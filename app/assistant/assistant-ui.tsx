"use client";
import Link from "next/link";
import {useState,type FormEvent} from "react";
export default function AssistantUI(){
 const [question,setQuestion]=useState("");
 const [answer,setAnswer]=useState("");
 const [error,setError]=useState("");
 const [busy,setBusy]=useState(false);
 async function ask(e:FormEvent){
   e.preventDefault();setBusy(true);setAnswer("");setError("");
   try{
     const res=await fetch("/api/ai/analyse",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({question})});
     const body=await res.json();
     if(!res.ok)throw new Error(body.error||"Analysis failed");
     setAnswer(body.answer);
   }catch(err){setError((err as Error).message);}
   finally{setBusy(false);}
 }
 return <main className="main-area" style={{minHeight:"100vh",maxWidth:1100,margin:"auto"}}>
  <header className="topbar"><strong>CABO. Financial Intelligence</strong><Link href="/dashboard">← Dashboard</Link></header>
  <div className="section-head"><div><span className="eyebrow">GROQ AI</span><h1>Financial Analyst</h1>
  <p>Ask about your organisation's posted records and findings.</p></div></div>
  <div className="notice">AI interpretation is read-only and not an audit certification.</div>
  <section className="panel">
    <form onSubmit={e=>void ask(e)}><label>Ask a question
      <textarea rows={5} minLength={8} maxLength={1000} required value={question}
      onChange={e=>setQuestion(e.target.value)} placeholder="Which recorded expenses need attention?"/></label>
      <div className="form-actions"><button className="button primary" disabled={busy}>{busy?"Analysing...":"Analyse →"}</button></div>
    </form>
    {error&&<p className="error-message">{error}</p>}
    {answer&&<p style={{whiteSpace:"pre-wrap",lineHeight:1.8,marginTop:24}}>{answer}</p>}
  </section></main>;
}
