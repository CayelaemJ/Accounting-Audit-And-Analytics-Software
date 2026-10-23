import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { pool, tx, setActor } from "@/lib/db";
import { verifyPassword, issueSessionToken, saveSession, setSessionCookie } from "@/lib/auth";
import { jsonError, requireSameOrigin, limit, unexpected } from "@/lib/http";

export const runtime = "nodejs";
const schema = z.object({
  identifier: z.string().trim().toLowerCase().min(3).max(180),
  password: z.string().min(1).max(128)
}).strict();
export async function POST(req: NextRequest) {
  try {
    requireSameOrigin(req);
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return jsonError("Invalid email or password.", 401);
    const { identifier, password } = parsed.data;
    const ip = req.headers.get("x-real-ip") || req.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
    if (!(await limit("login:" + identifier + ":" + ip, 8))) return jsonError("Too many attempts. Please try again later.", 429);
    const user = await pool().query("SELECT id,password_hash FROM users WHERE email=$1 OR username=$1 LIMIT 1",[identifier]);
    if (!user.rowCount || !(await verifyPassword(password,user.rows[0].password_hash))) return jsonError("Invalid email or password.", 401);
    const userId = user.rows[0].id as string;
    const token = issueSessionToken();
    const member = await tx(async client => {
      await setActor(client,userId);
      const result = await client.query("SELECT tenant_id FROM memberships WHERE user_id=$1 AND active=true ORDER BY created_at LIMIT 1",[userId]);
      if (!result.rowCount) return null;
      await saveSession(client,userId,result.rows[0].tenant_id,token);
      return result.rows[0].tenant_id as string;
    });
    if (!member) return jsonError("No active organisation membership.",403);
    await setSessionCookie(token);
    return NextResponse.json({ ok: true });
  } catch (error) { return unexpected(error); }
}
