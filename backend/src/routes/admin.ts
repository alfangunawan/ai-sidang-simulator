import { Router } from "express";
import type Database from "better-sqlite3";
import { getOverview } from "../repos/admin.js";

export function adminRouter(
  db: Database.Database,
  now: () => string = () => new Date().toISOString(),
): Router {
  const r = Router();

  r.get("/overview", (_req, res) => {
    res.json(getOverview(db, now()));
  });

  return r;
}
