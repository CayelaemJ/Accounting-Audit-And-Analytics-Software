"use client";
import Link from "next/link";
import {useCallback,useEffect,useState} from "react";
type Data={currency:string;history:Array<{month:string;revenue:string;expenses:string}>;
 forecast:Array<{month:string;revenue:string;expenses:string;profit:string}>;
 methodology:string;source:string;hasActivity:boolean;asOf:string};
export default function InsightClient(){
 const [months,setMonths]=useState(6),[growth,setGrowth]=useState(0),[data,setData]=useState<Data|null>(null);
 const [error,setError]=useState(""),[busy,setBusy]=useState(false);
 const load=useCallback(async()=>{
  setBusy(true);setError("");
  try{
   const r=await fetch("/api/intelligence/forecast?months="+months+"&growth="+growth,{cache:"no-store"});
   const v=await r.json();if(r.status===401){window.location.assign("/login");return;}
   if(!r.ok)throw new Error(v.error||"Unable to calculate scenario");
   setData(v);
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 },[months,growth]);
 useEffect(()=>{void load();},[load]);
 const fmt=(v:string)=>new Intl.NumberFormat("en-ZA",{style:"currency",currency:data?.currency??"ZAR"}).format(Number(v));
 return <main className="main-area" style={{maxWidth:1250,margin:"auto",minHeight:"100vh"}}>
  <header className="topbar"><strong>CABO<span style={{color:"var(--clay)"}}>.</span> / FINANCIAL INTELLIGENCE</strong><Link href="/dashboard">← Dashboard</Link></header>
  <section className="section-head"><div><span className="eyebrow">SCENARIOS / ANALYTICS</span><h1>Scenario intelligence</h1>
   <p>Transparent projections based on your organisation's actual ledger entries.</p></div></section>
  <div className="notice">Illustrative model, not an AI prediction. Scenarios may be materially different from actual results; review with a qualified finance professional.</div>
  <section className="panel form-panel"><h3>Model assumptions</h3><div className="grid-2">
   <label>Months ahead<select value={months} onChange={e=>setMonths(Number(e.target.value))}>{[3,6,9,12].map(n=><option key={n}>{n}</option>)}</select></label>
   <label>Monthly revenue growth (%)<input type="number" min={-25} max={25} step={1} value={growth} onChange={e=>setGrowth(Number(e.target.value))}/></label>
  </div><div className="form-actions"><button className="button primary" onClick={()=>void load()} disabled={busy}>{busy?"Calculating…":"Refresh scenario →"}</button></div></section>
  {error&&<p className="error-message" role="alert">{error}</p>}
  {data&&<><div className="content-grid">
   <section className="panel"><div className="panel-header"><h3>Historical results</h3><span>12 calendar months</span></div>
    <div className="table-wrap"><table><thead><tr><th>Month</th><th className="right">Recorded revenue</th><th className="right">Recorded expenses</th></tr></thead><tbody>
    {data.history.map(x=><tr key={x.month}><td>{x.month}</td><td className="right mono">{fmt(x.revenue)}</td><td className="right mono">{fmt(x.expenses)}</td></tr>)}
    </tbody></table></div></section>
   <section className="panel"><div className="panel-header"><h3>Projected scenario</h3><span>{months} months</span></div>
    <div className="table-wrap"><table><thead><tr><th>Month</th><th className="right">Revenue</th><th className="right">Expenses</th><th className="right">Result</th></tr></thead><tbody>
    {data.forecast.map(x=><tr key={x.month}><td>{x.month}</td><td className="right mono">{fmt(x.revenue)}</td><td className="right mono">{fmt(x.expenses)}</td><td className="right mono">{fmt(x.profit)}</td></tr>)}
    </tbody></table></div></section></div>
    {!data.hasActivity&&<div className="notice">No posted historical activity. Projected amounts are zero until journals are recorded.</div>}
    <p className="form-note" style={{marginTop:20}}>{data.methodology} Data refreshed {new Date(data.asOf).toLocaleString("en-ZA")}.</p>
  </>}
 </main>;
}
