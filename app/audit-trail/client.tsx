"use client";
import Link from "next/link";
import {useEffect,useState} from "react";
type Event={id:string;happened_at:string;action:string;actor_email:string;record_id:string;details:Record<string,unknown>};
function csvEscape(x:unknown){
 const raw=typeof x==="string"?x:JSON.stringify(x??"");
 const safe=/^[\s]*[=+@\-\t\r]/.test(raw)?"'"+raw:raw;
 return '"'+safe.replaceAll('"','""')+'"';
}
export default function AuditTrailClient(){
 const [events,setEvents]=useState<Event[]>([]),[cursor,setCursor]=useState<string|null>(null);
 const [error,setError]=useState(""),[busy,setBusy]=useState(false),[started,setStarted]=useState(false);
 async function load(next:string|null,replace:boolean){
  setBusy(true);setError("");
  try{
   const res=await fetch("/api/audit-trail?limit=50"+(next?"&before="+encodeURIComponent(next):""),{cache:"no-store"});
   if(res.status===401){window.location.assign("/login");return;}
   const body=await res.json();if(!res.ok)throw new Error(body.error||"Audit entries unavailable");
   setEvents(old=>replace?body.events:[...old,...body.events]);
   setCursor(body.nextCursor);setStarted(true);
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 useEffect(()=>{void load(null,true);},[]);
 function exportCsv(){
  const keys=["id","happened_at","action","actor_email","record_id","details"] as const;
  const text="\ufeff"+[keys.join(","),...events.map(row=>keys.map(k=>csvEscape(row[k])).join(","))].join("\r\n");
  const url=URL.createObjectURL(new Blob([text],{type:"text/csv;charset=utf-8"}));
  const a=document.createElement("a");a.href=url;a.download="cabo-audit-trail.csv";a.click();URL.revokeObjectURL(url);
 }
 return <main className="main-area" style={{minHeight:"100vh",maxWidth:1300,margin:"auto"}}>
  <header className="topbar"><strong>CABO. / GOVERNANCE</strong><Link href="/dashboard">← Dashboard</Link></header>
  <section className="section-head"><div><span className="eyebrow">AUDIT LOGGING / IMMUTABLE EVIDENCE</span>
    <h1>Financial activity audit trail</h1><p>Trace who created financial and audit records, and when each action occurred.</p></div>
    <div style={{display:"flex",gap:10}}><button className="button" onClick={()=>void load(null,true)} disabled={busy}>Refresh</button>
    <button className="button primary" disabled={!events.length} onClick={exportCsv}>Export loaded CSV</button></div>
  </section>
  <div className="notice">This ledger of application events is append-only and tenant-isolated. Export contains only the rows loaded here, not necessarily the complete history.</div>
  {error&&<div className="error-message" role="alert">{error}</div>}
  <section className="panel"><div className="panel-header"><h3>Recorded financial activity</h3><span>{events.length} events loaded</span></div>
    <div className="table-wrap"><table><thead><tr><th>When</th><th>Action</th><th>Actor</th><th>Reference</th><th>Details</th></tr></thead>
      <tbody>{events.map(item=><tr key={item.id}>
        <td>{new Date(item.happened_at).toLocaleString("en-ZA")}</td>
        <td>{item.action}</td><td>{item.actor_email}</td><td className="mono">{item.record_id}</td>
        <td><code>{JSON.stringify(item.details).slice(0,250)}</code></td>
      </tr>)}</tbody></table></div>
    {started&&events.length===0&&<p className="muted">No audit events are recorded yet.</p>}
    {cursor&&<div className="form-actions"><button className="button" disabled={busy} onClick={()=>void load(cursor,false)}>{busy?"Loading…":"Load more events"}</button></div>}
  </section>
 </main>;
}
