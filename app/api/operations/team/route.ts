import {NextRequest,NextResponse} from "next/server";
import {z} from "zod";
import {currentSession} from "@/lib/auth";
import {tenantTx} from "@/lib/db";
import {jsonError,requireSameOrigin,unexpected} from "@/lib/http";
export const runtime="nodejs";
const role=z.enum(["finance_manager","accountant","auditor","viewer"]);
export async function GET(){
 try{
 const user=await currentSession();if(!user)return jsonError("Sign in required.",401);
 if(user.role!=="owner")return jsonError("Tenant owner permission required.",403);
 const members=await tenantTx(user,async c=>{
  const rows=await c.query("SELECT m.user_id,u.email,m.role,m.active FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.tenant_id=$1 ORDER BY u.email",[user.tenantId]);
  return rows.rows;
 });return NextResponse.json({members});
 }catch(e){return unexpected(e);}
}
export async function POST(req:NextRequest){
 try{
 requireSameOrigin(req);const user=await currentSession();if(!user)return jsonError("Sign in required.",401);
 if(user.role!=="owner")return jsonError("Tenant owner permission required.",403);
 const v=z.object({email:z.string().trim().toLowerCase().email(),role}).strict().safeParse(await req.json());
 if(!v.success)return jsonError("Invalid collaborator email or role.");
 const member=await tenantTx(user,async c=>{
  const target=await c.query("SELECT id FROM users WHERE email=$1",[v.data.email]);
  if(!target.rowCount)throw new Error("User must first register a CABO account.");
  if(target.rows[0].id===user.userId)throw new Error("You cannot change your own owner role.");
  const r=await c.query(`INSERT INTO memberships(tenant_id,user_id,role,active) VALUES($1,$2,$3,true)
    ON CONFLICT(tenant_id,user_id) DO UPDATE SET role=EXCLUDED.role,active=true RETURNING user_id,role,active`,
    [user.tenantId,target.rows[0].id,v.data.role]);
  await c.query("INSERT INTO audit_events(tenant_id,actor_id,action,record_id,details) VALUES($1,$2,'membership.changed',$3,$4)",[user.tenantId,user.userId,target.rows[0].id,JSON.stringify({role:v.data.role})]);
  return r.rows[0];
 });return NextResponse.json({member});
 }catch(e){
 if(e instanceof Error&&/first register|owner role/.test(e.message))return jsonError(e.message,422);
 return unexpected(e);
 }
}
