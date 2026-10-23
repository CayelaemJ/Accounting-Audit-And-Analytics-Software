import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { currentSession, canAudit } from "@/lib/auth";
import { tenantTx } from "@/lib/db";
import { jsonError, requireSameOrigin, unexpected } from "@/lib/http";

export const runtime = "nodejs";
const schema = z.object({
  title: z.string().trim().min(5).max(180),
  description: z.string().trim().max(3000).default(""),
  severity: z.enum(["low","medium","high","critical"])
}).strict();
export async function POST(req: NextRequest) {
  try {
    requireSameOrigin(req);
    const session = await currentSession();
    if (!session) return jsonError("Sign in to continue.",401);
    if (!canAudit(session.role)) return jsonError("Audit permission required.",403);
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return jsonError("Please review the finding details.");
    const finding = await tenantTx(session, async client => {
      const r = await client.query(
        "INSERT INTO audit_findings(tenant_id,title,description,severity,created_by) VALUES($1,$2,$3,$4,$5) RETURNING id,title,severity,status",
        [session.tenantId,parsed.data.title,parsed.data.description,parsed.data.severity,session.userId]);
      await client.query("INSERT INTO audit_events(tenant_id,actor_id,action,record_id) VALUES($1,$2,'finding.created',$3)",
        [session.tenantId,session.userId,r.rows[0].id]);
      return r.rows[0];
    });
    return NextResponse.json({ finding },{status:201});
  } catch (error) { return unexpected(error); }
}
