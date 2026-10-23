"use client";
import Link from "next/link";
import {useCallback,useEffect,useState,type FormEvent} from "react";
type R=Record<string,any>;
type Report={contacts:R[];invoices:R[];bankTransactions:R[];periods:R[];budgets:R[];evidence:R[];auditReports:R[];
 trialBalance:R[];monthlyActuals:R[];engagements:R[];controls:R[];controlTests:R[];actions:R[];statement:R;refreshedAt:string};
type Overview={accounts:R[];entries:R[];findings:R[];tenant:{name:string;currency:string};role:string};
type Monitor={observations:R[];refreshedAt:string};
type Tab="invoices"|"banking"|"planning"|"assurance"|"reports"|"exceptions"|"team";
const tabs:{id:Tab;title:string}[]=[{id:"invoices",title:"Customers & invoices"},{id:"banking",title:"Bank reconciliation"},
 {id:"planning",title:"Budgets & periods"},{id:"team",title:"Organisation & team"},{id:"assurance",title:"Audit workbench"},{id:"reports",title:"Statements"},{id:"exceptions",title:"Continuous monitoring"}];
function read(form:HTMLFormElement){return Object.fromEntries(new FormData(form).entries()) as Record<string,string>;}
function money(value:unknown,currency="ZAR"){return new Intl.NumberFormat("en-ZA",{style:"currency",currency}).format(Number(value||0));}
function date(value:unknown){return String(value||"").slice(0,10);}
function fmt(value:unknown){return String(value??"");}
function parseCSV(src:string){
 const lines:string[][]=[];let cell="",row:string[]=[],quoted=false;
 for(let i=0;i<src.length;i++){
  const ch=src[i];
  if(ch==='"'){if(quoted&&src[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
  else if(ch===","&&!quoted){row.push(cell);cell="";}
  else if((ch==="\n"||ch==="\r")&&!quoted){
   if(ch==="\r"&&src[i+1]==="\n")i++;
   row.push(cell);if(row.some(x=>x.trim()))lines.push(row);row=[];cell="";
  }else cell+=ch;
 }
 if(quoted)throw new Error("Invalid CSV: unclosed quoted field");
 row.push(cell);if(row.some(x=>x.trim()))lines.push(row);
 if(!lines.length)throw new Error("CSV is empty.");
 const required=["bookedOn","description","signedAmount","sourceRef"];
 const cols=lines.shift()!.map(x=>x.trim());
 if(required.some(x=>!cols.includes(x)))throw new Error("CSV headers must be: "+required.join(", "));
 return lines.map((cells,index)=>{
  if(cells.length!==cols.length)throw new Error("CSV row "+(index+2)+" has an incorrect column count.");
  return Object.fromEntries(required.map(x=>[x,cells[cols.indexOf(x)].trim()]));
 });
}
export default function OperationsClient(){
 const [tab,setTab]=useState<Tab>("invoices");
 const [report,setReport]=useState<Report|null>(null);
 const [overview,setOverview]=useState<Overview|null>(null);
 const [monitor,setMonitor]=useState<Monitor|null>(null);
 const [working,setWorking]=useState(false);
 const [error,setError]=useState("");
 const [message,setMessage]=useState("");
 const [csv,setCsv]=useState("");
 const [members,setMembers]=useState<R[]>([]);
 const [orgs,setOrgs]=useState<R[]>([]);
 const refresh=useCallback(async()=>{
  const requests=await Promise.all(["/api/operations/reports","/api/overview","/api/operations/monitor"].map(p=>fetch(p,{cache:"no-store"})));
  if(requests.some(r=>r.status===401)){window.location.assign("/login");return;}
  if(requests.some(r=>!r.ok))throw new Error("Couldn't load operations. Check database migration and access.");
  const [a,b,c]=await Promise.all(requests.map(r=>r.json()));
  setReport(a);setOverview(b);setMonitor(c);
  const memberships=await fetch("/api/auth/organisations",{cache:"no-store"});
  if(memberships.ok){const o=await memberships.json();setOrgs(o.memberships||[]);}
  if(b.role==="owner"){const people=await fetch("/api/operations/team",{cache:"no-store"});
    if(people.ok){const m=await people.json();setMembers(m.members||[]);}}

 },[]);
 useEffect(()=>{refresh().catch(e=>setError((e as Error).message));
 const timer=setInterval(()=>{refresh().catch(()=>{});},30000);
 return()=>clearInterval(timer);},[refresh]);
 async function submit(e:FormEvent<HTMLFormElement>,endpoint:string,transform?:(d:Record<string,string>)=>unknown,method:"POST"|"PATCH"="POST"){
  e.preventDefault();const form=e.currentTarget;setWorking(true);setError("");setMessage("");
  try{
   const vals=read(form);
   const payload=transform?transform(vals):vals;
   const response=await fetch(endpoint,{method,headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
   const body=await response.json();
   if(!response.ok)throw new Error(body.error||"Request failed");
   setMessage("Saved successfully; source records and reporting have been refreshed.");
   await refresh();form.reset();
  }catch(err){setError((err as Error).message);}
  finally{setWorking(false);}
 }
 const a=overview?.accounts||[], bankAccounts=a.filter(x=>x.type==="asset"),
 findings=overview?.findings||[], journals=overview?.entries||[];
 const canWrite=["owner","finance_manager","accountant"].includes(overview?.role||"");
 const canManage=["owner","finance_manager"].includes(overview?.role||"");
 const canAudit=["owner","finance_manager","auditor"].includes(overview?.role||"");
 const controlCount=report?.controls.length||0;
 return <main className="main-area" style={{minHeight:"100vh",maxWidth:1500,margin:"auto"}}>
  <header className="topbar"><strong>CABO<span style={{color:"var(--clay)"}}>.</span> FINANCIAL INTELLIGENCE / OPERATIONS</strong>
   <Link className="button quiet" href="/dashboard">← Overview</Link></header>
  <section className="section-head"><div><span className="eyebrow">ACCOUNTING / BANKING / ASSURANCE</span>
    <h1>Financial operations</h1><p>Persistent, permission-controlled workflows for {overview?.tenant.name||"your organisation"}.</p></div>
    <button className="button" onClick={()=>refresh().catch(e=>setError(e.message))}>↻ Refresh</button></section>
  <div className="section-tabs">{tabs.map(t=><button className={"tab "+(tab===t.id?"active":"")} key={t.id} onClick={()=>{setTab(t.id);setError("");setMessage("");}}>{t.title}</button>)}</div>
  {error&&<div role="alert" className="error-message" style={{marginBottom:15}}>{error}</div>}
  {message&&<div role="status" className="notice success">{message}</div>}
  {!report||!overview?<div className="panel">Loading your records…</div>:<>
  {tab==="invoices"&&<>
    {canWrite&&<div className="content-grid">
      <div className="panel"><h3>Add a customer or supplier</h3>
        <form onSubmit={e=>void submit(e,"/api/operations/contacts") } className="stack-18">
         <label>Type<select name="kind"><option value="customer">Customer</option><option value="supplier">Supplier</option></select></label>
         <label>Name<input name="name" minLength={2} required placeholder="Company or individual"/></label>
         <label>Email (optional)<input name="email" type="email" placeholder="finance@example.co.za"/></label>
         <button className="button primary" disabled={working}>Save contact</button>
        </form>
      </div>
      <div className="panel"><h3>Post sales or purchase invoice</h3><p className="form-note">Posts a balanced journal immediately. No VAT is calculated automatically; enter an explicitly verified tax amount, or zero.</p>
        {canManage&&<button type="button" className="button" style={{marginBottom:16}} disabled={working} onClick={()=>void (async()=>{
         setWorking(true);setError("");setMessage("");
         try{const res=await fetch("/api/operations/tax-accounts",{method:"POST"});
          const data=await res.json();if(!res.ok)throw Error(data.error||"VAT account setup failed");
          setMessage("VAT control accounts are available. Verify tax treatment with your finance practitioner.");await refresh();
         }catch(err){setError((err as Error).message);}finally{setWorking(false);}
        })()}>Configure VAT ledger accounts</button>}

        <form className="stack-18" onSubmit={e=>void submit(e,"/api/operations/invoices",d=>({...d,
          idempotencyKey:crypto.randomUUID()}))}>
          <div className="grid-2">
            <label>Invoice type<select name="kind"><option value="sales">Sales invoice</option><option value="purchase">Supplier invoice</option></select></label>
            <label>Contact<select name="contactId" required><option value="">Choose contact</option>{report.contacts.map(x=><option key={x.id} value={x.id}>{x.name} ({x.kind})</option>)}</select></label>
          </div>
          <label>Reference<input name="reference" minLength={2} required placeholder="INV-0001"/></label>
          <div className="grid-2"><label>Date<input type="date" name="invoiceDate" required defaultValue={new Date().toISOString().slice(0,10)}/></label>
           <label>Due date<input type="date" name="dueDate" required defaultValue={new Date().toISOString().slice(0,10)}/></label></div>
          <div className="grid-2"><label>Net amount<input name="netAmount" required placeholder="1250.00"/></label>
           <label>Tax amount<input name="taxAmount" defaultValue="0.00" required/></label></div>
          <button className="button primary" disabled={working}>Post invoice to ledger</button>
        </form></div>
     </div>}
    <div className="content-grid">
      {canWrite&&<section className="panel" style={{marginBottom:18}}>
 <div className="panel-header"><h3>Allocate an invoice payment</h3><span>Creates a journal and updates outstanding balances</span></div>
 <form className="grid-3" onSubmit={e=>void submit(e,"/api/operations/payments",d=>({...d,idempotencyKey:crypto.randomUUID()}))}>
 <label>Unpaid invoice<select name="invoiceId" required><option value="">Choose invoice</option>{report.invoices.filter(x=>Number(x.outstanding_amount)>0).map(x=><option key={x.id} value={x.id}>{x.reference} ({x.outstanding_amount})</option>)}</select></label>
 <label>Cash asset account<select name="cashAccountId" required><option value="">Choose asset account</option>{bankAccounts.map(x=><option key={x.id} value={x.id}>{x.code} — {x.name}</option>)}</select></label>
 <label>Amount<input name="amount" placeholder="100.00" required/></label>
 <label>Payment date<input name="paymentDate" type="date" required defaultValue={new Date().toISOString().slice(0,10)}/></label>
 <div style={{alignSelf:"end"}}><button className="button primary" disabled={working}>Post payment</button></div>
 </form></section>}
 <section className="panel"><div className="panel-header"><h3>Posted invoices</h3><span>{report.invoices.length} recent</span></div>
       {report.invoices.length===0?<div className="empty">No invoices yet</div>:
       <div className="table-wrap"><table><thead><tr><th>Reference</th><th>Contact</th><th>Type</th><th>Due</th><th className="right">Total</th></tr></thead><tbody>
       {report.invoices.map(x=><tr key={x.id}><td>{x.reference}</td><td>{x.contact_name}</td><td>{x.kind}</td><td>{date(x.due_date)}</td>
       <td className="right mono">{money(x.total_amount,overview.tenant.currency)}
 <p className="form-note">Outstanding: {money(x.outstanding_amount,overview.tenant.currency)}</p></td></tr>)}</tbody></table></div>}
      </section>
      <section className="panel"><h3>Contacts</h3>{report.contacts.map(x=><div className="audit-item" key={x.id}>{x.name}<span className="pill">{x.kind}</span></div>)}
       {!report.contacts.length&&<div className="empty">No contacts yet</div>}</section>
    </div>
  </>}
  {tab==="team"&&<>
   <div className="content-grid">
    <section className="panel"><h3>Organisation membership</h3>
     <p className="form-note">Your current organisation is {overview.tenant.name}. You can change to another organisation where your account is an active member.</p>
     {orgs.map(o=><div className="audit-item" key={o.tenant_id}>
       <span>Organisation {String(o.tenant_id).slice(0,8)}<p className="form-note">{o.role} · {o.tenant_id}</p></span>
       <button className="button" disabled={working} onClick={async()=>{
         setWorking(true);setError("");
         try{const r=await fetch("/api/auth/organisations",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({tenantId:o.tenant_id})});
          const x=await r.json();if(!r.ok)throw new Error(x.error||"Switch failed");window.location.assign("/dashboard");
         }catch(e){setError((e as Error).message);}finally{setWorking(false);}
       }}>Switch</button></div>)}
    </section>
    <section className="panel"><h3>Team access</h3>
     {!canManage?<p className="muted">Only the tenant owner can manage collaborators.</p>:<>
     {overview.role==="owner"&&<form className="stack-18" onSubmit={e=>void submit(e,"/api/operations/team")}>
       <label>Existing CABO account email<input required type="email" name="email"/></label>
       <label>Role<select name="role"><option value="accountant">Accountant</option><option value="finance_manager">Finance manager</option><option value="auditor">Auditor</option><option value="viewer">Read-only viewer</option></select></label>
       <button className="button primary" disabled={working}>Add collaborator</button>
       <p className="form-note">The user must have registered an account. Access is subject to organisation membership and permission checks.</p>
      </form>}
     {members.map(m=><div key={m.user_id} className="audit-item">{m.email} <span className="pill">{m.role}</span></div>)}
     </>}
    </section>
   </div>
  </>}
  {tab==="banking"&&<>
   <div className="notice">Import your own CSV transactions and match each bank item to an existing journal with an equal, signed movement on the same asset account. This is manual statement reconciliation; no live bank feeds are connected.</div>
   <Link className="button primary" href="/bank-review" style={{marginBottom:18}}>Review suggested bank matches →</Link>
   {canWrite&&<section className="panel" style={{marginBottom:18}}>
     <div className="panel-header"><h3>Import OFX / QFX statement</h3><span>Bank file · up to 512 KB</span></div>
     <p className="form-note">Upload a downloaded bank statement. Select the bank ledger account that corresponds to the source statement. Imports are checked for duplicates and do not automatically post accounting journals.</p>
     <form className="stack-18" onSubmit={e=>void (async()=>{
       e.preventDefault();
       const form=e.currentTarget;
       setWorking(true);setError("");setMessage("");
       try{
         const result=await fetch("/api/operations/statements/import",{method:"POST",body:new FormData(form)});
         const data=await result.json();
         if(!result.ok)throw Error(data.error||"Statement import failed");
         setMessage("OFX import completed: "+data.imported+" new, "+data.duplicates+" duplicate entries. Source account ending "+data.statementAccountLast4+". Confirm the linked ledger account is correct before reconciling.");
         await refresh();form.reset();
       }catch(err){setError((err as Error).message);}finally{setWorking(false);}
     })()}>
       <label>Corresponding bank asset ledger<select name="bankAccountId" required>
         <option value="">Choose your bank account</option>
         {bankAccounts.map(x=><option value={x.id} key={x.id}>{x.code} — {x.name}</option>)}
       </select></label>
       <label>OFX or QFX file<input name="statement" type="file" accept=".ofx,.qfx" required/></label>
       <button className="button primary" disabled={working}>Import statement transactions</button>
     </form>
     <p className="form-note" style={{marginTop:12}}>No direct access to your bank account is requested. The bank's source account is shown by its last four digits after import; this release does not automatically verify the selected ledger account against a bank registry.</p>
   </section>}
   {canWrite&&<div className="content-grid">
    <section className="panel"><h3>Import bank statement CSV</h3>
     <label>Load CSV file<input type="file" accept=".csv,text/csv" onChange={e=>{
       const f=e.target.files?.[0];if(f)f.text().then(setCsv).catch(()=>setError("Unable to open CSV file."));}}/></label>
     <p className="form-note">Columns: bookedOn,description,signedAmount,sourceRef. Signed positive = money in; negative = money out.</p>
     <form className="stack-18" style={{marginTop:16}} onSubmit={e=>void submit(e,"/api/operations/banking",d=>({
       action:"import",bankAccountId:d.bankAccountId,rows:parseCSV(csv)}))}>
      <label>Bank asset account<select name="bankAccountId" required><option value="">Select account</option>{bankAccounts.map(x=><option value={x.id} key={x.id}>{x.code} — {x.name}</option>)}</select></label>
      <label>CSV preview<textarea rows={5} value={csv} onChange={e=>setCsv(e.target.value)} placeholder={"bookedOn,description,signedAmount,sourceRef\n2026-10-23,Deposit,500.00,TX001"}/></label>
      <button className="button primary" disabled={working||!csv.trim()}>Import and deduplicate</button></form>
    </section>
    <section className="panel"><h3>Match posted journal</h3><form className="stack-18" onSubmit={e=>void submit(e,"/api/operations/banking",d=>({...d,action:"match"}))}>
      <label>Unmatched bank item<select required name="bankTransactionId"><option value="">Select transaction</option>
       {report.bankTransactions.filter(x=>!x.journal_id).map(x=><option key={x.id} value={x.id}>{date(x.booked_on)} {x.description} ({x.signed_amount})</option>)}</select></label>
      <label>Ledger journal<select name="journalId" required><option value="">Select journal</option>
       {journals.map(x=><option value={x.id} key={x.id}>{date(x.entry_date)} — {x.memo}</option>)}</select></label>
      <button className="button primary" disabled={working}>Reconcile exact match</button>
      <p className="form-note">A journal and bank transaction may only be used once. The server validates account and amount.</p>
     </form></section>
   </div>}
   <section className="panel" style={{marginTop:18}}><div className="panel-header"><h3>Imported bank transactions</h3><span>{report.bankTransactions.filter(x=>!x.journal_id).length} unmatched</span></div>
    <div className="table-wrap"><table><thead><tr><th>Booked</th><th>Account</th><th>Reference</th><th>Description</th><th className="right">Signed amount</th><th>Reconciliation</th></tr></thead>
    <tbody>{report.bankTransactions.map(x=><tr key={x.id}><td>{date(x.booked_on)}</td><td>{x.bank_code}</td><td>{x.source_ref}</td><td>{x.description}</td>
     <td className="right mono">{money(x.signed_amount,overview.tenant.currency)}</td><td><span className={"pill "+(x.journal_id?"resolved":"")}>{x.journal_id?"Matched":"Unmatched"}</span></td></tr>)}</tbody></table></div>
   </section>
  </>}
  {tab==="planning"&&<>
    {canManage&&<div className="content-grid">
      <section className="panel"><h3>Define reporting period</h3>
       <form className="stack-18" onSubmit={e=>void submit(e,"/api/operations/periods")}>
       <label>Period label<input required name="label" placeholder="FY 2026"/></label>
       <div className="grid-2"><label>Start<input required type="date" name="startDate"/></label><label>End<input required type="date" name="endDate"/></label></div>
       <button className="button primary" disabled={working}>Create period</button></form>
       <p className="form-note">After periods are configured, journals outside open periods are rejected at the database level.</p>
      </section>
      <section className="panel"><h3>Monthly account budget</h3><form className="stack-18" onSubmit={e=>void submit(e,"/api/operations/budgets")}>
       <label>Account<select name="accountId" required><option value="">Select account</option>{a.map(x=><option key={x.id} value={x.id}>{x.code} — {x.name}</option>)}</select></label>
       <label>Month (first day)<input name="month" required type="date"/></label>
       <label>Budget amount<input name="amount" required placeholder="10000.00"/></label>
       <button className="button primary" disabled={working}>Save budget</button></form></section>
    </div>}
    <div className="content-grid">
     <section className="panel"><h3>Financial periods</h3>
       {report.periods.map(p=><div className="audit-item" key={p.id}><span>{p.label}<p className="form-note">{date(p.start_date)} – {date(p.end_date)}</p></span>
       {p.status==="open"&&canManage?<button className="button" disabled={working} onClick={()=>void (async()=>{
       setWorking(true);try{const res=await fetch("/api/operations/periods",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:p.id,status:"closed"})});
       const x=await res.json();if(!res.ok)throw new Error(x.error||"Failed");await refresh();}catch(e){setError((e as Error).message);}finally{setWorking(false);}
       })()}>Close period</button>:<span className="pill resolved">{p.status}</span>}</div>)}
       {!report.periods.length&&<div className="empty">No defined financial periods yet</div>}
     </section>
     <section className="panel"><h3>Monthly budgets</h3><div className="table-wrap"><table><thead><tr><th>Month</th><th>Account</th><th className="right">Amount</th></tr></thead><tbody>
      {report.budgets.map(b=><tr key={b.id}><td>{date(b.month)}</td><td>{b.code}</td><td className="right mono">{money(b.amount)}</td></tr>)}</tbody></table></div></section>
    </div>
  </>}
  {tab==="assurance"&&<>
    <div className="kpi-grid"><div className="kpi"><span className="kpi-label">Engagements</span><div className="kpi-value">{report.engagements.length}</div></div>
    <div className="kpi"><span className="kpi-label">Control library</span><div className="kpi-value">{controlCount}</div></div>
    <div className="kpi"><span className="kpi-label">Test records</span><div className="kpi-value">{report.controlTests.length}</div></div>
    <div className="kpi"><span className="kpi-label">Remediation actions</span><div className="kpi-value">{report.actions.length}</div></div></div>
    {canAudit&&<div className="content-grid">
     <section className="panel"><h3>Create audit engagement</h3><form className="stack-18" onSubmit={e=>void submit(e,"/api/operations/audit",d=>({...d,action:"engagement"}))}>
       <label>Title<input required name="title" minLength={5}/></label>
       <label>Objective<textarea name="objective" rows={3}/></label>
       <button className="button primary" disabled={working}>Create engagement</button></form></section>
     <section className="panel"><h3>Add a financial control</h3><form className="stack-18" onSubmit={e=>void submit(e,"/api/operations/audit",d=>({...d,action:"control"}))}>
       <div className="grid-2"><label>Code<input name="code" required placeholder="FIN-01"/></label><label>Frequency<select name="frequency">{["daily","weekly","monthly","quarterly","annual"].map(x=><option key={x}>{x}</option>)}</select></label></div>
       <label>Title<input required name="title" minLength={5}/></label><label>Risk<input name="risk"/></label><label>Owner<input name="owner"/></label>
       <button className="button primary" disabled={working}>Add control</button></form></section>
     <section className="panel"><h3>Record a control test</h3><form className="stack-18" onSubmit={e=>void submit(e,"/api/operations/audit",d=>({...d,action:"test"}))}>
       <label>Engagement<select name="engagementId" required><option value="">Choose</option>{report.engagements.map(x=><option key={x.id} value={x.id}>{x.title}</option>)}</select></label>
       <label>Control<select name="controlId" required><option value="">Choose</option>{report.controls.map(x=><option key={x.id} value={x.id}>{x.code} — {x.title}</option>)}</select></label>
       <label>Result<select name="result"><option value="pass">Pass</option><option value="fail">Fail</option><option value="needs_review">Needs review</option></select></label>
       <label>Evidence and testing notes<textarea required name="notes" minLength={5}/></label>
       <button className="button primary" disabled={working}>Save test record</button></form></section>
     <section className="panel"><h3>Create corrective action</h3><form className="stack-18" onSubmit={e=>void submit(e,"/api/operations/audit",d=>({...d,action:"remediation"}))}>
       <label>Related finding<select required name="findingId"><option value="">Choose</option>{findings.map(x=><option value={x.id} key={x.id}>{x.title}</option>)}</select></label>
       <label>Action<textarea name="description" required minLength={5}/></label>
       <label>Due date<input type="date" name="dueDate" required/></label>
       <button className="button primary" disabled={working}>Create corrective action</button></form></section>
    </div>}
    {canAudit&&<div className="content-grid">
     <section className="panel"><h3>Record evidence reference</h3>
       <p className="form-note">Records evidence provenance and a SHA-256 fingerprint. This screen does not upload original files.</p>
       <form className="stack-18" onSubmit={e=>void submit(e,"/api/operations/evidence",d=>({...d,action:"evidence"}))}>
       <label>Engagement<select required name="engagementId"><option value="">Select engagement</option>{report.engagements.map(x=><option key={x.id} value={x.id}>{x.title}</option>)}</select></label>
       <label>Evidence title<input required name="title" minLength={5}/></label>
       <label>Source reference<input required name="sourceRef" minLength={3}/></label>
       <label>Notes<textarea name="notes" rows={3}/></label>
       <button className="button primary" disabled={working}>Record evidence</button></form>
     </section>
     <section className="panel"><h3>Draft audit report</h3>
      <form className="stack-18" onSubmit={e=>void submit(e,"/api/operations/evidence",d=>({...d,action:"report"}))}>
       <label>Engagement<select required name="engagementId"><option value="">Select engagement</option>{report.engagements.map(x=><option key={x.id} value={x.id}>{x.title}</option>)}</select></label>
       <label>Report title<input required name="title" minLength={5}/></label>
       <label>Report and management response<textarea name="body" required minLength={20} rows={4}/></label>
       <button className="button primary" disabled={working}>Save draft report</button></form>
       <p className="form-note">A second authorised reviewer must approve; authors cannot approve their own reports.</p>
     </section>
    </div>}
    <div className="content-grid">
     <section className="panel"><h3>Evidence register</h3>
      {!report.evidence.length&&<div className="empty">No evidence references recorded</div>}
      {report.evidence.map(x=><div className="audit-item" key={x.id}>
       <span>{x.title}<p className="form-note">{x.source_ref} · SHA-256: {x.evidence_sha256.slice(0,16)}…</p></span>
      </div>)}
     </section>
     <section className="panel"><h3>Audit reports</h3>
      {!report.auditReports.length&&<div className="empty">No audit report drafts</div>}
      {report.auditReports.map(x=><div className="audit-item" key={x.id}>
        <span>{x.title}<p className="form-note">{x.body.slice(0,120)}</p></span>
        {x.status==="draft"&&canAudit?<button className="button" disabled={working} onClick={async()=>{
          setWorking(true);setError("");
          try{const response=await fetch("/api/operations/evidence",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"approve",reportId:x.id})});
          const body=await response.json();if(!response.ok)throw new Error(body.error||"Approval failed");await refresh();
          }catch(error){setError((error as Error).message);}finally{setWorking(false);}
        }}>Approve</button>:<span className="pill resolved">{x.status}</span>}
      </div>)}
     </section>
    </div>
    <div className="content-grid">
     <section className="panel"><h3>Audit engagements</h3>{report.engagements.map(x=><div className="audit-item" key={x.id}><span>{x.title}<p className="form-note">{x.objective}</p></span><span className="pill">{x.status}</span></div>)}</section>
     <section className="panel"><h3>Control test history</h3>{report.controlTests.map(x=><div className="audit-item" key={x.id}><span>{x.code}<p className="form-note">{x.notes}</p></span><span className={"pill "+(x.result==="fail"?"high":"")}>{x.result}</span></div>)}</section>
     <section className="panel"><h3>Remediation queue</h3>{report.actions.map(x=><div className="audit-item" key={x.id}><span>{x.description}<p className="form-note">Due {date(x.due_date)}</p></span>
       {canAudit?<select style={{width:"auto"}} value={x.status} disabled={working} onChange={async e=>{
       setWorking(true);try{const res=await fetch("/api/operations/audit",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({kind:"remediation",id:x.id,status:e.target.value})});
       const body=await res.json();if(!res.ok)throw new Error(body.error||"Update failed");await refresh();}catch(err){setError((err as Error).message);}finally{setWorking(false);}
       }}><option value="open">Open</option><option value="in_progress">In progress</option><option value="completed">Completed</option></select>:x.status}
       </div>)}</section>
     <section className="panel"><h3>Control register</h3>{report.controls.map(x=><div className="audit-item" key={x.id}><span>{x.code} · {x.title}<p className="form-note">{x.risk} · Owner: {x.owner}</p></span><span className="pill">{x.frequency}</span></div>)}</section>
    </div>
  </>}
  {tab==="reports"&&<>
    <div className="notice">Unaudited cumulative general ledger balances. These are not formal IFRS or SARS statements, and period attribution must be reviewed before external distribution.</div>
    <div className="kpi-grid">
      <div className="kpi"><span className="kpi-label">Recorded revenue</span><div className="kpi-value">{money(report.statement?.revenue,overview.tenant.currency)}</div><p className="form-note">Cumulative posted revenue</p></div>
      <div className="kpi"><span className="kpi-label">Recorded expenses</span><div className="kpi-value">{money(report.statement?.expenses,overview.tenant.currency)}</div><p className="form-note">Cumulative posted expenses</p></div>
      <div className="kpi"><span className="kpi-label">Revenue less expenses</span><div className="kpi-value">{money(Number(report.statement?.revenue||0)-Number(report.statement?.expenses||0),overview.tenant.currency)}</div><p className="form-note">Simplified pretax result</p></div>
      <div className="kpi"><span className="kpi-label">Total assets</span><div className="kpi-value">{money(report.statement?.assets,overview.tenant.currency)}</div><p className="form-note">Net recorded asset balances</p></div>
    </div>
    <section className="panel" style={{marginTop:18,marginBottom:18}}>
      <h3>Management financial position</h3>
      <div className="grid-3">
        <div><p className="muted">Assets</p><h3>{money(report.statement?.assets)}</h3></div>
        <div><p className="muted">Liabilities</p><h3>{money(report.statement?.liabilities)}</h3></div>
        <div><p className="muted">Equity (excluding current result)</p><h3>{money(report.statement?.equity)}</h3></div>
      </div>
      <p className="form-note">This management view is not an IFRS-compliant statutory statement. Revenue and expense balances are displayed separately until proper close entries are posted.</p>
    </section>
    <section className="panel"><div className="panel-header"><h3>Net account balances</h3><span>Read-only reporting from committed ledger records</span></div>
     <div className="table-wrap"><table><thead><tr><th>Code</th><th>Account</th><th>Classification</th><th className="right">Net debit</th><th className="right">Net credit</th></tr></thead>
     <tbody>{report.trialBalance.map(x=><tr key={x.code}><td>{x.code}</td><td>{x.name}</td><td>{x.type}</td>
      <td className="right mono">{money(x.debit_balance)}</td><td className="right mono">{money(x.credit_balance)}</td></tr>)}</tbody></table></div>
    </section>
    <section className="panel" style={{marginTop:15}}><h3>Budget versus actual</h3><div className="table-wrap"><table><thead><tr><th>Month</th><th>Account</th><th className="right">Budget</th><th className="right">Actual</th><th className="right">Variance</th></tr></thead><tbody>
      {report.budgets.map(b=>{const actual=report.monthlyActuals.find(x=>x.account_id===b.account_id&&date(x.month)===date(b.month));
       return <tr key={b.id}><td>{date(b.month)}</td><td>{b.code}</td><td className="right">{money(b.amount)}</td><td className="right">{money(actual?.actual)}</td>
        <td className="right">{money(Number(actual?.actual||0)-Number(b.amount||0))}</td></tr>})}
     </tbody></table></div></section>
  </>}
  {tab==="exceptions"&&<>
    <div className="notice">These are rule-based investigation signals, not proof of fraud. Overdue invoices reflect allocated payments. Confirm bank receipts and credit notes before action.</div>
    <section className="panel"><div className="panel-header"><h3>Continuous exception monitoring</h3><span>{monitor?.observations.length||0} signals · refreshed every 30 seconds</span></div>
     {!monitor?.observations.length?<div className="empty">No current exceptions detected by the implemented rules.</div>:
      <div className="table-wrap"><table><thead><tr><th>Rule</th><th>Severity</th><th>Observation</th></tr></thead>
        <tbody>{monitor.observations.map((x,i)=><tr key={x.recordId+"-"+i}><td>{x.rule}</td><td><span className={"pill "+x.severity}>{x.severity}</span></td><td>{x.description}</td></tr>)}</tbody></table></div>}
    </section>
  </>}
  <p className="form-note" style={{marginTop:30}}>CABO Financial Intelligence · Phases 1–4 operations · Committed records only. Last sync {report.refreshedAt?new Date(report.refreshedAt).toLocaleString("en-ZA"):"unknown"}.</p>
  </>}
 </main>;
}
