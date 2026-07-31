# Admin Dashboard (Panel Founder/Ops) — Design

**Date:** 2026-07-31
**Status:** Approved (design), pending implementation plan

## Goal

Give the founder a single place to see and steer the live deployment: who
signed up, what they cost, what they ran, who is riding on a shared key — plus
the write actions that matter (suspend, delete, manage access codes) and
editing of the two datasets that currently require a redeploy to change (the
examiner question bank and the examiner personas).

Audience is one person today (`alfan`), with room for a second admin later.
This is not a lecturer/campus portal — there is no supervisor↔student relation
in the data model and none is being added.

Builds on the existing per-user auth, `user_settings`, and collaboration model
([[sidang-vps-deploy]], `2026-07-27-auth-multi-user-design.md`,
`2026-07-27-collaboration-design.md`).

## Decisions (locked)

- **No dashboard template is adopted.** Every mainstream shadcn admin template
  (satnaing/shadcn-admin, shadcndashboard, shadcnstore, tailwind-admin) ships
  React 19 + a router library + an auth library + a state library. This app is
  React 18, routes by `useState` in `App.tsx`, and authenticates with its own
  cookie. Adopting one means rewriting the app to gain a layout. Individual
  shadcn components remain copy-pasteable later (same Radix + Tailwind base).
- **Zero new npm dependencies.** The 12 primitives in
  `frontend/src/components/ui/` cover everything: `table`, `dialog`, `badge`,
  `button`, `input`, `select`, `checkbox`, `textarea`, `label`, `alert`,
  `card`, `separator`. Sidebar is a plain `<aside>`. Charts are CSS bars.
- **Admin lives at `/admin` in the same build.** `App.tsx` branches on
  `location.pathname`; no router library. nginx already serves
  `try_files $uri $uri/ /index.html`, so no server config changes.
- **Admin status is a DB column keyed by user id**, never an env var matched by
  username. A username change must not silently revoke or transfer admin.
- **Guards live in the backend**, not in what the UI chooses to render.

## Admin identity

```sql
ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0
```

Added via the existing `addColumnIfMissing` helper in `db.ts` — same mechanism
as every other post-hoc column in this schema.

- `requireAdmin(db)` middleware reads `users.is_admin` for `req.userId`.
  Composes after `requireAuth`, so it inherits the suspension check.
- `GET /auth/me` gains `is_admin: boolean`. The frontend uses it only to decide
  whether to render `/admin` — it is not the security boundary.
- **Bootstrap:** `backend/scripts/grant-admin.ts`, run as
  `npx tsx scripts/grant-admin.ts <username>`. Follows the existing
  `scripts/fix-chunk-pages.ts` pattern. No env var, no unauthenticated
  bootstrap endpoint.
- **Subsequent admins:** toggle on the Pengguna page →
  `PATCH /admin/users/:id { is_admin }`.

### Guards (enforced server-side)

| Rule | Reason |
|---|---|
| Cannot demote, suspend, or delete **yourself** | One misclick otherwise locks the founder out of the panel entirely |
| Cannot demote the **last** admin (`COUNT(*) WHERE is_admin=1 > 1`) | Same, via the two-admin path |
| Non-admin hitting any `/admin/*` route → 403 | UI hiding is not a boundary |

## Suspension

```sql
ALTER TABLE users ADD COLUMN suspended INTEGER NOT NULL DEFAULT 0
```

The check goes in **`requireAuth`** (`backend/src/routes/auth.ts:19`), not in
individual routes. Every authenticated route already funnels through it, so one
guard covers `/sessions`, `/skripsi`, `/tts`, `/stt`, `/settings`, `/collab`
and anything added later. A suspended user gets `403 { error: "Akun ditangguhkan" }`.

Suspension is reversible and leaves all data intact. `/auth/login` also rejects
suspended users, so they cannot mint a fresh token.

## Deleting a user

`users` has `ON DELETE CASCADE` from `auth_tokens`, `user_settings`,
`collaborations`, and `collaboration_members`.

**It does not cascade to `sessions`, `documents`, or `usage_events`.** Those
three carry `user_id` columns added later via `ALTER TABLE` (`db.ts:122-129`),
which SQLite cannot attach a foreign key to. Deleting a user without handling
them orphans every transcript and uploaded skripsi in the database forever.

Deletion therefore runs as one `better-sqlite3` transaction:

