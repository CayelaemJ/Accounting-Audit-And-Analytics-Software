import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { currentSession, canAudit } from "@/lib/auth";
import { tenantTx } from "@/lib/db";
import { jsonError, requireSameOrigin, unexpected } from "@/lib/http";

export const runtime = "nodejs";
const schema = z.object({ status: z.enum(["open","in_progress","resolved"]) }).strict();
export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(req);
    const session = await currentSession();
    if (!session) return jsonError("Sign in to continue.",401);
    if (!canAudit(session.role)) return jsonError("Audit permission required.",403);
    const { id } = await context.params;
    if (!z.string().uuid().safeParse(id).success) return jsonError("Invalid finding ID.");
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return jsonError("Invalid status.");
    const updated = await tenantTx(session, async client => {
      const r = await client.query(
        "UPDATE audit_findings SET status=$1,updated_at=now() WHERE tenant_id=$2 AND id=$3 RETURNING id,status",
        [parsed.data.status,session.tenantId,id]);
      if (!r.rowCount) return null;
      await client.query("INSERT INTO audit_events(tenant_id,actor_id,action,record_id,details) VALUES($1,$2,'finding.updated',$3,$4)",
        [session.tenantId,session.userId,id,JSON.stringify({ status:parsed.data.status })]);
      return r.rows[0];
    });
    return updated ? NextResponse.json({ finding:updated }) : jsonError("Finding not found.",404);
  } catch(error) { return unexpected(error); }
}
