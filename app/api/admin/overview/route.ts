import {NextResponse} from "next/server";
import {currentSession} from "@/lib/auth";
import {isPlatformAdmin} from "@/lib/platform-admin";
import {tx,setActor} from "@/lib/db";
import {jsonError,unexpected} from "@/lib/http";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function GET(){
 try{
  const session=await currentSession();
  if(!session)return jsonError("Sign in required.",401);
  if(!await isPlatformAdmin(session.userId))return jsonError("Platform administrator access required.",403);
  const data=await tx(async client=>{
   await setActor(client,session.userId,session.tenantId);
   const stats=await client.query(`SELECT
    (SELECT count(*)::int FROM tenants) AS organisations,
    (SELECT count(*)::int FROM users) AS users,
    (SELECT count(*)::int FROM memberships WHERE active=true) AS active_memberships,
    (SELECT count(*)::int FROM platform_admins WHERE active=true) AS platform_administrators`);
   const tenants=await client.query(`SELECT t.id,t.name,t.slug,t.created_at,
    count(m.user_id)::int AS members
    FROM tenants t LEFT JOIN memberships m ON m.tenant_id=t.id AND m.active=true
    GROUP BY t.id ORDER BY t.created_at DESC LIMIT 100`);
   return {summary:stats.rows[0],organisations:tenants.rows};
  });
  return NextResponse.json({...data,role:"superadmin",
   permission:"Read-only platform metadata only; accounting and audit records remain tenant-isolated.",
   refreshedAt:new Date().toISOString()},{headers:{"Cache-Control":"no-store"}});
 }catch(error){return unexpected(error);}
}
