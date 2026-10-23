"use client";
import Link from "next/link";
import {useEffect,useState} from "react";
type Plan={code:string;name:string;description:string;features:string[];price_zar_cents:string|null};
type Data={subscription:{plan_code:string;status:string;plan_name:string;features:string[]}|null;
 usage:{journals:number;invoices:number;saved_reports:number;audit_findings:number};plans:Plan[];notice:string};
export default function BillingClient(){
 const [data,setData]=useState<Data|null>(null),[error,setError]=useState("");
 useEffect(()=>{void (async()=>{
  try{const r=await fetch("/api/billing/overview",{cache:"no-store"});const x=await r.json();
   if(r.status===401){window.location.assign("/login");return;}
   if(!r.ok)throw new Error(x.error||"Unable to load billing records");setData(x);
  }catch(err){setError((err as Error).message);}
 })();},[]);
 const u=data?.usage;
 return <main className="main-area" style={{minHeight:"100vh",maxWidth:1230,margin:"auto"}}>
  <header className="topbar"><strong>CABO<span style={{color:"var(--clay)"}}>.</span> / ACCOUNT PLAN</strong><Link href="/dashboard">← Dashboard</Link></header>
  <section className="section-head"><div><span className="eyebrow">SOFTWARE AS A SERVICE / COMMERCIAL FOUNDATION</span>
   <h1>Subscription & usage</h1><p>Understand your organisation's subscription status and recorded activity.</p></div></section>
  <div className="notice">No payment gateway is connected and no subscription charges will be processed from this page.</div>
  {error&&<div className="error-message">{error}</div>}
  {data&&<>
   <div className="panel"><div className="panel-header"><h3>Current organisation plan</h3>
    <span className="pill">{data.subscription?.status||"Not configured"}</span></div>
    <h2>{data.subscription?.plan_name||"Unassigned"}</h2>
    <p className="muted">Commercial plans are configured by CABO after a formal agreement. Self-service upgrades are disabled until secure billing integration is complete.</p>
   </div>
   <div className="kpi-grid" style={{marginTop:18}}>
    {([["Posted journals",u?.journals],["Business invoices",u?.invoices],["Saved reports",u?.saved_reports],["Audit findings",u?.audit_findings]] as const).map(([name,count])=>
     <div className="kpi" key={name}><span className="kpi-label">{name}</span><div className="kpi-value">{count??0}</div></div>)}
   </div>
   <div className="content-grid">
    {data.plans.map(p=><section className="panel" key={p.code}><div className="panel-header"><h3>{p.name}</h3><span className="pill">{p.code===data.subscription?.plan_code?"Current":"Catalog"}</span></div>
     <p className="muted">{p.description}</p><p className="form-note">Pricing: {p.price_zar_cents===null?"By agreement":"Configured"}</p>
     <p className="form-note">Planned capabilities: {p.features.join(", ")}</p></section>)}
   </div>
  </>}
 </main>;
}
