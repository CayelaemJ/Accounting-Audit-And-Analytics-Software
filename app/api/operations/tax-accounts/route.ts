import {NextRequest,NextResponse} from "next/server";
import {currentSession} from "@/lib/auth";
import {tenantTx} from "@/lib/db";
import {jsonError,requireSameOrigin,limit,unexpected} from "@/lib/http";
export const runtime="nodejs";
const standards=[
 {code:"1200",name:"Input VAT",type:"asset"},
 {code:"2100",name:"Output VAT",type:"liability"}
] as const;
export async function POST(req:NextRequest){
 try{
  requireSameOrigin(req);
  const session=await currentSession();
  if(!session)return jsonError("Sign in required.",401);
  if(!["owner","finance_manager"].includes(session.role))return jsonError("Finance manager permission required.",403);
  if(!await limit("vat-account-setup:"+session.tenantId,10,60))return jsonError("Setup rate limit exceeded.",429);
  const result=await tenantTx(session,async c=>{
   const saved:unknown[]=[];let created=0;
   for(const item of standards){
    const existing=await c.query("SELECT id,name,type FROM accounts WHERE tenant_id=$1 AND code=$2",[session.tenantId,item.code]);
    if(existing.rows.length && existing.rows[0].type!==item.type)
      throw Error("Ledger account "+item.code+" already exists with an incompatible classification. Resolve it manually.");
    const q=await c.query(`INSERT INTO accounts(tenant_id,code,name,type) VALUES($1,$2,$3,$4)
      ON CONFLICT(tenant_id,code) DO NOTHING RETURNING id,code,name,type`,
     [session.tenantId,item.code,item.name,item.type]);
    if(q.rows.length)created++;
    const acc=await c.query("SELECT id,code,name,type FROM accounts WHERE tenant_id=$1 AND code=$2",[session.tenantId,item.code]);
    saved.push(acc.rows[0]);
   }
   if(created){
    const auditId=(await c.query("SELECT gen_random_uuid() AS id")).rows[0].id;
    await c.query("INSERT INTO audit_events(tenant_id,actor_id,action,record_id,details) VALUES($1,$2,'vat.accounts.configured',$3,$4)",
     [session.tenantId,session.userId,auditId,JSON.stringify({created})]);
   }
   return {accounts:saved,created};
  });
  return NextResponse.json({...result,notice:"VAT accounts are now available. VAT amounts must still be independently calculated and verified. No SARS compliance certification is provided."},{status:result.created?201:200});
 }catch(e){
  if(e instanceof Error&&e.message.includes("incompatible classification"))return jsonError(e.message,409);
  return unexpected(e);
 }
}
