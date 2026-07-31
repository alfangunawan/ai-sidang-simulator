import { Router } from "express";
import type Database from "better-sqlite3";
import { getOverview, listUsers, getUserDetail } from "../repos/admin.js";

export function adminRouter(
  db: Database.Database,
  now: () => string = () => new Date().toISOString(),
): Router {
  const r = Router();

  r.get("/overview", (_req, res) => {
    res.json(getOverview(db, now()));
  });

  r.get("/users", (_req, res) => {
    res.json({ users: listUsers(db) });
  });

  r.get("/users/:id", (req, res) => {
    const detail = getUserDetail(db, Number(req.params.id));
    if (!detail) return res.status(404).json({ error: "Pengguna tidak ditemukan" });
    res.json(detail);
  });

  return r;
}
