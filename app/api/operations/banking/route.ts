import {NextRequest,NextResponse} from "next/server";
import {createHash} from "node:crypto";
import {z} from "zod";
import {currentSession,canWrite} from "@/lib/auth";
import {tenantTx} from "@/lib/db";
import {jsonError,requireSameOrigin,unexpected} from "@/lib/http";
import {toCents,fromCents} from "@/lib/money";
export const runtime="nodejs";
const row=z.object({
 bookedOn:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
 description:z.string().trim().min(1).max(300),signedAmount:z.string().regex(/^-?(0|[1-9][0-9]{0,14})(\.[0-9]{1,2})?$/),
 sourceRef:z.string().trim().min(1).max(180)
}).strict();
const schema=z.discriminatedUnion("action",[
 z.object({action:z.literal("import"),bankAccountId:z.string().uuid(),rows:z.array(row).min(1).max(250)}).strict(),
 z.object({action:z.literal("match"),bankTransactionId:z.string().uuid(),journalId:z.string().uuid()}).strict()
]);
function signedCents(s:string){return s.startsWith("-")?-toCents(s.slice(1)):toCents(s);}
export async function POST(req:NextRequest){
 try{
 requireSameOrigin(req);const user=await currentSession();if(!user)return jsonError("Sign in required.",401);
 if(!canWrite(user.role))return jsonError("Finance permission required.",403);
 const parsed=schema.safeParse(await req.json());if(!parsed.success)return jsonError("Review banking details.");
 const x=parsed.data;
 if(x.action==="import"){
  const rows=x.rows.map(r=>({...r,amount:signedCents(r.signedAmount)}));
  if(rows.some(r=>r.amount===0n))return jsonError("Zero-value bank transactions cannot be imported.");
  const result=await tenantTx(user,async c=>{
   const acc=await c.query("SELECT id FROM accounts WHERE tenant_id=$1 AND id=$2 AND type='asset'",[user.tenantId,x.bankAccountId]);
   if(!acc.rowCount)throw new Error("Bank account must be an asset account owned by this organisation.");
   let imported=0,duplicates=0;
   for(const entry of rows){
    const hash=createHash("sha256").update(JSON.stringify([entry.bookedOn,entry.sourceRef,entry.signedAmount,entry.description])).digest("hex");
    const r=await c.query(`INSERT INTO bank_transactions(tenant_id,bank_account_id,booked_on,description,signed_amount,source_ref,source_hash,created_by)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(tenant_id,bank_account_id,source_hash) DO NOTHING RETURNING id`,
     [user.tenantId,x.bankAccountId,entry.bookedOn,entry.description,fromCents(entry.amount),entry.sourceRef,hash,user.userId]);
    if(r.rowCount)imported++;else duplicates++;
   }
   const eventId=(await c.query("SELECT gen_random_uuid() AS id")).rows[0].id;
   await c.query("INSERT INTO audit_events(tenant_id,actor_id,action,record_id,details) VALUES($1,$2,'bank.imported',$3,$4)",
    [user.tenantId,user.userId,eventId,JSON.stringify({imported,duplicates})]);
   return {imported,duplicates};
  });return NextResponse.json(result,{status:201});
 }
 const result=await tenantTx(user,async c=>{
  const transaction=await c.query("SELECT id,bank_account_id,signed_amount::text FROM bank_transactions WHERE tenant_id=$1 AND id=$2 FOR UPDATE",[user.tenantId,x.bankTransactionId]);
  if(!transaction.rowCount)throw new Error("Bank transaction not found.");
  const journal=await c.query(`SELECT coalesce(sum(l.debit-l.credit),0)::text AS net,
    count(*)::int AS line_count FROM journal_lines l
    WHERE l.tenant_id=$1 AND l.entry_id=$2 AND l.account_id=$3`,
    [user.tenantId,x.journalId,transaction.rows[0].bank_account_id]);
  const exists=await c.query("SELECT 1 FROM journal_entries WHERE tenant_id=$1 AND id=$2",[user.tenantId,x.journalId]);
  if(!exists.rowCount || !journal.rows[0].line_count)throw new Error("Journal has no lines for this bank account.");
  const net=BigInt(Math.round(Number(journal.rows[0].net)*100));
  const value=signedCents(transaction.rows[0].signed_amount);
  if(net!==value)throw new Error("Bank amount must exactly equal the journal's signed movement on this account.");
  const r=await c.query(`INSERT INTO bank_matches(tenant_id,bank_transaction_id,journal_id,matched_by) VALUES($1,$2,$3,$4)
    ON CONFLICT DO NOTHING RETURNING bank_transaction_id`,[user.tenantId,x.bankTransactionId,x.journalId,user.userId]);
  if(!r.rowCount)throw new Error("Transaction or journal is already matched.");
  await c.query("INSERT INTO audit_events(tenant_id,actor_id,action,record_id,details) VALUES($1,$2,'bank.matched',$3,$4)",
   [user.tenantId,user.userId,x.bankTransactionId,JSON.stringify({journalId:x.journalId})]);
  return {matched:true};
 });return NextResponse.json(result);
 }catch(e){
  if(e instanceof Error&&/Bank account|Bank transaction|Journal has|Bank amount|already matched/.test(e.message))return jsonError(e.message,422);
  if((e as {code?:string}).code==="23505")return jsonError("This bank item is already reconciled.",409);
  return unexpected(e);
 }
}
