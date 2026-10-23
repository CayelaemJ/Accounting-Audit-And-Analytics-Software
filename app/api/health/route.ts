import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    await pool().query("SELECT 1");
    return NextResponse.json({ status:"ok", service:"cabo-financial-intelligence" },{headers:{"Cache-Control":"no-store"}});
  } catch {
    return NextResponse.json({ status:"unavailable" },{status:503,headers:{"Cache-Control":"no-store"}});
  }
}
