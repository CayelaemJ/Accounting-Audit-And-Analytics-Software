import {verifyStoredPassword} from "@/lib/password-policy";
import { randomBytes, createHash, scrypt as nodeScrypt } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { pool, tx, setActor } from "@/lib/db";
import type { PoolClient } from "pg";

const scrypt = promisify(nodeScrypt);
const COOKIE = "cabo_session";
export type Session = { userId: string; tenantId: string; email: string; role: string };
export function sessionDigest(token: string) { return createHash("sha256").update(token).digest("hex"); }
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const key = await scrypt(password, salt, 64) as Buffer;
  return "scrypt:" + salt + ":" + key.toString("hex");
}
export async function verifyPassword(password: string, stored: string) {
  return verifyStoredPassword(password, stored);
}
export function issueSessionToken() { return randomBytes(32).toString("base64url"); }
export async function saveSession(client: PoolClient, userId: string, tenantId: string, token: string) {
  await client.query("INSERT INTO sessions(token_hash,user_id,tenant_id,expires_at) VALUES($1,$2,$3,now()+interval '7 days')",
    [sessionDigest(token), userId, tenantId]);
}
export async function setSessionCookie(token: string) {
  const jar = await cookies();
  jar.set(COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 604800 });
}
export async function clearSessionCookie() {
  const jar = await cookies();
  jar.set(COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
}
export async function currentSession(): Promise<Session | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const found = await pool().query(
    "SELECT s.user_id,s.tenant_id,u.email FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at > now()",
    [sessionDigest(token)]);
  if (!found.rowCount) return null;
  const row = found.rows[0];
  return tx(async client => {
    await setActor(client, row.user_id, row.tenant_id);
    const membership = await client.query(
      "SELECT role FROM memberships WHERE user_id=$1 AND tenant_id=$2 AND active=true", [row.user_id,row.tenant_id]);
    return membership.rowCount ? { userId: row.user_id, tenantId: row.tenant_id, email: row.email, role: membership.rows[0].role } : null;
  });
}
export async function revokeCurrentSession() {
  const token = (await cookies()).get(COOKIE)?.value;
  if (token) await pool().query("DELETE FROM sessions WHERE token_hash=$1", [sessionDigest(token)]);
}
export function canWrite(role: string) { return ["owner", "finance_manager", "accountant"].includes(role); }
export function canAudit(role: string) { return ["owner", "finance_manager", "auditor"].includes(role); }
