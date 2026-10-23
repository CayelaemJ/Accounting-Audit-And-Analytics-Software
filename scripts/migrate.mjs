import pg from "pg";
import {readFile, readdir} from "node:fs/promises";
import {resolve} from "node:path";
if(!process.env.DATABASE_URL)throw new Error("DATABASE_URL is required");
const url=new URL(process.env.DATABASE_URL);
const client=new pg.Client({connectionString:process.env.DATABASE_URL,
 ssl:["localhost","127.0.0.1","[::1]"].includes(url.hostname)?false:{rejectUnauthorized:true}});
await client.connect();
try{
 await client.query("CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now())");
 const files=(await readdir(resolve("db"))).filter(f=>/^\d+_.*\.sql$/.test(f)).sort();
 for(const file of files){
  const exists=await client.query("SELECT 1 FROM schema_migrations WHERE version=$1",[file]);
  if(exists.rowCount)continue;
  // Migration files own their BEGIN/COMMIT transaction boundary.
  const sql=await readFile(resolve("db",file),"utf8");
  await client.query(sql);
  await client.query("INSERT INTO schema_migrations(version) VALUES($1)",[file]);
  console.log("Applied "+file);
 }
}finally{await client.end();}
