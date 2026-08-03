import { describe, it, expect } from "vitest";
import request from "supertest";
import { randomBytes } from "node:crypto";
import { openDb } from "../src/db.js";
import { buildApp } from "../src/app.js";

function app() { return buildApp(openDb(":memory:"), randomBytes(32)); }
async function reg(a: any, username: string) {
  const agent = request.agent(a);
  const { body } = await agent.post("/auth/register").send({ username, password: "password1" });
  return { agent, id: body.user.id };
}

describe("collab routes", () => {
  it("host creates, shares, member joins by code, host lists + kicks", async () => {
    const a = app();
    const host = await reg(a, "host");
    const member = await reg(a, "member");

    await host.agent.get("/collab").expect(200).then((r) => expect(r.body.hosting).toBeNull());
    const created = await host.agent.post("/collab").expect(200);
    const code = created.body.hosting.invite_code;
    expect(code).toMatch(/^[0-9a-f]{12}$/);

    await host.agent.patch("/collab/shares").send({ share_ai: true, share_tts: false, share_stt: true }).expect(200);

    await member.agent.post("/collab/join").send({ code: "deadbeefdead" }).expect(404); // unknown
    await member.agent.post("/collab/join").send({ code }).expect(200);
    await member.agent.post("/collab/join").send({ code }).expect(400); // already

    const state = await host.agent.get("/collab").expect(200);
    expect(state.body.hosting.members.map((m: any) => m.username)).toEqual(["member"]);
    expect(state.body.hosting.shares).toMatchObject({ share_ai: 1, share_tts: 0, share_stt: 1 });

    const mstate = await member.agent.get("/collab").expect(200);
    expect(mstate.body.joined).toMatchObject({ host_username: "host" });

    await host.agent.delete(`/collab/members/${member.id}`).expect(200);
    await member.agent.get("/collab").expect(200).then((r) => expect(r.body.joined).toBeNull());
  });

  it("host sets its own code by hand and members join with any casing", async () => {
    const a = app();
    const host = await reg(a, "host");
    const member = await reg(a, "member");
    await host.agent.post("/collab").expect(200);

    const saved = await host.agent.put("/collab/code").send({ code: "Sibiru-2026" }).expect(200);
    expect(saved.body.hosting.invite_code).toBe("Sibiru-2026");

    await member.agent.post("/collab/join").send({ code: "SIBIRU-2026" }).expect(200);
  });

  it("rejects bad shapes, taken codes, and non-hosts", async () => {
    const a = app();
    const host = await reg(a, "host");
    const other = await reg(a, "other");
    const stranger = await reg(a, "stranger");
    await host.agent.post("/collab").expect(200);
    await other.agent.post("/collab").expect(200);

    await host.agent.put("/collab/code").send({ code: "abc" }).expect(400);
    await host.agent.put("/collab/code").send({ code: "sibiru-2026" }).expect(200);
    await host.agent.put("/collab/code").send({ code: "sibiru-2026" }).expect(200); // kodenya sendiri
    await other.agent.put("/collab/code").send({ code: "SIBIRU-2026" }).expect(409);
    await stranger.agent.put("/collab/code").send({ code: "kelas-a" }).expect(400); // belum jadi host
  });

  it("locks out after too many wrong codes, and a hit resets the count", async () => {
    const a = app();
    const host = await reg(a, "host");
    const member = await reg(a, "member");
    const patient = await reg(a, "patient");
    const code = (await host.agent.post("/collab").expect(200)).body.hosting.invite_code;

    for (let i = 0; i < 9; i++) {
      await patient.agent.post("/collab/join").send({ code: "nope-nope" }).expect(404);
    }
    await patient.agent.post("/collab/join").send({ code }).expect(200); // masih boleh, hitungan direset
    for (let i = 0; i < 10; i++) {
      await member.agent.post("/collab/join").send({ code: "nope-nope" }).expect(404);
    }
    await member.agent.post("/collab/join").send({ code }).expect(429); // kode benar pun ditolak
  });

  it("blocks unauthenticated and joining own collab", async () => {
    const a = app();
    await request(a).get("/collab").expect(401);
    const host = await reg(a, "host");
    await host.agent.post("/collab").expect(200);
    const code = (await host.agent.get("/collab")).body.hosting.invite_code;
    await host.agent.post("/collab/join").send({ code }).expect(400); // own
  });
});
