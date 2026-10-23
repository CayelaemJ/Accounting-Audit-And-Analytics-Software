import { NextResponse } from "next/server";
import { z } from "zod";
import { currentSession } from "@/lib/auth";
import { tenantTx } from "@/lib/db";
import { jsonError, unexpected } from "@/lib/http";
export const runtime = "nodejs";
export async function GET(_request: Request, context:{params:Promise<{id:string}>}) {
  try {
    const session=await currentSession();
    if (!session) return jsonError("Sign in to continue.",401);
    const {id}=await context.params;
    if (!z.string().uuid().safeParse(id).success) return jsonError("Invalid journal ID.");
    const entry=await tenantTx(session,async client=>{
      const r=await client.query("SELECT id,memo,entry_date,posted_at FROM journal_entries WHERE tenant_id=$1 AND id=$2",[session.tenantId,id]);
      if(!r.rowCount) return null;
      const lines=await client.query(
        "SELECT a.code,a.name,l.debit::text,l.credit::text FROM journal_lines l JOIN accounts a ON a.id=l.account_id AND a.tenant_id=l.tenant_id WHERE l.tenant_id=$1 AND l.entry_id=$2 ORDER BY l.line_no",
        [session.tenantId,id]);
      return {...r.rows[0],lines:lines.rows};
    });
    return entry?NextResponse.json({entry},{headers:{"Cache-Control":"no-store"}}):jsonError("Journal not found.",404);
  }catch(error){return unexpected(error);}
}
