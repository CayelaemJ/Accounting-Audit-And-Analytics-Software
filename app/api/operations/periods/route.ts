import {NextRequest,NextResponse} from "next/server";
import {z} from "zod";
import {currentSession} from "@/lib/auth";
import {tenantTx} from "@/lib/db";
import {jsonError,requireSameOrigin,unexpected} from "@/lib/http";
export const runtime="nodejs";
const schema=z.object({label:z.string().trim().min(2).max(80),
 startDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),endDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/)}).strict();
export async function POST(req:NextRequest){
 try{
 requireSameOrigin(req);const user=await currentSession();
 if(!user)return jsonError("Sign in required.",401);
 if(!["owner","finance_manager"].includes(user.role))return jsonError("Finance manager permission required.",403);
 const v=schema.safeParse(await req.json());if(!v.success||v.data.startDate>v.data.endDate)return jsonError("Invalid period dates.");
 const period=await tenantTx(user,async c=>{
 await c.query("SELECT pg_advisory_xact_lock(hashtext($1))",[user.tenantId]);
 const overlaps=await c.query("SELECT 1 FROM financial_periods WHERE tenant_id=$1 AND start_date<=$3 AND end_date>=$2",[user.tenantId,v.data.startDate,v.data.endDate]);
 if(overlaps.rowCount)throw new Error("A financial period already overlaps these dates.");
 const existing=await c.query("SELECT count(*)::int AS count FROM journal_entries WHERE tenant_id=$1 AND entry_date NOT BETWEEN $2 AND $3",[user.tenantId,v.data.startDate,v.data.endDate]);
 if(Number(existing.rows[0].count)>0)throw new Error("Prior entries exist outside the proposed period; configure a period covering your ledger history first.");
 const r=await c.query("INSERT INTO financial_periods(tenant_id,label,start_date,end_date,created_by) VALUES($1,$2,$3,$4,$5) RETURNING id,label,status,start_date,end_date",[user.tenantId,v.data.label,v.data.startDate,v.data.endDate,user.userId]);
 await c.query("INSERT INTO audit_events(tenant_id,actor_id,action,record_id) VALUES($1,$2,'period.created',$3)",[user.tenantId,user.userId,r.rows[0].id]);
 return r.rows[0];
 });return NextResponse.json({period},{status:201});
 }catch(e){if(e instanceof Error&&/overlaps|outside/.test(e.message))return jsonError(e.message,409);return unexpected(e);}
}
export async function PATCH(req:NextRequest){
 try{
 requireSameOrigin(req);const user=await currentSession();
 if(!user)return jsonError("Sign in required.",401);
 if(!["owner","finance_manager"].includes(user.role))return jsonError("Finance manager permission required.",403);
 const v=z.object({id:z.string().uuid(),status:z.literal("closed")}).safeParse(await req.json());
 if(!v.success)return jsonError("Invalid close request.");
 const item=await tenantTx(user,async c=>{
 const q=await c.query("UPDATE financial_periods SET status='closed' WHERE tenant_id=$1 AND id=$2 AND status='open' RETURNING id,status",[user.tenantId,v.data.id]);
 if(q.rowCount)await c.query("INSERT INTO audit_events(tenant_id,actor_id,action,record_id) VALUES($1,$2,'period.closed',$3)",[user.tenantId,user.userId,v.data.id]);
 return q.rows[0]||null;
 });return item?NextResponse.json({period:item}):jsonError("Open period not found.",404);
 }catch(e){return unexpected(e);}
}
