import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { tx, setActor } from "@/lib/db";
import { hashPassword, issueSessionToken, saveSession, setSessionCookie } from "@/lib/auth";
import { jsonError, requireSameOrigin, limit, unexpected } from "@/lib/http";

export const runtime = "nodejs";
const schema = z.object({
  email: z.string().trim().toLowerCase().email().max(180),
  password: z.string().min(12).max(128),
  organisation: z.string().trim().min(2).max(120)
}).strict();
const defaultAccounts = [
  ["1000","Cash and bank","asset"],
  ["1100","Accounts receivable","asset"],
  ["2000","Accounts payable","liability"],
  ["3000","Owner's equity","equity"],
  ["4000","Sales revenue","revenue"],
  ["5000","Operating expenses","expense"]
];
export async function POST(req: NextRequest) {
  try {
    requireSameOrigin(req);
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return jsonError("Provide a valid email, 12+ character password and organisation name.");
    const { email, password, organisation } = parsed.data;
    const ip = req.headers.get("x-real-ip") || req.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
    if (!(await limit("register:" + ip, 10))) return jsonError("Too many attempts. Please try again later.", 429);
    const hash = await hashPassword(password);
    const tenantId = randomUUID();
    const token = issueSessionToken();
    await tx(async client => {
      const user = await client.query("INSERT INTO users(email,password_hash) VALUES($1,$2) RETURNING id", [email,hash]);
      const userId = user.rows[0].id as string;
      await setActor(client, userId, tenantId);
      const slug = organisation.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,60) + "-" + tenantId.slice(0,8);
      await client.query("INSERT INTO tenants(id,name,slug,created_by) VALUES($1,$2,$3,$4)",[tenantId,organisation,slug,userId]);
      await client.query("INSERT INTO memberships(tenant_id,user_id,role) VALUES($1,$2,'owner')",[tenantId,userId]);
      for (const [code,name,type] of defaultAccounts) {
        await client.query("INSERT INTO accounts(tenant_id,code,name,type) VALUES($1,$2,$3,$4)",[tenantId,code,name,type]);
      }
      await saveSession(client,userId,tenantId,token);
    });
    await setSessionCookie(token);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    if ((error as { code?: string })?.code === "23505") return jsonError("This email is already registered.",409);
    return unexpected(error);
  }
}
