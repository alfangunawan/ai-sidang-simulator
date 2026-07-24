import "dotenv/config";

export const PORT = Number(process.env.PORT ?? 3001);

export function loadEncryptionKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex || !/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error(
      "ENCRYPTION_KEY must be set to 64 hex chars (32 bytes). Run: openssl rand -hex 32",
    );
  }
  return Buffer.from(hex, "hex");
}
