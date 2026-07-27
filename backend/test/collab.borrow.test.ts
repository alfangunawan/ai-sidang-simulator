import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { randomBytes } from "node:crypto";
import { openDb } from "../src/db.js";
import { buildApp } from "../src/app.js";
import { getKeyUsageView } from "../src/repos/usage.js";
import { replaceDocument } from "../src/repos/documents.js";

// Stub the provider so we can observe which apiKey the turn used.
vi.mock("../src/providers/index.js", () => ({
  getProvider: (cfg: any) => ({
    async sendTurn() {
      return {
        reply: `KEY=${cfg.apiKey}`,
        usage: { input_tokens: 1, output_tokens: 1, cache_read_tokens: 0, cache_write_tokens: 0, cost_usd: 0.01 },
      };
    },
    async generate() {
      return { text: "{}", usage: undefined, truncated: false };
    },
    async checkAuth() {},
  }),
}));

async function reg(a: any, username: string) {
  const agent = request.agent(a);
  const { body } = await agent.post("/auth/register").send({ username, password: "password1" });
  return { agent, id: body.user.id };
}

describe("member borrows host AI key", () => {
  it("uses host key server-side, records key_owner=host, never exposes the key", async () => {
    const db = openDb(":memory:");
    const app = buildApp(db, randomBytes(32));
    const host = await reg(app, "host");
    const member = await reg(app, "member");

    await host.agent.post("/settings").send({ api_key: "sk-HOSTKEY" }).expect(200);

    // host becomes host + shares AI, member joins
    const created = await host.agent.post("/collab").expect(200);
    const code = created.body.hosting.invite_code;
    await host.agent.patch("/collab/shares").send({ share_ai: true, share_tts: false, share_stt: false }).expect(200);
    await member.agent.post("/collab/join").send({ code }).expect(200);

    // seed the member's document directly — avoids PDF-upload flakiness
    replaceDocument(db, member.id, "s.pdf", "isi skripsi", "t");

    const session = await member.agent.post("/sessions").send({}).expect(200);
    const turn = await member.agent
      .post(`/sessions/${session.body.session_id}/turn`)
      .send({ transcript: "jawaban saya" })
      .expect(200);

    // the reply echoes the HOST's key — member borrowed it
    expect(turn.body.reply).toBe("KEY=sk-HOSTKEY");

    // usage is attributed to the host's key, not the member's own (nonexistent) key
    expect(getKeyUsageView(db, host.id).total.calls).toBe(1);

    // member sees the borrow in Settings, but the raw key is never exposed
    const settings = await member.agent.get("/settings").expect(200);
    expect(settings.body).not.toHaveProperty("api_key");
    expect(settings.body.effective_ai_shared).toBe(true);
    expect(settings.body.has_api_key).toBe(false);
  });
});
