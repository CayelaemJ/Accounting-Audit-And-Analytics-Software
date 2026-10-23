import {NextRequest,NextResponse} from "next/server";
import {z} from "zod";
import {currentSession,canAudit} from "@/lib/auth";
import {tenantTx} from "@/lib/db";
import {jsonError,requireSameOrigin,unexpected} from "@/lib/http";
export const runtime="nodejs";
const input=z.discriminatedUnion("action",[
 z.object({action:z.literal("engagement"),title:z.string().trim().min(5).max(180),objective:z.string().trim().max(2000).default("")}).strict(),
 z.object({action:z.literal("control"),code:z.string().trim().min(2).max(40),title:z.string().trim().min(5).max(180),
 risk:z.string().trim().max(1000).default(""),owner:z.string().trim().max(100).default(""),
 frequency:z.enum(["daily","weekly","monthly","quarterly","annual"])}).strict(),
 z.object({action:z.literal("test"),engagementId:z.string().uuid(),controlId:z.string().uuid(),
 result:z.enum(["pass","fail","needs_review"]),notes:z.string().trim().min(5).max(3000)}).strict(),
 z.object({action:z.literal("remediation"),findingId:z.string().uuid(),description:z.string().trim().min(5).max(1000),
 dueDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/)}).strict()
]);
export async function POST(req:NextRequest){
 try{
 requireSameOrigin(req);const user=await currentSession();if(!user)return jsonError("Sign in required.",401);
 if(!canAudit(user.role))return jsonError("Audit permission required.",403);
 const v=input.safeParse(await req.json());if(!v.success)return jsonError("Invalid audit record.");
 const x=v.data;
 const result=await tenantTx(user,async c=>{
  let result:{id:string};
  if(x.action==="engagement"){
   const q=await c.query("INSERT INTO audit_engagements(tenant_id,title,objective,created_by) VALUES($1,$2,$3,$4) RETURNING id",[user.tenantId,x.title,x.objective,user.userId]);
   result=q.rows[0];
  }else if(x.action==="control"){
   const q=await c.query("INSERT INTO audit_controls(tenant_id,code,title,risk,owner,frequency,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id",
    [user.tenantId,x.code.toUpperCase(),x.title,x.risk,x.owner,x.frequency,user.userId]);
   result=q.rows[0];
  }else if(x.action==="test"){
   const q=await c.query("INSERT INTO audit_tests(tenant_id,engagement_id,control_id,result,notes,tested_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING id",
    [user.tenantId,x.engagementId,x.controlId,x.result,x.notes,user.userId]);
   result=q.rows[0];
  }else{
   const finding=await c.query("SELECT id FROM audit_findings WHERE tenant_id=$1 AND id=$2",[user.tenantId,x.findingId]);
   if(!finding.rowCount)throw new Error("Finding not found.");
   const q=await c.query("INSERT INTO remediation_actions(tenant_id,finding_id,description,due_date,created_by) VALUES($1,$2,$3,$4,$5) RETURNING id",
    [user.tenantId,x.findingId,x.description,x.dueDate,user.userId]);result=q.rows[0];
  }
  await c.query("INSERT INTO audit_events(tenant_id,actor_id,action,record_id) VALUES($1,$2,$3,$4)",
   [user.tenantId,user.userId,"audit."+x.action+".created",result.id]);
  return {id:result.id};
 });return NextResponse.json(result,{status:201});
 }catch(e){
  if(e instanceof Error&&e.message==="Finding not found.")return jsonError(e.message,404);
  if((e as {code?:string}).code==="23503")return jsonError("A selected audit reference does not belong to your organisation.",422);
  if((e as {code?:string}).code==="23505")return jsonError("Control code already exists.",409);
  return unexpected(e);
 }
}
export async function PATCH(req:NextRequest){
 try{
 requireSameOrigin(req);const user=await currentSession();if(!user)return jsonError("Sign in required.",401);
 if(!canAudit(user.role))return jsonError("Audit permission required.",403);
 const x=z.discriminatedUnion("kind",[
  z.object({kind:z.literal("engagement"),id:z.string().uuid(),status:z.enum(["planned","in_progress","review","closed"])}),
  z.object({kind:z.literal("remediation"),id:z.string().uuid(),status:z.enum(["open","in_progress","completed"])})
 ]).safeParse(await req.json());
 if(!x.success)return jsonError("Invalid status update.");
 const result=await tenantTx(user,async c=>{
  const table=x.data.kind==="engagement"?"audit_engagements":"remediation_actions";
  const q=await c.query(`UPDATE ${table} SET status=$1 ${table==="remediation_actions"?",updated_at=now()":""} WHERE tenant_id=$2 AND id=$3 RETURNING id,status`,
   [x.data.status,user.tenantId,x.data.id]);
  if(q.rowCount)await c.query("INSERT INTO audit_events(tenant_id,actor_id,action,record_id) VALUES($1,$2,$3,$4)",[user.tenantId,user.userId,"audit."+x.data.kind+".updated",x.data.id]);
  return q.rows[0]||null;
 });return result?NextResponse.json(result):jsonError("Audit record not found.",404);
 }catch(e){return unexpected(e);}
}
