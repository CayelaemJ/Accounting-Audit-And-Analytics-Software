"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";

export default function Login() {
  const [identifier,setIdentifier] = useState("");
  const [password,setPassword] = useState("");
  const [loading,setLoading] = useState(false);
  const [showPassword,setShowPassword] = useState(false);
  const [error,setError] = useState("");
  async function submit(e:FormEvent) {
    e.preventDefault(); setError(""); setLoading(true);
    try {
      const response = await fetch("/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({identifier,password})});
      const body = await response.json();
      if (!response.ok) throw new Error(response.status===429?"Too many login attempts. Please retry after 15 minutes.":body.error || "Unable to sign in");
      window.location.replace("/dashboard");
    } catch (err) { setError((err as Error).message); } finally { setLoading(false); }
  }
  return <main className="auth-layout">
    <section className="auth-hero">
      <span className="eyebrow">CABO SOLUTIONS / FINANCIAL INTELLIGENCE</span>
      <h1>Make every financial decision <em>an informed one.</em></h1>
      <p>A connected workspace for trusted accounting, continuous assurance and financial clarity.</p>
      <div className="hero-separator" />
      <div className="hero-caption">FROM LEDGER TO LEADERSHIP</div>
    </section>
    <section className="auth-form-column"><div className="auth-form-wrap">
      <div className="brand-mark">C<span>.</span></div>
      <Link href="/" className="home-signin">← Back to homepage</Link><span className="eyebrow">WELCOME BACK</span>
      <h2>Sign in to your workspace</h2>
      <p className="muted">Secure access to your organisation's financial records.</p>
      <form onSubmit={submit} className="stack-18">
        <label>Email address or username<input required type="text" value={identifier} autoComplete="username" onChange={e=>setIdentifier(e.target.value)} placeholder="name@company.co.za or username"/></label>
        <label>Password<input required type={showPassword?"text":"password"} autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Your password"/></label>
        <label style={{display:"flex",alignItems:"center",gap:10}}><input type="checkbox" checked={showPassword} onChange={e=>setShowPassword(e.target.checked)} style={{width:"auto"}}/> Show password</label>
        {error && <div className="error-message" role="alert">{error}</div>}
        <button className="button primary full" type="submit" disabled={loading}>{loading?"Signing in…":"Access workspace →"}</button>
      </form>
      <p className="auth-bottom">New to CABO? <Link href="/register">Create your organisation</Link></p>
    </div></section>
  </main>;
}
