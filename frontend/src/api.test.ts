import { describe, it, expect, vi, afterEach } from "vitest";
import { postTurn, uploadSkripsi, ttsSpeak, getTtsVoices } from "./api.js";

afterEach(() => vi.restoreAllMocks());

describe("api client", () => {
  it("postTurn returns the reply", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ reply: "Q?" }) })) as any,
    );
    expect(await postTurn("s1", "jawaban")).toBe("Q?");
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
