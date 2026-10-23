import { Pool, type PoolClient } from "pg";

declare global { var __caboPool: Pool | undefined; }
function makePool() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
  return new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 8_000,
    ssl: /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL) ? false : { rejectUnauthorized: true }
  });
}
export function pool() {
  if (!globalThis.__caboPool) globalThis.__caboPool = makePool();
  return globalThis.__caboPool;
}
export async function tx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool().connect();
  try {
    await client.query("BEGIN");
    const value = await fn(client);
    await client.query("COMMIT");
    return value;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
export async function setActor(client: PoolClient, userId: string, tenantId?: string) {
  // Transaction-local context prevents tenant bleed across pooled connections.
  await client.query("SELECT set_config('app.user_id', $1, true)", [userId]);
  if (tenantId) await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
}
export async function tenantTx<T>(ctx: { userId: string; tenantId: string }, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  return tx(async client => {
    await setActor(client, ctx.userId, ctx.tenantId);
    const member = await client.query("SELECT role FROM memberships WHERE tenant_id=$1 AND user_id=$2 AND active=true", [ctx.tenantId, ctx.userId]);
    if (!member.rowCount) throw new Error("Membership is inactive or missing");
    await client.query("SELECT set_config('app.user_role', $1, true)", [member.rows[0].role]);
    return fn(client);
  });
}
