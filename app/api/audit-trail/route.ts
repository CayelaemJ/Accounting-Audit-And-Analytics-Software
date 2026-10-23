import {NextRequest,NextResponse} from "next/server";
import {currentSession} from "@/lib/auth";
import {tenantTx} from "@/lib/db";
import {jsonError,unexpected} from "@/lib/http";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function GET(req:NextRequest){
 try{
  const user=await currentSession();
  if(!user)return jsonError("Sign in required.",401);
  if(!["owner","finance_manager","auditor"].includes(user.role))return jsonError("Audit-trail permission required.",403);
  const p=req.nextUrl.searchParams;
  const limitValue=p.get("limit")||"50";
  const before=p.get("before");
  if(!/^\d{1,3}$/.test(limitValue))return jsonError("Invalid page size.");
  const limit=Number(limitValue);
  if(limit<1||limit>100)return jsonError("Page size must be between 1 and 100.");
  if(before!==null&&(!/^\d{1,19}$/.test(before)||BigInt(before)<1n||BigInt(before)>9223372036854775807n))
   return jsonError("Invalid audit pagination cursor.");
  const result=await tenantTx(user,async c=>{
   const q=await c.query(`SELECT a.id::text AS id,a.happened_at,a.action,a.record_id,
     a.details,u.email AS actor_email
     FROM audit_events a JOIN users u ON u.id=a.actor_id
     WHERE a.tenant_id=$1 AND ($2::bigint IS NULL OR a.id<$2::bigint)
     ORDER BY a.id DESC LIMIT $3`,[user.tenantId,before,limit+1]);
   const more=q.rows.length>limit;
   const events=q.rows.slice(0,limit);
   return {events,nextCursor:more?events[events.length-1].id:null};
  });
  return NextResponse.json({...result,readOnly:true,asOf:new Date().toISOString()},
   {headers:{"Cache-Control":"no-store"}});
 }catch(e){return unexpected(e);}
}
