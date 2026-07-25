import { describe, it, expect, vi, afterEach } from "vitest";
import {
  postTurn,
  continueSession,
  closeSession,
  getResult,
  uploadSkripsi,
  ttsSpeak,
  getTtsVoices,
  testLlm,
  testTts,
  ttsPreview,
} from "./api.js";

afterEach(() => vi.restoreAllMocks());

describe("api client", () => {
  it("postTurn returns reply + propose_close", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ reply: "Q?", propose_close: true }) })) as any,
    );
    expect(await postTurn("s1", "jawaban")).toEqual({ reply: "Q?", propose_close: true });
  });

  it("closeSession returns the assessment", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ assessment: { final_score: 80 } }) })) as any,
    );
    expect(await closeSession("s1")).toEqual({ final_score: 80 });
  });

  it("continueSession POSTs and resolves", async () => {
    const captured: { url?: string } = {};
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        captured.url = url;
        return { ok: true, json: async () => ({ ok: true }) };
      }) as any,
    );
    await continueSession("s1");
    expect(captured.url).toContain("/api/sessions/s1/continue");
  });

  it("getResult returns status + assessment", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ status: "closed", assessment: null }) })) as any,
    );
    expect(await getResult("s1")).toEqual({ status: "closed", assessment: null });
  });

  it("throws the server error message on non-2xx", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 400,
        json: async () => ({ error: "Upload skripsi (PDF) dulu" }),
      })) as any,
    );
    await expect(postTurn("s1", "x")).rejects.toThrow("Upload skripsi (PDF) dulu");
  });

  it("throws a 'backend not running' message on a non-2xx with no JSON body (proxy 500)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 500,
        json: async () => {
          throw new Error("Unexpected end of JSON input"); // empty/non-JSON body
        },
      })) as any,
    );
    await expect(postTurn("s1", "x")).rejects.toThrow(/backend berjalan/);
  });

  it("ttsSpeak posts the text and returns the audio payload", async () => {
    const captured: { body?: any } = {};
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: any) => {
        captured.body = JSON.parse(init.body);
        return { ok: true, json: async () => ({ audio: "QQ==", mime: "audio/mpeg" }) };
      }) as any,
    );
    expect(await ttsSpeak("halo")).toEqual({ audio: "QQ==", mime: "audio/mpeg" });
    expect(captured.body).toEqual({ text: "halo" });
  });

  it("getTtsVoices requests the given provider and returns its voices", async () => {
    const captured: { url?: string } = {};
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        captured.url = url;
        return { ok: true, json: async () => ({ voices: [{ name: "nova", type: "OpenAI" }] }) };
      }) as any,
    );
    expect(await getTtsVoices("openai")).toEqual([{ name: "nova", type: "OpenAI" }]);
    expect(captured.url).toContain("provider=openai");
  });

  it("testLlm posts the body and returns the result", async () => {
    const captured: { url?: string; body?: any } = {};
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: any) => {
        captured.url = url;
        captured.body = JSON.parse(init.body);
        return { ok: true, json: async () => ({ ok: false, error: "bad key" }) };
      }) as any,
    );
    expect(await testLlm({ provider: "openrouter", api_key: "k" })).toEqual({
      ok: false,
      error: "bad key",
    });
    expect(captured.url).toContain("/api/settings/test-llm");
    expect(captured.body).toEqual({ provider: "openrouter", api_key: "k" });
  });

  it("testTts hits the tts test endpoint", async () => {
    const captured: { url?: string } = {};
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        captured.url = url;
        return { ok: true, json: async () => ({ ok: true }) };
      }) as any,
    );
    expect(await testTts({ provider: "google" })).toEqual({ ok: true });
    expect(captured.url).toContain("/api/tts/test");
  });

  it("ttsPreview returns the audio payload", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ audio: "QQ==", mime: "audio/mpeg" }) })) as any,
    );
    expect(await ttsPreview({ provider: "google", voice: "v" })).toEqual({
      audio: "QQ==",
      mime: "audio/mpeg",
    });
  });

  it("uploadSkripsi posts multipart FormData", async () => {
    const captured: { body?: any } = {};
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: any) => {
        captured.body = init.body;
        return { ok: true, json: async () => ({ filename: "a.pdf", char_count: 3, uploaded_at: "t" }) };
      }) as any,
    );
    const file = new File(["hi"], "a.pdf", { type: "application/pdf" });
    const info = await uploadSkripsi(file);
    expect(info.filename).toBe("a.pdf");
    expect(captured.body).toBeInstanceOf(FormData);
  });
});
