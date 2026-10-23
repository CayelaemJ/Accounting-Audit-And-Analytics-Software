import {NextRequest,NextResponse} from "next/server";
import {z} from "zod";
import {currentSession} from "@/lib/auth";
import {tenantTx} from "@/lib/db";
import {jsonError,requireSameOrigin,unexpected} from "@/lib/http";
export const runtime="nodejs";export const dynamic="force-dynamic";
const schema=z.object({
 name:z.string().trim().min(3).max(120),
 template:z.enum(["trial_balance","income_summary","audit_findings","bank_reconciliation","budget_variance"])
}).strict();
export async function GET(){
 try{
 const user=await currentSession();if(!user)return jsonError("Sign in required.",401);
 const reports=await tenantTx(user,async c=>{
  const q=await c.query("SELECT id,name,template,created_by,created_at FROM saved_reports WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 100",[user.tenantId]);
  return q.rows;
 });
 return NextResponse.json({reports},{headers:{"Cache-Control":"no-store"}});
 }catch(e){return unexpected(e);}
}
export async function POST(req:NextRequest){
 try{
 requireSameOrigin(req);const user=await currentSession();if(!user)return jsonError("Sign in required.",401);
 if(!["owner","finance_manager","accountant","auditor"].includes(user.role))return jsonError("Report author permission required.",403);
 const parsed=schema.safeParse(await req.json());if(!parsed.success)return jsonError("Invalid report template or name.");
 const report=await tenantTx(user,async c=>{
  const result=await c.query("INSERT INTO saved_reports(tenant_id,name,template,created_by) VALUES($1,$2,$3,$4) RETURNING id,name,template",[user.tenantId,parsed.data.name,parsed.data.template,user.userId]);
  await c.query("INSERT INTO audit_events(tenant_id,actor_id,action,record_id) VALUES($1,$2,'report.saved',$3)",[user.tenantId,user.userId,result.rows[0].id]);
  return result.rows[0];
 });
 return NextResponse.json({report},{status:201});
 }catch(e){return unexpected(e);}
}
