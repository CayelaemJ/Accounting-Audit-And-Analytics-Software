"use client";
import {useEffect,useState,type FormEvent} from "react";
import Link from "next/link";
type Entry={id:string;memo:string;entry_date:string};
export default function ReversalUI(){
 const [entries,setEntries]=useState<Entry[]>([]),[id,setId]=useState(""),[date,setDate]=useState(new Date().toISOString().slice(0,10)),
 [reason,setReason]=useState(""),[error,setError]=useState(""),[notice,setNotice]=useState(""),[busy,setBusy]=useState(false);
 async function load(){
  const r=await fetch("/api/overview",{cache:"no-store"});const j=await r.json();
  if(r.status===401){window.location.assign("/login");return;}
  if(!r.ok)throw Error(j.error||"Unable to load journal records");
  setEntries(j.entries);
 }
 useEffect(()=>{void load().catch(e=>setError((e as Error).message));},[]);
 async function submit(e:FormEvent){
  e.preventDefault();if(!window.confirm("Post a permanent reversing journal? This cannot be undone."))return;
  setBusy(true);setError("");setNotice("");
  try{
   const r=await fetch("/api/journals/reverse",{method:"POST",headers:{"Content-Type":"application/json"},
   body:JSON.stringify({journalId:id,reason,entryDate:date})});
   const result=await r.json();if(!r.ok)throw Error(result.error||"Reversal rejected");
   setNotice("Reversal posted successfully. New journal reference: "+result.id);
   setId("");setReason("");await load();
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 return <main className="main-area" style={{minHeight:"100vh",maxWidth:1100,margin:"auto"}}>
  <header className="topbar"><strong>CABO. FINANCIAL INTELLIGENCE</strong><Link href="/dashboard">← Dashboard</Link></header>
  <section className="section-head"><div><span className="eyebrow">ACCOUNTING / CORRECTIONS</span>
  <h1>Journal reversals</h1><p>Correct eligible postings without changing or deleting the original audit trail.</p></div></section>
  <div className="notice">Only unlinked standalone journals can be reversed here. Invoice settlements and reconciled bank movements require specialised correction workflows. Accounting periods must be open.</div>
  <section className="panel"><h3>Post a reversal</h3>
   <form className="stack-18" onSubmit={e=>void submit(e)}>
    <label>Original journal<select value={id} onChange={e=>setId(e.target.value)} required>
     <option value="">Choose a journal</option>{entries.map(x=><option key={x.id} value={x.id}>{String(x.entry_date).slice(0,10)} — {x.memo}</option>)}
    </select></label>
    <label>Reversal posting date<input type="date" value={date} onChange={e=>setDate(e.target.value)} required/></label>
    <label>Reason for reversing<textarea rows={4} minLength={10} maxLength={500} value={reason} onChange={e=>setReason(e.target.value)} required placeholder="Explain the source error and required correction"/></label>
    <button className="button primary" disabled={busy||!id||reason.trim().length<10}>{busy?"Posting…":"Post reversing journal"}</button>
   </form>
   {error&&<p className="error-message" role="alert">{error}</p>}
   {notice&&<div className="notice" role="status">{notice}</div>}
  </section>
 </main>;
}
