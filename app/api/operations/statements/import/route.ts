import {NextRequest,NextResponse} from "next/server";
import {randomUUID} from "node:crypto";
import {currentSession,canWrite} from "@/lib/auth";
import {tenantTx} from "@/lib/db";
import {jsonError,requireSameOrigin,limit,unexpected} from "@/lib/http";
import {parseOFX} from "@/lib/bank-ofx";
export const runtime="nodejs";
const LIMIT=512_000;
export async function POST(req:NextRequest){
 try{
  requireSameOrigin(req);
  const session=await currentSession();
  if(!session)return jsonError("Sign in required.",401);
  if(!canWrite(session.role))return jsonError("Finance write permission required.",403);
  if(!(await limit("ofx:"+session.tenantId+":"+session.userId,25,60)))
   return jsonError("Statement import limit reached. Try again later.",429);
  const length=Number(req.headers.get("content-length"));
  if(!Number.isSafeInteger(length)||length<1||length>LIMIT+12_000)
   return jsonError("Upload must include Content-Length and be at most 512 KB.",413);
  const form=await req.formData();
  const accountId=form.get("bankAccountId");
  const file=form.get("statement");
  if(typeof accountId!=="string"||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(accountId))
   return jsonError("Choose your authorised bank ledger account.");
  if(!(file instanceof File)||file.size<1||file.size>LIMIT)
   return jsonError("Choose an OFX/QFX bank statement under 512 KB.");
  if(!/\.(?:ofx|qfx)$/i.test(file.name)||file.name.length>200)
   return jsonError("Only OFX/QFX bank statements are supported.");
  const source=await file.text();
  let statement:ReturnType<typeof parseOFX>;
  try{statement=parseOFX(source);}catch(error){
   return jsonError(error instanceof Error?error.message:"Invalid OFX bank statement.");
  }
  // Historical source dates are permitted, future transactions must not be silently accepted.
  const future=new Date().toISOString().slice(0,10);
  if(statement.transactions.some(row=>row.bookedOn>future))
   return jsonError("Statement contains future-dated bank transactions.");
  const result=await tenantTx(session,async c=>{
   const bank=await c.query("SELECT id FROM accounts WHERE tenant_id=$1 AND id=$2 AND type='asset'",
     [session.tenantId,accountId]);
   if(!bank.rows.length)throw Error("Bank account does not belong to your organisation.");
   const company=await c.query("SELECT currency FROM tenants WHERE id=$1",[session.tenantId]);
   if(statement.currency&&statement.currency!==company.rows[0]?.currency)
    throw Error("Statement currency does not match your organisation.");
   let imported=0,duplicates=0;
   for(const row of statement.transactions){
    const existing=await c.query(`SELECT booked_on,signed_amount::text FROM bank_transactions
      WHERE tenant_id=$1 AND bank_account_id=$2 AND source_hash=$3`,
      [session.tenantId,accountId,row.sourceHash]);
    if(existing.rows.length){
     const previous=existing.rows[0];
     const priorDate=previous.booked_on instanceof Date?previous.booked_on.toISOString().slice(0,10):String(previous.booked_on).slice(0,10);
     if(priorDate!==row.bookedOn||previous.signed_amount!==row.signedAmount)
      throw Error("An existing statement transaction ID conflicts with the imported amount or date.");
     duplicates++;continue;
    }
    const q=await c.query(`INSERT INTO bank_transactions
      (tenant_id,bank_account_id,booked_on,description,signed_amount,source_ref,source_hash,created_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT(tenant_id,bank_account_id,source_hash) DO NOTHING RETURNING id`,
      [session.tenantId,accountId,row.bookedOn,row.description,row.signedAmount,row.sourceRef,row.sourceHash,session.userId]);
    if(q.rows.length)imported++;
    else duplicates++;
   }
   await c.query("INSERT INTO audit_events(tenant_id,actor_id,action,record_id,details) VALUES($1,$2,$3,$4,$5)",
    [session.tenantId,session.userId,"bank.ofx_imported",randomUUID(),
    JSON.stringify({accountId,imported,duplicates,format:"OFX",statementAccountLast4:statement.accountLast4})]);
   return {imported,duplicates,total:statement.transactions.length,statementAccountLast4:statement.accountLast4};
  });
  return NextResponse.json({...result,format:"OFX",notice:"Statement entries have been staged. Review the ledger bank account and reconcile manually. No financial journal has been automatically created."},
    {status:200,headers:{"Cache-Control":"no-store"}});
 }catch(error){
  if(error instanceof Error&&/Bank account does not belong|Statement currency does not match|conflicts with the imported/.test(error.message))
   return jsonError(error.message,422);
  return unexpected(error);
 }
}
