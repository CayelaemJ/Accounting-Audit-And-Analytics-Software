"use client";
import Link from "next/link";
import {useEffect,useState} from "react";
type Feed={id:string;bank_account_id:string;active:boolean;created_at:string;
 last_used_at:string|null;code:string;name:string;account_last4:string;deliveries:number};
type Account={id:string;code:string;name:string};
export default function BankFeedClient(){
 const [feeds,setFeeds]=useState<Feed[]>([]),[accounts,setAccounts]=useState<Account[]>([]);
 const [account,setAccount]=useState(""),[token,setToken]=useState(""),[notice,setNotice]=useState("");
 const [error,setError]=useState(""),[working,setWorking]=useState(false);
 async function load(){
  const [r,o]=await Promise.all([fetch("/api/operations/feed/connections",{cache:"no-store"}),
    fetch("/api/overview",{cache:"no-store"})]);
  if(r.status===401||o.status===401){window.location.assign("/login");return;}
  const [a,b]=await Promise.all([r.json(),o.json()]);
  if(!r.ok||!o.ok)throw Error(a.error||b.error||"Unable to load feed configuration");
  setFeeds(a.connections);
  setAccounts(b.accounts.filter((x:Account)=>x.code&&x.id));
 }
 useEffect(()=>{void load().catch(e=>setError((e as Error).message));},[]);
 async function act(action:"issue"|"disable",bankAccountId:string){
  if(action==="disable"&&!window.confirm("Disable this feed? Incoming automated events will be rejected."))return;
  if(action==="issue"&&feeds.some(f=>f.bank_account_id===bankAccountId&&f.active)
     &&!window.confirm("Reissuing immediately invalidates the previous token. Continue?"))return;
  setWorking(true);setError("");setNotice("");setToken("");
  try{
   const r=await fetch("/api/operations/feed/connections",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({action,bankAccountId})
   });
   const v=await r.json();if(!r.ok)throw Error(v.error||"Feed setup failed");
   setToken(v.token||"");setNotice(v.notice||"Feed connection updated.");
   await load();
  }catch(e){setError((e as Error).message);}finally{setWorking(false);}
 }
 return <main className="main-area" style={{minHeight:"100vh",maxWidth:1200,margin:"auto"}}>
  <header className="topbar"><strong>CABO. / AUTOMATED FEEDS</strong><Link href="/operations">← Operations</Link></header>
  <section className="section-head"><div><span className="eyebrow">SECURE BANK FEED INGESTION</span>
    <h1>Automated statement feed</h1>
    <p>Set up a controlled ingestion endpoint for a trusted third-party bank connector.</p></div></section>
  <div className="notice">
   This is a secure ingestion interface, not a live bank connection. To enable automated delivery,
   an approved provider or authorised integration must be configured to send events to your webhook.
   No automatic transfers or ledger reconciliations take place.
  </div>
  {error&&<div className="error-message" role="alert" style={{marginTop:18}}>{error}</div>}
  {notice&&<div className="notice" role="status" style={{marginTop:18}}>{notice}</div>}
  <div className="content-grid" style={{marginTop:18}}>
   <section className="panel"><h3>Issue a scoped feed credential</h3>
    <p className="form-note">Only ledger accounts already confirmed by a finance manager during OFX/QFX import may be connected.</p>
    <label>Statement-mapped bank ledger
     <select value={account} onChange={e=>setAccount(e.target.value)}>
      <option value="">Select account</option>
      {accounts.map(a=><option value={a.id} key={a.id}>{a.code} — {a.name}</option>)}
     </select>
    </label>
    <button className="button primary" style={{marginTop:16}} disabled={working||!account}
      onClick={()=>void act("issue",account)}>Issue or rotate feed credential</button>
    {token&&<div style={{marginTop:18}}>
      <strong>One-time feed credential</strong>
      <p className="form-note">Copy this once into your authorised sender's secret manager. It cannot be retrieved later.</p>
      <textarea readOnly value={token} rows={4} style={{width:"100%",fontFamily:"monospace"}}/>
      <button className="button" onClick={()=>navigator.clipboard.writeText(token)}>Copy credential</button>
    </div>}
   </section>
   <section className="panel"><h3>Connection details</h3>
    <label>Ingestion endpoint
     <input readOnly value={typeof window!=="undefined"?window.location.origin+"/api/operations/feed/webhook":"/api/operations/feed/webhook"}/>
    </label>
    <p className="form-note">HTTP POST, Content-Type: application/json, Authorization: Bearer YOUR_SCOPED_TOKEN.</p>
    <p className="form-note">The sender supplies a stable event ID, bank account last four characters, currency, and uniquely identified statement transactions. Payload format is documented in the repository.</p>
    <p className="form-note">Credentials are bound to an organisation, issuing finance user, and previously verified bank ledger. Disabling or rotating a token prevents further use of its previous value.</p>
   </section>
  </div>
  <section className="panel" style={{marginTop:18}}><div className="panel-header"><h3>Connected source authorisations</h3><span>{feeds.length} configured</span></div>
   {feeds.length===0&&<p className="muted">No automatic feed credentials have been issued yet. Import a verified OFX/QFX statement first.</p>}
   {feeds.map(f=><div className="audit-item" key={f.id}><span>
    <strong>{f.code} — {f.name}</strong>
    <p className="form-note">Statement source ••••{f.account_last4} · {f.deliveries} delivery events</p>
    <p className="form-note">Last received: {f.last_used_at?new Date(f.last_used_at).toLocaleString("en-ZA"):"Never"}</p>
   </span>
   <div style={{display:"flex",gap:8,alignItems:"center"}}>
    <span className="pill">{f.active?"Active":"Disabled"}</span>
    {f.active&&<button className="button quiet" disabled={working} onClick={()=>void act("disable",f.bank_account_id)}>Disable</button>}
   </div></div>)}
  </section>
 </main>;
}
