import { Router, type RequestHandler } from "express";
import type Database from "better-sqlite3";
import {
  hashPassword, verifyPassword, newToken, expiresAt,
  setAuthCookie, clearAuthCookie, readAuthCookie,
} from "../auth.js";
import {
  createUser, getUserByUsername, getUserById,
  createToken, getUserIdByToken, deleteToken, isAdmin,
} from "../repos/users.js";
import { seedDefaults } from "../repos/settings.js";

const USERNAME_RE = /^[a-zA-Z0-9_]{3,32}$/;

export function requireAuth(
  db: Database.Database,
  now: () => string = () => new Date().toISOString(),
): RequestHandler {
  return (req, res, next) => {
    const token = readAuthCookie(req);
    const userId = token ? getUserIdByToken(db, token, now()) : null;
    if (!userId) return res.status(401).json({ error: "Silakan login" });
    req.userId = userId;
    next();
  };
}

/**
 * Pasang SESUDAH requireAuth. Gerbangnya membaca kolom `users.is_admin` lewat
 * `req.userId` — terikat ke id, bukan username, supaya ganti username tidak
 * diam-diam mencabut atau memindahkan hak admin.
 */
export function requireAdmin(db: Database.Database): RequestHandler {
  return (req, res, next) => {
    if (!isAdmin(db, req.userId!)) return res.status(403).json({ error: "Khusus admin" });
    next();
  };
}

export function authRouter(
  db: Database.Database,
  now: () => string = () => new Date().toISOString(),
): Router {
  const r = Router();

  function issue(res: Parameters<RequestHandler>[1], req: Parameters<RequestHandler>[0], userId: number) {
    const token = newToken();
    const at = now();
    createToken(db, token, userId, at, expiresAt(at));
    setAuthCookie(res, token, req.secure);
  }

  r.post("/register", (req, res) => {
    const username = String(req.body?.username ?? "");
    const password = String(req.body?.password ?? "");
    if (!USERNAME_RE.test(username)) {
      return res.status(400).json({ error: "Username 3–32 karakter, huruf/angka/underscore" });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: "Password minimal 8 karakter" });
    }
    if (getUserByUsername(db, username)) {
      return res.status(409).json({ error: "Username sudah dipakai" });
    }
    const userId = createUser(db, username, hashPassword(password), now());
    seedDefaults(db, userId);
    issue(res, req, userId);
    res.json({ user: getUserById(db, userId) });
  });

  r.post("/login", (req, res) => {
    const username = String(req.body?.username ?? "");
    const password = String(req.body?.password ?? "");
    const user = getUserByUsername(db, username);
    if (!user || !verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ error: "Username atau password salah" });
    }
    issue(res, req, user.id);
    res.json({ user: getUserById(db, user.id) });
  });

  r.post("/logout", (req, res) => {
    const token = readAuthCookie(req);
    if (token) deleteToken(db, token);
    clearAuthCookie(res);
    res.json({ ok: true });
  });

  r.get("/me", (req, res) => {
    const token = readAuthCookie(req);
    const userId = token ? getUserIdByToken(db, token, now()) : null;
    const user = userId ? getUserById(db, userId) : null;
    if (!user) return res.status(401).json({ error: "Belum login" });
    res.json({ user });
  });

  return r;
}
