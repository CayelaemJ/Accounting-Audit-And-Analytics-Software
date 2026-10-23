import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg, { type PoolClient } from "pg";

const database = process.env.DATABASE_URL;
if (!database) throw new Error("DATABASE_URL required for PostgreSQL integration tests");
const pool = new pg.Pool({ connectionString: database, max: 2 });

async function ctx(client: PoolClient, userId:string, tenantId:string) {
  await client.query("SELECT set_config('app.user_id',$1,true)",[userId]);
  await client.query("SELECT set_config('app.tenant_id',$1,true)",[tenantId]);
}
async function createTenant() {
  const userId=randomUUID(),tenantId=randomUUID();
  const accountIds:{[name:string]:string}={};
  const c=await pool.connect();
  try{
    await c.query("BEGIN");
    await c.query("INSERT INTO users(id,email,password_hash) VALUES($1,$2,'test-only')",[userId,userId+"@example.test"]);
    await ctx(c,userId,tenantId);
    await c.query("INSERT INTO tenants(id,name,slug) VALUES($1,'Integration Test',$2)",[tenantId,"integration-"+tenantId]);
    await c.query("INSERT INTO memberships(tenant_id,user_id,role) VALUES($1,$2,'owner')",[tenantId,userId]);
    for (const [name,type] of [["Cash","asset"],["Capital","equity"]]) {
      const r=await c.query("INSERT INTO accounts(tenant_id,code,name,type) VALUES($1,$2,$3,$4) RETURNING id",
        [tenantId,name==="Cash"?"1000":"3000",name,type]);
      accountIds[name]=r.rows[0].id;
    }
    await c.query("COMMIT");
  }catch(error){await c.query("ROLLBACK");throw error}finally{c.release();}
  return {userId,tenantId,accountIds};
}

test("RLS isolates tenants, posting constraints and session-local context",async()=>{
  const roles=await pool.query("SELECT rolbypassrls,rolsuper FROM pg_roles WHERE rolname=current_user");
  assert.equal(roles.rows[0].rolbypassrls,false,"test user must not bypass row security");
  assert.equal(roles.rows[0].rolsuper,false,"test user must not be superuser");
  const a=await createTenant(),b=await createTenant();
  const client=await pool.connect();
  try {
    await client.query("BEGIN");
    await ctx(client,a.userId,a.tenantId);
    const allowed=await client.query("SELECT id FROM accounts WHERE tenant_id=$1",[a.tenantId]);
    assert.equal(allowed.rowCount,2);
    const denied=await client.query("SELECT id FROM accounts WHERE tenant_id=$1",[b.tenantId]);
    assert.equal(denied.rowCount,0,"cross-tenant account read must be hidden");
    const tenantDenied=await client.query("SELECT id FROM tenants WHERE id=$1",[b.tenantId]);
    assert.equal(tenantDenied.rowCount,0,"cross-tenant identity must be hidden");
    await client.query("COMMIT");
    const cleared=await client.query("SELECT count(*)::int AS n FROM accounts");
    assert.equal(cleared.rows[0].n,0,"transaction-local context must not leak to reused pooled clients");

    await client.query("BEGIN");
    await ctx(client,a.userId,a.tenantId);
    const goodId=randomUUID();
    const key=randomUUID();
    await client.query("INSERT INTO journal_entries(id,tenant_id,entry_date,memo,idempotency_key,created_by) VALUES($1,$2,current_date,'Owner capital received',$3,$4)",
      [goodId,a.tenantId,key,a.userId]);
    await client.query("INSERT INTO journal_lines(tenant_id,entry_id,account_id,line_no,debit,credit) VALUES($1,$2,$3,1,'200.10',0),($1,$2,$4,2,0,'200.10')",
      [a.tenantId,goodId,a.accountIds.Cash,a.accountIds.Capital]);
    await client.query("COMMIT");
    await client.query("BEGIN");
    await ctx(client,a.userId,a.tenantId);
    const sums=await client.query("SELECT sum(debit)::text AS debit,sum(credit)::text AS credit FROM journal_lines WHERE tenant_id=$1",[a.tenantId]);
    assert.equal(sums.rows[0].debit,"200.10");
    assert.equal(sums.rows[0].credit,"200.10");
    const attempted = await client.query("UPDATE journal_entries SET memo='tampered' WHERE id=$1",[goodId]);
    assert.equal(attempted.rowCount,0,"RLS must deny journal mutation");
    await client.query("ROLLBACK");

    await client.query("BEGIN");
    await ctx(client,a.userId,a.tenantId);
    const badId=randomUUID();
    await client.query("INSERT INTO journal_entries(id,tenant_id,entry_date,memo,idempotency_key,created_by) VALUES($1,$2,current_date,'Imbalanced entry',$3,$4)",
      [badId,a.tenantId,randomUUID(),a.userId]);
    await client.query("INSERT INTO journal_lines(tenant_id,entry_id,account_id,line_no,debit,credit) VALUES($1,$2,$3,1,'200.00',0),($1,$2,$4,2,0,'199.99')",
      [a.tenantId,badId,a.accountIds.Cash,a.accountIds.Capital]);
    await assert.rejects(client.query("COMMIT"),/Unbalanced or incomplete/);
    await client.query("ROLLBACK");
    const noRows=await client.query("SELECT count(*)::int AS n FROM journal_entries");
    assert.equal(noRows.rows[0].n,0,"unscoped querying should disclose nothing");

    await client.query("BEGIN");
    await ctx(client,a.userId,a.tenantId);
    const distinct=await client.query("SELECT count(*)::int AS n FROM journal_entries WHERE tenant_id=$1",[a.tenantId]);
    assert.equal(distinct.rows[0].n,1,"failed posting must roll back atomically");
    await client.query("ROLLBACK");
  }finally{client.release();await pool.end();}
});
