"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
export default function Register() {
  const router = useRouter();
  const [organisation,setOrganisation] = useState("");
  const [email,setEmail] = useState("");
  const [password,setPassword] = useState("");
  const [loading,setLoading] = useState(false);
  const [error,setError] = useState("");
  async function submit(e:FormEvent) {
    e.preventDefault(); setError(""); setLoading(true);
    try {
      const response = await fetch("/api/auth/register",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({organisation,email,password})});
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to create organisation");
      router.push("/dashboard"); router.refresh();
    } catch (err) { setError((err as Error).message); } finally { setLoading(false); }
  }
  return <main className="auth-layout">
    <section className="auth-hero">
      <span className="eyebrow">CABO SOLUTIONS / BUILT FOR AMBITION</span>
      <h1>Financial control, <em>without the complexity.</em></h1>
      <p>Bring your ledger, financial reporting and audit trail into one intelligent workspace.</p>
      <div className="hero-separator" />
      <div className="hero-caption">YOUR FINANCIAL FOUNDATION STARTS HERE</div>
    </section>
    <section className="auth-form-column"><div className="auth-form-wrap">
      <div className="brand-mark">C<span>.</span></div>
      <span className="eyebrow">GET STARTED</span>
      <h2>Create your organisation</h2>
      <p className="muted">Your workspace is logically isolated from every other customer.</p>
      <form onSubmit={submit} className="stack-18">
        <label>Organisation name<input required minLength={2} maxLength={120} value={organisation} onChange={e=>setOrganisation(e.target.value)} placeholder="Your registered business name"/></label>
        <label>Work email<input required type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="name@company.co.za"/></label>
        <label>Password (at least 12 characters)<input required minLength={12} maxLength={128} type="password" autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Create a strong password"/></label>
        {error && <div className="error-message" role="alert">{error}</div>}
        <button className="button primary full" type="submit" disabled={loading}>{loading?"Creating workspace…":"Create secure workspace →"}</button>
      </form>
      <p className="auth-bottom">Already registered? <Link href="/login">Sign in</Link></p>
    </div></section>
  </main>;
}
