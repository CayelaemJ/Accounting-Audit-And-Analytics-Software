import {NextRequest,NextResponse} from "next/server";
import {randomUUID} from "node:crypto";
import {z} from "zod";
import {currentSession,canWrite} from "@/lib/auth";
import {tenantTx} from "@/lib/db";
import {jsonError,requireSameOrigin,unexpected} from "@/lib/http";
export const runtime="nodejs";
const schema=z.object({journalId:z.string().uuid(),reason:z.string().trim().min(10).max(500),entryDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/)}).strict();
export async function POST(req:NextRequest){
 try{
  requireSameOrigin(req);
  const user=await currentSession();
  if(!user)return jsonError("Sign in to continue.",401);
  if(!canWrite(user.role))return jsonError("Accounting write permission required.",403);
  const parsed=schema.safeParse(await req.json());if(!parsed.success)return jsonError("Provide a journal, posting date and a reason of at least 10 characters.");
  const x=parsed.data;
  const result=await tenantTx(user,async c=>{
   const original=await c.query("SELECT id,entry_date,memo FROM journal_entries WHERE tenant_id=$1 AND id=$2 FOR SHARE",[user.tenantId,x.journalId]);
   if(!original.rowCount)throw new Error("Journal not found.");
   const duplicate=await c.query("SELECT 1 FROM journal_reversals WHERE tenant_id=$1 AND (original_entry_id=$2 OR reversal_entry_id=$2)",[user.tenantId,x.journalId]);
   if(duplicate.rowCount)throw new Error("Journal is already reversed or is itself a reversal.");
   const lines=await c.query("SELECT account_id,debit::text,credit::text FROM journal_lines WHERE tenant_id=$1 AND entry_id=$2 ORDER BY line_no",[user.tenantId,x.journalId]);
   if(lines.rowCount<2)throw new Error("Original journal has no valid lines.");
   const id=randomUUID();
   await c.query("INSERT INTO journal_entries(id,tenant_id,entry_date,memo,idempotency_key,created_by) VALUES($1,$2,$3,$4,$5,$6)",
    [id,user.tenantId,x.entryDate,"Reversal: "+original.rows[0].memo.slice(0,210),randomUUID(),user.userId]);
   for(const [i,line] of lines.rows.entries()){
    await c.query("INSERT INTO journal_lines(tenant_id,entry_id,account_id,line_no,debit,credit) VALUES($1,$2,$3,$4,$5,$6)",
     [user.tenantId,id,line.account_id,i+1,line.credit,line.debit]);
   }
   await c.query("INSERT INTO journal_reversals(tenant_id,original_entry_id,reversal_entry_id,reason,reversed_by) VALUES($1,$2,$3,$4,$5)",
    [user.tenantId,x.journalId,id,x.reason,user.userId]);
   await c.query("INSERT INTO audit_events(tenant_id,actor_id,action,record_id,details) VALUES($1,$2,'journal.reversed',$3,$4)",
    [user.tenantId,user.userId,id,JSON.stringify({originalId:x.journalId,reason:x.reason})]);
   return {id,originalId:x.journalId,postedDate:x.entryDate};
  });
  return NextResponse.json(result,{status:201});
 }catch(error){
  if(error instanceof Error&&/Journal not found|already reversed|Original journal/.test(error.message))return jsonError(error.message,409);
  if((error as {code?:string})?.code==="23505")return jsonError("Journal was already reversed.",409);
  if((error as {code?:string})?.code==="P0001")return jsonError("The requested journal date is not in an open financial period.",422);
  return unexpected(error);
 }
}
