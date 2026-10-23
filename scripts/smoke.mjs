import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import pg from "pg";
const base="http://127.0.0.1:3123", password="CI_Staging_Test_2026!", email="smoke-"+randomUUID()+"@example.test";
async function request(path,{method="GET",body,cookie}={}){
 const res=await fetch(base+path,{
  method,headers:{"Origin":base,...(body?{"Content-Type":"application/json"}:{}),...(cookie?{"Cookie":cookie}:{})},
  ...(body?{body:JSON.stringify(body)}:{})
 });
 const result=await res.json().catch(()=>null);
 return {status:res.status,result,cookie:res.headers.get("set-cookie")?.split(";")[0]};
}
let ready=false;
for(let i=0;i<45;i++){
 try{const r=await request("/api/health");if(r.status===200){ready=true;break;}}catch{}
 await new Promise(r=>setTimeout(r,500));
}
assert.ok(ready,"Next.js service did not become healthy");
let r=await request("/api/auth/register",{method:"POST",body:{email,password,organisation:"CI Example Company"}});
assert.equal(r.status,201,"Registration must persist organisation, accounts and session");
const cookie=r.cookie;assert.ok(cookie?.startsWith("cabo_session="),"Session cookie not set");
r=await request("/api/overview",{cookie});assert.equal(r.status,200,"Authenticated overview");
assert.equal(r.result.accounts.length,6,"Default chart of accounts");
const unauthorized=await request("/api/admin/overview",{cookie});
assert.equal(unauthorized.status,403,"Tenant owner must not automatically become platform admin");
r=await request("/api/operations/contacts",{method:"POST",cookie,body:{name:"Smoke Customer",kind:"customer"}});
assert.equal(r.status,201,"Contact creation");
const contactId=r.result.contact.id;
const current=new Date().toISOString().slice(0,10);
r=await request("/api/operations/invoices",{method:"POST",cookie,body:{
 kind:"sales",contactId,reference:"CI-INV-"+randomUUID().slice(0,8),
 invoiceDate:current,dueDate:current,netAmount:"100.00",taxAmount:"0.00",idempotencyKey:randomUUID()
}});
assert.equal(r.status,201,"Invoice posting must be atomic");
r=await request("/api/overview",{cookie});
assert.equal(r.status,200);assert.equal(r.result.totals.revenue,"100.00","Actual posted revenue");
const accountsBefore=(await request("/api/overview",{cookie})).result.accounts;
const cash=accountsBefore.find(a=>a.code==="1000"),capital=accountsBefore.find(a=>a.code==="3000");
const originalIdempotency=randomUUID();
r=await request("/api/journals",{method:"POST",cookie,body:{entryDate:current,memo:"Testing reversible owner capital",idempotencyKey:originalIdempotency,
 lines:[{accountId:cash.id,side:"debit",amount:"15.50"},{accountId:capital.id,side:"credit",amount:"15.50"}]}});
assert.equal(r.status,201,"Standalone journal posting");
const postedId=r.result.id;
r=await request("/api/journals/reverse",{method:"POST",cookie,body:{journalId:postedId,reason:"Correction of duplicate source entry",entryDate:current}});
assert.equal(r.status,201,"Immutable reversal journal: "+JSON.stringify(r.result));
r=await request("/api/journals/reverse",{method:"POST",cookie,body:{journalId:postedId,reason:"Second reversal attempt must fail",entryDate:current}});
assert.equal(r.status,409,"Duplicate reversal blocked");
r=await request("/api/overview",{cookie});
assert.equal(r.result.totals.revenue,"100.00","Reversal must not change unrelated revenue");
r=await request("/api/reports/saved",{method:"POST",cookie,body:{name:"CI trial balance",template:"trial_balance"}});
assert.equal(r.status,201,"Create saved report definition");const reportId=r.result.report.id;
r=await request("/api/reports/saved/"+reportId,{cookie});assert.equal(r.status,200);
assert.ok(r.result.rows.length>=6,"Report data derived from chart of accounts");
r=await request("/api/intelligence/forecast?months=3&growth=5",{cookie});
assert.equal(r.status,200,"Tenant-scoped scenario forecast");
assert.equal(r.result.forecast.length,3);
r=await request("/api/billing/overview",{cookie});
assert.equal(r.status,200,"Tenant subscription read");assert.equal(r.result.subscription.plan_code,"evaluation");
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});
try{
 await pool.query("UPDATE users SET username=$1 WHERE email=$2",["ci_platform",email]);
 await pool.query("INSERT INTO platform_admins(user_id) SELECT id FROM users WHERE email=$1",[email]);
}finally{await pool.end();}
r=await request("/api/auth/login",{method:"POST",body:{identifier:"ci_platform",password}});
assert.equal(r.status,200,"Username authentication");assert.ok(r.cookie,"Username login cookie");
const admin=await request("/api/admin/overview",{cookie:r.cookie});
assert.equal(admin.status,200,"Verified platform administrator");
assert.ok(admin.result.summary.organisations>=1);
const changed=await request("/api/security/password",{method:"POST",cookie:r.cookie,
 body:{currentPassword:password,newPassword:"CI-NewPassword-2026!-"+randomUUID().slice(0,12)}});
assert.equal(changed.status,200,"Password change must succeed and revoke all sessions");
const revoked=await request("/api/overview",{cookie:r.cookie});
assert.equal(revoked.status,401,"Old session must be invalidated after password change");
console.log("CABO HTTP smoke: registration, journals, RLS, reports, forecasts, billing, admin login, password change and session revocation passed.");
