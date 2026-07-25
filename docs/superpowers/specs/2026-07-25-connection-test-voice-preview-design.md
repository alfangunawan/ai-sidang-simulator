# Connection Tests & Voice Preview — Design

**Date:** 2026-07-25
**Status:** Approved

## Goal

From Settings, let the user (a) test that the AI (LLM) provider connects with the
configured key, (b) test that the TTS provider connects, and (c) preview what a
chosen TTS voice sounds like.

## Decisions (from brainstorming)

- **LLM test** = lightweight auth-check only (0 tokens). Model name is *not*
  validated.
- **TTS connection test** = global, per provider ("can we reach this TTS provider
  with this key"), independent of any specific voice.
- **Voice preview** = per voice: synthesize a fixed sample sentence with the
  selected voice and play it.
- All tests use the API key currently typed in the form if present, else the saved
  key (so the user can test before saving).

## Architecture

### Backend
- `providers/types.ts` — extend `LLMProvider` with `checkAuth(): Promise<void>`
  (throws on failure).
  - `providers/claude.ts` — `checkAuth()` calls `client.models.list()`.
  - `providers/openrouter.ts` — `checkAuth()` does `GET https://openrouter.ai/api/v1/key`
    with the bearer key; non-2xx throws (never leaks the key).
- `providers/tts/openai.ts` — add `openaiCheckAuth(apiKey)` → `GET /v1/models`;
  non-2xx throws. (Google's auth-check reuses the existing `googleVoices`.)
- `repos/settings.ts` — add `getLlmKey(db, key)` → decrypted `api_key` or null
  (mirrors `getTtsKey`).
- `routes/settings.ts` — `POST /test-llm` `{provider?, model?, api_key?}`:
  resolve provider/model from body or saved; key = body.api_key (if non-empty) else
  `getLlmKey`. No key → `{ok:false, error}`. Else `getProvider(cfg).checkAuth()` →
  `{ok:true}`; any throw → `{ok:false, error}`. Always HTTP 200 (result in `ok`).
- `routes/tts.ts`
  - `POST /test` `{provider?, key?}`: provider from body or saved. `browser` →
    `{ok:true}`. Else key = body.key or `getTtsKey`; missing → `{ok:false, error}`.
    google → `googleVoices(key)`, openai → `openaiCheckAuth(key)`; success `{ok:true}`,
    throw → `{ok:false, error}`. HTTP 200.
  - `POST /preview` `{provider?, voice, key?}`: browser → 400 (client-side).
    Missing key/voice → 400 `{error}`. Else `synthesize({provider, voice, apiKey}, SAMPLE)`
    → `{audio, mime}`; throw → 400 `{error}`. `SAMPLE = "Halo, ini contoh suara
    penguji sidang."`.

### Frontend
- `api.ts` — `testLlm(body) → {ok, error?}`, `testTts(body) → {ok, error?}`,
  `ttsPreview(body) → {audio, mime}` (throws on non-2xx via `jsonOrThrow`).
- `pages/SettingsPage.tsx`
  - LLM section: **Tes Koneksi** button → calls `testLlm({provider, model, api_key: apiKey || undefined})`;
    shows `✓ Terhubung` or `✗ <error>`.
  - TTS section: **Tes Koneksi TTS** button (google/openai) → `testTts({provider, key: <typed> || undefined})`;
    browser shows a "didukung, tanpa key" note instead. Shows status.
  - Voice row: **▶ Preview** button beside the voice `<select>`. Browser provider →
    speak the sample via `window.speechSynthesis`. google/openai → `ttsPreview(...)`,
    play the returned audio via `new Audio(dataURI)`. Errors show inline.
  - Local state: `llmStatus`, `ttsStatus`, `previewErr`, plus a busy flag per button.

## Error handling
Auth/connection failures return `{ok:false, error}` (HTTP 200) for the two test
endpoints so the UI renders a red `✗` line without throwing. Preview returns HTTP 400
`{error}` on failure; the UI catches and shows it. No key leaks into any error string.

## Scope cuts (YAGNI)
No model-name validation in the LLM test. No per-option preview inside the native
`<select>` (a single Preview for the current selection). No result caching. No
timeouts beyond the platform default.

## Testing
- Backend: `ClaudeProvider.checkAuth` / `OpenRouterProvider.checkAuth` (SDK & fetch
  mocked; success + non-2xx throws, no key leak); `openaiCheckAuth`; routes
  `POST /settings/test-llm`, `POST /tts/test`, `POST /tts/preview` (ok, missing-key,
  provider failure).
- Frontend: `api` wrappers hit the right URL/body; SettingsPage shows ✓/✗ after
  clicking a test; Preview calls `ttsPreview` for a server provider and
  `speechSynthesis` for browser.
