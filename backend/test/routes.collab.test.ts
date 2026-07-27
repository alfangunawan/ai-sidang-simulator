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

  it("blocks unauthenticated and joining own collab", async () => {
    const a = app();
    await request(a).get("/collab").expect(401);
    const host = await reg(a, "host");
    await host.agent.post("/collab").expect(200);
    const code = (await host.agent.get("/collab")).body.hosting.invite_code;
    await host.agent.post("/collab/join").send({ code }).expect(400); // own
  });
});
