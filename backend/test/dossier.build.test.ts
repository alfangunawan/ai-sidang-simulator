import { describe, it, expect, vi } from "vitest";
import { randomBytes } from "node:crypto";
import { openDb } from "../src/db.js";
import { createUser } from "../src/repos/users.js";
import { saveSettings } from "../src/repos/settings.js";
import { replaceDocument, getDossierRow } from "../src/repos/documents.js";
import { buildDossier } from "../src/dossier.js";

vi.mock("../src/providers/index.js", () => ({
  getProvider: () => ({
    async generate(): Promise<never> {
      throw new Error("OpenRouter request failed: kredit OpenRouter habis (HTTP 402)");
    },
    async sendTurn(): Promise<never> {
      throw new Error("unused");
    },
    async checkAuth() {},
  }),
}));

describe("buildDossier when the model call fails", () => {
  it("stores the provider's reason, so the UI stops blaming the PDF", async () => {
    const db = openDb(":memory:");
    const key = randomBytes(32);
    const userId = createUser(db, "mahasiswa", "hash", "t");
    saveSettings(db, userId, key, { api_key: "sk-x", provider: "openrouter", model: "x/y" });
    const documentId = replaceDocument(db, userId, "skripsi.pdf", "isi naskah", "t");

    await buildDossier(db, userId, key, documentId, "isi naskah", () => "t");

    const row = getDossierRow(db, documentId);
    expect(row?.dossier_status).toBe("failed");
    // Sebab yang bisa ditindaklanjuti ikut tersimpan — bukan "gagal" telanjang
    // yang membuat user mengunggah ulang PDF yang sebenarnya tidak bersalah.
    expect(row?.dossier_error).toMatch(/kredit OpenRouter habis \(HTTP 402\)/);
  });
});
