import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;

export function encrypt(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString("base64");
}

export function decrypt(blob: string, key: Buffer): string {
  const data = Buffer.from(blob, "base64");
  const iv = data.subarray(0, IV_LEN);
  const tag = data.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ct = data.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

/**
 * Untuk naskah skripsi: baris yang tidak bisa dibuka diperlakukan seperti tidak
 * ada, bukan dilempar. Dua kasus nyata yang tertutup di sini — baris lama yang
 * ditulis sebelum kolomnya dienkripsi, dan ENCRYPTION_KEY yang berganti. Efeknya
 * user diminta unggah ulang; alternatifnya 500 di setiap request sampai ada yang
 * membersihkan tabel secara manual.
 */
export function tryDecrypt(blob: string, key: Buffer): string | null {
  try {
    return decrypt(blob, key);
  } catch {
    return null;
  }
}
