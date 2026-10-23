import {NextResponse} from "next/server";
import {currentSession} from "@/lib/auth";
import {tenantTx} from "@/lib/db";
import {pool} from "@/lib/db";
import {jsonError,unexpected} from "@/lib/http";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function GET(){
 try{
 const user=await currentSession();if(!user)return jsonError("Sign in required.",401);
 const plans=await pool().query("SELECT code,name,description,price_zar_cents,features FROM subscription_plans ORDER BY code");
 const data=await tenantTx(user,async c=>{
  const [subscription,usage]=await Promise.all([
   c.query(`SELECT s.plan_code,s.status,s.changed_at,p.name AS plan_name,p.features
    FROM tenant_subscriptions s JOIN subscription_plans p ON p.code=s.plan_code WHERE s.tenant_id=$1`,[user.tenantId]),
   c.query(`SELECT
    (SELECT count(*)::int FROM journal_entries WHERE tenant_id=$1) AS journals,
    (SELECT count(*)::int FROM invoices WHERE tenant_id=$1) AS invoices,
    (SELECT count(*)::int FROM saved_reports WHERE tenant_id=$1) AS saved_reports,
    (SELECT count(*)::int FROM audit_findings WHERE tenant_id=$1) AS audit_findings`,[user.tenantId])
  ]);
  return {subscription:subscription.rows[0]||null,usage:usage.rows[0]};
 });
 return NextResponse.json({...data,plans:plans.rows,asOf:new Date().toISOString(),
  billingStatus:"not_connected",notice:"Plan catalogue is informational. No payment gateway, invoices for subscription fees, or automatic renewals are active."},
  {headers:{"Cache-Control":"no-store"}});
 }catch(error){return unexpected(error);}
}
