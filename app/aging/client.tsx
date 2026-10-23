"use client";
import Link from "next/link";
import {useEffect,useState} from "react";
import {AGING_BUCKETS,AGING_LABELS} from "@/lib/aging";
type Summary={invoiceCount:number;totalOutstanding:string;current:string;days_1_30:string;days_31_60:string;days_61_90:string;days_91_plus:string};
type Invoice={id:string;kind:"sales"|"purchase";reference:string;contact_name:string;invoice_date:string;due_date:string;total_amount:string;paid:string;outstanding:string;aging_bucket:keyof typeof AGING_LABELS};
type Data={sales:Summary;purchase:Summary;invoices:Invoice[];asOf:string;truncated:boolean;totalOpen:number;shown:number;explanation:string};
function money(amount:string){return new Intl.NumberFormat("en-ZA",{style:"currency",currency:"ZAR"}).format(Number(amount));}
function csvEscape(value:unknown){
 const raw=String(value??"");
 const safe=/^[\s]*[=+@\-\t\r]/.test(raw)?"'"+raw:raw;
 return '"'+safe.replaceAll('"','""')+'"';
}
export default function AgingClient(){
 const [asOf,setAsOf]=useState(new Date().toISOString().slice(0,10));
 const [data,setData]=useState<Data|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(false);
 async function load(){
  setBusy(true);setError("");
  try{
   const r=await fetch("/api/operations/aging?asOf="+encodeURIComponent(asOf),{cache:"no-store"});
   if(r.status===401){window.location.replace("/login");return;}
   const v=await r.json();if(!r.ok)throw new Error(v.error||"Unable to generate ageing report");
   setData(v);
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 useEffect(()=>{void load();},[]);
 function download(){
  if(!data)return;
  const fields=["kind","reference","contact_name","invoice_date","due_date","total_amount","paid","outstanding","aging_bucket"] as const;
  const lines=[fields.join(","),...data.invoices.map(x=>fields.map(f=>csvEscape(x[f])).join(","))];
  const blob=new Blob(["\ufeff"+lines.join("\r\n")],{type:"text/csv;charset=utf-8"});
  const url=URL.createObjectURL(blob);const a=document.createElement("a");
  a.href=url;a.download="cabo-invoice-ageing-"+data.asOf+".csv";a.click();URL.revokeObjectURL(url);
 }
 const summary=[{key:"sales",title:"Customer receivables",value:data?.sales},{key:"purchase",title:"Supplier payables",value:data?.purchase}];
 return <main className="main-area" style={{minHeight:"100vh",maxWidth:1400,margin:"auto"}}>
  <header className="topbar"><strong>CABO. / FINANCIAL INTELLIGENCE</strong><Link href="/dashboard">← Dashboard</Link></header>
  <section className="section-head"><div><span className="eyebrow">CREDIT CONTROL / AS-OF REPORTING</span>
    <h1>Receivables & payables ageing</h1>
    <p>See what remains outstanding, who owes what, and how long balances have been past due.</p>
   </div></section>
  <section className="panel"><div className="grid-2"><label>Report as of date
   <input type="date" value={asOf} max={new Date().toISOString().slice(0,10)} min="2000-01-01" onChange={e=>setAsOf(e.target.value)}/></label>
   <div className="form-actions"><button className="button primary" disabled={busy} onClick={()=>void load()}>{busy?"Generating…":"Generate report"}</button>
   <button className="button" disabled={!data?.invoices.length} onClick={download}>↓ Export displayed invoices</button></div></div></section>
  {error&&<p className="error-message" role="alert">{error}</p>}
  {data&&<>
   <div className="notice" style={{marginTop:18}}>{data.explanation} Amounts are in ZAR. Date: {data.asOf}.
   {data.truncated&&" Only the 200 oldest outstanding invoices are shown below; aggregate totals cover all outstanding invoices."}</div>
   <div className="content-grid">{summary.map(x=><section className="panel" key={x.key}>
    <div className="panel-header"><h3>{x.title}</h3><span className="pill">{x.value?.invoiceCount||0} open invoices</span></div>
    <div className="kpi-value" style={{marginBottom:16}}>{money(x.value?.totalOutstanding||"0.00")}</div>
    <div className="table-wrap"><table><thead><tr><th>Ageing</th><th className="right">Outstanding (ZAR)</th></tr></thead>
     <tbody>{AGING_BUCKETS.map(bucket=><tr key={bucket}><td>{AGING_LABELS[bucket]}</td><td className="right mono">{money(x.value?.[bucket]||"0.00")}</td></tr>)}</tbody>
    </table></div></section>)}</div>
   <section className="panel" style={{marginTop:18}}>
    <div className="panel-header"><h3>Outstanding invoice detail</h3><span>{data.shown} of {data.totalOpen} open</span></div>
    {data.invoices.length===0?<p className="muted">No outstanding balances on this date.</p>:
    <div className="table-wrap"><table><thead><tr><th>Type</th><th>Invoice</th><th>Customer / supplier</th><th>Due</th><th>Age bucket</th><th className="right">Outstanding</th></tr></thead>
     <tbody>{data.invoices.map(i=><tr key={i.id}><td>{i.kind==="sales"?"Receivable":"Payable"}</td>
      <td>{i.reference}</td><td>{i.contact_name}</td><td>{String(i.due_date).slice(0,10)}</td>
      <td>{AGING_LABELS[i.aging_bucket]}</td><td className="right mono">{money(i.outstanding)}</td>
     </tr>)}</tbody></table></div>}
   </section>
  </>}
 </main>;
}
