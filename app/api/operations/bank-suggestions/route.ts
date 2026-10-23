import {NextResponse} from "next/server";
import {currentSession} from "@/lib/auth";
import {tenantTx} from "@/lib/db";
import {jsonError,unexpected} from "@/lib/http";
export const runtime="nodejs";
export const dynamic="force-dynamic";

/**
 * Advisory matching only. This endpoint never posts, reconciles, or alters money.
 * We only offer journal movements on the same account, same signed amount, and within
 * 14 calendar days of the bank booking date. Ambiguities are shown, not auto-resolved.
 * The existing bank match endpoint revalidates all facts before committing.
 */
export async function GET(){
 try{
  const session=await currentSession();
  if(!session)return jsonError("Sign in required.",401);
  const data=await tenantTx(session,async c=>{
   const [totals,matches]=await Promise.all([
    c.query(`SELECT count(*)::int AS imported,
      count(*) FILTER(WHERE m.journal_id IS NOT NULL)::int AS matched,
      count(*) FILTER(WHERE m.journal_id IS NULL)::int AS unmatched,
      coalesce(sum(b.signed_amount) FILTER(WHERE m.journal_id IS NULL),0)::text AS unmatched_net
      FROM bank_transactions b LEFT JOIN bank_matches m
      ON m.tenant_id=b.tenant_id AND m.bank_transaction_id=b.id
      WHERE b.tenant_id=$1`,[session.tenantId]),
    c.query(`WITH unmatched AS (
        SELECT b.id AS bank_transaction_id,b.bank_account_id,b.signed_amount,
          b.booked_on,b.description,b.source_ref
        FROM bank_transactions b LEFT JOIN bank_matches m
          ON m.tenant_id=b.tenant_id AND m.bank_transaction_id=b.id
        WHERE b.tenant_id=$1 AND m.bank_transaction_id IS NULL
        ORDER BY b.booked_on DESC,b.id LIMIT 100
      ), net AS (
        SELECT b.bank_transaction_id,b.signed_amount,b.booked_on,b.description,b.source_ref,
          e.id AS journal_id,e.entry_date,e.memo,
          sum(l.debit-l.credit) AS journal_signed_amount
        FROM unmatched b
        JOIN journal_entries e ON e.tenant_id=$1
          AND e.entry_date BETWEEN b.booked_on-14 AND b.booked_on+14
        JOIN journal_lines l ON l.tenant_id=e.tenant_id AND l.entry_id=e.id
          AND l.account_id=b.bank_account_id
        LEFT JOIN bank_matches existing ON existing.tenant_id=e.tenant_id
          AND existing.journal_id=e.id
        WHERE existing.journal_id IS NULL
        GROUP BY b.bank_transaction_id,b.signed_amount,b.booked_on,
          b.description,b.source_ref,e.id,e.entry_date,e.memo
        HAVING sum(l.debit-l.credit)=b.signed_amount
      ), ranked AS (
        SELECT *,count(*) OVER(PARTITION BY bank_transaction_id)::int AS candidate_count,
          row_number() OVER(PARTITION BY bank_transaction_id
            ORDER BY abs(entry_date-booked_on),journal_id)::int AS candidate_rank
        FROM net
      )
      SELECT bank_transaction_id,signed_amount::text,booked_on,description,source_ref,
        journal_id,entry_date,memo,journal_signed_amount::text,candidate_count
      FROM ranked WHERE candidate_rank<=3
      ORDER BY booked_on DESC,bank_transaction_id,candidate_rank
      LIMIT 300`,[session.tenantId])
   ]);
   const groups=new Map<string,{bankTransactionId:string;bookedOn:string;
     sourceRef:string;description:string;amount:string;candidateCount:number;
     candidates:Array<{journalId:string;entryDate:string;memo:string}>}>();
   for(const r of matches.rows){
    let g=groups.get(r.bank_transaction_id);
    if(!g){
     g={bankTransactionId:r.bank_transaction_id,bookedOn:r.booked_on,
       sourceRef:r.source_ref,description:r.description,amount:r.signed_amount,
       candidateCount:r.candidate_count,candidates:[]};
     groups.set(r.bank_transaction_id,g);
    }
    g.candidates.push({journalId:r.journal_id,entryDate:r.entry_date,memo:r.memo});
   }
   return {summary:totals.rows[0],suggestions:[...groups.values()]};
  });
  return NextResponse.json({...data,asOf:new Date().toISOString(),
   limitations:"Exact same-account signed movements within 14 days only, maximum three proposals per bank item. Review and confirm manually. Absence of a match does not imply a missing journal.",
   automaticallyMatched:0},{headers:{"Cache-Control":"no-store"}});
 }catch(error){return unexpected(error);}
}
