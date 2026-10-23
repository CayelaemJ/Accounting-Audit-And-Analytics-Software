import {NextRequest,NextResponse} from "next/server";
import {z} from "zod";
import {currentSession} from "@/lib/auth";
import {tenantTx} from "@/lib/db";
import {jsonError,requireSameOrigin,unexpected} from "@/lib/http";
import {toCents,fromCents} from "@/lib/money";
export const runtime="nodejs";
export async function POST(req:NextRequest){
 try{
 requireSameOrigin(req);const user=await currentSession();
 if(!user)return jsonError("Sign in required.",401);
 if(!["owner","finance_manager"].includes(user.role))return jsonError("Finance manager permission required.",403);
 const v=z.object({accountId:z.string().uuid(),month:z.string().regex(/^\d{4}-\d{2}-01$/),
 amount:z.string().max(24)}).strict().safeParse(await req.json());
 if(!v.success)return jsonError("Invalid budget.");
 let amount:string;try{amount=fromCents(toCents(v.data.amount));}catch{return jsonError("Amount must be non-negative with 2 decimals.");}
 const budget=await tenantTx(user,async c=>{
 const acc=await c.query("SELECT id FROM accounts WHERE tenant_id=$1 AND id=$2",[user.tenantId,v.data.accountId]);
 if(!acc.rowCount)throw new Error("Account not found in your organisation.");
 const r=await c.query(`INSERT INTO budgets(tenant_id,account_id,month,amount,created_by) VALUES($1,$2,$3,$4,$5)
  ON CONFLICT(tenant_id,account_id,month) DO UPDATE SET amount=EXCLUDED.amount,updated_at=now()
  RETURNING id,month,amount::text`,[user.tenantId,v.data.accountId,v.data.month,amount,user.userId]);
 await c.query("INSERT INTO audit_events(tenant_id,actor_id,action,record_id) VALUES($1,$2,'budget.updated',$3)",[user.tenantId,user.userId,r.rows[0].id]);
 return r.rows[0];
 });return NextResponse.json({budget});
 }catch(e){if(e instanceof Error&&e.message.includes("Account not found"))return jsonError(e.message,404);return unexpected(e);}
}
