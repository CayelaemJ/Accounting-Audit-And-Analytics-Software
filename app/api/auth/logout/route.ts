import { NextRequest, NextResponse } from "next/server";
import { clearSessionCookie, revokeCurrentSession } from "@/lib/auth";
import { requireSameOrigin, unexpected } from "@/lib/http";
export const runtime = "nodejs";
export async function POST(req: NextRequest) {
  try {
    requireSameOrigin(req);
    await revokeCurrentSession();
    await clearSessionCookie();
    return NextResponse.json({ ok: true });
  } catch (error) { return unexpected(error); }
}
