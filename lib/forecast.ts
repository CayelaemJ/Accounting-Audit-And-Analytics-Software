import {toCents,fromCents} from "@/lib/money";
export type MonthRow={month:string;revenue:string;expenses:string};
function signed(amount:string){return amount.startsWith("-")?-toCents(amount.slice(1)):toCents(amount);}
function nextMonth(month:string,offset:number){
 const [year,mon]=month.split("-").map(Number);
 return new Date(Date.UTC(year,mon-1+offset,1)).toISOString().slice(0,7);
}
export function projectFinancials(records:MonthRow[],asOf:string,months:number,growthPercent:number){
 if(!Number.isInteger(months)||months<1||months>12)throw new Error("Months must be between 1 and 12.");
 if(!Number.isFinite(growthPercent)||growthPercent < -25||growthPercent>25)throw new Error("Growth scenario must be -25% to +25%.");
 const monthBase=asOf.slice(0,7);
 const byMonth=new Map(records.map(x=>[x.month,x]));
 const history=Array.from({length:12},(_,i)=>{
  const month=nextMonth(monthBase,i-11),entry=byMonth.get(month);
  return {month,revenue:entry?.revenue??"0.00",expenses:entry?.expenses??"0.00"};
 });
 const recent=history.slice(-3);
 const revenueBase=recent.reduce((n,r)=>n+signed(r.revenue),0n)/3n;
 const expenseBase=recent.reduce((n,r)=>n+signed(r.expenses),0n)/3n;
 let revenue=revenueBase;
 const basisPoints=BigInt(Math.round(growthPercent*100));
 const forecast=Array.from({length:months},(_,i)=>{
  revenue=revenue*(10000n+basisPoints)/10000n;
  return {month:nextMonth(monthBase,i+1),revenue:fromCents(revenue),expenses:fromCents(expenseBase),profit:fromCents(revenue-expenseBase)};
 });
 return {history,forecast,hasActivity:records.length>0,
  methodology:"Illustrative scenario: trailing 3 calendar-month average; apply monthly growth to revenue and keep expense run-rate constant. Not a statistical forecast or financial advice.",
  source:"Authorised posted journal lines only"};
}
