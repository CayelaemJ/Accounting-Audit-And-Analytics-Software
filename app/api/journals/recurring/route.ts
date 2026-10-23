import {NextRequest,NextResponse} from "next/server";
import {randomUUID} from "node:crypto";
import {z} from "zod";
import {currentSession,canWrite} from "@/lib/auth";
import {tenantTx} from "@/lib/db";
import {validatePosting,toCents,fromCents} from "@/lib/money";
import {jsonError,requireSameOrigin,unexpected} from "@/lib/http";
export const runtime="nodejs";export const dynamic="force-dynamic";
const line=z.object({accountId:z.string().uuid(),side:z.enum(["debit","credit"]),amount:z.string().max(24)}).strict();
const schema=z.discriminatedUnion("action",[
 z.object({action:z.literal("create"),name:z.string().trim().min(3).max(120),memo:z.string().trim().min(3).max(300),lines:z.array(line).min(2).max(100)}).strict(),
 z.object({action:z.literal("post"),templateId:z.string().uuid(),postingDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/)}).strict(),
 z.object({action:z.literal("deactivate"),templateId:z.string().uuid()}).strict()
]);
export async function GET(){
 try{
 const session=await currentSession();if(!session)return jsonError("Sign in required.",401);
 const templates=await tenantTx(session,async c=>{
  const rows=await c.query(`SELECT t.id,t.name,t.memo,t.lines,t.active,t.created_at,
   (SELECT max(p.posting_date) FROM recurring_journal_postings p WHERE p.tenant_id=t.tenant_id AND p.template_id=t.id) AS last_posted
   FROM recurring_journal_templates t WHERE t.tenant_id=$1 ORDER BY t.created_at DESC LIMIT 100`,[session.tenantId]);
  return rows.rows;
 });
 return NextResponse.json({templates,notice:"Each recurrence requires explicit human approval to post; no automated journal scheduling."},{headers:{"Cache-Control":"no-store"}});
 }catch(e){return unexpected(e);}
}
export async function POST(req:NextRequest){
 try{
 requireSameOrigin(req);
 const session=await currentSession();if(!session)return jsonError("Sign in required.",401);
 if(!canWrite(session.role))return jsonError("Accounting permission required.",403);
 const parsed=schema.safeParse(await req.json());if(!parsed.success)return jsonError("Invalid recurring journal request.");
 const v=parsed.data;
 if(v.action==="create"){
  try{validatePosting(v.lines);}catch(e){return jsonError((e as Error).message);}
  const unique=[...new Set(v.lines.map(x=>x.accountId))];
  if(unique.length<2)return jsonError("Choose two different ledger accounts.");
  const created=await tenantTx(session,async c=>{
   const accounts=await c.query("SELECT id FROM accounts WHERE tenant_id=$1 AND id=ANY($2::uuid[])",[session.tenantId,unique]);
   if(accounts.rows.length!==unique.length)throw Error("Ledger accounts must belong to your organisation.");
   const q=await c.query("INSERT INTO recurring_journal_templates(tenant_id,name,memo,lines,created_by) VALUES($1,$2,$3,$4,$5) RETURNING id,name",
    [session.tenantId,v.name,v.memo,JSON.stringify(v.lines),session.userId]);
   await c.query("INSERT INTO audit_events(tenant_id,actor_id,action,record_id) VALUES($1,$2,'recurring.created',$3)",[session.tenantId,session.userId,q.rows[0].id]);
   return q.rows[0];
  });
  return NextResponse.json({template:created},{status:201});
 }
 if(v.action==="deactivate"){
  const updated=await tenantTx(session,async c=>{
   const q=await c.query("UPDATE recurring_journal_templates SET active=false WHERE tenant_id=$1 AND id=$2 AND active=true RETURNING id",[session.tenantId,v.templateId]);
   if(q.rows.length)await c.query("INSERT INTO audit_events(tenant_id,actor_id,action,record_id) VALUES($1,$2,'recurring.deactivated',$3)",[session.tenantId,session.userId,v.templateId]);
   return Boolean(q.rows.length);
  });
  return updated?NextResponse.json({ok:true}):jsonError("Active template not found.",404);
 }
 const result=await tenantTx(session,async c=>{
  await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[session.tenantId+":"+v.templateId+":"+v.postingDate]);
  const existing=await c.query("SELECT journal_id FROM recurring_journal_postings WHERE tenant_id=$1 AND template_id=$2 AND posting_date=$3",[session.tenantId,v.templateId,v.postingDate]);
  if(existing.rows.length)return {journalId:existing.rows[0].journal_id,alreadyPosted:true};
  const q=await c.query("SELECT memo,lines FROM recurring_journal_templates WHERE tenant_id=$1 AND id=$2 AND active=true",[session.tenantId,v.templateId]);
  if(!q.rows.length)throw Error("Active template not found.");
  const lines=line.array().min(2).max(100).parse(q.rows[0].lines);
  validatePosting(lines);
  const ids=[...new Set(lines.map(x=>x.accountId))];
  if(ids.length<2)throw Error("Template must affect at least two accounts.");
  const valid=await c.query("SELECT id FROM accounts WHERE tenant_id=$1 AND id=ANY($2::uuid[])",[session.tenantId,ids]);
  if(valid.rows.length!==ids.length)throw Error("Template contains an unavailable ledger account.");
  const id=randomUUID();
  await c.query("INSERT INTO journal_entries(id,tenant_id,entry_date,memo,idempotency_key,created_by) VALUES($1,$2,$3,$4,$5,$6)",[id,session.tenantId,v.postingDate,q.rows[0].memo,randomUUID(),session.userId]);
  for(const [i,item] of lines.entries()){
   const amount=fromCents(toCents(item.amount));
   await c.query("INSERT INTO journal_lines(tenant_id,entry_id,account_id,line_no,debit,credit) VALUES($1,$2,$3,$4,$5,$6)",
    [session.tenantId,id,item.accountId,i+1,item.side==="debit"?amount:"0.00",item.side==="credit"?amount:"0.00"]);
  }
  await c.query("INSERT INTO recurring_journal_postings(tenant_id,template_id,posting_date,journal_id,posted_by) VALUES($1,$2,$3,$4,$5)",[session.tenantId,v.templateId,v.postingDate,id,session.userId]);
  await c.query("INSERT INTO audit_events(tenant_id,actor_id,action,record_id,details) VALUES($1,$2,'recurring.posted',$3,$4)",[session.tenantId,session.userId,id,JSON.stringify({templateId:v.templateId})]);
  return {journalId:id,alreadyPosted:false};
 });
 return NextResponse.json(result,{status:result.alreadyPosted?200:201});
 }catch(e){
 if(e instanceof Error&&/unavailable ledger|Active template not found|Ledger accounts must|must affect at least two/.test(e.message))return jsonError(e.message,422);
 if((e as {code?:string})?.code==="23505")return jsonError("This template has already been posted for the selected date.",409);
 if((e as {code?:string})?.code==="22007")return jsonError("Invalid journal date.");
 return unexpected(e);
 }
}
