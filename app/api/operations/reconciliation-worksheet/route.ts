import { NextRequest, NextResponse } from "next/server";
import { currentSession } from "@/lib/auth";
import { tenantTx } from "@/lib/db";
import { validISODate } from "@/lib/aging";
import { jsonError, unexpected } from "@/lib/http";
export const runtime="nodejs";
export const dynamic="force-dynamic";

export async function GET(req:NextRequest) {
 try {
  const user=await currentSession();
  if(!user)return jsonError("Sign in required.",401);
  const today=new Date().toISOString().slice(0,10);
  const start=req.nextUrl.searchParams.get("start")||today.slice(0,7)+"-01";
  const end=req.nextUrl.searchParams.get("end")||today;
  if(!validISODate(start)||!validISODate(end)||start>end||end>today)
    return jsonError("Invalid statement date range.",400);
  const accounts=await tenantTx(user,async c=>{
    const q=await c.query(`WITH statements AS (
      SELECT bank_account_id,COUNT(*)::int AS item_count,
       COUNT(*) FILTER(WHERE m.journal_id IS NULL)::int AS unmatched_count,
       COALESCE(SUM(signed_amount),0)::text AS statement_net,
       COALESCE(SUM(signed_amount) FILTER(WHERE m.journal_id IS NULL),0)::text AS unmatched_net
      FROM bank_transactions b LEFT JOIN bank_matches m
       ON m.tenant_id=b.tenant_id AND m.bank_transaction_id=b.id
      WHERE b.tenant_id=$1 AND booked_on BETWEEN $2::date AND $3::date
      GROUP BY bank_account_id
    ), ledger AS (
      SELECT l.account_id,COALESCE(SUM(l.debit-l.credit),0)::text AS ledger_net
      FROM journal_lines l JOIN journal_entries e ON e.id=l.entry_id AND e.tenant_id=l.tenant_id
      WHERE l.tenant_id=$1 AND e.entry_date BETWEEN $2::date AND $3::date
      GROUP BY l.account_id
    )
    SELECT a.id,a.code,a.name,s.item_count,s.unmatched_count,s.statement_net,
      s.unmatched_net,COALESCE(l.ledger_net,'0.00') AS ledger_net,
      (s.statement_net::numeric-COALESCE(l.ledger_net,'0.00')::numeric)::text AS difference
    FROM statements s JOIN accounts a ON a.id=s.bank_account_id AND a.tenant_id=$1
    LEFT JOIN ledger l ON l.account_id=a.id
    ORDER BY a.code LIMIT 100`,[user.tenantId,start,end]);
    return q.rows;
  });
  return NextResponse.json({start,end,accounts,readOnly:true,
   limitations:"Compares movements in a period, not opening or closing bank balances. Differences may reflect timing or missing records.",
   generatedAt:new Date().toISOString()},{headers:{"Cache-Control":"no-store"}});
 }catch(e){return unexpected(e);}
}
