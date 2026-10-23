"use client";
import {useEffect,useState} from "react";
import Link from "next/link";
type Org={id:string;name:string;slug:string;members:number;created_at:string};
type Data={summary:{organisations:number;users:number;active_memberships:number;platform_administrators:number};
 organisations:Org[];refreshedAt:string};
export default function AdminWorkspace(){
 const [data,setData]=useState<Data|null>(null),[error,setError]=useState("");
 useEffect(()=>{const load=async()=>{
  try{const r=await fetch("/api/admin/overview",{cache:"no-store"});const j=await r.json();
   if(!r.ok)throw new Error(j.error||"Unable to load platform overview");setData(j);
  }catch(e){setError((e as Error).message);}
 };void load();},[]);
 const k=data?.summary;
 return <main className="main-area" style={{minHeight:"100vh",maxWidth:1380,margin:"auto"}}>
  <header className="topbar"><strong>CABO<span style={{color:"var(--clay)"}}>.</span> / PLATFORM ADMINISTRATION</strong>
   <Link className="button quiet" href="/dashboard">← Financial workspace</Link></header>
  <div className="section-head"><div><span className="eyebrow">PLATFORM OPERATIONS</span>
   <h1>Superadmin overview</h1><p>Organisation administration, with financial records remaining tenant-isolated.</p></div></div>
  {error&&<div className="error-message">{error}</div>}
  <div className="kpi-grid">
   {[["Organisations",k?.organisations],["Users",k?.users],["Active memberships",k?.active_memberships],["Platform administrators",k?.platform_administrators]]
    .map(([n,v])=><div className="kpi" key={String(n)}><span className="kpi-label">{n}</span><div className="kpi-value">{v??"—"}</div></div>)}
  </div>
  <div className="panel" style={{marginTop:24}}><div className="panel-header"><h3>Organisation directory</h3><span>{data?.organisations.length??0} shown</span></div>
   <div className="table-wrap"><table><thead><tr><th>Name</th><th>Workspace slug</th><th>Active members</th><th>Created</th></tr></thead><tbody>
    {data?.organisations.map(t=><tr key={t.id}><td>{t.name}</td><td className="mono">{t.slug}</td><td>{t.members}</td><td>{new Date(t.created_at).toLocaleDateString("en-ZA")}</td></tr>)}
   </tbody></table></div>
   {!data&&<p className="muted">Loading administrator overview…</p>}
   <p className="form-note">This view does not bypass financial tenant isolation, read transactions of other customers, or grant implicit access to their ledgers.</p>
  </div>
 </main>;
}
