import { describe, it, expect } from "vitest";
import request from "supertest";
import { randomBytes } from "node:crypto";
import { openDb } from "../src/db.js";
import { buildApp } from "../src/app.js";
import { setAdmin } from "../src/repos/users.js";
import { PERSONA_SEED } from "../src/personas.js";
import { listPersonas } from "../src/repos/personas.js";

function ctx() {
  const db = openDb(":memory:");
  return { db, app: buildApp(db, randomBytes(32)) };
}
async function reg(app: any, username: string) {
  const agent = request.agent(app);
  const { body } = await agent
    .post("/auth/register")
    .send({ username, password: "password1" })
    .expect(200);
  return { agent, id: body.user.id };
}

describe("GET /settings/personas", () => {
  it("is readable by any signed-in user and needs no admin", async () => {
    const { app } = ctx();
    const budi = await reg(app, "budi");
    const { body } = await budi.agent.get("/settings/personas").expect(200);
    expect(body.personas.map((p: any) => p.key)).toEqual(PERSONA_SEED.map((p) => p.key));
  });

  it("is 401 without a cookie", async () => {
    const { app } = ctx();
    await request(app).get("/settings/personas").expect(401);
  });
});

describe("/admin/personas", () => {
  it("creates, updates, and deletes a persona", async () => {
    const { db, app } = ctx();
    const admin = await reg(app, "alfan");
    setAdmin(db, admin.id, 1);

    const zaki = {
      key: "zaki", name: "Dr. Zaki", initials: "DZ", role: "Penguji tamu",
      mode: "kritis", type: "domain", color: "#123456", trait: "Baru.",
      position: 99, active: true,
    };
    await admin.agent.put("/admin/personas/zaki").send(zaki).expect(200);
    let list = (await admin.agent.get("/admin/personas").expect(200)).body.personas;
    expect(list.find((p: any) => p.key === "zaki").name).toBe("Dr. Zaki");

    await admin.agent
      .put("/admin/personas/zaki")
      .send({ ...zaki, name: "Dr. Zaki Rahman" })
      .expect(200);
    list = (await admin.agent.get("/admin/personas")).body.personas;
    expect(list.find((p: any) => p.key === "zaki").name).toBe("Dr. Zaki Rahman");

    await admin.agent.delete("/admin/personas/zaki").expect(200);
    list = (await admin.agent.get("/admin/personas")).body.personas;
    expect(list.some((p: any) => p.key === "zaki")).toBe(false);
  });

  it("rejects a body missing required fields", async () => {
    const { db, app } = ctx();
    const admin = await reg(app, "alfan");
    setAdmin(db, admin.id, 1);
    await admin.agent.put("/admin/personas/zaki").send({ name: "" }).expect(400);
  });

  // Menghapus persona terakhir membuat picker mahasiswa kosong.
  it("refuses to delete the last active persona", async () => {
    const { db, app } = ctx();
    const admin = await reg(app, "alfan");
    setAdmin(db, admin.id, 1);
    for (const p of PERSONA_SEED.slice(1)) {
      await admin.agent.delete(`/admin/personas/${p.key}`).expect(200);
    }
    await admin.agent.delete(`/admin/personas/${PERSONA_SEED[0].key}`).expect(400);
  });

  it("is 403 for a plain user", async () => {
    const { app } = ctx();
    const budi = await reg(app, "budi");
    await budi.agent.get("/admin/personas").expect(403);
  });

  // PUT can empty the picker just as surely as DELETE — deactivating the
  // last active persona must hit the same guard.
  it("refuses to deactivate the last active persona via PUT", async () => {
    const { db, app } = ctx();
    const admin = await reg(app, "alfan");
    setAdmin(db, admin.id, 1);
    for (const p of PERSONA_SEED.slice(1)) {
      await admin.agent.put(`/admin/personas/${p.key}`).send({ ...p, active: false }).expect(200);
    }
    const last = PERSONA_SEED[0];
    await admin.agent.put(`/admin/personas/${last.key}`).send({ ...last, active: false }).expect(400);
    expect(listPersonas(db)).toEqual([expect.objectContaining({ key: last.key })]);
  });

  it("allows deactivating a persona while others remain active", async () => {
    const { db, app } = ctx();
    const admin = await reg(app, "alfan");
    setAdmin(db, admin.id, 1);
    const p = PERSONA_SEED[1];
    await admin.agent.put(`/admin/personas/${p.key}`).send({ ...p, active: false }).expect(200);
    expect(listPersonas(db).some((x) => x.key === p.key)).toBe(false);
    expect(listPersonas(db).length).toBe(PERSONA_SEED.length - 1);
  });

  it("rejects a non-boolean active value instead of coercing it truthy", async () => {
    const { db, app } = ctx();
    const admin = await reg(app, "alfan");
    setAdmin(db, admin.id, 1);
    const p = PERSONA_SEED[0];
    await admin.agent.put(`/admin/personas/${p.key}`).send({ ...p, active: "false" }).expect(400);
  });

  // personaFor mencari persona lewat pasangan mode+type, bukan key. Dua
  // persona dengan pasangan sama membuat find() mengembalikan yang salah —
  // header sidang bisa menampilkan nama penguji yang keliru sepanjang sitting.
  it("rejects an unknown examiner mode", async () => {
    const { db, app } = ctx();
    const admin = await reg(app, "alfan");
    setAdmin(db, admin.id, 1);
    const p = PERSONA_SEED[0];
    const { body } = await admin.agent
      .put(`/admin/personas/${p.key}`)
      .send({ ...p, mode: "brutal" })
      .expect(400);
    expect(body.error).toBe("Mode tidak dikenal");
  });

  it("rejects an unknown examiner type", async () => {
    const { db, app } = ctx();
    const admin = await reg(app, "alfan");
    setAdmin(db, admin.id, 1);
    const p = PERSONA_SEED[0];
    const { body } = await admin.agent
      .put(`/admin/personas/${p.key}`)
      .send({ ...p, type: "misterius" })
      .expect(400);
    expect(body.error).toBe("Tipe tidak dikenal");
  });

  it("rejects a (mode, type) pair already held by a different key", async () => {
    const { db, app } = ctx();
    const admin = await reg(app, "alfan");
    setAdmin(db, admin.id, 1);
    const siti = PERSONA_SEED.find((p) => p.key === "siti")!; // mode: kritis, type: umum
    const { body } = await admin.agent
      .put("/admin/personas/zaki")
      .send({
        key: "zaki", name: "Dr. Zaki", initials: "DZ", role: "Penguji tamu",
        mode: siti.mode, type: siti.type, color: "#123456", trait: "", position: 99, active: true,
      })
      .expect(400);
    expect(body.error).toBe("Pasangan mode dan tipe ini sudah dipakai persona lain");
  });

  it("still allows re-saving a persona with its own existing pair", async () => {
    const { db, app } = ctx();
    const admin = await reg(app, "alfan");
    setAdmin(db, admin.id, 1);
    const siti = PERSONA_SEED.find((p) => p.key === "siti")!;
    await admin.agent
      .put(`/admin/personas/${siti.key}`)
      .send({ ...siti, trait: "Diperbarui." })
      .expect(200);
    const list = (await admin.agent.get("/admin/personas")).body.personas;
    expect(list.find((p: any) => p.key === siti.key).trait).toBe("Diperbarui.");
  });

  it("treats a pair held by an inactive persona as still taken", async () => {
    const { db, app } = ctx();
    const admin = await reg(app, "alfan");
    setAdmin(db, admin.id, 1);
    const siti = PERSONA_SEED.find((p) => p.key === "siti")!;
    // Deactivate siti — she still occupies (kritis, umum) and can be reactivated later.
    await admin.agent.put(`/admin/personas/${siti.key}`).send({ ...siti, active: false }).expect(200);

    const { body } = await admin.agent
      .put("/admin/personas/zaki")
      .send({
        key: "zaki", name: "Dr. Zaki", initials: "DZ", role: "Penguji tamu",
        mode: siti.mode, type: siti.type, color: "#123456", trait: "", position: 99, active: true,
      })
      .expect(400);
    expect(body.error).toBe("Pasangan mode dan tipe ini sudah dipakai persona lain");
  });
});
