import "dotenv/config";
import { randomBytes } from "node:crypto";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  appendFileSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

export const PORT = Number(process.env.PORT ?? 3001);

const HEX64 = /^[0-9a-fA-F]{64}$/;

export interface KeyOpts {
  genHex: () => string;
  persist: (hex: string) => void;
  onGenerate?: () => void;
}

/**
 * Resolve the AES key from a raw value.
 * - `undefined` (no ENCRYPTION_KEY at all → fresh clone): generate one,
 *   persist it, and use it. Keeps the tool working out-of-the-box while the
 *   key still lives only in the gitignored `.env`.
 * - present but not 64 hex chars: throw a clear, actionable error rather than
 *   clobber a real-but-misconfigured value.
 */
export function resolveKey(raw: string | undefined, opts: KeyOpts): Buffer {
  if (raw === undefined) {
    const hex = opts.genHex();
    opts.persist(hex);
    opts.onGenerate?.();
    return Buffer.from(hex, "hex");
  }
  if (!HEX64.test(raw)) {
    throw new Error(
      "ENCRYPTION_KEY tidak valid — harus 64 karakter hex (32 byte). Perbaiki backend/.env, mis: openssl rand -hex 32",
    );
  }
  return Buffer.from(raw, "hex");
}

export function loadEncryptionKey(): Buffer {
  return resolveKey(process.env.ENCRYPTION_KEY, {
    genHex: () => randomBytes(32).toString("hex"),
    persist: persistKeyToEnvFile,
    onGenerate: () =>
      console.warn(
        "[env] ENCRYPTION_KEY tidak ditemukan — kunci baru dibuat otomatis dan disimpan ke backend/.env",
      ),
  });
}

function persistKeyToEnvFile(hex: string): void {
  try {
    const envPath = join(dirname(fileURLToPath(import.meta.url)), "..", ".env");
    const line = `ENCRYPTION_KEY=${hex}\n`;
    if (existsSync(envPath)) {
      const cur = readFileSync(envPath, "utf8");
      if (!/^ENCRYPTION_KEY=/m.test(cur)) {
        appendFileSync(
          envPath,
          (cur === "" || cur.endsWith("\n") ? "" : "\n") + line,
        );
      }
    } else {
      writeFileSync(envPath, line);
    }
  } catch {
    // read-only fs / permission — key is still used in-memory for this run
  }
}
