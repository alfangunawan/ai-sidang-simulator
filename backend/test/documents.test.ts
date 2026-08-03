import { describe, it, expect } from "vitest";
import { randomBytes } from "node:crypto";
import { openDb } from "../src/db.js";
import { createUser } from "../src/repos/users.js";
import { getActiveDocument, replaceDocument, deleteDocument } from "../src/repos/documents.js";

describe("per-user documents", () => {
  it("keeps each user's active document separate", () => {
    const db = openDb(":memory:");
    const key = randomBytes(32);
    const u1 = createUser(db, "a", "h", "t");
    const u2 = createUser(db, "b", "h", "t");
    replaceDocument(db, u1, "skripsi1.pdf", "isi satu", "t1", key);
    replaceDocument(db, u2, "skripsi2.pdf", "isi dua", "t2", key);
    expect(getActiveDocument(db, u1, key)?.filename).toBe("skripsi1.pdf");
    expect(getActiveDocument(db, u2, key)?.filename).toBe("skripsi2.pdf");
    deleteDocument(db, u1);
    expect(getActiveDocument(db, u1, key)).toBeNull();
    expect(getActiveDocument(db, u2, key)?.filename).toBe("skripsi2.pdf"); // untouched
  });

  // Yang dijaga: file SQLite yang bocor tidak sama dengan naskah terbaca.
  it("stores the manuscript encrypted but returns it intact", () => {
    const db = openDb(":memory:");
    const key = randomBytes(32);
    const u = createUser(db, "a", "h", "t");
    replaceDocument(db, u, "s.pdf", "kalimat rahasia dari naskah", "t", key);

    const raw = db.prepare("SELECT full_text, char_count FROM documents").get() as {
      full_text: string;
      char_count: number;
    };
    expect(raw.full_text).not.toContain("kalimat rahasia");
    // char_count tetap panjang plaintext — dipakai UI, bukan panjang ciphertext.
    expect(raw.char_count).toBe("kalimat rahasia dari naskah".length);
    expect(getActiveDocument(db, u, key)?.full_text).toBe("kalimat rahasia dari naskah");
  });

  // Kunci berganti (atau baris lama pra-enkripsi): dokumen dianggap tidak ada
  // supaya user diminta unggah ulang, bukan 500 di setiap request.
  it("treats an undecryptable row as no document", () => {
    const db = openDb(":memory:");
    const u = createUser(db, "a", "h", "t");
    replaceDocument(db, u, "s.pdf", "isi", "t", randomBytes(32));
    expect(getActiveDocument(db, u, randomBytes(32))).toBeNull();
  });
});
