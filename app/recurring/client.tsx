"use client";
import Link from "next/link";
import {useEffect,useState,type FormEvent} from "react";
type Account={id:string;code:string;name:string;type:string};
type Template={id:string;name:string;memo:string;active:boolean;last_posted:string|null};
export default function RecurringClient(){
 const [accounts,setAccounts]=useState<Account[]>([]);
 const [templates,setTemplates]=useState<Template[]>([]);
 const [name,setName]=useState(""),[memo,setMemo]=useState("");
 const [debit,setDebit]=useState(""),[credit,setCredit]=useState(""),[amount,setAmount]=useState("");
 const [postingDate,setPostingDate]=useState(new Date().toISOString().slice(0,10));
 const [error,setError]=useState(""),[notice,setNotice]=useState(""),[busy,setBusy]=useState(false);
 async function load(){
  const [a,b]=await Promise.all([fetch("/api/overview",{cache:"no-store"}),fetch("/api/journals/recurring",{cache:"no-store"})]);
  if(a.status===401||b.status===401){window.location.assign("/login");return;}
  const [overview,items]=await Promise.all([a.json(),b.json()]);
  if(!a.ok||!b.ok)throw Error(overview.error||items.error||"Unable to load templates");
  setAccounts(overview.accounts);setTemplates(items.templates);
 }
 useEffect(()=>{void load().catch(e=>setError((e as Error).message));},[]);
 async function send(payload:unknown){
  setBusy(true);setError("");setNotice("");
  try{
   const r=await fetch("/api/journals/recurring",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
   const result=await r.json();if(!r.ok)throw Error(result.error||"Operation failed");
   setNotice("Saved successfully. "+(result.journalId?"Posted journal: "+result.journalId:""));
   await load();return true;
  }catch(e){setError((e as Error).message);return false;}finally{setBusy(false);}
 }
 async function add(e:FormEvent){
  e.preventDefault();
  if(debit===credit){setError("Use two different ledger accounts.");return;}
  const ok=await send({action:"create",name,memo,lines:[
   {accountId:debit,side:"debit",amount},{accountId:credit,side:"credit",amount}
  ]});
  if(ok){setName("");setMemo("");setAmount("");}
 }
 return <main className="main-area" style={{minHeight:"100vh",maxWidth:1200,margin:"auto"}}>
  <header className="topbar"><strong>CABO. / RECURRING JOURNALS</strong><Link href="/dashboard">← Dashboard</Link></header>
  <section className="section-head"><div><span className="eyebrow">ACCOUNTING / REPEATABLE ENTRIES</span><h1>Recurring journal templates</h1>
   <p>Save balanced entries for repeat transactions and post each period explicitly.</p></div></section>
  <div className="notice">Posting requires human confirmation. No automatic postings or scheduled deductions are enabled. The database prevents posting the same template twice on the same date.</div>
  {error&&<div role="alert" className="error-message">{error}</div>}
  {notice&&<div role="status" className="notice">{notice}</div>}
  <div className="content-grid">
   <section className="panel"><h3>New journal template</h3><form className="stack-18" onSubmit={e=>void add(e)}>
    <label>Template name<input minLength={3} maxLength={120} required value={name} onChange={e=>setName(e.target.value)} placeholder="Monthly office rent"/></label>
    <label>Posting description<input minLength={3} maxLength={300} required value={memo} onChange={e=>setMemo(e.target.value)} placeholder="Monthly operational charge"/></label>
    <label>Debit account<select required value={debit} onChange={e=>setDebit(e.target.value)}><option value="">Select</option>
     {accounts.map(a=><option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}</select></label>
    <label>Credit account<select required value={credit} onChange={e=>setCredit(e.target.value)}><option value="">Select</option>
     {accounts.map(a=><option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}</select></label>
    <label>Amount<input required placeholder="1500.00" value={amount} onChange={e=>setAmount(e.target.value)}/></label>
    <button className="button primary" disabled={busy}>Save template</button>
   </form></section>
   <section className="panel"><h3>Templates and posting</h3>
    <label>Posting date<input type="date" required value={postingDate} onChange={e=>setPostingDate(e.target.value)}/></label>
    {templates.map(t=><div className="audit-item" key={t.id}>
     <span><strong>{t.name}</strong><p className="form-note">{t.memo}</p>
     <p className="form-note">Last posted: {t.last_posted?String(t.last_posted).slice(0,10):"Never"}</p></span>
     <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
      {t.active?<><button className="button primary" disabled={busy} onClick={()=>{if(window.confirm("Post this balanced journal on "+postingDate+"?"))void send({action:"post",templateId:t.id,postingDate});}}>Post</button>
      <button className="button quiet" disabled={busy} onClick={()=>void send({action:"deactivate",templateId:t.id})}>Deactivate</button></>:<span className="pill">Inactive</span>}
     </div></div>)}
    {templates.length===0&&<p className="muted">No recurring templates yet.</p>}
   </section>
  </div>
 </main>;
}
