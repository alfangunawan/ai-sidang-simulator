# Collaboration (Shared API Keys) — Design

**Date:** 2026-07-27
**Status:** Approved (design), pending implementation plan

## Goal

Let a user (host) share their AI / TTS / STT provider configuration — including
the paid API keys — with other users (members) who join via an invite code.
The host chooses which of the three capabilities to share, sees who joined, and
can kick members. Members use the host's keys transparently (server-side only;
the raw key is never sent to a member). Sessions, documents, and history stay
100% private per user — collaboration shares only keys/provider config.

Builds on the existing per-user auth + `user_settings` model
([[sidang-vps-deploy]]).

## Decisions (locked)

- **Join by invite code.** Host has an auto-generated unique code; a member
  pastes it to join. Host can regenerate (invalidates the old code).
- **Roles:** a user hosts **at most one** collaboration and is a member of
  **at most one**. A user may host their own AND be a member of another
  simultaneously. Enforced by `UNIQUE(host_user_id)` and `UNIQUE(member_user_id)`.
- **Sharing shares the host's OWN stored config** (`user_settings`), never a
  chain. If a host is themselves a member elsewhere, that does not affect what
  they share — no recursion.
- **Usage:** each call is still recorded under the acting member (member sees
  their own usage unchanged). Additionally `usage_events.key_owner_user_id`
  records whose key paid, powering a host aggregate ("your key was used N
  times / $X, broken down by member").
- **Security:** members never receive the host's plaintext key. Only the
  server-side usage endpoints resolve to the host's key. Self-test/preview
  endpoints always use the caller's own keys.

## Resolution rule (core)

For a user `U` and capability `cap ∈ {ai, tts, stt}`, the **source user** whose
config to use:

```
if U is a member of a collaboration X
   and X.share_<cap> is true
   and X.host has a usable key for <cap>:
       source = X.host_user_id
else:
       source = U
```

"host has a usable key for cap":
- ai  → host `user_settings.api_key` is set.
- tts → host `user_settings.<ttsKeyName(host tts_provider)>` is set (i.e. the key
  for the host's selected TTS provider; `browser` provider needs no key and is
  never shared as a paid capability — if host's tts_provider is `browser`,
  treat ai/stt independently and tts as "no usable key" → member falls back).
- stt → host `user_settings.openai_stt_key` is set (whisper).

Hosting never redirects `U`'s own key use — only membership does. So there is
at most one hop (member → host), no chains.

### What each share means

- **AI:** member borrows host's `provider`, `model`, `api_key`. The exam persona
  (`attack_points`, `examiner_mode`, `examiner_type`) stays the **member's own**.
- **TTS:** member borrows host's `tts_provider`, `tts_voice`, and provider key.
- **STT:** member borrows host's `stt_provider` and `openai_stt_key`.

## Schema changes

```sql
CREATE TABLE collaborations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  host_user_id INTEGER NOT NULL UNIQUE,
  invite_code TEXT NOT NULL UNIQUE,
  share_ai INTEGER NOT NULL DEFAULT 0,
  share_tts INTEGER NOT NULL DEFAULT 0,
  share_stt INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY (host_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE collaboration_members (
  collaboration_id INTEGER NOT NULL,
  member_user_id INTEGER NOT NULL UNIQUE,
  joined_at TEXT NOT NULL,
  PRIMARY KEY (collaboration_id, member_user_id),
  FOREIGN KEY (collaboration_id) REFERENCES collaborations(id) ON DELETE CASCADE,
  FOREIGN KEY (member_user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

Add `key_owner_user_id INTEGER` to `usage_events` via the existing
`addColumnIfMissing` helper. Existing rows get NULL (treated as "self" —
back-compat).

Invite code: `randomBytes(6).toString("hex")` (12 hex chars), regenerated on
demand. `UNIQUE` column; on the astronomically rare collision, retry.

## Backend

**New `src/repos/collab.ts`**
- `getHostCollab(db, hostUserId)` → collaboration row or null.
- `getMembership(db, memberUserId)` → `{ collaboration_id, host_user_id, share_ai, share_tts, share_stt }` (joined with `collaborations`) or null.
- `createCollab(db, hostUserId, code, createdAt)` → id (idempotent at route layer).
- `setShares(db, hostUserId, {share_ai, share_tts, share_stt})`.
- `regenerateCode(db, hostUserId, code)`.
- `deleteCollab(db, hostUserId)` (disband).
- `joinByCode(db, memberUserId, code, joinedAt)` → `{ ok } | { error }` (404 unknown code, 400 if joining own collab, 400 if already a member).
- `leave(db, memberUserId)`.
- `listMembers(db, hostUserId)` → `[{ member_user_id, username, joined_at }]` (join `users`).
- `kickMember(db, hostUserId, memberUserId)` (delete only within the host's own collab).

**New `src/effectiveConfig.ts`** (the resolver — keeps `settings.ts` unchanged
except reuse of its getters)
- `resolveSourceUser(db, userId, cap: "ai"|"tts"|"stt"): number` — implements the
  resolution rule above (reads `getMembership` + checks the host's key via
  `getSetting`).
- `getEffectiveLlmConfig(db, userId, key): { provider, model, apiKey, attackPoints, examinerMode, examinerType }` — provider/model/apiKey from `resolveSourceUser(…, "ai")`, persona fields from `userId`.
- `getEffectiveTtsConfig(db, userId, key)` → `getActiveTtsConfig(db, resolveSourceUser(…,"tts"), key)`.
- `resolveSttSource(db, userId): number` → `resolveSourceUser(db, userId, "stt")` (stt route reads `stt_provider` + `getSttKey` from that source).

**Modify usage seams**
- `routes/sessions.ts` (turn + close): replace `getActiveConfig(db, userId, key)`
  with `getEffectiveLlmConfig(db, userId, key)`. Record usage with
  `keyOwnerUserId = resolveSourceUser(db, userId, "ai")`.
- `routes/tts.ts` `/speak`: use `getEffectiveTtsConfig(db, userId, key)`.
- `routes/stt.ts` `/transcribe`: `const src = resolveSttSource(db, userId)`; read
  `stt_provider` + `getSttKey` from `src`.
- `repos/usage.ts` `recordUsage(db, userId, keyOwnerUserId, at, …)` — new second
  param; add `key_owner_user_id` to the INSERT. `getUsageView(db, userId)`
  unchanged (member's own view). Add `getKeyUsageView(db, hostUserId)` →
  aggregate + per-member breakdown of events `WHERE key_owner_user_id = hostUserId`.

**New `src/routes/collab.ts`** (mounted behind `requireAuth`)
- `GET /collab` → `{ hosting: {invite_code, shares, members[], usage} | null, joined: {host_username, shares} | null }`.
- `POST /collab` → become host (create if absent), returns hosting state.
- `DELETE /collab` → disband own collaboration.
- `PATCH /collab/shares` `{share_ai, share_tts, share_stt}` (host).
- `POST /collab/regenerate-code` (host).
- `POST /collab/join` `{code}` (member) → 404 unknown, 400 own/already-member.
- `POST /collab/leave` (member).
- `DELETE /collab/members/:memberUserId` (host kick).

Mount in `app.ts`: `app.use("/collab", auth, collabRouter(db, key))`.

## Frontend

`SettingsPage` gains a **Kolaborasi** section (new `CollabSettings` component,
its own file to keep SettingsPage focused):

- **Host panel:** "Jadi host" button (creates collab); once hosting → show
  invite code with copy + "Regenerate" ; three toggles (Bagikan AI / TTS / STT);
  member list (username + joined date + "Keluarkan" kick button); usage summary
  ("Key kamu dipakai: N panggilan · $X" + per-member rows); "Bubarkan" disband.
- **Member panel:** if not a member → input code + "Gabung"; if a member → show
  host username + shared-capability badges (AI/TTS/STT) + "Keluar" leave.
- On the AI/TTS/STT settings blocks, when that capability is currently borrowed,
  show a small note ("Memakai AI dari host: <username>") so the member
  understands why their own key isn't in effect.

`api.ts`: `getCollab`, `becomeHost`, `disbandCollab`, `setCollabShares`,
`regenerateCollabCode`, `joinCollab`, `leaveCollab`, `kickMember`.
`types.ts`: `CollabState`, `CollabMember`.

## Error handling

- Join unknown code → 404 "Kode tidak ditemukan".
- Join own collaboration → 400 "Tidak bisa gabung ke kolaborasi sendiri".
- Join while already a member → 400 "Kamu sudah tergabung di sebuah kolaborasi".
- Host actions by a non-host (no collab) → 404/400 with a clear message.
- Kick a non-member / member of another collab → no-op (scoped `WHERE`), 200.
- Host shares a capability but has no key → member silently falls back to own
  (resolver checks key presence); the member's borrowed-badge is not shown for
  that capability.

## Testing

- `effectiveConfig.test.ts`: borrow when (member + share on + host has key);
  fall back when share off / host missing key / not a member; persona fields
  always the member's; at-most-one-hop (host who is also a member still shares
  their own key).
- `collab.test.ts` (repo): create/host uniqueness, join/leave, kick scoped to
  own collab, `UNIQUE(member_user_id)` rejects a second join, `getKeyUsageView`
  aggregates by member.
- `routes.collab.test.ts` (supertest, two agents): host shares AI → member's
  `/sessions/:id/turn` uses host key (assert via a stubbed provider that echoes
  which key it received), `key_owner_user_id` recorded as host; member cannot
  read host's raw key anywhere in any response; kick → member falls back.

## Deploy

Additive migration (new tables + one nullable column) — no DB wipe needed.
`npm run build` (backend + frontend) → `pm2 restart sidang-backend`. nginx
unchanged.

## Out of scope (YAGNI)

Multiple collaborations per user, nested/transitive sharing, per-member share
overrides, approval workflows, real-time member presence, email/notifications,
spend limits/quotas per member (host controls via toggles + kick).
