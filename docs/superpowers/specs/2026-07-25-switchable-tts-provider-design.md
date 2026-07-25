# Switchable TTS Provider — Design

**Date:** 2026-07-25
**Status:** Approved

## Goal

Let the user pick the text-to-speech engine that voices the examiner's replies.
Add Google Cloud TTS (Neural2 / Chirp3-HD) and OpenAI TTS alongside the existing
browser voice, switchable from Settings.

## Current state

The examiner reply is spoken by `frontend/src/hooks/useSpeechSynthesis.ts` via the
browser Web Speech API (`window.speechSynthesis`, `lang="id-ID"`). It is on-device,
free, needs no API key, and quality varies by OS/browser. There is **no** server-side
TTS today (the earlier assumption that it was OpenAI was incorrect).

## Decisions (from brainstorming)

- Providers in the switcher: **Browser + Google Cloud + OpenAI**.
- Browser stays the default and the offline fallback.
- Google auth: **API key** (pasted, write-only, encrypted at rest — same pattern as
  the LLM key), used as `?key=` on the REST call.
- Voice selection: **curated dropdown**. Google list is fetched **dynamically** from
  Google's `voices.list` for `id-ID` (avoids hardcoding voice names that may not exist
  for Indonesian); OpenAI voices are a fixed static list.

## Architecture

Browser TTS stays entirely client-side. Google and OpenAI run through the backend so
API keys never reach the browser.

### Data flow — speak
```
examiner reply → tts.speak(text)
  provider = browser        → window.speechSynthesis (unchanged, offline)
  provider = google|openai  → POST /api/tts/speak { text }
        server reads stored provider + voice + key → synthesize
        → { audio: base64, mime }
        frontend: new Audio("data:<mime>;base64,<audio>").play()
        speaking state driven by audio play / ended
```
The frontend only needs the non-secret `tts_provider` to choose local vs. server.
The server owns the voice, the key, and the actual synthesis call.

### Backend

- `providers/tts/google.ts` — `synth(text, voice, key) → { audio, mime }`.
  `POST https://texttospeech.googleapis.com/v1/text:synthesize?key=<key>`,
  body `{ input:{text}, voice:{languageCode:"id-ID", name:voice}, audioConfig:{audioEncoding:"MP3"} }`.
  Response `{ audioContent }` (already base64) → `{ audio: audioContent, mime: "audio/mpeg" }`.
- `providers/tts/openai.ts` — `synth(text, voice, key, model="tts-1") → { audio, mime }`.
  `POST https://api.openai.com/v1/audio/speech`, body `{ model, input:text, voice, response_format:"mp3" }`.
  Response is binary → base64 encode → `{ audio, mime:"audio/mpeg" }`.
- `providers/tts/index.ts` — dispatch by provider; throws a clear error for unknown /
  missing config.
- `routes/tts.ts`
  - `POST /speak` — read active TTS config; synthesize; `{ audio, mime }`.
    Missing key or synth failure → `400 { error }`.
  - `GET /voices` — Google: proxy `voices.list?languageCode=id-ID&key=<key>` and return
    `[{ name, ssmlGender, type }]` (type parsed from the name: Chirp3-HD / Neural2 /
    Wavenet / Standard). OpenAI: static list. Browser: `[]`. On Google fetch failure,
    return a small static id-ID fallback list so the dropdown is never empty.
- `repos/settings.ts` — new settings keys:
  - `tts_provider` (default `"browser"`), `tts_voice` (default `""`).
  - `google_tts_key`, `openai_tts_key` — encrypted, write-only.
  - View adds `tts_provider`, `tts_voice`, `has_google_tts_key`, `has_openai_tts_key`.
    Keys are never returned (mirrors existing `has_api_key`).
  - `saveSettings` accepts and persists the new fields (encrypting non-empty keys).
- `app.ts` — mount `ttsRouter` at `/api/tts`.

### Frontend

- `hooks/useSpeechSynthesis.ts` — becomes a dispatcher. Takes provider (+ voice not
  needed client-side). `browser` → current path. `google|openai` → `ttsSpeak(text)`,
  play returned audio, set `speaking` on `play`/`ended`/`error`. `cancel()` stops both
  the utterance and any playing `<audio>`.
- `api.ts` — `ttsSpeak(text) → { audio, mime }`, `getTtsVoices() → Voice[]`; extend the
  settings payload type.
- `types.ts` — add TTS fields to the settings view type; add `TtsVoice` type.
- `pages/SettingsPage.tsx` — new **Suara (TTS)** section: provider `<select>`; when
  Google/OpenAI selected, show a write-only API-key input + a voice `<select>` (Google
  populated from `getTtsVoices`, grouped by type; OpenAI static). A hint warns when the
  chosen provider has no key saved.
- `pages/SessionPage.tsx` — pass the loaded `tts_provider` to the hook.

## Error handling

Provider selected but no key, or synthesis fails → `/speak` returns `400`. SessionPage
surfaces the error text and **skips audio silently** — the chat transcript never blocks
on TTS. Settings shows a warning when the active provider lacks a key.

## Scope cuts (YAGNI)

- Orb stays synthetic during speech (no real audio-amplitude analysis).
- Single `tts_voice` field; switching provider resets to that provider's default voice.
- No audio caching / streaming; whole-utterance synthesis per reply.

## Testing

**Backend**
- `google.ts` / `openai.ts`: `fetch` mocked — assert request shape and that the adapter
  returns base64 + mime; error responses surface as thrown errors.
- `routes/tts.ts`: `/speak` returns `{ audio, mime }` for a configured provider; returns
  `400` when the key is missing; `/voices` returns parsed Google list and OpenAI static
  list.
- `repos/settings.ts`: save + view round-trips the new fields; keys stored encrypted and
  never returned (only `has_*` booleans).

**Frontend**
- `SettingsPage`: renders the provider dropdown; key + voice fields appear only for
  Google/OpenAI; saving posts the new fields.
- `useSpeechSynthesis`: browser provider uses `speechSynthesis`; google/openai provider
  calls `ttsSpeak` and plays the returned audio (Audio mocked).

## Security

API keys (`google_tts_key`, `openai_tts_key`) are encrypted with the existing
`crypto.encrypt` key, stored write-only, and never returned to the client. CORS stays
scoped as-is. Server-side synthesis keeps keys off the browser entirely.
