import {NextRequest,NextResponse} from "next/server";
import {currentSession} from "@/lib/auth";
import {tenantTx} from "@/lib/db";
import {jsonError,unexpected} from "@/lib/http";
import {AGING_BUCKETS,type AgingBucket,validISODate} from "@/lib/aging";

export const runtime="nodejs";
export const dynamic="force-dynamic";
// The as-of date applies to both invoice recognition and settlement allocation dates.
// All SQL is fixed and scoped to the authenticated tenant.
const balanceCTE=`
WITH source AS (
 SELECT i.id,i.kind,i.reference,i.invoice_date,i.due_date,i.total_amount,c.name AS contact_name,
  coalesce((SELECT sum(p.amount) FROM invoice_allocations p
   WHERE p.tenant_id=i.tenant_id AND p.invoice_id=i.id AND p.payment_date<=$2::date),0) AS paid
 FROM invoices i JOIN contacts c ON c.id=i.contact_id AND c.tenant_id=i.tenant_id
 WHERE i.tenant_id=$1 AND i.invoice_date<=$2::date
), balances AS (
 SELECT *,GREATEST(total_amount-paid,0) AS outstanding,
  CASE
   WHEN due_date >= $2::date THEN 'current'
   WHEN ($2::date-due_date)<=30 THEN 'days_1_30'
   WHEN ($2::date-due_date)<=60 THEN 'days_31_60'
   WHEN ($2::date-due_date)<=90 THEN 'days_61_90'
   ELSE 'days_91_plus'
  END AS aging_bucket
 FROM source
)
`;
type Entry={kind:string;aging_bucket:AgingBucket;invoice_count:number;outstanding_amount:string};
function emptyGroup(){
 return {invoiceCount:0,totalOutstanding:"0.00",current:"0.00",days_1_30:"0.00",
 days_31_60:"0.00",days_61_90:"0.00",days_91_plus:"0.00"};
}
function sumDecimal(a:string,b:string):string{
 const cents=(x:string)=>{
  const neg=x.startsWith("-");
  const parts=(neg?x.slice(1):x).split(".");
  const value=BigInt(parts[0])*100n+BigInt((parts[1]||"").padEnd(2,"0").slice(0,2));
  return neg?-value:value;
 };
 const value=cents(a)+cents(b),absolute=value<0n?-value:value;
 return (value<0n?"-":"")+String(absolute/100n)+"."+String(absolute%100n).padStart(2,"0");
}
export async function GET(req:NextRequest){
 try{
  const session=await currentSession();
  if(!session)return jsonError("Sign in required.",401);
  const today=new Date().toISOString().slice(0,10);
  const asOf=req.nextUrl.searchParams.get("asOf")||today;
  if(!validISODate(asOf)||asOf<"2000-01-01"||asOf>today)
   return jsonError("Provide a real date from 2000-01-01 through today.");
  const data=await tenantTx(session,async c=>{
   const [groups,rows]=await Promise.all([
    c.query(balanceCTE+`SELECT kind,aging_bucket,count(*)::int AS invoice_count,
       sum(outstanding)::text AS outstanding_amount FROM balances
       WHERE outstanding>0 GROUP BY kind,aging_bucket`,[session.tenantId,asOf]),
    c.query(balanceCTE+`SELECT id,kind,reference,contact_name,invoice_date,due_date,
       total_amount::text,paid::text,outstanding::text,aging_bucket
       FROM balances WHERE outstanding>0
       ORDER BY due_date ASC,invoice_date ASC,id ASC LIMIT 200`,[session.tenantId,asOf])
   ]);
   const sales=emptyGroup(),purchase=emptyGroup();
   for(const item of groups.rows as Entry[]){
    const group=item.kind==="sales"?sales:purchase;
    if(!AGING_BUCKETS.includes(item.aging_bucket))throw new Error("Unsupported ageing classification");
    group.invoiceCount+=item.invoice_count;
    group[item.aging_bucket]=item.outstanding_amount;
    group.totalOutstanding=sumDecimal(group.totalOutstanding,item.outstanding_amount);
   }
   return {sales,purchase,invoices:rows.rows,
    shown:rows.rows.length,totalOpen:sales.invoiceCount+purchase.invoiceCount};
  });
  return NextResponse.json({...data,asOf,truncated:data.totalOpen>data.shown,
   explanation:"As-of ageing of posted invoices, less payments allocated on or before the requested date. Not a bank reconciliation or independently verified external financial statement.",
   generatedAt:new Date().toISOString()},{headers:{"Cache-Control":"no-store"}});
 }catch(e){return unexpected(e);}
}
