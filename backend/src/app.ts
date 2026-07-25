import express from "express";
import cors from "cors";
import type Database from "better-sqlite3";
import { seedDefaults } from "./repos/settings.js";
import { settingsRouter } from "./routes/settings.js";
import { sessionsRouter } from "./routes/sessions.js";
import { skripsiRouter } from "./routes/skripsi.js";
import { ttsRouter } from "./routes/tts.js";

export function buildApp(db: Database.Database, key: Buffer): express.Express {
  seedDefaults(db);

  const app = express();
  app.use(cors({ origin: "http://localhost:5173" }));
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.use("/settings", settingsRouter(db, key));
  app.use("/sessions", sessionsRouter(db, key));
  app.use("/skripsi", skripsiRouter(db));
  app.use("/tts", ttsRouter(db, key));

  app.use(
    (err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      console.error("[unhandled]", (err as Error)?.message);
      if (res.headersSent) return;
      res.status(500).json({ error: "Kesalahan server" });
    },
  );

  return app;
}
