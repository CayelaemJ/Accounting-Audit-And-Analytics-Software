import {NextRequest,NextResponse} from "next/server";
import {z} from "zod";
import {currentSession} from "@/lib/auth";
import {tenantTx} from "@/lib/db";
import {jsonError,requireSameOrigin,unexpected} from "@/lib/http";
export const runtime="nodejs";export const dynamic="force-dynamic";
type Ctx={params:Promise<{id:string}>};
export async function GET(_req:NextRequest,context:Ctx){
 try{
 const user=await currentSession();if(!user)return jsonError("Sign in required.",401);
 const {id}=await context.params;if(!z.string().uuid().safeParse(id).success)return jsonError("Invalid report ID.");
 const result=await tenantTx(user,async c=>{
  const q=await c.query("SELECT id,name,template FROM saved_reports WHERE tenant_id=$1 AND id=$2",[user.tenantId,id]);
  if(!q.rowCount)return null;
  const definition=q.rows[0] as {id:string;name:string;template:string};
  let rows:Array<Record<string,unknown>>=[];
  switch(definition.template){
   case "trial_balance":{
    const r=await c.query(`SELECT a.code,a.name,a.type,
      GREATEST(coalesce(sum(l.debit-l.credit),0),0)::text AS net_debit,
      GREATEST(coalesce(sum(l.credit-l.debit),0),0)::text AS net_credit
      FROM accounts a LEFT JOIN journal_lines l ON l.account_id=a.id AND l.tenant_id=a.tenant_id
      WHERE a.tenant_id=$1 GROUP BY a.id,a.code,a.name,a.type ORDER BY a.code LIMIT 300`,[user.tenantId]);
    rows=r.rows;break;
   }
   case "income_summary":{
    const r=await c.query(`SELECT a.code,a.name,a.type,
      coalesce(sum(CASE WHEN a.type='revenue' THEN l.credit-l.debit ELSE l.debit-l.credit END),0)::text AS balance
      FROM accounts a LEFT JOIN journal_lines l ON a.id=l.account_id AND a.tenant_id=l.tenant_id
      WHERE a.tenant_id=$1 AND a.type IN ('revenue','expense')
      GROUP BY a.id,a.code,a.name,a.type ORDER BY a.code LIMIT 300`,[user.tenantId]);
    rows=r.rows;break;
   }
   case "audit_findings":{
    const r=await c.query("SELECT title,severity,status,created_at FROM audit_findings WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 300",[user.tenantId]);
    rows=r.rows;break;
   }
   case "bank_reconciliation":{
    const r=await c.query(`SELECT a.code AS account,b.booked_on,b.source_ref,b.description,b.signed_amount::text AS amount,
      CASE WHEN m.journal_id IS NULL THEN 'unmatched' ELSE 'matched' END AS reconciliation
      FROM bank_transactions b JOIN accounts a ON a.id=b.bank_account_id AND a.tenant_id=b.tenant_id
      LEFT JOIN bank_matches m ON m.bank_transaction_id=b.id AND m.tenant_id=b.tenant_id
      WHERE b.tenant_id=$1 ORDER BY b.booked_on DESC LIMIT 300`,[user.tenantId]);
    rows=r.rows;break;
   }
   case "budget_variance":{
    const r=await c.query(`SELECT a.code,b.month,b.amount::text AS budget,
      coalesce(sum(CASE WHEN a.type IN ('expense','asset') THEN l.debit-l.credit ELSE l.credit-l.debit END),0)::text AS actual,
      (coalesce(sum(CASE WHEN a.type IN ('expense','asset') THEN l.debit-l.credit ELSE l.credit-l.debit END),0)-b.amount)::text AS variance
      FROM budgets b JOIN accounts a ON a.id=b.account_id AND a.tenant_id=b.tenant_id
      LEFT JOIN journal_entries j ON j.tenant_id=b.tenant_id AND date_trunc('month',j.entry_date)::date=b.month
      LEFT JOIN journal_lines l ON l.entry_id=j.id AND l.tenant_id=j.tenant_id AND l.account_id=b.account_id
      WHERE b.tenant_id=$1 GROUP BY b.id,a.code,a.type,b.month,b.amount ORDER BY b.month DESC LIMIT 300`,[user.tenantId]);
    rows=r.rows;break;
   }
  }
  return {definition,rows};
 });
 return result?NextResponse.json({...result,asOf:new Date().toISOString(),
    limitations:"Cumulative data unless a reporting month is explicitly shown. No statutory audit certification.",rowsLimitedTo:300},{headers:{"Cache-Control":"no-store"}}):jsonError("Report not found.",404);
 }catch(e){return unexpected(e);}
}
export async function DELETE(req:NextRequest,context:Ctx){
 try{
 requireSameOrigin(req);const user=await currentSession();if(!user)return jsonError("Sign in required.",401);
 const {id}=await context.params;if(!z.string().uuid().safeParse(id).success)return jsonError("Invalid report ID.");
 const deleted=await tenantTx(user,async c=>{
  const q=await c.query("DELETE FROM saved_reports WHERE tenant_id=$1 AND id=$2 RETURNING id",[user.tenantId,id]);
  if(q.rowCount)await c.query("INSERT INTO audit_events(tenant_id,actor_id,action,record_id) VALUES($1,$2,'report.deleted',$3)",[user.tenantId,user.userId,id]);
  return Boolean(q.rowCount);
 });
 return deleted?NextResponse.json({ok:true}):jsonError("Report not found or not yours to delete.",404);
 }catch(e){return unexpected(e);}
}
