import { describe, it, expect, vi, afterEach } from "vitest";
import {
  googleSynth,
  googleVoices,
  openaiSynth,
  OPENAI_VOICES,
} from "../src/providers/tts/index.js";
import { synthesize } from "../src/providers/tts/index.js";

afterEach(() => vi.restoreAllMocks());

describe("googleSynth", () => {
  it("posts to Google TTS with id-ID voice and returns base64 mp3", async () => {
    const captured: { url?: string; body?: any } = {};
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: any) => {
        captured.url = url;
        captured.body = JSON.parse(init.body);
        return { ok: true, status: 200, json: async () => ({ audioContent: "QUJD" }) } as any;
      }),
    );

    const out = await googleSynth("Halo dunia", "id-ID-Chirp3-HD-Kore", "gkey-SECRET");

    expect(out).toEqual({ audio: "QUJD", mime: "audio/mpeg" });
    expect(captured.url).toContain("texttospeech.googleapis.com/v1/text:synthesize");
    expect(captured.url).toContain("key=gkey-SECRET");
    expect(captured.body.input.text).toBe("Halo dunia");
    expect(captured.body.voice).toEqual({ languageCode: "id-ID", name: "id-ID-Chirp3-HD-Kore" });
    expect(captured.body.audioConfig.audioEncoding).toBe("MP3");
  });

  it("throws without leaking the key on non-2xx", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 403, text: async () => "denied" })) as any,
    );
    await expect(googleSynth("x", "v", "gkey-SECRET")).rejects.toThrow(/Google TTS.*403/);
    await expect(googleSynth("x", "v", "gkey-SECRET")).rejects.not.toThrow(/gkey-SECRET/);
  });
});

describe("googleVoices", () => {
  it("lists id-ID voices and derives the type from the name", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        expect(url).toContain("languageCode=id-ID");
        return {
          ok: true,
          status: 200,
          json: async () => ({
            voices: [
              { name: "id-ID-Chirp3-HD-Kore", ssmlGender: "FEMALE" },
              { name: "id-ID-Neural2-A", ssmlGender: "FEMALE" },
              { name: "id-ID-Standard-B", ssmlGender: "MALE" },
            ],
          }),
        } as any;
      }),
    );

    const voices = await googleVoices("gkey");

    expect(voices).toEqual([
      { name: "id-ID-Chirp3-HD-Kore", gender: "FEMALE", type: "Chirp3-HD" },
      { name: "id-ID-Neural2-A", gender: "FEMALE", type: "Neural2" },
      { name: "id-ID-Standard-B", gender: "MALE", type: "Standard" },
    ]);
  });
});

describe("openaiSynth", () => {
  it("posts to OpenAI speech and base64-encodes the binary response", async () => {
    const captured: { url?: string; body?: any; auth?: string } = {};
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: any) => {
        captured.url = url;
        captured.auth = init.headers.Authorization;
        captured.body = JSON.parse(init.body);
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
        } as any;
      }),
    );

    const out = await openaiSynth("Halo", "nova", "sk-SECRET", "tts-1-hd");

    expect(out.mime).toBe("audio/mpeg");
    expect(out.audio).toBe(Buffer.from([1, 2, 3]).toString("base64"));
    expect(captured.url).toContain("api.openai.com/v1/audio/speech");
    expect(captured.auth).toBe("Bearer sk-SECRET");
    expect(captured.body).toMatchObject({ model: "tts-1-hd", input: "Halo", voice: "nova" });
  });

  it("exposes a static voice list", () => {
    expect(OPENAI_VOICES.length).toBeGreaterThan(0);
    expect(OPENAI_VOICES.map((v) => v.name)).toContain("nova");
  });
});

describe("synthesize dispatch", () => {
  it("routes google and openai, rejects browser/unknown", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ audioContent: "QQ==" }) })) as any,
    );
    const g = await synthesize({ provider: "google", voice: "id-ID-Standard-A", apiKey: "k" }, "hi");
    expect(g.audio).toBe("QQ==");

    await expect(
      synthesize({ provider: "browser", voice: "", apiKey: "" }, "hi"),
    ).rejects.toThrow();
    await expect(
      synthesize({ provider: "nope", voice: "", apiKey: "k" }, "hi"),
    ).rejects.toThrow(/tidak didukung/);
  });
});