```
DELETE FROM turns WHERE session_id IN (SELECT id FROM sessions WHERE user_id = ?)
DELETE FROM sessions      WHERE user_id = ?
DELETE FROM chunks WHERE document_id IN (SELECT id FROM documents WHERE user_id = ?)
DELETE FROM documents     WHERE user_id = ?
DELETE FROM usage_events  WHERE user_id = ?
DELETE FROM users         WHERE id = ?      -- cascades the remaining four tables
```

(`turns` and `chunks` do have cascading FKs to their parents, but the parents
are being deleted by `user_id`, so the explicit deletes above document the
order rather than relying on cascade timing.)

`usage_events.key_owner_user_id` rows belonging to *other* users are left
alone — a host's spend history must survive a member's deletion.

The UI requires typing the username to confirm, via the existing
`ConfirmModal`.

## Backend surface

New files: `backend/src/repos/admin.ts` (cross-user aggregates),
`backend/src/routes/admin.ts`, `backend/src/repos/questions.ts`,
`backend/src/repos/personas.ts`, `backend/scripts/grant-admin.ts`.

Mounted in `app.ts`: `app.use("/admin", auth, requireAdmin(db), adminRouter(db))`.

Every existing repo query is scoped `WHERE user_id = ?`. None are modified —
the admin repo adds its own unscoped queries so the student-facing paths keep
their isolation guarantee unchanged.

| Method | Path | Returns / does |
|---|---|---|
| GET | `/admin/overview` | counts (users, sessions, documents, turns), total USD, top 5 spenders, signups per day for 14 days |
| GET | `/admin/users` | per user: id, username, created_at, session count, USD spent, whose key they use, suspended, is_admin |
| GET | `/admin/users/:id` | detail: settings summary, sessions, documents, collab membership |
| PATCH | `/admin/users/:id` | `{ suspended?, is_admin? }`, subject to the guards above |
| DELETE | `/admin/users/:id` | the transaction above |
| GET | `/admin/sessions` | all sessions; filters `user_id`, `status` |
| GET | `/admin/sessions/:id` | turns + assessment |
| GET | `/admin/codes` | all collaborations: host, code, shares, members, USD drawn |
| DELETE | `/admin/codes/:id/members/:uid` | kick a member |
| GET | `/admin/questions` | question bank grouped by phase |
| PUT | `/admin/questions` | replace one phase's list |
| GET | `/admin/personas` | all personas |
| POST/PATCH/DELETE | `/admin/personas[/:key]` | CRUD |

### API keys are never exposed

`/admin/users/:id` reports each key slot as `has_api_key: boolean`, mirroring
what `getSettingsView` already does for the user's own settings
(`repos/settings.ts:78`). The admin endpoints never call `decrypt()`. An admin
panel that can read other people's provider keys is a credential-theft surface
for one person's convenience.

## Master data

Two tables, seeded from the constants that exist today when the table is empty.
First deploy therefore changes no behaviour at all.

```sql
CREATE TABLE IF NOT EXISTS question_bank (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  phase    TEXT NOT NULL,
  text     TEXT NOT NULL,
  position INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_question_bank_phase ON question_bank(phase, position);

CREATE TABLE IF NOT EXISTS personas (
  key      TEXT PRIMARY KEY,
  name     TEXT NOT NULL,
  initials TEXT NOT NULL,
  role     TEXT NOT NULL,
  mode     TEXT NOT NULL,
  type     TEXT NOT NULL,
  color    TEXT NOT NULL,
  trait    TEXT NOT NULL,
  position INTEGER NOT NULL,
  active   INTEGER NOT NULL DEFAULT 1
);
```

- `backend/src/questionBank.ts` keeps `QUESTION_BANK` as the seed constant;
  `buildPhaseBlock` reads through `repos/questions.ts`.
- Persona seed comes from `EXAMINER_MODES` / `EXAMINER_TYPES` in
  `backend/src/persona.ts` joined with the six presets in
  `frontend/src/personas.ts`.
- A phase in `phases.ts` with no rows falls back to the constant, so a mistaken
  "delete all" in the editor cannot leave the examiner with nothing to ask.
- `phases.ts` itself stays hardcoded — it is a short fixed sequence and moving
  it buys nothing.

### Persona cost warning

