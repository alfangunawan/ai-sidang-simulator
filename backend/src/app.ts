import express from "express";
import cors from "cors";
import type Database from "better-sqlite3";
import { authRouter, requireAuth } from "./routes/auth.js";
import { settingsRouter } from "./routes/settings.js";
import { sessionsRouter } from "./routes/sessions.js";
import { skripsiRouter } from "./routes/skripsi.js";
import { ttsRouter } from "./routes/tts.js";
import { sttRouter } from "./routes/stt.js";
import { collabRouter } from "./routes/collab.js";

export function buildApp(db: Database.Database, key: Buffer): express.Express {
  const app = express();
  app.set("trust proxy", 1);
  app.use(cors({ origin: "http://localhost:5173", credentials: true }));
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.use("/auth", authRouter(db));

  const auth = requireAuth(db);
  app.use("/settings", auth, settingsRouter(db, key));
  app.use("/sessions", auth, sessionsRouter(db, key));
  app.use("/skripsi", auth, skripsiRouter(db, key));
  app.use("/tts", auth, ttsRouter(db, key));
  app.use("/stt", auth, sttRouter(db, key));
  app.use("/collab", auth, collabRouter(db));

  app.use(
    (err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      console.error("[unhandled]", (err as Error)?.message);
      if (res.headersSent) return;
      res.status(500).json({ error: "Kesalahan server" });
    },
  );

  return app;
}
