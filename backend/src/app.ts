import express from "express";
import cors from "cors";
import type Database from "better-sqlite3";
import { seedDefaults } from "./repos/settings.js";
import { settingsRouter } from "./routes/settings.js";

export function buildApp(db: Database.Database, key: Buffer): express.Express {
  seedDefaults(db);

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.use("/settings", settingsRouter(db, key));

  return app;
}
