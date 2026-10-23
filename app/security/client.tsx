"use client";
import Link from "next/link";
import {useState,type FormEvent} from "react";
export default function SecurityClient(){
 const [currentPassword,setCurrentPassword]=useState("");
 const [newPassword,setNewPassword]=useState("");
 const [confirm,setConfirm]=useState("");
 const [error,setError]=useState("");
 const [busy,setBusy]=useState(false);
 async function submit(e:FormEvent){
  e.preventDefault();setError("");
  if(newPassword!==confirm){setError("The new passwords do not match.");return;}
  setBusy(true);
  try{
   const response=await fetch("/api/security/password",{method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({currentPassword,newPassword})});
   const data=await response.json();
   if(!response.ok)throw new Error(data.error||"Password change failed.");
   window.location.assign("/login");
  }catch(err){setError((err as Error).message);setBusy(false);}
 }
 return <main className="main-area" style={{maxWidth:1080,margin:"auto",minHeight:"100vh"}}>
  <header className="topbar"><strong>CABO<span style={{color:"var(--clay)"}}>.</span> / ACCOUNT SECURITY</strong>
   <Link href="/dashboard">← Dashboard</Link></header>
  <section className="section-head"><div><span className="eyebrow">IDENTITY / SECURITY</span>
    <h1>Account security</h1>
    <p>Change your password and revoke every signed-in session across all your devices.</p></div></section>
  <div className="notice">After a successful password change, you must sign in again everywhere. Never share your password or recovery details.</div>
  <section className="panel">
   <form className="stack-18" onSubmit={e=>void submit(e)}>
    <label>Current password<input required type="password" autoComplete="current-password" value={currentPassword} onChange={e=>setCurrentPassword(e.target.value)}/></label>
    <label>New password (12+ characters)<input required type="password" autoComplete="new-password" minLength={12} maxLength={128} value={newPassword} onChange={e=>setNewPassword(e.target.value)}/></label>
    <label>Confirm new password<input required type="password" autoComplete="new-password" minLength={12} maxLength={128} value={confirm} onChange={e=>setConfirm(e.target.value)}/></label>
    {error&&<div className="error-message" role="alert">{error}</div>}
    <button className="button primary" disabled={busy}>{busy?"Updating…":"Change password and sign out everywhere"}</button>
   </form>
  </section>
 </main>;
}
