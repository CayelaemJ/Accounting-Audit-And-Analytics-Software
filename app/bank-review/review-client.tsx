"use client";
import Link from "next/link";
import {useEffect,useState} from "react";
type Candidate={journalId:string;entryDate:string;memo:string};
type Suggestion={bankTransactionId:string;bookedOn:string;sourceRef:string;
 description:string;amount:string;candidateCount:number;candidates:Candidate[]};
type Snapshot={summary:{imported:number;matched:number;unmatched:number;unmatched_net:string};
 suggestions:Suggestion[];limitations:string;automaticallyMatched:number};
export default function BankReview({canMatch}:{canMatch:boolean}){
 const [data,setData]=useState<Snapshot|null>(null);
 const [selected,setSelected]=useState<Record<string,string>>({});
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [message,setMessage]=useState("");
 const load=async()=>{
  const response=await fetch("/api/operations/bank-suggestions",{cache:"no-store"});
  if(response.status===401){window.location.assign("/login");return;}
  const value=await response.json();
  if(!response.ok)throw Error(value.error||"Unable to find reconciliation candidates");
  setData(value);
 };
 useEffect(()=>{void load().catch(e=>setError((e as Error).message));},[]);
 const match=async(s:Suggestion)=>{
  const journalId=selected[s.bankTransactionId]||s.candidates[0]?.journalId;
  if(!journalId)return;
  if(!window.confirm("Match this statement transaction to the selected posted journal? The match is permanent and cannot be automatically undone."))return;
  setBusy(true);setError("");setMessage("");
  try{
   const response=await fetch("/api/operations/banking",{method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({action:"match",bankTransactionId:s.bankTransactionId,journalId})});
   const body=await response.json();
   if(!response.ok)throw Error(body.error||"Match rejected");
   setMessage("Confirmed bank reconciliation saved.");
   setSelected(old=>{const next={...old};delete next[s.bankTransactionId];return next;});
   await load();
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 };
 const money=(amount:string)=>new Intl.NumberFormat("en-ZA",{style:"currency",currency:"ZAR"}).format(Number(amount));
 return <main className="main-area" style={{minHeight:"100vh",maxWidth:1380,margin:"auto"}}>
  <header className="topbar"><strong>CABO. / BANK RECONCILIATION</strong><Link href="/operations">← Financial operations</Link></header>
  <div className="section-head"><div><span className="eyebrow">CONTROLLED ACCOUNTING / BANK STATEMENTS</span>
   <h1>Reconciliation review</h1><p>Find exact potential matches, then approve each one yourself.</p></div>
   <button className="button" onClick={()=>void load().catch(e=>setError((e as Error).message))} disabled={busy}>↻ Refresh</button></div>
  <div className="notice">Suggestions only: no automated matching, live bank connection, transfers or payment initiation. Same ledger account, signed amount and posting date within 14 days are required. All matches are revalidated by the server.</div>
  {error&&<div role="alert" className="error-message" style={{marginTop:16}}>{error}</div>}
  {message&&<div role="status" className="notice" style={{marginTop:16}}>{message}</div>}
  {data&&<>
   <div className="kpi-grid" style={{marginTop:18}}>
    {([["Imported statement entries",data.summary.imported],
      ["Reconciled entries",data.summary.matched],
      ["Unmatched entries",data.summary.unmatched],
      ["Unmatched signed net (ZAR)",money(data.summary.unmatched_net)]] as const).map(([name,value])=>
      <div className="kpi" key={name}><span className="kpi-label">{name}</span><div className="kpi-value">{value}</div></div>)}
   </div>
   <section className="panel" style={{marginTop:20}}>
    <div className="panel-header"><h3>Candidate matches</h3><span>{data.suggestions.length} bank items with proposals</span></div>
    {data.suggestions.length===0&&<p className="muted">No exact potential matches found in the 100 most recent unmatched bank transactions. Review the remaining items manually.</p>}
    {data.suggestions.map(s=><div className="audit-item" key={s.bankTransactionId} style={{alignItems:"flex-start",gap:18}}>
      <div style={{flex:"1",minWidth:180}}>
       <strong>{s.description}</strong><p className="form-note">{String(s.bookedOn).slice(0,10)} · {s.sourceRef}</p>
       <div className="kpi-value" style={{fontSize:"1.3rem",marginTop:5}}>{money(s.amount)}</div>
      </div>
      <div style={{flex:"1.5",minWidth:210}}>
       <p className="form-note">{s.candidateCount===1?"One exact candidate":s.candidateCount+" possible journals — review carefully"}</p>
       <label>Select posted journal
        <select value={selected[s.bankTransactionId]||s.candidates[0]?.journalId||""}
         onChange={e=>setSelected(old=>({...old,[s.bankTransactionId]:e.target.value}))}>
         {s.candidates.map(c=><option key={c.journalId} value={c.journalId}>
          {String(c.entryDate).slice(0,10)} · {c.memo.slice(0,75)}
         </option>)}
        </select></label>
       {s.candidateCount>3&&<p className="form-note">Only the three closest suggestions are displayed. Check the manual journal list before matching.</p>}
       {canMatch&&<button className="button primary" style={{marginTop:10}} disabled={busy}
        onClick={()=>void match(s)}>Review & confirm match</button>}
      </div>
    </div>)}
    <p className="form-note" style={{marginTop:18}}>{data.limitations}</p>
   </section>
  </>}
 </main>;
}
