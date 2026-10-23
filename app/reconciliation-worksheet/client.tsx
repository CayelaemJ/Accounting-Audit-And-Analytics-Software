"use client";
import Link from "next/link";
import {useEffect,useState} from "react";
type Item={id:string;code:string;name:string;item_count:number;unmatched_count:number;statement_net:string;unmatched_net:string;ledger_net:string;difference:string};
export default function Worksheet(){
 const now=new Date().toISOString().slice(0,10);
 const [start,setStart]=useState(now.slice(0,7)+"-01"),[end,setEnd]=useState(now);
 const [items,setItems]=useState<Item[]>([]),[error,setError]=useState(""),[busy,setBusy]=useState(false);
 async function load(){
  setBusy(true);setError("");
  try{
   const r=await fetch("/api/operations/reconciliation-worksheet?start="+encodeURIComponent(start)+"&end="+encodeURIComponent(end),{cache:"no-store"});
   if(r.status===401){window.location.replace("/login");return;}
   const j=await r.json();if(!r.ok)throw new Error(j.error||"Worksheet unavailable");
   setItems(j.accounts);
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 useEffect(()=>{void load();},[]);
 const fmt=(v:string)=>new Intl.NumberFormat("en-ZA",{style:"currency",currency:"ZAR"}).format(Number(v));
 return <main className="main-area" style={{maxWidth:1300,margin:"auto",minHeight:"100vh"}}>
  <header className="topbar"><strong>CABO. BANKING CONTROLS</strong><Link href="/operations">← Financial operations</Link></header>
  <section className="section-head"><div><span className="eyebrow">STATEMENT CONTROL</span>
   <h1>Bank reconciliation worksheet</h1><p>Compare imported bank movements with posted ledger movements over the same dates.</p></div></section>
  <div className="notice">Read-only reconciliation aid. This compares period movements, not independently verified bank balances. No funds or journals are changed.</div>
  <section className="panel" style={{marginTop:18}}><div className="grid-2">
   <label>From<input type="date" value={start} onChange={e=>setStart(e.target.value)} required/></label>
   <label>To<input type="date" max={now} value={end} onChange={e=>setEnd(e.target.value)} required/></label>
   </div><button className="button primary" disabled={busy} onClick={()=>void load()}>{busy?"Checking…":"Run worksheet"}</button></section>
  {error&&<p role="alert" className="error-message">{error}</p>}
  <section className="panel" style={{marginTop:18}}><div className="panel-header"><h3>Account movements</h3><span>{items.length} bank-linked accounts</span></div>
   <div className="table-wrap"><table><thead><tr><th>Account</th><th>Statement net</th><th>Ledger net</th><th>Difference</th><th>Unmatched</th></tr></thead><tbody>
    {items.map(x=><tr key={x.id}><td>{x.code} · {x.name}</td><td>{fmt(x.statement_net)}</td><td>{fmt(x.ledger_net)}</td>
     <td>{fmt(x.difference)}</td><td>{x.unmatched_count} / {x.item_count}</td></tr>)}</tbody></table></div>
   {!items.length&&<p className="muted">No bank statement activity for this date range.</p>}
   <p className="form-note">Review timing differences and unreconciled items before closing a financial period.</p>
   <Link href="/bank-review" className="button">Review suggested matches →</Link></section>
 </main>;
}
