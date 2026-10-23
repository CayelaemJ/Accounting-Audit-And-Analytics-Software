import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import pg,{type PoolClient} from "pg";

if(!process.env.DATABASE_URL)throw new Error("DATABASE_URL required");
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:3});
async function ctx(c:PoolClient,user:string,tenant:string,role="owner"){
 await c.query("SELECT set_config('app.user_id',$1,true)",[user]);
 await c.query("SELECT set_config('app.tenant_id',$1,true)",[tenant]);
 await c.query("SELECT set_config('app.user_role',$1,true)",[role]);
}
async function tenant(c:PoolClient){
 const user=randomUUID(),org=randomUUID();
 await c.query("INSERT INTO users(id,email,password_hash) VALUES($1,$2,'test')",[user,user+"@example.test"]);
 await ctx(c,user,org);
 await c.query("INSERT INTO tenants(id,name,slug,created_by) VALUES($1,'Test company',$2,$3)",[org,"test-"+org,user]);
 await c.query("INSERT INTO memberships(tenant_id,user_id,role) VALUES($1,$2,'owner')",[org,user]);
 const ids:{[key:string]:string}={};
 for(const [code,name,type] of [["1000","Cash","asset"],["1100","Receivables","asset"],["2000","Payables","liability"],["3000","Capital","equity"],["4000","Revenue","revenue"],["5000","Expenses","expense"]]){
  const r=await c.query("INSERT INTO accounts(tenant_id,code,name,type) VALUES($1,$2,$3,$4) RETURNING id",[org,code,name,type]);
  ids[code]=r.rows[0].id;
 }
 return {user,org,ids};
}
test("phases 1-4: organisations, invoicing, banking, reporting, controls and period close",async()=>{
 const c=await pool.connect();
 try{
  await c.query("BEGIN");
  const a=await tenant(c);
  await c.query("COMMIT");
  await c.query("BEGIN");
  const b=await tenant(c);
  await c.query("COMMIT");
  await c.query("BEGIN");
  await ctx(c,a.user,a.org);
  // Contacts and invoice are tied to their own organisation; ledger is balanced atomically.
  const customer=(await c.query("INSERT INTO contacts(tenant_id,kind,name,created_by) VALUES($1,'customer','Test Customer',$2) RETURNING id",[a.org,a.user])).rows[0].id;
  const id=randomUUID();
  await c.query("INSERT INTO journal_entries(id,tenant_id,entry_date,memo,idempotency_key,created_by) VALUES($1,$2,current_date,'Sales invoice test',$3,$4)",[id,a.org,randomUUID(),a.user]);
  await c.query("INSERT INTO journal_lines(tenant_id,entry_id,account_id,line_no,debit,credit) VALUES($1,$2,$3,1,100,0),($1,$2,$4,2,0,100)",[a.org,id,a.ids["1100"],a.ids["4000"]]);
  const invoice=(await c.query("INSERT INTO invoices(tenant_id,kind,reference,contact_id,journal_id,invoice_date,due_date,net_amount,created_by) VALUES($1,'sales','INV-T1',$2,$3,current_date,current_date,100,$4) RETURNING total_amount::text",[a.org,customer,id,a.user])).rows[0];
  assert.equal(invoice.total_amount,"100.00");
  const bankId=(await c.query("INSERT INTO bank_transactions(tenant_id,bank_account_id,booked_on,description,signed_amount,source_ref,source_hash,created_by) VALUES($1,$2,current_date,'Bank deposit',100,'PAY-1',$3,$4) RETURNING id",[a.org,a.ids["1000"],"a".repeat(64),a.user])).rows[0].id;
  const cashJournal=randomUUID();
  await c.query("INSERT INTO journal_entries(id,tenant_id,entry_date,memo,idempotency_key,created_by) VALUES($1,$2,current_date,'Customer payment',$3,$4)",[cashJournal,a.org,randomUUID(),a.user]);
  await c.query("INSERT INTO journal_lines(tenant_id,entry_id,account_id,line_no,debit,credit) VALUES($1,$2,$3,1,100,0),($1,$2,$4,2,0,100)",[a.org,cashJournal,a.ids["1000"],a.ids["1100"]]);
  await c.query("INSERT INTO bank_matches(tenant_id,bank_transaction_id,journal_id,matched_by) VALUES($1,$2,$3,$4)",[a.org,bankId,cashJournal,a.user]);
  await c.query("SAVEPOINT duplicate_match");
  await assert.rejects(c.query("INSERT INTO bank_matches(tenant_id,bank_transaction_id,journal_id,matched_by) VALUES($1,$2,$3,$4)",[a.org,bankId,id,a.user]),/duplicate key/);
  await c.query("ROLLBACK TO SAVEPOINT duplicate_match");
  const allocation=(await c.query("INSERT INTO invoice_allocations(tenant_id,invoice_id,journal_id,amount,payment_date,posted_by) VALUES($1,(SELECT id FROM invoices WHERE tenant_id=$1 AND reference='INV-T1'),$2,100,current_date,$3) RETURNING id",[a.org,cashJournal,a.user])).rows[0].id;
  const paid=(await c.query("SELECT sum(amount)::text AS amount FROM invoice_allocations WHERE tenant_id=$1",[a.org])).rows[0].amount;
  assert.equal(paid,"100.00");
  await c.query("SAVEPOINT overpayment");
  await assert.rejects(c.query("INSERT INTO invoice_allocations(tenant_id,invoice_id,journal_id,amount,payment_date,posted_by) VALUES($1,(SELECT id FROM invoices WHERE tenant_id=$1 AND reference='INV-T1'),$2,1,current_date,$3)",[a.org,id,a.user]),/Invoice payment exceeds remaining balance/);
  await c.query("ROLLBACK TO SAVEPOINT overpayment");

  const period=(await c.query("INSERT INTO financial_periods(tenant_id,label,start_date,end_date,created_by) VALUES($1,'FY 2026',DATE '2026-01-01',DATE '2026-12-31',$2) RETURNING id",[a.org,a.user])).rows[0].id;
  const budget=(await c.query("INSERT INTO budgets(tenant_id,account_id,month,amount,created_by) VALUES($1,$2,DATE '2026-10-01',250,$3) RETURNING amount::text",[a.org,a.ids["5000"],a.user])).rows[0];
  assert.equal(budget.amount,"250.00");
  const e=(await c.query("INSERT INTO audit_engagements(tenant_id,title,objective,created_by) VALUES($1,'FY2026 financial controls','Review controls',$2) RETURNING id",[a.org,a.user])).rows[0].id;
  const control=(await c.query("INSERT INTO audit_controls(tenant_id,code,title,created_by) VALUES($1,'FIN-001','Review payment approvals',$2) RETURNING id",[a.org,a.user])).rows[0].id;
  await c.query("INSERT INTO audit_tests(tenant_id,engagement_id,control_id,result,notes,tested_by) VALUES($1,$2,$3,'fail','Approval evidence incomplete',$4)",[a.org,e,control,a.user]);
  const finding=(await c.query("INSERT INTO audit_findings(tenant_id,title,severity,created_by) VALUES($1,'Payment approval exception','high',$2) RETURNING id",[a.org,a.user])).rows[0].id;
  await c.query("INSERT INTO remediation_actions(tenant_id,finding_id,description,due_date,created_by) VALUES($1,$2,'Review payments before posting',current_date,$3)",[a.org,finding,a.user]);
  const evidence=(await c.query("INSERT INTO audit_evidence(tenant_id,engagement_id,title,source_ref,evidence_sha256,submitted_by) VALUES($1,$2,'Approval checklist','CHECK-001',$3,$4) RETURNING id",[a.org,e,"b".repeat(64),a.user])).rows[0].id;
  assert.ok(evidence);
  const draft=(await c.query("INSERT INTO audit_reports(tenant_id,engagement_id,title,body,prepared_by) VALUES($1,$2,'FY2026 control report','Control review completed, exceptions require investigation.',$3) RETURNING id",[a.org,e,a.user])).rows[0].id;
  await c.query("SAVEPOINT self_approval");
  await assert.rejects(c.query("UPDATE audit_reports SET status='approved',approved_by=$1,approved_at=now() WHERE id=$2",[a.user,draft]),/audit_reports_check/);
  await c.query("ROLLBACK TO SAVEPOINT self_approval");
  const reviewer=randomUUID();
  await c.query("INSERT INTO users(id,email,password_hash) VALUES($1,$2,'test')",[reviewer,reviewer+"@example.test"]);
  await c.query("INSERT INTO memberships(tenant_id,user_id,role) VALUES($1,$2,'auditor')",[a.org,reviewer]);
  await ctx(c,reviewer,a.org,"auditor");
  const approved=await c.query("UPDATE audit_reports SET status='approved',approved_by=$1,approved_at=now() WHERE id=$2 RETURNING status",[reviewer,draft]);
  assert.equal(approved.rows[0].status,"approved");
  await ctx(c,a.user,a.org);
  await c.query("UPDATE financial_periods SET status='closed' WHERE tenant_id=$1 AND id=$2",[a.org,period]);
  await c.query("SAVEPOINT blocked_period");
  await assert.rejects(c.query("INSERT INTO journal_entries(tenant_id,entry_date,memo,idempotency_key,created_by) VALUES($1,DATE '2026-10-23','Wrong closed-period journal',$2,$3)",[a.org,randomUUID(),a.user]),/Accounting period is not open/);
  await c.query("ROLLBACK TO SAVEPOINT blocked_period");
  await c.query("COMMIT");
  await c.query("BEGIN");await ctx(c,b.user,b.org);
  for(const table of ["contacts","invoices","financial_periods","budgets","bank_transactions","audit_engagements","audit_controls","audit_tests","remediation_actions","invoice_allocations","audit_evidence","audit_reports","saved_reports"]){
   const q=await c.query("SELECT count(*)::int AS count FROM "+table+" WHERE tenant_id=$1",[a.org]);
   assert.equal(q.rows[0].count,0,"RLS leaked "+table);
  }
  await c.query("ROLLBACK");
 }finally{c.release();await pool.end();}
});
