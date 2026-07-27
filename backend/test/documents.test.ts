import { describe, it, expect } from "vitest";
import { openDb } from "../src/db.js";
import { createUser } from "../src/repos/users.js";
import { getActiveDocument, replaceDocument, deleteDocument } from "../src/repos/documents.js";

describe("per-user documents", () => {
  it("keeps each user's active document separate", () => {
    const db = openDb(":memory:");
    const u1 = createUser(db, "a", "h", "t");
    const u2 = createUser(db, "b", "h", "t");
    replaceDocument(db, u1, "skripsi1.pdf", "isi satu", "t1");
    replaceDocument(db, u2, "skripsi2.pdf", "isi dua", "t2");
    expect(getActiveDocument(db, u1)?.filename).toBe("skripsi1.pdf");
    expect(getActiveDocument(db, u2)?.filename).toBe("skripsi2.pdf");
    deleteDocument(db, u1);
    expect(getActiveDocument(db, u1)).toBeNull();
    expect(getActiveDocument(db, u2)?.filename).toBe("skripsi2.pdf"); // untouched
  });
});
