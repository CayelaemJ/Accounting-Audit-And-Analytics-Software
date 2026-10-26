import {NextRequest,NextResponse} from "next/server";
import {randomUUID} from "node:crypto";
import {z} from "zod";
import {currentSession,canWrite} from "@/lib/auth";
import {tenantTx} from "@/lib/db";
import {jsonError,requireSameOrigin,limit,unexpected} from "@/lib/http";
import {toCents,fromCents,validatePosting,type PostingLine} from "@/lib/money";
export const runtime="nodejs";
const money=z.string().regex(/^(0|[1-9][0-9]{0,14})(\.[0-9]{1,2})?$/);
const schema=z.object({kind:z.enum(["sales","purchase"]),contactId:z.string().uuid(),
 reference:z.string().trim().min(2).max(70),invoiceDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
 dueDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),netAmount:money,taxAmount:money.default("0"),
 idempotencyKey:z.string().uuid()}).strict();
export async function POST(req:NextRequest){
 try{
 requireSameOrigin(req);const user=await currentSession();
 if(!user)return jsonError("Sign in required.",401);
 if(!canWrite(user.role))return jsonError("Finance permission required.",403);
 if(!(await limit("invoice:create:"+user.tenantId+":"+user.userId,60,1)))return jsonError("Too many invoice requests. Retry shortly.",429);
 const val=schema.safeParse(await req.json());if(!val.success)return jsonError("Review invoice fields.");
 const x=val.data;if(x.dueDate<x.invoiceDate)return jsonError("Due date precedes invoice date.");
 const net=toCents(x.netAmount),tax=toCents(x.taxAmount);if(net<=0n)return jsonError("Net amount must be positive.");
 const gross=fromCents(net+tax);
 const result=await tenantTx(user,async c=>{
  const existing=await c.query("SELECT id,reference,journal_id FROM invoices i WHERE tenant_id=$1 AND kind=$2 AND reference=$3",[user.tenantId,x.kind,x.reference]);
  if(existing.rowCount) return {conflict:true,alreadyPosted:true};
  const contact=await c.query("SELECT id FROM contacts WHERE tenant_id=$1 AND id=$2 AND kind=$3",[user.tenantId,x.contactId,x.kind==="sales"?"customer":"supplier"]);
  if(!contact.rowCount)throw new Error("Invoice contact is missing or has the wrong type.");
  const codes=x.kind==="sales"?["1100","4000","2100"]:["5000","2000","1200"];
  const accounts=await c.query("SELECT id,code FROM accounts WHERE tenant_id=$1 AND code=ANY($2::text[])",[user.tenantId,codes]);
  const map=new Map<string,string>(accounts.rows.map((v:{code:string;id:string})=>[v.code,v.id]));
  if(!map.has(codes[0])||!map.has(codes[1])||(tax>0n&&!map.has(codes[2])))throw new Error("Missing default receivable, payable, income, expense or VAT ledger account.");
  const lines:PostingLine[]=x.kind==="sales"?
    [{accountId:map.get("1100")!,side:"debit",amount:gross},{accountId:map.get("4000")!,side:"credit",amount:fromCents(net)}]:
    [{accountId:map.get("5000")!,side:"debit",amount:fromCents(net)},{accountId:map.get("2000")!,side:"credit",amount:gross}];
  if(tax>0n)lines.push({accountId:map.get(x.kind==="sales"?"2100":"1200")!,side:x.kind==="sales"?"credit":"debit",amount:fromCents(tax)});
  validatePosting(lines);
  const journal=await c.query("INSERT INTO journal_entries(tenant_id,entry_date,memo,idempotency_key,created_by) VALUES($1,$2,$3,$4,$5) ON CONFLICT(tenant_id,idempotency_key) DO NOTHING RETURNING id",
    [user.tenantId,x.invoiceDate,x.kind+" invoice "+x.reference,x.idempotencyKey,user.userId]);
  if(!journal.rowCount){
   const previous=await c.query("SELECT i.id,i.reference,i.journal_id FROM invoices i JOIN journal_entries j ON i.journal_id=j.id AND i.tenant_id=j.tenant_id WHERE i.tenant_id=$1 AND j.idempotency_key=$2",[user.tenantId,x.idempotencyKey]);
   if(previous.rowCount)return {invoice:previous.rows[0],alreadyPosted:true};
   throw new Error("Idempotency key was already used for another transaction.");
  }
  const id=journal.rows[0].id;
  for(const [index,line] of lines.entries()){
   await c.query("INSERT INTO journal_lines(tenant_id,entry_id,account_id,line_no,debit,credit) VALUES($1,$2,$3,$4,$5,$6)",[user.tenantId,id,line.accountId,index+1,line.side==="debit"?line.amount:"0.00",line.side==="credit"?line.amount:"0.00"]);
  }
  const invoice=await c.query("INSERT INTO invoices(tenant_id,kind,reference,contact_id,journal_id,invoice_date,due_date,net_amount,tax_amount,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id,reference,journal_id",
    [user.tenantId,x.kind,x.reference,x.contactId,id,x.invoiceDate,x.dueDate,fromCents(net),fromCents(tax),user.userId]);
  await c.query("INSERT INTO audit_events(tenant_id,actor_id,action,record_id,details) VALUES($1,$2,'invoice.posted',$3,$4)",[user.tenantId,user.userId,invoice.rows[0].id,JSON.stringify({kind:x.kind,reference:x.reference,journalId:id})]);
  return {invoice:invoice.rows[0],alreadyPosted:false};
 });
 if("conflict" in result)return jsonError("Invoice reference already exists; use a new reference.",409);
 return NextResponse.json(result,{status:result.alreadyPosted?200:201});
 }catch(e){
  if(e instanceof Error&&/Invoice contact|Missing default|Idempotency key/.test(e.message))return jsonError(e.message,422);
  if((e as {code?:string}).code==="23505")return jsonError("Duplicate invoice reference.",409);
  return unexpected(e);
 }
}
