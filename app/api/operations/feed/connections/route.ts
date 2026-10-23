import {NextRequest,NextResponse} from "next/server";
import {randomUUID} from "node:crypto";
import {z} from "zod";
import {currentSession} from "@/lib/auth";
import {tenantTx} from "@/lib/db";
import {issueBankFeedToken} from "@/lib/bank-feed";
import {jsonError,requireSameOrigin,limit,unexpected} from "@/lib/http";
export const runtime="nodejs";export const dynamic="force-dynamic";
const actions=z.discriminatedUnion("action",[
 z.object({action:z.literal("issue"),bankAccountId:z.string().uuid()}).strict(),
 z.object({action:z.literal("disable"),bankAccountId:z.string().uuid()}).strict()
]);
export async function GET(){
 try{
  const user=await currentSession();if(!user)return jsonError("Sign in required.",401);
  if(!["owner","finance_manager"].includes(user.role))return jsonError("Finance manager access required.",403);
  const connections=await tenantTx(user,async c=>{
   const q=await c.query(`SELECT f.id,f.bank_account_id,f.active,f.created_at,f.last_used_at,
      a.code,a.name,s.account_last4,
      (SELECT count(*)::int FROM bank_feed_events e WHERE e.tenant_id=f.tenant_id AND e.connection_id=f.id) AS deliveries
      FROM bank_feed_connections f
      JOIN bank_statement_sources s ON s.tenant_id=f.tenant_id AND s.bank_account_id=f.bank_account_id
      JOIN accounts a ON a.tenant_id=f.tenant_id AND a.id=f.bank_account_id
      WHERE f.tenant_id=$1 ORDER BY f.created_at DESC LIMIT 100`,[user.tenantId]);
   return q.rows;
  });
  return NextResponse.json({connections,notice:"Automated feed ingestion becomes active only after you configure an approved upstream sender to deliver to the webhook. This application does not yet fetch statements from any bank."},
   {headers:{"Cache-Control":"no-store"}});
 }catch(e){return unexpected(e);}
}
export async function POST(req:NextRequest){
 try{
  requireSameOrigin(req);
  const user=await currentSession();if(!user)return jsonError("Sign in required.",401);
  if(!["owner","finance_manager"].includes(user.role))return jsonError("Finance manager access required.",403);
  if(!await limit("bank-feed-manage:"+user.userId,12,60))return jsonError("Connection changes are temporarily rate limited.",429);
  const parsed=actions.safeParse(await req.json());
  if(!parsed.success)return jsonError("Invalid bank feed action.");
  const action=parsed.data;
  const token=action.action==="issue"?issueBankFeedToken(user.tenantId,user.userId):null;
  const outcome=await tenantTx(user,async c=>{
   if(action.action==="disable"){
    const q=await c.query(`UPDATE bank_feed_connections SET active=false WHERE tenant_id=$1 AND bank_account_id=$2 AND active=true RETURNING id`,
      [user.tenantId,action.bankAccountId]);
    if(!q.rows.length)throw Error("No active feed connection exists for this account.");
    await c.query("INSERT INTO audit_events(tenant_id,actor_id,action,record_id) VALUES($1,$2,'bank.feed_disabled',$3)",[user.tenantId,user.userId,q.rows[0].id]);
    return {id:q.rows[0].id,active:false};
   }
   const source=await c.query(`SELECT s.bank_account_id FROM bank_statement_sources s
     JOIN accounts a ON a.tenant_id=s.tenant_id AND a.id=s.bank_account_id
     WHERE s.tenant_id=$1 AND s.bank_account_id=$2 AND a.type='asset'`,
     [user.tenantId,action.bankAccountId]);
   if(!source.rows.length)throw Error("First import and verify an OFX/QFX statement for this bank ledger account.");
   const q=await c.query(`INSERT INTO bank_feed_connections
    (tenant_id,bank_account_id,token_hash,issued_by,active)
    VALUES($1,$2,$3,$4,true)
    ON CONFLICT(tenant_id,bank_account_id)
    DO UPDATE SET token_hash=EXCLUDED.token_hash,issued_by=EXCLUDED.issued_by,
      active=true,last_used_at=NULL
    RETURNING id`,[user.tenantId,action.bankAccountId,token!.hash,user.userId]);
   await c.query("INSERT INTO audit_events(tenant_id,actor_id,action,record_id) VALUES($1,$2,'bank.feed_credential_issued',$3)",[user.tenantId,user.userId,q.rows[0].id]);
   return {id:q.rows[0].id,active:true};
  });
  return NextResponse.json({...outcome,...(token?{token:token.token}:{}),
   notice:token?"This scoped credential is displayed once. Store it in the authorised upstream sender's secret manager; reissuing immediately invalidates the previous token.":"Bank feed credentials have been disabled."},
   {headers:{"Cache-Control":"no-store"}});
 }catch(e){
  if(e instanceof Error&&/No active feed connection|First import and verify/.test(e.message))return jsonError(e.message,422);
  return unexpected(e);
 }
}
