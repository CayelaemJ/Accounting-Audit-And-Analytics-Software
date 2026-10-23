"use client";
import Link from "next/link";
import {useEffect,useState,type FormEvent} from "react";
type Definition={id:string;name:string;template:string;created_by:string;created_at:string};
type ReportData={definition:Definition;rows:Array<Record<string,unknown>>;asOf:string;limitations:string};
const templates=[
{value:"trial_balance",label:"Net trial balance"},
{value:"income_summary",label:"Income and expense overview"},
{value:"audit_findings",label:"Audit findings"},
{value:"bank_reconciliation",label:"Bank reconciliation"},
{value:"budget_variance",label:"Budget vs actual"}];
function cell(v:unknown){return v===null||v===undefined?"":String(v);}
function escapeCSV(v:unknown){
 const s=cell(v),safe=/^[=+@\-\t\r]/.test(s)?"'"+s:s;
 return '"'+safe.replaceAll('"','""')+'"';
}
export default function SavedReportsClient(){
 const [reports,setReports]=useState<Definition[]>([]),[selected,setSelected]=useState<ReportData|null>(null);
 const [name,setName]=useState(""),[template,setTemplate]=useState("trial_balance");
 const [error,setError]=useState(""),[busy,setBusy]=useState(false);
 async function list(){
  const res=await fetch("/api/reports/saved",{cache:"no-store"});
  if(res.status===401){window.location.assign("/login");return;}
  const data=await res.json();if(!res.ok)throw new Error(data.error||"Unable to load reports");
  setReports(data.reports);
 }
 useEffect(()=>{void list().catch(e=>setError((e as Error).message));},[]);
 async function add(e:FormEvent){
  e.preventDefault();setBusy(true);setError("");
  try{
   const res=await fetch("/api/reports/saved",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name,template})});
   const data=await res.json();if(!res.ok)throw new Error(data.error||"Unable to save report");
   setName("");await list();
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 async function run(id:string){
  setBusy(true);setError("");
  try{
   const res=await fetch("/api/reports/saved/"+encodeURIComponent(id),{cache:"no-store"});
   const data=await res.json();if(!res.ok)throw new Error(data.error||"Report could not be generated");
   setSelected(data);
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 async function remove(id:string){
  if(!window.confirm("Delete this saved report definition? Ledger data will not be deleted."))return;
  setBusy(true);setError("");
  try{
   const res=await fetch("/api/reports/saved/"+encodeURIComponent(id),{method:"DELETE"});
   const data=await res.json();if(!res.ok)throw new Error(data.error||"Delete failed");
   if(selected?.definition.id===id)setSelected(null);
   await list();
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 function download(){
  if(!selected)return;
  const keys=Object.keys(selected.rows[0]??{});
  const rows=[keys,...selected.rows.map(r=>keys.map(k=>cell(r[k])))];
  const text="\ufeff"+rows.map(r=>r.map(escapeCSV).join(",")).join("\r\n");
  const url=URL.createObjectURL(new Blob([text],{type:"text/csv;charset=utf-8"}));
  const a=document.createElement("a");a.href=url;a.download="cabo-saved-report.csv";a.click();URL.revokeObjectURL(url);
 }
 const keys=Object.keys(selected?.rows[0]??{});
 return <main className="main-area" style={{minHeight:"100vh",maxWidth:1260,margin:"auto"}}>
  <header className="topbar"><strong>CABO<span style={{color:"var(--clay)"}}>.</span> / REPORT LIBRARY</strong><Link href="/dashboard">← Dashboard</Link></header>
  <section className="section-head"><div><span className="eyebrow">CUSTOM ANALYTICS / TEMPLATES</span>
   <h1>Saved financial reports</h1><p>Choose a governed report template, run it against current authorised records, and export results.</p></div></section>
  <div className="notice">Saved definitions do not store or duplicate financial data. Every report is generated from current posted records, with tenant-level access controls.</div>
  {error&&<div className="error-message" role="alert" style={{marginBottom:16}}>{error}</div>}
  <div className="content-grid">
   <section className="panel"><h3>New saved report</h3>
    <form className="stack-18" onSubmit={e=>void add(e)}>
     <label>Report name<input value={name} onChange={e=>setName(e.target.value)} minLength={3} maxLength={120} required placeholder="Monthly assurance overview"/></label>
     <label>Report template<select value={template} onChange={e=>setTemplate(e.target.value)}>{templates.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}</select></label>
     <button className="button primary" type="submit" disabled={busy}>Save report definition</button>
    </form>
   </section>
   <section className="panel"><div className="panel-header"><h3>Saved reports</h3><span>{reports.length} saved</span></div>
    {reports.length===0&&<div className="empty">No reports saved yet.</div>}
    {reports.map(x=><div className="audit-item" key={x.id}><span><strong>{x.name}</strong><p className="form-note">{templates.find(t=>t.value===x.template)?.label||x.template}</p></span>
      <div style={{display:"flex",gap:6}}><button className="button" disabled={busy} onClick={()=>void run(x.id)}>Run</button>
      <button className="button quiet" disabled={busy} onClick={()=>void remove(x.id)}>Delete</button></div></div>)}
   </section>
  </div>
  {selected&&<section className="panel" style={{marginTop:18}}>
   <div className="panel-header"><h3>{selected.definition.name}</h3><button className="button primary" onClick={download} disabled={!selected.rows.length}>↓ Export CSV</button></div>
   <p className="form-note">{selected.rows.length} rows · generated {new Date(selected.asOf).toLocaleString("en-ZA")}</p>
   <div className="table-wrap"><table><thead><tr>{keys.map(k=><th key={k}>{k.replaceAll("_"," ")}</th>)}</tr></thead>
    <tbody>{selected.rows.map((r,i)=><tr key={i}>{keys.map(k=><td key={k}>{cell(r[k])}</td>)}</tr>)}</tbody></table></div>
   {!selected.rows.length&&<div className="empty">No matching records yet.</div>}
   <p className="form-note" style={{marginTop:12}}>{selected.limitations}</p>
  </section>}
 </main>;
}
