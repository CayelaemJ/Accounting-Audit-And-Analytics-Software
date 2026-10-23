import pg from "pg";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: ["localhost","127.0.0.1","[::1]"].includes(new URL(process.env.DATABASE_URL).hostname) ? false : { rejectUnauthorized: true } });
await client.connect();
try {
  const sql = await readFile(resolve("db/001_init.sql"), "utf8");
  await client.query(sql);
  console.log("CABO database migration applied");
} finally {
  await client.end();
}
