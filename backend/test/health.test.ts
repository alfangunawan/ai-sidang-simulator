import { describe, it, expect } from "vitest";
import { randomBytes } from "node:crypto";
import request from "supertest";
import { buildApp } from "../src/app.js";
import { openDb } from "../src/db.js";

describe("health", () => {
  it("returns ok", async () => {
    const app = buildApp(openDb(":memory:"), randomBytes(32));
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});
