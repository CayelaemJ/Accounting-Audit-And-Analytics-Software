import {NextRequest,NextResponse} from "next/server";
import {randomUUID} from "node:crypto";
import {z} from "zod";
import {currentSession,canWrite} from "@/lib/auth";
import {tenantTx} from "@/lib/db";
import {toCents,fromCents,validatePosting,type PostingLine} from "@/lib/money";
import {jsonError,requireSameOrigin,limit,unexpected} from "@/lib/http";
export const runtime="nodejs";
const schema=z.object({
 invoiceId:z.string().uuid(),cashAccountId:z.string().uuid(),amount:z.string().max(24),
 paymentDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),idempotencyKey:z.string().uuid()
}).strict();
export async function POST(req:NextRequest){
 try{
 requireSameOrigin(req);const session=await currentSession();if(!session)return jsonError("Sign in required.",401);
 if(!canWrite(session.role))return jsonError("Finance permission required.",403);
 if(!(await limit("payment:post:"+session.tenantId+":"+session.userId,60,1)))return jsonError("Too many payment requests. Retry shortly.",429);
 const v=schema.safeParse(await req.json());if(!v.success)return jsonError("Review payment details.");
 const x=v.data;let cents:bigint;try{cents=toCents(x.amount);}catch{return jsonError("Invalid payment amount.");}
 if(cents<=0n)return jsonError("Payment must be positive.");
 const posted=await tenantTx(session,async c=>{
  // Serialise all allocations for a given invoice to stop concurrent over-payment.
  await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[session.tenantId+":"+x.invoiceId]);
  const inv=await c.query("SELECT id,kind,total_amount::text FROM invoices WHERE tenant_id=$1 AND id=$2",
   [session.tenantId,x.invoiceId]);
  if(!inv.rowCount)throw new Error("Invoice not found.");
  const existing=await c.query("SELECT a.id,a.journal_id FROM invoice_allocations a JOIN journal_entries j ON j.id=a.journal_id AND j.tenant_id=a.tenant_id WHERE a.tenant_id=$1 AND j.idempotency_key=$2",
   [session.tenantId,x.idempotencyKey]);
  if(existing.rowCount)return {allocation:existing.rows[0],alreadyPosted:true};
  const total=toCents(inv.rows[0].total_amount);
  const used=await c.query("SELECT coalesce(sum(amount),0)::text AS amount FROM invoice_allocations WHERE tenant_id=$1 AND invoice_id=$2",[session.tenantId,x.invoiceId]);
  const remaining=total-toCents(used.rows[0].amount);
  if(cents>remaining)throw new Error("Payment exceeds invoice outstanding balance.");
  const cash=await c.query("SELECT id FROM accounts WHERE tenant_id=$1 AND id=$2 AND type='asset'",[session.tenantId,x.cashAccountId]);
  const code=inv.rows[0].kind==="sales"?"1100":"2000";
  const settlement=await c.query("SELECT id FROM accounts WHERE tenant_id=$1 AND code=$2",[session.tenantId,code]);
  if(!cash.rowCount||!settlement.rowCount)throw new Error("Cash or settlement account not found.");
  const amount=fromCents(cents);
  const lines:PostingLine[]=inv.rows[0].kind==="sales"?
    [{accountId:x.cashAccountId,side:"debit",amount},{accountId:settlement.rows[0].id,side:"credit",amount}]:
    [{accountId:settlement.rows[0].id,side:"debit",amount},{accountId:x.cashAccountId,side:"credit",amount}];
  validatePosting(lines);
  const journal=await c.query("INSERT INTO journal_entries(tenant_id,entry_date,memo,idempotency_key,created_by) VALUES($1,$2,$3,$4,$5) RETURNING id",
    [session.tenantId,x.paymentDate,"Invoice settlement "+x.invoiceId,x.idempotencyKey,session.userId]);
  const id=journal.rows[0].id;
  for(const [index,line] of lines.entries())await c.query("INSERT INTO journal_lines(tenant_id,entry_id,account_id,line_no,debit,credit) VALUES($1,$2,$3,$4,$5,$6)",[session.tenantId,id,line.accountId,index+1,line.side==="debit"?amount:"0.00",line.side==="credit"?amount:"0.00"]);
  const allocation=await c.query("INSERT INTO invoice_allocations(tenant_id,invoice_id,journal_id,amount,payment_date,posted_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,journal_id",
   [session.tenantId,x.invoiceId,id,amount,x.paymentDate,session.userId]);
  await c.query("INSERT INTO audit_events(tenant_id,actor_id,action,record_id,details) VALUES($1,$2,'invoice.payment_posted',$3,$4)",[session.tenantId,session.userId,allocation.rows[0].id,JSON.stringify({invoiceId:x.invoiceId,journalId:id})]);
  return {allocation:allocation.rows[0],alreadyPosted:false};
 });
 return NextResponse.json(posted,{status:posted.alreadyPosted?200:201});
 }catch(e){
 if(e instanceof Error&&/Invoice not found|Payment exceeds|account not found/.test(e.message))return jsonError(e.message,422);
 if((e as {code?:string}).code==="23505")return jsonError("Payment reference already used.",409);
 return unexpected(e);
 }
}
