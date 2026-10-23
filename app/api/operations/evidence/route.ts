import {NextRequest,NextResponse} from "next/server";
import {createHash} from "node:crypto";
import {z} from "zod";
import {currentSession,canAudit} from "@/lib/auth";
import {tenantTx} from "@/lib/db";
import {jsonError,requireSameOrigin,unexpected} from "@/lib/http";
export const runtime="nodejs";
const schema=z.discriminatedUnion("action",[
 z.object({action:z.literal("evidence"),engagementId:z.string().uuid(),title:z.string().trim().min(5).max(180),
 sourceRef:z.string().trim().min(3).max(300),notes:z.string().trim().max(4000)}).strict(),
 z.object({action:z.literal("report"),engagementId:z.string().uuid(),title:z.string().trim().min(5).max(180),body:z.string().trim().min(20).max(20000)}).strict(),
 z.object({action:z.literal("approve"),reportId:z.string().uuid()}).strict()
]);
export async function POST(req:NextRequest){
 try{
 requireSameOrigin(req);const user=await currentSession();if(!user)return jsonError("Sign in required.",401);
 if(!canAudit(user.role))return jsonError("Audit permission required.",403);
 const val=schema.safeParse(await req.json());if(!val.success)return jsonError("Review evidence or report details.");
 const x=val.data;
 const result=await tenantTx(user,async c=>{
  if(x.action==="approve"){
   const updated=await c.query("UPDATE audit_reports SET status='approved',approved_by=$1,approved_at=now() WHERE tenant_id=$2 AND id=$3 AND status='draft' AND prepared_by<>$1 RETURNING id,status",[user.userId,user.tenantId,x.reportId]);
   if(!updated.rowCount)throw new Error("Report must be reviewed by another authorised auditor.");
   await c.query("INSERT INTO audit_events(tenant_id,actor_id,action,record_id) VALUES($1,$2,'audit.report.approved',$3)",[user.tenantId,user.userId,x.reportId]);
   return updated.rows[0];
  }
  const exists=await c.query("SELECT id FROM audit_engagements WHERE tenant_id=$1 AND id=$2",[user.tenantId,x.engagementId]);
  if(!exists.rowCount)throw new Error("Engagement not found.");
  if(x.action==="evidence"){
   const digest=createHash("sha256").update(JSON.stringify([x.engagementId,x.title,x.sourceRef,x.notes])).digest("hex");
   const q=await c.query("INSERT INTO audit_evidence(tenant_id,engagement_id,title,source_ref,notes,evidence_sha256,submitted_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,evidence_sha256",
    [user.tenantId,x.engagementId,x.title,x.sourceRef,x.notes,digest,user.userId]);
   await c.query("INSERT INTO audit_events(tenant_id,actor_id,action,record_id) VALUES($1,$2,'audit.evidence.recorded',$3)",[user.tenantId,user.userId,q.rows[0].id]);
   return q.rows[0];
  }
  const q=await c.query("INSERT INTO audit_reports(tenant_id,engagement_id,title,body,prepared_by) VALUES($1,$2,$3,$4,$5) RETURNING id,status",
   [user.tenantId,x.engagementId,x.title,x.body,user.userId]);
  await c.query("INSERT INTO audit_events(tenant_id,actor_id,action,record_id) VALUES($1,$2,'audit.report.drafted',$3)",[user.tenantId,user.userId,q.rows[0].id]);
  return q.rows[0];
 });
 return NextResponse.json(result,{status:x.action==="approve"?200:201});
 }catch(e){
 if(e instanceof Error&&/Engagement not found|reviewed by another/.test(e.message))return jsonError(e.message,422);
 return unexpected(e);
 }
}
