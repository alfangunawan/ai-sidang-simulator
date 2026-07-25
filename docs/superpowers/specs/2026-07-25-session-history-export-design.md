# Session History, CSV Export & Markdown Fix — Design

**Date:** 2026-07-25
**Status:** Approved

## Goal

Let the user review past defense sessions, delete any of them, export a chosen
session to CSV, and render the examiner's `*`/`**` markup instead of showing it
raw (and stop TTS from spelling the symbols aloud).

## Current state

- `sessions` table already holds many sessions (`id`, `created_at`, `label`); `turns`
  cascade-delete. But there is **no list endpoint**, and the frontend keeps a single
  active session id in `localStorage`.
- "Reset Sesi" **deletes** the active session and creates a new one — which would
  destroy history.
- Examiner replies contain `**bold**` / `*italic*`. Bubbles render `{content}` as plain
  text, so the markers show raw, and TTS reads them as "bintang bintang".

## Decisions (from brainstorming)

- "Reset Sesi" becomes **"Sesi Baru"**: start a fresh session, keep the old one.
  Deletion happens only from Riwayat.
- Markdown handled by a **dependency-free formatter** (bold/italic only) plus a
  strip pass for TTS.
- CSV export is **per-session** (not bulk), built **client-side**, reachable from the
  live transcript header and the Riwayat detail view.

## Architecture

### Backend
- `repos/sessions.ts` — add `listSessions(db)` returning
  `{ id, created_at, label, turn_count }[]`, **only sessions with `turn_count > 0`**,
  ordered by `created_at DESC`. (Excludes the empty auto-created session so the list
  stays clean.)
- `routes/sessions.ts` — add `GET /` → `{ sessions: [...] }`. `DELETE /:id` already
  exists (cascades turns).

### Frontend
- `lib/markdown.ts`
  - `renderInline(text): ReactNode[]` — `**x**` → `<strong>`, `*x*` → `<em>`; other text
    passes through unchanged; newlines preserved by the existing `white-space: pre-wrap`.
    Unmatched markers are left as literal text.
  - `stripMarkdown(text): string` — removes `**` / `*` / `_` markers, collapsing to the
    inner text, for TTS input.
- `lib/csv.ts`
  - `turnsToCsv(turns): string` — header `no,peran,isi`; `peran` = `Penguji`/`Anda`;
    RFC-4180 escaping (wrap fields containing `",\n` in quotes, double internal quotes).
  - `downloadCsv(filename, csv): void` — Blob + object URL + anchor click (thin, untested).
- `components/Transcript.tsx` — shared bubble list rendering `renderInline(content)`.
  Used by both the live session and the Riwayat detail so markdown renders identically.
- `pages/HistoryPage.tsx`
  - List view: rows `Sesi — <formatted created_at>` · `N percakapan` · **Buka** / **Hapus**.
  - Detail view (read-only): `<Transcript>` + **Export CSV** + **Hapus**. Fetches the
    session's turns on open. Does not change the active practice session.
- `pages/SessionPage.tsx`
  - Bubbles render through `<Transcript>` (markdown).
  - TTS speaks `stripMarkdown(reply)`.
  - "Reset Sesi" → **"Sesi Baru"**: create a new session + clear turns, **without**
    deleting the old one.
  - Transcript panel header gains an **Export** button (exports current turns).
- `App.tsx` — third tab **Riwayat**.
- `api.ts` — `listSessions()`; reuse `getTurns`, `deleteSession`.

## Data flow — export
```
[Export] → turnsToCsv(turns) → downloadCsv("sibiru-sesi-<tanggal>.csv", csv)
```
Live session uses the turns already in state; Riwayat detail uses the turns it fetched.

## Error handling
- Empty session (no turns) → Export disabled/no-op.
- Delete failure → surface the error, keep the row.
- `GET /sessions` failure on the Riwayat tab → show an error line, empty list.

## Scope cuts (YAGNI)
No multi-select bulk actions, no per-turn timestamps in CSV, no resuming an old session,
no manual session naming (auto date label), no backend CSV endpoint.

## Testing
- Pure units: `renderInline` (bold, italic, mixed, unmatched marker), `stripMarkdown`,
  `turnsToCsv` (escaping commas/quotes/newlines, role labels).
- Backend: `listSessions` excludes empty sessions, orders DESC, counts turns; `GET /sessions`.
- Frontend: HistoryPage renders the list and deletes a row; SessionPage "Sesi Baru"
  creates a new session and does **not** call `deleteSession`.
