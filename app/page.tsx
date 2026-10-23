import Link from "next/link";
const capabilityCards=[
 {n:"01",title:"Accounting that connects",description:"A governed general ledger, double-entry journals, customer and supplier invoices, payment allocations, and period controls.",tag:"FINANCIAL OPERATIONS"},
 {n:"02",title:"Know what the numbers say",description:"Explore real ledger-driven reporting, trial balances, budget comparisons and transparent, assumption-based forecasts.",tag:"BUSINESS INTELLIGENCE"},
 {n:"03",title:"Build confidence in every control",description:"Coordinate audit engagements, evidence references, remediation actions, reviewer sign-off and continuous exception monitoring.",tag:"AUDIT & ASSURANCE"},
 {n:"04",title:"Ask better questions of your data",description:"Use read-only, Groq-powered financial explanations alongside authoritative accounting records and human review.",tag:"APPLIED AI"}
];
const steps=[
 {no:"01",title:"Bring your operations together",body:"Create an organisation, configure accounts, invite your team and start recording the financial picture."},
 {no:"02",title:"See what matters",body:"Move from journals and reconciliations to financial insights, trends and areas requiring attention."},
 {no:"03",title:"Act with evidence",body:"Use documented controls and auditable actions to support stronger, more accountable decisions."}
];
export default function Home(){
 return <main className="cabo-home">
  <header className="home-nav">
   <Link className="home-brand" href="/" aria-label="CABO Financial Intelligence home"><span className="home-logo">C<span>.</span></span><span className="home-brand-text"><strong>CABO</strong><small>FINANCIAL INTELLIGENCE</small></span></Link>
   <nav className="home-navlinks" aria-label="Homepage navigation">
    <a href="#platform">Platform</a><a href="#how-it-works">How it works</a><a href="#about">Why CABO</a>
   </nav>
   <div className="home-nav-actions"><Link className="home-action" href="/login">Sign in to your workspace <span aria-hidden="true">↗</span></Link><Link className="home-signin" href="/register">Create account</Link></div>
  </header>

  <section className="home-hero" aria-labelledby="home-headline">
   <div className="home-halo" aria-hidden="true"/>
   <div className="home-hero-copy">
    <div className="home-kicker"><span className="home-kicker-line"/> FINANCE. INTELLIGENCE. CONFIDENCE.</div>
    <h1 id="home-headline">Turn financial complexity into <em>clarity.</em></h1>
    <p className="home-lede">Accounting, analytics and assurance belong together. One connected workspace to manage your finances, understand performance and make decisions with greater confidence.</p>
    <div className="home-hero-actions"><Link className="home-action home-action-large" href="/login">Access your workspace <span aria-hidden="true">↗</span></Link><a className="home-action-secondary" href="#platform">Explore the platform <span aria-hidden="true">↓</span></a></div>
    <p className="home-hero-note"><span className="home-status-dot"/> Secure organisation workspaces <span>·</span> Built for South African businesses</p>
   </div>
   <div className="home-visual" aria-label="Illustrative overview of platform capabilities">
    <div className="home-visual-top"><span>THE CONNECTED VIEW</span><span className="home-visual-live"><i/> FINANCIAL OPERATIONS</span></div>
    <div className="home-visual-title"><div><small>ONE CONNECTED PLATFORM</small><h2>Intelligence in motion.</h2></div><div className="home-visual-mark">C<span>.</span></div></div>
    <div className="home-pulse"><span className="home-pulse-label">From recorded data to informed decisions</span><div className="home-pulse-bars" aria-hidden="true">{[27,40,34,51,43,61,56,72,64,81,73,94].map((height,i)=><span key={i} style={{height:height+"%"}}/>)}</div><div className="home-pulse-footer"><span>CAPTURE</span><span>UNDERSTAND</span><span>ACT</span></div></div>
    <div className="home-visual-cards"><div><span className="home-mini-icon">↗</span><strong>Analytics</strong><small>See the bigger picture</small></div><div><span className="home-mini-icon gold">◇</span><strong>Assurance</strong><small>Strengthen your controls</small></div><div><span className="home-mini-icon teal">✦</span><strong>AI insights</strong><small>Ask smarter questions</small></div></div>
    <div className="home-visual-caption">Illustrative interface · Not live customer financial data</div>
   </div>
  </section>

  <section className="home-strip" aria-label="Core disciplines"><span>CONNECTED BY DESIGN</span><strong>ACCOUNTING</strong><i/><strong>ANALYTICS</strong><i/><strong>AUDIT</strong><i/><strong>APPLIED AI</strong></section>
  <section id="platform" className="home-section home-platform">
   <div className="home-section-heading"><div><span className="home-eyebrow">THE PLATFORM / 01</span><h2>Your financial world.<br/><em>Working together.</em></h2></div><p>Replace scattered spreadsheets and disconnected workflows with a clearer way to work across finance, reporting and assurance.</p></div>
   <div className="home-capability-grid">{capabilityCards.map(item=><article className="home-capability" key={item.n}><div className="home-cap-top"><span>{item.n} / 04</span><span aria-hidden="true">↗</span></div><div><span className="home-cap-tag">{item.tag}</span><h3>{item.title}</h3><p>{item.description}</p></div></article>)}</div>
  </section>
  <section id="how-it-works" className="home-section home-process">
   <div className="home-section-heading"><div><span className="home-eyebrow">THE APPROACH / 02</span><h2>From activity<br/>to <em>action.</em></h2></div><p>Good technology should simplify decisions, not create another layer of complexity.</p></div>
   <div className="home-steps">{steps.map(s=><div className="home-step" key={s.no}><span className="home-step-no">{s.no}</span><h3>{s.title}</h3><p>{s.body}</p></div>)}</div>
  </section>
  <section className="home-section home-statement" id="about">
   <div className="home-statement-glow"/><span className="home-eyebrow">BUILT WITH PURPOSE / CABO SOLUTIONS</span>
   <h2>Technology should work <em>for the business.</em><br/>Not the other way around.</h2>
   <p>CABO Financial Intelligence brings structured accounting, insightful reporting and transparent assurance together—while keeping your organisation's source records and human decisions at the centre.</p>
   <Link className="home-action home-action-large" href="/login">Sign in to CABO <span aria-hidden="true">↗</span></Link>
  </section>
  <footer className="home-footer"><div className="home-footer-brand"><span className="home-logo">C<span>.</span></span><div><strong>CABO Financial Intelligence</strong><p>Built by CABO Solutions · South Africa</p></div></div>
  <div className="home-footer-links"><a href="#platform">Platform</a><Link href="/login">Sign in</Link><Link href="/register">Get started</Link></div>
  <small>Staging preview. Not for live client financial records or statutory financial advice.</small></footer>
 </main>;
}