`frontend/src/personas.ts` is currently a static module read synchronously by
`App.tsx:79`, `SetupModal.tsx:138`, and `SessionPage.tsx:133` — the last of
which resolves the examiner's name and colour *during a live sidang*. Serving
personas from the DB means those three must fetch, adding a loading state to
both the setup flow and the session header.

Mitigation: the static array stays as the initial value and the fetch replaces
it, so the picker is never empty and a running sidang never renders a nameless
examiner. `personaFor(mode, type)` keeps its signature and falls back to the
constant when no DB row matches, which also covers a persona deleted mid-session.
This is why personas are the last phase.

## Frontend

```
frontend/src/pages/admin/
  AdminApp.tsx     shell: <aside> nav + section state + admin guard
  Overview.tsx     stat cards + 14-day signup bars (CSS widths)
  Users.tsx        table, detail dialog, suspend / admin toggle / delete
  Sessions.tsx     table + transcript dialog
  Codes.tsx        collaborations, members, kick
  Questions.tsx    per-phase textarea editor
  Personas.tsx     table + edit dialog
```

`App.tsx` gains one branch before the tab shell:

```tsx
// after the existing `if (!ready)` / `if (!user)` guards, so an unauthenticated
// visitor to /admin still sees the login screen rather than a blank redirect
if (window.location.pathname.startsWith("/admin")) {
  if (!user.is_admin) {
    window.location.replace("/");
    return null;
  }
  return <AdminApp user={user} />;
}
```

Sub-navigation inside the panel is `useState`, not URL. Deep links like
`/admin/users/42` are deliberately not supported yet.

Admin API calls extend `frontend/src/api.ts` (same `fetch` wrapper, same
`credentials: "include"`, same 401 handler).

## Known limitation: cost reporting

`providers/claude.ts:19` hardcodes `cost_usd: 0`. Only the OpenAI-compatible
router path (`providers/openaiCompat.ts:36`) reports real cost, and only
because the router returns it. So **every USD figure in this panel reads $0.00
for users on the direct Claude provider.**

A `model_pricing` master table would fix it and was explicitly deferred. Until
then the panel labels the column "Biaya (router saja)" rather than "Biaya", so
the number is not read as truth it does not have.

## Testing

Backend (`vitest` + `supertest`, matching `backend/test/`):

- `requireAdmin` rejects a non-admin with 403 and admits an admin.
- Renaming a user's username does not change their admin status.
- Self-demotion, self-suspension, and self-deletion are all rejected.
- Demoting the last remaining admin is rejected.
- A suspended user is rejected by `requireAuth` on an unrelated route
  (`/sessions`) and by `/auth/login`.
- Deleting a user leaves zero rows in `sessions`, `turns`, `documents`,
  `chunks`, and `usage_events` for that user — and leaves another user's rows
  untouched.
- `/admin/users/:id` response contains no decrypted key material.
- Seeding runs once: a second `openDb` does not duplicate question rows.
- An empty phase falls back to the constant question list.

Frontend (`vitest` + Testing Library, matching the existing `*.test.tsx`):

- `/admin` with a non-admin user renders the normal app, not the panel.
- Users table renders rows and the delete confirm requires the typed username.

## Phases

| # | Scope | Usable at end of phase |
|---|---|---|
| 1 | `is_admin` column, `requireAdmin`, `grant-admin.ts`, `/admin` branch, shell, Ringkasan | Yes — live numbers same day |
| 2 | `suspended` column, `requireAuth` guard, Pengguna page, delete transaction | Yes |
| 3 | Sesi list + transcript viewer | Yes |
| 4 | Kode Akses | Yes |
| 5 | `question_bank` table, seed, fallback, editor | Yes |
| 6 | `personas` table, seed, frontend fetch | Yes |

## Deliberately skipped

- **Audit log of which admin viewed whose transcript.** There is one admin. Add
  when there are two.
- **Deep links** into admin sections. Navigation is state; add if debugging
  gets tedious.
- **recharts.** Fourteen CSS-width divs draw a fourteen-day bar chart.
- **shadcn `sidebar` block.** ~400 lines plus `sheet`, `tooltip`, `skeleton`,
  and a mobile hook, for a panel one person opens. A plain `<aside>` matches
  the header nav already in `App.tsx`.
- **`model_pricing` table.** Explicitly deferred; see the cost limitation above.
- **Role table / permission matrix.** One boolean covers one admin, and the
  guards are three lines. Add a role table when a third distinct role exists.
