import {NextResponse} from "next/server";
import {currentSession} from "@/lib/auth";
import {isPlatformAdmin} from "@/lib/platform-admin";
import {pool} from "@/lib/db";
import {jsonError,unexpected} from "@/lib/http";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function GET(){
 try{
  const session=await currentSession();
  if(!session)return jsonError("Sign in required.",401);
  if(!await isPlatformAdmin(session.userId))return jsonError("Platform administrator access required.",403);
  const [stats,tenants]=await Promise.all([
   pool().query(`SELECT
      (SELECT count(*)::int FROM tenants) AS organisations,
      (SELECT count(*)::int FROM users) AS users,
      (SELECT count(*)::int FROM journal_entries) AS journals,
      (SELECT count(*)::int FROM audit_findings WHERE status<>'resolved') AS unresolved_findings`),
   pool().query(`SELECT t.id,t.name,t.slug,t.created_at,count(m.user_id)::int AS members
    FROM tenants t LEFT JOIN memberships m ON m.tenant_id=t.id AND m.active=true
    GROUP BY t.id ORDER BY t.created_at DESC LIMIT 100`)
  ]);
  return NextResponse.json({summary:stats.rows[0],organisations:tenants.rows,
   role:"superadmin",permission:"Platform metadata only; no tenant financial records",
   refreshedAt:new Date().toISOString()},{headers:{"Cache-Control":"no-store"}});
 }catch(error){return unexpected(error);}
}
