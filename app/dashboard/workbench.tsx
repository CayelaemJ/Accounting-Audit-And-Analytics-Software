"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { fromCents, toCents } from "@/lib/money";

type Account = {id:string;code:string;name:string;type:"asset"|"liability"|"equity"|"revenue"|"expense"};
type Entry = {id:string;entry_date:string;memo:string;posted_at:string};
type Finding = {id:string;title:string;description:string;severity:"low"|"medium"|"high"|"critical";status:"open"|"in_progress"|"resolved";created_at:string};
type Trial = Account & {debit:string;credit:string};
type Overview = {
  tenant:{id:string;name:string;currency:string};
  totals:{revenue:string;expenses:string;assets:string;liabilities:string;profit:string};
  accounts:Account[];trialBalance:Trial[];entries:Entry[];findings:Finding[];
  journalCount:number;email:string;role:string;refreshedAt:string
};
type View = "overview"|"ledger"|"accounts"|"audit"|"reports";
type Detail = {id:string;memo:string;entry_date:string;posted_at:string;lines:{code:string;name:string;debit:string;credit:string}[]};

function localDate() { const now = new Date(); return new Date(now.getTime()-now.getTimezoneOffset()*60000).toISOString().slice(0,10); }
function fmtDate(date:string) { const d = new Date(date); return Number.isNaN(d.getTime()) ? date : d.toLocaleDateString("en-ZA",{day:"2-digit",month:"short",year:"numeric"}); }
function isWriter(role:string) { return ["owner","finance_manager","accountant"].includes(role); }
function isAuditor(role:string) { return ["owner","finance_manager","auditor"].includes(role); }
function signedMoney(currency:string,value:string) {
  const n=Number(value || "0");
  return new Intl.NumberFormat("en-ZA",{style:"currency",currency,maximumFractionDigits:2}).format(n);
}
function csvSafe(value:string) {
  const cleaned = /^[=+\-@\t\r]/.test(value) ? "'" + value : value;
  return '"' + cleaned.replaceAll('"','""') + '"';
}
function exportTrial(data:Overview) {
  const rows = [["Account code","Account name","Type","Debit","Credit"],
    ...data.trialBalance.map(a=>[a.code,a.name,a.type,a.debit,a.credit])];
  const text = rows.map(row=>row.map(csvSafe).join(",")).join("\r\n");
  const blob = new Blob(["\ufeff" + text],{type:"text/csv;charset=utf-8"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href=url; a.download="cabo-trial-balance-" + localDate() + ".csv"; a.click();
  URL.revokeObjectURL(url);
}
async function api(path:string, method:"POST"|"PATCH",payload:unknown) {
  const response = await fetch(path,{method,headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Request failed");
  return result;
}
export default function Workbench({role,userEmail}:{role:string;userEmail:string}) {
  const [data,setData] = useState<Overview|null>(null);
  const [view,setView] = useState<View>("overview");
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const [notice,setNotice] = useState("");
  const [refreshing,setRefreshing] = useState(false);
  const [detail,setDetail] = useState<Detail|null>(null);
  const [accountCode,setAccountCode] = useState("");
  const [accountName,setAccountName] = useState("");
  const [accountType,setAccountType] = useState<Account["type"]>("expense");
  const [debitAccount,setDebitAccount] = useState("");
  const [creditAccount,setCreditAccount] = useState("");
  const [amount,setAmount] = useState("");
  const [memo,setMemo] = useState("");
  const [entryDate,setEntryDate] = useState(localDate);
  const journalKey=useRef<string>("");
  const [findingTitle,setFindingTitle] = useState("");
  const [findingDescription,setFindingDescription] = useState("");
  const [findingSeverity,setFindingSeverity] = useState<Finding["severity"]>("medium");
  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/overview",{cache:"no-store"});
      if (response.status===401) { window.location.assign("/login"); return; }
      if (!response.ok) throw new Error("Financial data could not be loaded");
      setData(await response.json());
      setError("");
    } catch (err) { setError((err as Error).message); }
  },[]);
  useEffect(()=>{void load();const tick=window.setInterval(()=>{void load();},30000);return()=>window.clearInterval(tick);},[load]);
  async function refresh() {setRefreshing(true);await load();setRefreshing(false);}
  async function mutate(fn:()=>Promise<void>) {
    setBusy(true);setError("");setNotice("");
    try { await fn(); await load(); }
    catch(err) { setError((err as Error).message); }
    finally {setBusy(false);}
  }
  async function addAccount(e:FormEvent) {
    e.preventDefault();
    await mutate(async()=> {
      await api("/api/accounts","POST",{code:accountCode,name:accountName,type:accountType});
      setAccountCode("");setAccountName("");setNotice("Account saved to your organisation's chart of accounts.");
    });
  }
  async function postJournal(e:FormEvent) {
    e.preventDefault();
    if (debitAccount===creditAccount) {setError("Choose two different accounts.");return;}
    if (!journalKey.current) journalKey.current=crypto.randomUUID();
    await mutate(async()=> {
      await api("/api/journals","POST",{
        entryDate,memo,idempotencyKey:journalKey.current,
        lines:[{accountId:debitAccount,side:"debit",amount},{accountId:creditAccount,side:"credit",amount}]
      });
      journalKey.current="";setAmount("");setMemo("");
      setNotice("Balanced journal posted. Reports have been recalculated.");
    });
  }
  async function addFinding(e:FormEvent) {
    e.preventDefault();
    await mutate(async()=> {
      await api("/api/findings","POST",{title:findingTitle,description:findingDescription,severity:findingSeverity});
      setFindingTitle("");setFindingDescription("");setNotice("Audit finding created and recorded in the activity history.");
    });
  }
  async function changeStatus(id:string,status:Finding["status"]) {
    await mutate(async()=> {
      await api("/api/findings/"+id,"PATCH",{status});
      setNotice("Finding status updated.");
    });
  }
  async function openEntry(id:string) {
    setError("");setDetail(null);
    try {
      const response=await fetch("/api/journals/"+id,{cache:"no-store"});
      const result=await response.json();
      if(!response.ok) throw new Error(result.error || "Unable to retrieve journal");
      setDetail(result.entry);
      setView("ledger");
    } catch(err) {setError((err as Error).message);}
  }
  async function signOut() {
    await mutate(async()=> {await api("/api/auth/logout","POST",{});window.location.assign("/login");});
  }
  const accessibleViews:{id:View;label:string;symbol:string}[]=[
    {id:"overview",label:"Overview",symbol:"◈"},
    {id:"ledger",label:"General ledger",symbol:"≡"},
    {id:"accounts",label:"Chart of accounts",symbol:"▦"},
    {id:"audit",label:"Audit & controls",symbol:"◇"},
    {id:"reports",label:"Financial reports",symbol:"▤"}
  ];
  const rev = data?.totals.revenue || "0";
  const exp = data?.totals.expenses || "0";
  const profit = data?.totals.profit || "0";
  const pendingFindings = data?.findings.filter(f=>f.status!=="resolved").length || 0;
  const highRisks = data?.findings.filter(f=>f.status!=="resolved" && ["critical","high"].includes(f.severity)).length || 0;
  const cash = data?.trialBalance.find(a=>a.code==="1000");
  const debitTotal = data?.trialBalance.reduce((x,a)=>x+toCents(a.debit),0n) || 0n;
  const creditTotal = data?.trialBalance.reduce((x,a)=>x+toCents(a.credit),0n) || 0n;
  return <div className="workspace">
    <aside className="sidebar">
      <div className="wordmark">CABO<span>.</span></div>
      <div className="product">FINANCIAL INTELLIGENCE</div>
      <div className="navlabel">WORKSPACE</div>
      <nav aria-label="Primary navigation">
        {accessibleViews.map(item=><button key={item.id} className={"nav-button "+(view===item.id?"active":"")} aria-current={view===item.id?"page":undefined} onClick={()=>{setView(item.id);setError("");setNotice("");setDetail(null);}}>
          <span className="nav-icon">{item.symbol}</span>{item.label}
        </button>)}
        <a className="nav-button" href="/operations"><span className="nav-icon">▣</span> Financial operations</a>
        <a className="nav-button" href="/assistant"><span className="nav-icon">✦</span> AI Financial Analyst</a>
      </nav>
      <div className="sidebar-footer">
        <div style={{fontWeight:700}}>{userEmail}</div><small>Role: {role.replaceAll("_"," ")}</small>
        <button className="button quiet" onClick={()=>void signOut()} disabled={busy}>Sign out ↗</button>
      </div>
    </aside>
    <main className="main-area">
      <header className="topbar">
        <div className="topbar-left">{data?.tenant.name || "Your organisation"} <span style={{color:"var(--muted)"}}> / {data?.tenant.currency || "ZAR"}</span></div>
        <div className="topbar-right">
          <span><span className="status-dot"/>Tenant-scoped workspace</span>
          <span className="no-print">{data?.refreshedAt ? "Updated "+new Date(data.refreshedAt).toLocaleTimeString("en-ZA",{hour:"2-digit",minute:"2-digit"}) : "Connecting…"}</span>
          <button className="button quiet no-print" onClick={()=>void refresh()} disabled={refreshing} aria-label="Refresh financial data">↻</button>
        </div>
      </header>
      <section className="section-head">
        <div><span className="eyebrow">CABO / {view.toUpperCase().replaceAll("_"," ")}</span>
          <h1>{view==="overview"?"Financial overview":view==="ledger"?"General ledger":view==="accounts"?"Chart of accounts":view==="audit"?"Audit & controls":"Financial reports"}</h1>
          <p>{view==="overview"?"Your finances, risks and decisions — brought together.":view==="ledger"?"Post transactions with balanced, traceable double-entry records.":view==="accounts"?"Build the financial structure behind every transaction.":view==="audit"?"Document control exceptions and track their resolution.":"Verified reports sourced directly from posted journal lines."}</p>
        </div>
        {view==="reports"&&data&&<button className="button primary" onClick={()=>exportTrial(data)}>↓ Export trial balance CSV</button>}
      </section>
      {error&&<div className="error-message" role="alert">{error}</div>}
      {notice&&<div className="notice success" role="status">{notice}</div>}
      {!data ? <div className="panel"><h3>Connecting to your financial records…</h3><p className="muted">This screen displays live database records, not sample balances.</p></div> : <>
      {view==="overview"&&<>
        <div className="kpi-grid">
          <div className="kpi highlight"><span className="kpi-label">Total recorded revenue</span><div className="kpi-value">{signedMoney(data.tenant.currency,rev)}</div><div className="kpi-caption">All posted journals</div></div>
          <div className="kpi"><span className="kpi-label">Total recorded expenses</span><div className="kpi-value">{signedMoney(data.tenant.currency,exp)}</div><div className="kpi-caption">All posted journals</div></div>
          <div className="kpi"><span className="kpi-label">Revenue less expenses</span><div className="kpi-value">{signedMoney(data.tenant.currency,profit)}</div><div className="kpi-caption">Simplified operating result · before tax</div></div>
          <div className="kpi"><span className="kpi-label">Open audit findings</span><div className="kpi-value">{pendingFindings}</div><div className="kpi-caption">{highRisks} high or critical risk</div></div>
        </div>
        <div className="content-grid">
          <div className="panel"><div className="panel-header"><h3>Recent journal activity</h3><span>{data.journalCount} posted in total</span></div>
          {data.entries.length===0 ? <div className="empty"><strong>No journals posted yet</strong>Start by recording an opening balance or your first transaction.<div style={{marginTop:15}}><button className="button primary" onClick={()=>setView("ledger")}>Post first journal →</button></div></div> : <div className="table-wrap"><table><thead><tr><th>Date</th><th>Description</th><th>Record</th></tr></thead><tbody>{data.entries.slice(0,7).map(row=><tr key={row.id}><td>{fmtDate(row.entry_date)}</td><td>{row.memo}</td><td><button className="button quiet" onClick={()=>void openEntry(row.id)}>View ↗</button></td></tr>)}</tbody></table></div>}
          </div>
          <div className="panel"><div className="panel-header"><h3>Intelligence observations</h3><span>Rules-based · Not AI</span></div>
            {data.journalCount===0?<div className="insight">Your chart of accounts is ready. Post your first journal to activate financial performance reporting.</div>:<>
              {toCents(profit)<0n&&<div className="insight">Recorded expenses exceed recorded revenue. Review cost drivers and the entries behind the current result.</div>}
              {highRisks>0&&<div className="insight">{highRisks} unresolved high-severity audit finding(s) need management review.</div>}
              {toCents(profit)>=0n&&highRisks===0&&<div className="insight">No high-priority exceptions detected by the current basic rules. This does not constitute an audit opinion.</div>}
              {cash&&<div className="insight">Cash and bank account activity: debit {signedMoney(data.tenant.currency,cash.debit)} / credit {signedMoney(data.tenant.currency,cash.credit)}.</div>}
            </>}
            <p className="form-note">Observations use permitted ledger records only. Advanced AI explanations and anomaly models are future modules.</p>
          </div>
        </div>
        <div className="content-grid">
          <div className="panel"><div className="panel-header"><h3>Financial position snapshot</h3><span>Net recorded balances</span></div>
            <div className="grid-2"><div><p className="muted">Assets</p><h2>{signedMoney(data.tenant.currency,data.totals.assets)}</h2></div><div><p className="muted">Liabilities</p><h2>{signedMoney(data.tenant.currency,data.totals.liabilities)}</h2></div></div>
          </div>
          <div className="panel"><div className="panel-header"><h3>Assurance overview</h3><span>{data.findings.length} recent findings</span></div>
            <p className="muted">Resolved: {data.findings.filter(f=>f.status==="resolved").length} / {data.findings.length}</p>
            <div className="progress-track"><span style={{width:(data.findings.length?100*data.findings.filter(f=>f.status==="resolved").length/data.findings.length:0)+"%"}}/></div>
            <button className="button" onClick={()=>setView("audit")}>Review findings →</button>
          </div>
        </div>
      </>}
      {view==="accounts"&&<>
        {isWriter(role)&&<form className="panel form-panel" onSubmit={e=>void addAccount(e)}>
          <div className="panel-header"><h3>Add a general ledger account</h3><span>Unique account codes per organisation</span></div>
          <div className="grid-3">
            <label>Account code<input required value={accountCode} onChange={e=>setAccountCode(e.target.value)} maxLength={20} placeholder="e.g. 5100"/></label>
            <label>Account name<input required value={accountName} onChange={e=>setAccountName(e.target.value)} maxLength={120} placeholder="Travel expenses"/></label>
            <label>Account type<select value={accountType} onChange={e=>setAccountType(e.target.value as Account["type"])}>{["asset","liability","equity","revenue","expense"].map(t=><option key={t} value={t}>{t.charAt(0).toUpperCase()+t.slice(1)}</option>)}</select></label>
          </div><div className="form-actions"><button className="button primary" disabled={busy}>+ Add account</button></div>
        </form>}
        <div className="panel"><div className="panel-header"><h3>Account directory</h3><span>{data.accounts.length} accounts</span></div>
          <div className="table-wrap"><table><thead><tr><th>Code</th><th>Account</th><th>Type</th></tr></thead><tbody>{data.accounts.map(a=><tr key={a.id}><td className="mono">{a.code}</td><td>{a.name}</td><td><span className="pill">{a.type}</span></td></tr>)}</tbody></table></div>
        </div>
      </>}
      {view==="ledger"&&<>
        {isWriter(role)&&<form className="panel form-panel" onSubmit={e=>void postJournal(e)}>
          <div className="panel-header"><h3>Post a balanced journal</h3><span>Authorised posting · immutable history</span></div>
          <div className="grid-2">
            <label>Journal date<input type="date" required value={entryDate} onChange={e=>setEntryDate(e.target.value)}/></label>
            <label>Amount ({data.tenant.currency})<input required inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0.00" pattern="(0|[1-9][0-9]*)(\.[0-9]{1,2})?"/></label>
          </div>
          <div className="grid-2" style={{marginTop:16}}>
            <label>Debit account<select required value={debitAccount} onChange={e=>setDebitAccount(e.target.value)}><option value="">Select an account</option>{data.accounts.map(a=><option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}</select></label>
            <label>Credit account<select required value={creditAccount} onChange={e=>setCreditAccount(e.target.value)}><option value="">Select an account</option>{data.accounts.map(a=><option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}</select></label>
          </div>
          <div style={{marginTop:16}}><label>Transaction description<input required minLength={3} maxLength={300} value={memo} onChange={e=>setMemo(e.target.value)} placeholder="Describe the financial event"/></label></div>
          <div className="form-actions"><button className="button primary" disabled={busy||!debitAccount||!creditAccount||!amount}>{busy?"Posting…":"Post journal →"}</button><span className="form-note">Posting is validated again by the database at commit.</span></div>
        </form>}
        {detail&&<div className="panel form-panel">
          <div className="panel-header"><h3>Journal {detail.id.slice(0,8)}</h3><button className="button quiet" onClick={()=>setDetail(null)}>Close ×</button></div>
          <p className="muted">{fmtDate(detail.entry_date)} · {detail.memo} · posted {fmtDate(detail.posted_at)}</p>
          <div className="table-wrap"><table><thead><tr><th>Code</th><th>Account</th><th className="right">Debit</th><th className="right">Credit</th></tr></thead><tbody>{detail.lines.map((l,i)=><tr key={i}><td>{l.code}</td><td>{l.name}</td><td className="right mono">{signedMoney(data.tenant.currency,l.debit)}</td><td className="right mono">{signedMoney(data.tenant.currency,l.credit)}</td></tr>)}</tbody></table></div>
        </div>}
        <div className="panel"><div className="panel-header"><h3>Posted entries</h3><span>Most recent 20 · {data.journalCount} total</span></div>
          {data.entries.length===0?<div className="empty"><strong>No entries yet</strong>Transactions appear here after a successful database commit.</div>:
          <div className="table-wrap"><table><thead><tr><th>Date</th><th>Memo</th><th>Posted</th><th>Details</th></tr></thead><tbody>{data.entries.map(e=><tr key={e.id}><td>{fmtDate(e.entry_date)}</td><td>{e.memo}</td><td>{fmtDate(e.posted_at)}</td><td><button className="button quiet" onClick={()=>void openEntry(e.id)}>View lines ↗</button></td></tr>)}</tbody></table></div>}
        </div>
      </>}
      {view==="audit"&&<>
        {isAuditor(role)&&<form className="panel form-panel" onSubmit={e=>void addFinding(e)}>
          <div className="panel-header"><h3>Register an audit finding</h3><span>Human-entered observation · not a fraud determination</span></div>
          <div className="grid-2"><label>Finding title<input required minLength={5} maxLength={180} value={findingTitle} onChange={e=>setFindingTitle(e.target.value)} placeholder="Missing supporting documentation"/></label>
            <label>Severity<select value={findingSeverity} onChange={e=>setFindingSeverity(e.target.value as Finding["severity"])}>{["low","medium","high","critical"].map(s=><option key={s} value={s}>{s[0].toUpperCase()+s.slice(1)}</option>)}</select></label></div>
          <div style={{marginTop:16}}><label>Evidence / observation notes<textarea rows={3} maxLength={3000} value={findingDescription} onChange={e=>setFindingDescription(e.target.value)} placeholder="Document what was observed and what should be investigated."/></label></div>
          <div className="form-actions"><button className="button primary" disabled={busy}>+ Register finding</button></div>
        </form>}
        <div className="panel"><div className="panel-header"><h3>Findings register</h3><span>{pendingFindings} open or in progress</span></div>
          {data.findings.length===0?<div className="empty"><strong>No findings registered</strong>Findings will be displayed here with severity and resolution state.</div>:<div className="audit-list">{data.findings.map(f=><div className="audit-item" key={f.id}><div><div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}><strong>{f.title}</strong><span className={"pill "+f.severity}>{f.severity}</span></div><p>{f.description||"No additional detail provided."} · {fmtDate(f.created_at)}</p></div>
            {isAuditor(role)?<label className="form-note">Status<select aria-label={"Status for "+f.title} value={f.status} disabled={busy} onChange={e=>void changeStatus(f.id,e.target.value as Finding["status"])}><option value="open">Open</option><option value="in_progress">In progress</option><option value="resolved">Resolved</option></select></label>:<span className={"pill "+f.status}>{f.status.replaceAll("_"," ")}</span>}
          </div>)}</div>}
        </div>
      </>}
      {view==="reports"&&<>
        <div className="notice">This is a cumulative trial balance across all posted dates. Period filtering, period closes, VAT configuration and formal IFRS statements are not yet available. Do not treat this as a statutory report.</div>
        <div className="kpi-grid">
          <div className="kpi"><span className="kpi-label">Total debit activity</span><div className="kpi-value">{signedMoney(data.tenant.currency,fromCents(debitTotal))}</div></div>
          <div className="kpi"><span className="kpi-label">Total credit activity</span><div className="kpi-value">{signedMoney(data.tenant.currency,fromCents(creditTotal))}</div></div>
          <div className="kpi"><span className="kpi-label">Difference</span><div className="kpi-value">{signedMoney(data.tenant.currency,fromCents(debitTotal-creditTotal))}</div></div>
          <div className="kpi"><span className="kpi-label">Posting integrity</span><div className="kpi-value" style={{color:debitTotal===creditTotal?"var(--ok)":"var(--danger)"}}>{debitTotal===creditTotal?"Balanced":"Investigate"}</div></div>
        </div>
        <div className="panel" style={{marginTop:18}}>
          <div className="panel-header"><h3>Trial balance · {data.tenant.name}</h3><span>As at {fmtDate(data.refreshedAt)}</span></div>
          <div className="table-wrap"><table><thead><tr><th>Code</th><th>Account</th><th>Type</th><th className="right">Debits</th><th className="right">Credits</th></tr></thead><tbody>
            {data.trialBalance.map(a=><tr key={a.id}><td className="mono">{a.code}</td><td>{a.name}</td><td>{a.type}</td><td className="right mono">{signedMoney(data.tenant.currency,a.debit)}</td><td className="right mono">{signedMoney(data.tenant.currency,a.credit)}</td></tr>)}
            <tr><td colSpan={3}><strong>Transaction totals</strong></td><td className="right mono"><strong>{signedMoney(data.tenant.currency,fromCents(debitTotal))}</strong></td><td className="right mono"><strong>{signedMoney(data.tenant.currency,fromCents(creditTotal))}</strong></td></tr>
          </tbody></table></div>
          <p className="form-note">All values trace to authorised organisation accounts and committed journal lines. For a printable copy, use your browser's Print command.</p>
        </div>
      </>}
      </>}
      <p className="form-note" style={{marginTop:25}}>CABO Financial Intelligence · Initial accounting release · Read-only insight cards are rules-based, not generative AI. Database-backed figures refresh every 30 seconds and after posted updates.</p>
    </main>
  </div>;
}
