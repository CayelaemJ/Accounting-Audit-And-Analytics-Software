import {NextRequest,NextResponse} from "next/server";
import {z} from "zod";
import {currentSession} from "@/lib/auth";
import {tenantTx} from "@/lib/db";
import {jsonError,unexpected} from "@/lib/http";
import {projectFinancials} from "@/lib/forecast";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function GET(req:NextRequest){
 try{
  const session=await currentSession();
  if(!session)return jsonError("Sign in required.",401);
  const values=z.object({months:z.coerce.number().int().min(1).max(12).default(6),
     growth:z.coerce.number().min(-25).max(25).default(0)}).safeParse({
    months:req.nextUrl.searchParams.get("months")??6,
    growth:req.nextUrl.searchParams.get("growth")??0});
  if(!values.success)return jsonError("Select 1–12 months and monthly revenue growth between -25% and 25%.");
  const asOf=new Date().toISOString();
  const [records,currency]=await tenantTx(session,async client=>{
   const data=await client.query(`SELECT to_char(date_trunc('month',j.entry_date),'YYYY-MM') AS month,
    coalesce(sum(CASE WHEN a.type='revenue' THEN l.credit-l.debit ELSE 0 END),0)::text AS revenue,
    coalesce(sum(CASE WHEN a.type='expense' THEN l.debit-l.credit ELSE 0 END),0)::text AS expenses
    FROM journal_lines l JOIN journal_entries j ON j.id=l.entry_id AND j.tenant_id=l.tenant_id
    JOIN accounts a ON a.id=l.account_id AND a.tenant_id=l.tenant_id
    WHERE l.tenant_id=$1 AND j.entry_date>=date_trunc('month',current_date)-interval '11 months'
    AND j.entry_date<date_trunc('month',current_date)+interval '1 month'
    GROUP BY date_trunc('month',j.entry_date)
    ORDER BY date_trunc('month',j.entry_date)`,[session.tenantId]);
   const tenant=await client.query("SELECT currency FROM tenants WHERE id=$1",[session.tenantId]);
   return [data.rows,tenant.rows[0]?.currency??"ZAR"] as const;
  });
  return NextResponse.json({...projectFinancials(records,asOf,values.data.months,values.data.growth),currency,growthPercent:values.data.growth,asOf},
   {headers:{"Cache-Control":"no-store"}});
 }catch(error){return unexpected(error);}
}
