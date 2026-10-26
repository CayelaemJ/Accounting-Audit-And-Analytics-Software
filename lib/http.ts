import {RequestOriginError,validSameOriginRequest} from "@/lib/origin-policy";
import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { pool } from "@/lib/db";
export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}
export function requireSameOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  const target = req.headers.get("host");
  if(!validSameOriginRequest(origin,target,process.env.NODE_ENV==="production",process.env.CABO_PUBLIC_ORIGIN))throw new RequestOriginError();
}
export async function limit(key: string, max: number, minutes = 15): Promise<boolean> {
  const windowStart = Math.floor(Date.now() / (minutes * 60000));
  const digest = createHash("sha256").update(key).digest("hex");
  const result = await pool().query(
    "INSERT INTO rate_limits(key_hash,window_start,hits) VALUES($1,$2,1) ON CONFLICT(key_hash,window_start) DO UPDATE SET hits=rate_limits.hits+1 RETURNING hits",
    [digest,windowStart]
  );
  return Number(result.rows[0].hits) <= max;
}
export function unexpected(error: unknown) {
  if(error instanceof RequestOriginError)return jsonError("Request origin not allowed.",403);
  console.error("CABO request error", error instanceof Error ? error.message : "Unknown");
  return jsonError("We couldn't complete the request. Please try again.", 500);
}
