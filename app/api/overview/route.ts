import { NextResponse } from "next/server";
import { currentSession } from "@/lib/auth";
import { tenantTx } from "@/lib/db";
import { jsonError, unexpected } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const session = await currentSession();
    if (!session) return jsonError("Sign in to continue.",401);
    const result = await tenantTx(session, async client => {
      const tenant = await client.query("SELECT id,name,currency FROM tenants WHERE id=$1",[session.tenantId]);
      const totals = await client.query(`
        SELECT
          coalesce(sum(CASE WHEN a.type='revenue' THEN l.credit-l.debit ELSE 0 END),0)::text AS revenue,
          coalesce(sum(CASE WHEN a.type='expense' THEN l.debit-l.credit ELSE 0 END),0)::text AS expenses,
          coalesce(sum(CASE WHEN a.type='asset' THEN l.debit-l.credit ELSE 0 END),0)::text AS assets,
          coalesce(sum(CASE WHEN a.type='liability' THEN l.credit-l.debit ELSE 0 END),0)::text AS liabilities
        FROM journal_lines l JOIN accounts a ON a.id=l.account_id AND a.tenant_id=l.tenant_id
        WHERE l.tenant_id=$1
      `,[session.tenantId]);
      const accounts = await client.query(
        "SELECT id,code,name,type FROM accounts WHERE tenant_id=$1 ORDER BY code LIMIT 500",[session.tenantId]);
      const trial = await client.query(`
        SELECT a.id,a.code,a.name,a.type,coalesce(sum(l.debit),0)::text AS debit,
        coalesce(sum(l.credit),0)::text AS credit
        FROM accounts a LEFT JOIN journal_lines l ON a.id=l.account_id AND a.tenant_id=l.tenant_id
        WHERE a.tenant_id=$1 GROUP BY a.id,a.code,a.name,a.type ORDER BY a.code LIMIT 500
      `,[session.tenantId]);
      const entries = await client.query(
        "SELECT id,entry_date,memo,posted_at FROM journal_entries WHERE tenant_id=$1 ORDER BY posted_at DESC LIMIT 20",
        [session.tenantId]);
      const findings = await client.query(
        "SELECT id,title,description,severity,status,created_at FROM audit_findings WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 50",
        [session.tenantId]);
      const journalCount = await client.query("SELECT count(*)::int AS count FROM journal_entries WHERE tenant_id=$1",[session.tenantId]);
      return {
        tenant:tenant.rows[0], totals:totals.rows[0],
        accounts:accounts.rows, trialBalance:trial.rows, entries:entries.rows,
        findings:findings.rows, journalCount:journalCount.rows[0].count,
        email:session.email, role:session.role, refreshedAt:new Date().toISOString()
      };
    });
    return NextResponse.json(result,{headers:{"Cache-Control":"no-store"}});
  } catch(error) { return unexpected(error); }
}
