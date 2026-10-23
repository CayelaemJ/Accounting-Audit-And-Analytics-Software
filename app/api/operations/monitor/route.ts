import {NextResponse} from "next/server";
import {currentSession} from "@/lib/auth";
import {tenantTx} from "@/lib/db";
import {jsonError,unexpected} from "@/lib/http";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function GET(){
 try{
 const user=await currentSession();if(!user)return jsonError("Sign in required.",401);
 const observations=await tenantTx(user,async c=>{
  const [overdue,unmatched,remediation,failedControls]=await Promise.all([
  c.query(`SELECT id,reference,due_date,total_amount::text AS amount FROM invoices WHERE tenant_id=$1 AND due_date<current_date ORDER BY due_date LIMIT 50`,[user.tenantId]),
  c.query(`SELECT b.id,b.booked_on,b.signed_amount::text AS amount FROM bank_transactions b
   LEFT JOIN bank_matches m ON m.tenant_id=b.tenant_id AND m.bank_transaction_id=b.id
   WHERE b.tenant_id=$1 AND m.bank_transaction_id IS NULL AND b.booked_on<current_date-interval '30 days'
   ORDER BY b.booked_on LIMIT 50`,[user.tenantId]),
  c.query("SELECT id,description,due_date FROM remediation_actions WHERE tenant_id=$1 AND status<>'completed' AND due_date<current_date ORDER BY due_date LIMIT 50",[user.tenantId]),
  c.query(`SELECT t.id,c.code,t.result,t.notes FROM audit_tests t JOIN audit_controls c ON c.id=t.control_id AND c.tenant_id=t.tenant_id WHERE t.tenant_id=$1 AND t.result='fail' ORDER BY t.tested_at DESC LIMIT 50`,[user.tenantId])
  ]);
  return [
   ...overdue.rows.map(r=>({rule:"invoice_due",severity:"medium",recordId:r.id,description:"Past-due invoice: "+r.reference+" (payment status not yet tracked)",date:r.due_date})),
   ...unmatched.rows.map(r=>({rule:"unmatched_bank_30d",severity:"high",recordId:r.id,description:"Bank entry older than 30 days remains unmatched",date:r.booked_on})),
   ...remediation.rows.map(r=>({rule:"overdue_remediation",severity:"high",recordId:r.id,description:"Remediation action past due: "+r.description,date:r.due_date})),
   ...failedControls.rows.map(r=>({rule:"failed_control_test",severity:"high",recordId:r.id,description:"Failed control test: "+r.code,date:null}))
  ];
 });
 return NextResponse.json({observations,source:"Deterministic monitoring rules, not confirmed fraud or an audit opinion",refreshedAt:new Date().toISOString()},{headers:{"Cache-Control":"no-store"}});
 }catch(e){return unexpected(e);}
}
