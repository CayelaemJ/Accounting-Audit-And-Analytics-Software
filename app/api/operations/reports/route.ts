import {NextResponse} from "next/server";
import {currentSession} from "@/lib/auth";
import {tenantTx} from "@/lib/db";
import {jsonError,unexpected} from "@/lib/http";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function GET(){
 try{
 const user=await currentSession();if(!user)return jsonError("Sign in required.",401);
 const report=await tenantTx(user,async c=>{
 const [periods,contacts,invoices,banks,balances,monthly,budgets,engagements,controls,tests,actions]=await Promise.all([
 c.query("SELECT id,label,start_date,end_date,status FROM financial_periods WHERE tenant_id=$1 ORDER BY start_date DESC LIMIT 30",[user.tenantId]),
 c.query("SELECT id,name,kind,email FROM contacts WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 100",[user.tenantId]),
 c.query(`SELECT i.id,i.kind,i.reference,i.invoice_date,i.due_date,i.net_amount::text,i.tax_amount::text,i.total_amount::text,c.name AS contact_name
 FROM invoices i JOIN contacts c ON c.id=i.contact_id AND c.tenant_id=i.tenant_id
 WHERE i.tenant_id=$1 ORDER BY i.created_at DESC LIMIT 100`,[user.tenantId]),
 c.query(`SELECT b.id,b.booked_on,b.description,b.signed_amount::text,b.source_ref,a.code AS bank_code,
  m.journal_id,m.matched_at FROM bank_transactions b JOIN accounts a ON a.id=b.bank_account_id
 LEFT JOIN bank_matches m ON m.tenant_id=b.tenant_id AND m.bank_transaction_id=b.id
 WHERE b.tenant_id=$1 ORDER BY b.booked_on DESC LIMIT 100`,[user.tenantId]),
 c.query(`SELECT a.code,a.name,a.type,
  GREATEST(coalesce(sum(l.debit-l.credit),0),0)::text AS debit_balance,
  GREATEST(coalesce(sum(l.credit-l.debit),0),0)::text AS credit_balance,
  coalesce(sum(l.debit-l.credit),0)::text AS signed_balance
 FROM accounts a LEFT JOIN journal_lines l ON a.id=l.account_id AND a.tenant_id=l.tenant_id
 WHERE a.tenant_id=$1 GROUP BY a.id,a.code,a.name,a.type ORDER BY a.code LIMIT 500`,[user.tenantId]),
 c.query(`SELECT a.id AS account_id,a.code,a.type,date_trunc('month',j.entry_date)::date AS month,
  coalesce(sum(CASE WHEN a.type IN ('expense','asset') THEN l.debit-l.credit ELSE l.credit-l.debit END),0)::text AS actual
 FROM journal_lines l JOIN journal_entries j ON j.id=l.entry_id AND j.tenant_id=l.tenant_id
 JOIN accounts a ON a.id=l.account_id AND a.tenant_id=l.tenant_id
 WHERE l.tenant_id=$1 GROUP BY a.id,a.code,a.type,date_trunc('month',j.entry_date) ORDER BY month DESC LIMIT 150`,[user.tenantId]),
 c.query("SELECT b.id,b.account_id,a.code,b.month,b.amount::text FROM budgets b JOIN accounts a ON a.id=b.account_id AND a.tenant_id=b.tenant_id WHERE b.tenant_id=$1 ORDER BY b.month DESC LIMIT 150",[user.tenantId]),
 c.query("SELECT id,title,objective,status FROM audit_engagements WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 50",[user.tenantId]),
 c.query("SELECT id,code,title,risk,owner,frequency FROM audit_controls WHERE tenant_id=$1 ORDER BY code LIMIT 100",[user.tenantId]),
 c.query("SELECT t.id,t.result,t.notes,t.tested_at,c.code FROM audit_tests t JOIN audit_controls c ON c.id=t.control_id AND c.tenant_id=t.tenant_id WHERE t.tenant_id=$1 ORDER BY t.tested_at DESC LIMIT 100",[user.tenantId]),
 c.query("SELECT a.id,a.finding_id,a.description,a.due_date,a.status FROM remediation_actions a WHERE a.tenant_id=$1 ORDER BY a.due_date LIMIT 100",[user.tenantId])
 ]);
 return {periods:periods.rows,contacts:contacts.rows,invoices:invoices.rows,bankTransactions:banks.rows,
 trialBalance:balances.rows,monthlyActuals:monthly.rows,budgets:budgets.rows,
 engagements:engagements.rows,controls:controls.rows,controlTests:tests.rows,actions:actions.rows,
 note:"Cumulative ledger net balances. Period-close and VAT statements require professional review.",refreshedAt:new Date().toISOString()};
 });
 return NextResponse.json(report,{headers:{"Cache-Control":"no-store"}});
 }catch(e){return unexpected(e);}
}
