import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { currentSession, canWrite } from "@/lib/auth";
import { tenantTx } from "@/lib/db";
import { jsonError, requireSameOrigin, unexpected } from "@/lib/http";

export const runtime = "nodejs";
const schema = z.object({
  code: z.string().trim().min(2).max(20).regex(/^[0-9A-Za-z._-]+$/),
  name: z.string().trim().min(2).max(120),
  type: z.enum(["asset","liability","equity","revenue","expense"])
}).strict();
export async function POST(req: NextRequest) {
  try {
    requireSameOrigin(req);
    const session = await currentSession();
    if (!session) return jsonError("Sign in to continue.",401);
    if (!canWrite(session.role)) return jsonError("You do not have posting permissions.",403);
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return jsonError("Please check the account details.");
    const { code, name, type } = parsed.data;
    const account = await tenantTx(session, async client => {
      const result = await client.query(
        "INSERT INTO accounts(tenant_id,code,name,type) VALUES($1,$2,$3,$4) RETURNING id,code,name,type",
        [session.tenantId,code.toUpperCase(),name,type]);
      await client.query("INSERT INTO audit_events(tenant_id,actor_id,action,record_id) VALUES($1,$2,'account.created',$3)",
        [session.tenantId,session.userId,result.rows[0].id]);
      return result.rows[0];
    });
    return NextResponse.json({ account }, { status:201 });
  } catch (error) {
    if ((error as {code?: string})?.code === "23505") return jsonError("That account code already exists.",409);
    return unexpected(error);
  }
}
