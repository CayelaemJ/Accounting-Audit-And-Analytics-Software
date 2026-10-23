import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { currentSession, canWrite } from "@/lib/auth";
import { tenantTx } from "@/lib/db";
import { validatePosting, toCents, fromCents } from "@/lib/money";
import { jsonError, requireSameOrigin, unexpected } from "@/lib/http";

export const runtime = "nodejs";
const schema = z.object({
  entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  memo: z.string().trim().min(3).max(300),
  idempotencyKey: z.string().uuid(),
  lines: z.array(z.object({
    accountId: z.string().uuid(),
    side: z.enum(["debit","credit"]),
    amount: z.string().max(24)
  }).strict()).min(2).max(100)
}).strict();
export async function POST(req: NextRequest) {
  try {
    requireSameOrigin(req);
    const session = await currentSession();
    if (!session) return jsonError("Sign in to continue.",401);
    if (!canWrite(session.role)) return jsonError("You do not have journal posting permissions.",403);
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return jsonError("Review the journal date, lines and reference.");
    const input = parsed.data;
    try { validatePosting(input.lines); } catch (err) { return jsonError((err as Error).message); }
    const distinct = Array.from(new Set(input.lines.map(line => line.accountId)));
    if (distinct.length < 2) return jsonError("A journal must affect at least two different accounts.");
    const outcome = await tenantTx(session, async client => {
      const valid = await client.query("SELECT id FROM accounts WHERE tenant_id=$1 AND id=ANY($2::uuid[])",
        [session.tenantId, distinct]);
      if (valid.rowCount !== distinct.length) throw new Error("An account does not belong to this organisation");
      const entry = await client.query(
        "INSERT INTO journal_entries(tenant_id,entry_date,memo,idempotency_key,created_by) VALUES($1,$2,$3,$4,$5) ON CONFLICT(tenant_id,idempotency_key) DO NOTHING RETURNING id",
        [session.tenantId,input.entryDate,input.memo,input.idempotencyKey,session.userId]);
      if (!entry.rowCount) {
        const existing = await client.query("SELECT id FROM journal_entries WHERE tenant_id=$1 AND idempotency_key=$2",
          [session.tenantId,input.idempotencyKey]);
        return { id: existing.rows[0].id as string, alreadyPosted:true };
      }
      const id = entry.rows[0].id as string;
      for (const [index,line] of input.lines.entries()) {
        const amount = fromCents(toCents(line.amount));
        await client.query(
          "INSERT INTO journal_lines(tenant_id,entry_id,account_id,line_no,debit,credit) VALUES($1,$2,$3,$4,$5,$6)",
          [session.tenantId,id,line.accountId,index+1,line.side === "debit" ? amount : "0.00",line.side === "credit" ? amount : "0.00"]);
      }
      await client.query("INSERT INTO audit_events(tenant_id,actor_id,action,record_id,details) VALUES($1,$2,'journal.posted',$3,$4)",
        [session.tenantId,session.userId,id,JSON.stringify({ lineCount:input.lines.length })]);
      return { id, alreadyPosted:false };
    });
    return NextResponse.json(outcome,{ status:outcome.alreadyPosted ? 200 : 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "An account does not belong to this organisation") return jsonError(error.message);
    if ((error as {code?:string})?.code === "22007") return jsonError("Invalid journal date.");
    return unexpected(error);
  }
}
