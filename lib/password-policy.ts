import { scrypt as nodeScrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(nodeScrypt);
/** Reject malformed hashes before any expensive password derivation. */
export async function verifyStoredPassword(password: unknown, stored: unknown): Promise<boolean> {
  if (typeof password !== "string" || password.length === 0 || password.length > 128 ||
      typeof stored !== "string") return false;
  const parts = /^scrypt:([a-f0-9]{32}):([a-f0-9]{128})$/.exec(stored);
  if (!parts) return false;
  try {
    const actual = await scrypt(password, parts[1], 64) as Buffer;
    const expected = Buffer.from(parts[2], "hex");
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
