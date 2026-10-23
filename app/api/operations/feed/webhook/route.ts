import {NextRequest,NextResponse} from "next/server";
import {createHash,randomUUID} from "node:crypto";
import {z} from "zod";
import {parseBankFeedToken} from "@/lib/bank-feed";
import {tenantTx} from "@/lib/db";
import {validISODate} from "@/lib/aging";
import {toCents,fromCents} from "@/lib/money";
import {jsonError,unexpected} from "@/lib/http";
export const runtime="nodejs";export const dynamic="force-dynamic";
const MAX_BYTES=196608;
const txSchema=z.object({
 transactionId:z.string().min(3).max(140).regex(/^[A-Za-z0-9._:-]+$/),
 bookedOn:z.string(),
 description:z.string().trim().min(1).max(300),
 signedAmount:z.string().regex(/^-?(?:0|[1-9][0-9]{0,14})(?:\.[0-9]{1,2})?$/)
}).strict();
const bodySchema=z.object({
 eventId:z.string().min(4).max(120).regex(/^[A-Za-z0-9._:-]+$/),
 accountLast4:z.string().min(4).max(4),
 currency:z.string().length(3).regex(/^[A-Z]{3}$/),
 transactions:z.array(txSchema).min(1).max(250)
}).strict();
async function boundedBody(req:NextRequest){
 const reader=req.body?.getReader();
 if(!reader)throw Error("Missing request body");
 const chunks:Buffer[]=[];let size=0;
 while(true){
  const {value,done}=await reader.read();
  if(done)break;
  size+=value.byteLength;
  if(size>MAX_BYTES){await reader.cancel();throw Error("Payload exceeds 192 KB");}
  chunks.push(Buffer.from(value));
 }
 if(!size)throw Error("Missing request body");
 return Buffer.concat(chunks).toString("utf8");
}
function canonical(value:string){
 const neg=value.startsWith("-");
 const cents=toCents(neg?value.slice(1):value);
 if(cents===0n)throw Error("Bank feed transactions must not have zero value");
 return fromCents(neg?-cents:cents);
}
export async function POST(req:NextRequest){
 try{
  if(!(req.headers.get("content-type")||"").toLowerCase().startsWith("application/json"))
   return jsonError("Expected application/json.",415);
  const bearer=/^Bearer (.+)$/.exec(req.headers.get("authorization")||"");
  const parsedToken=bearer&&parseBankFeedToken(bearer[1]);
  if(!parsedToken)return jsonError("Invalid bank feed credentials.",401);
  const len=req.headers.get("content-length");
  if(len!==null&&Number(len)>MAX_BYTES)return jsonError("Feed payload exceeds 192 KB.",413);
  let raw:string;try{raw=await boundedBody(req);}catch(e){return jsonError((e as Error).message,413);}
  let json:unknown;try{json=JSON.parse(raw);}catch{return jsonError("Malformed JSON.");}
  const parsed=bodySchema.safeParse(json);
  if(!parsed.success)return jsonError("Invalid bank feed event or transaction fields.");
  const input=parsed.data;
  const current=new Date().toISOString().slice(0,10);
  if(input.transactions.some(t=>!validISODate(t.bookedOn)||t.bookedOn>current))
   return jsonError("Feed includes invalid or future-dated transactions.");
  if(new Set(input.transactions.map(t=>t.transactionId)).size!==input.transactions.length)
   return jsonError("Feed event contains duplicate transaction IDs.");
  let transactions:typeof input.transactions;
  try{transactions=input.transactions.map(t=>({...t,signedAmount:canonical(t.signedAmount)}));}
  catch{return jsonError("Invalid signed transaction amount.");}
  const hash=createHash("sha256").update(raw).digest("hex");
  const result=await tenantTx({tenantId:parsedToken.tenantId,userId:parsedToken.userId},async c=>{
   const connection=await c.query(`SELECT f.id,f.bank_account_id,s.account_last4,s.currency
      FROM bank_feed_connections f
      JOIN bank_statement_sources s ON s.tenant_id=f.tenant_id AND s.bank_account_id=f.bank_account_id
      WHERE f.tenant_id=$1 AND f.issued_by=$2 AND f.token_hash=$3 AND f.active=true`,
     [parsedToken.tenantId,parsedToken.userId,parsedToken.hash]);
   if(!connection.rows.length)throw Error("Feed token is not active or is no longer authorised.");
   const con=connection.rows[0];
   if(input.accountLast4!==con.account_last4||input.currency!==con.currency)
    throw Error("Feed source account or currency does not match the authorised connection.");
   // All events for one feed serialize to prevent duplicate entries on concurrent retries.
   await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[parsedToken.tenantId+":"+con.id+":feed"]);
   const seen=await c.query(`SELECT payload_hash,imported,duplicates FROM bank_feed_events
     WHERE tenant_id=$1 AND connection_id=$2 AND event_id=$3`,
     [parsedToken.tenantId,con.id,input.eventId]);
   if(seen.rows.length){
    if(seen.rows[0].payload_hash!==hash)throw Error("This feed event ID was already used for a different payload.");
    return {eventId:input.eventId,alreadyProcessed:true,imported:seen.rows[0].imported,duplicates:seen.rows[0].duplicates};
   }
   let imported=0,duplicates=0;
   for(const t of transactions){
    const identity=createHash("sha256").update(JSON.stringify(["cabo-bank-feed-v1",con.id,t.transactionId])).digest("hex");
    const prev=await c.query(`SELECT booked_on,signed_amount::text FROM bank_transactions
      WHERE tenant_id=$1 AND bank_account_id=$2 AND source_hash=$3`,
      [parsedToken.tenantId,con.bank_account_id,identity]);
    if(prev.rows.length){
     const dt=prev.rows[0].booked_on instanceof Date?prev.rows[0].booked_on.toISOString().slice(0,10):String(prev.rows[0].booked_on).slice(0,10);
     if(dt!==t.bookedOn||prev.rows[0].signed_amount!==t.signedAmount)
      throw Error("Previously ingested bank transaction has conflicting date or amount.");
     duplicates++;continue;
    }
    const insert=await c.query(`INSERT INTO bank_transactions
      (tenant_id,bank_account_id,booked_on,description,signed_amount,source_ref,source_hash,created_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT(tenant_id,bank_account_id,source_hash) DO NOTHING RETURNING id`,
      [parsedToken.tenantId,con.bank_account_id,t.bookedOn,t.description,t.signedAmount,
       "FEED:"+t.transactionId,identity,parsedToken.userId]);
    if(insert.rows.length)imported++;else duplicates++;
   }
   await c.query(`INSERT INTO bank_feed_events
     (tenant_id,connection_id,event_id,payload_hash,imported,duplicates) VALUES($1,$2,$3,$4,$5,$6)`,
     [parsedToken.tenantId,con.id,input.eventId,hash,imported,duplicates]);
   await c.query("UPDATE bank_feed_connections SET last_used_at=now() WHERE tenant_id=$1 AND id=$2",[parsedToken.tenantId,con.id]);
   await c.query("INSERT INTO audit_events(tenant_id,actor_id,action,record_id,details) VALUES($1,$2,'bank.feed_imported',$3,$4)",
     [parsedToken.tenantId,parsedToken.userId,randomUUID(),JSON.stringify({connectionId:con.id,eventId:input.eventId,imported,duplicates})]);
   return {eventId:input.eventId,alreadyProcessed:false,imported,duplicates};
  });
  return NextResponse.json({...result,automaticallyReconciled:0,notice:"Bank feed entries staged; all accounting matches still require a finance user's approval."},
   {headers:{"Cache-Control":"no-store"}});
 }catch(e){
  if(e instanceof Error&&/Feed token is not active|no longer authorised|Membership is inactive/.test(e.message))return jsonError("Invalid or revoked bank feed credentials.",401);
  if(e instanceof Error&&/Feed source account|already used for a different payload|conflicting date or amount/.test(e.message))return jsonError(e.message,409);
  return unexpected(e);
 }
}
