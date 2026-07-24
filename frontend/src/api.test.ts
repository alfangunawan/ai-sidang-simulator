import { describe, it, expect, vi, afterEach } from "vitest";
import { postTurn, uploadSkripsi } from "./api.js";

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
