import {NextRequest,NextResponse} from "next/server";
import {z} from "zod";
import {currentSession,verifyPassword,hashPassword,clearSessionCookie} from "@/lib/auth";
import {tx,setActor} from "@/lib/db";
import {jsonError,requireSameOrigin,limit,unexpected} from "@/lib/http";
export const runtime="nodejs";
const input=z.object({currentPassword:z.string().min(1).max(128),newPassword:z.string().min(12).max(128)}).strict();
export async function POST(req:NextRequest){
 try{
  requireSameOrigin(req);
  const session=await currentSession();
  if(!session)return jsonError("Sign in required.",401);
  if(!(await limit("password-change:"+session.userId,5,60)))return jsonError("Too many attempts.",429);
  const parsed=input.safeParse(await req.json());
  if(!parsed.success)return jsonError("Provide your current password and a new password of at least 12 characters.");
  const {currentPassword,newPassword}=parsed.data;
  if(currentPassword===newPassword)return jsonError("Choose a password different from your current password.");
  const done=await tx(async client=>{
   await setActor(client,session.userId,session.tenantId);
   const found=await client.query("SELECT password_hash FROM users WHERE id=$1 FOR UPDATE",[session.userId]);
   if(!found.rowCount||!(await verifyPassword(currentPassword,found.rows[0].password_hash)))return false;
   const newHash=await hashPassword(newPassword);
   await client.query("UPDATE users SET password_hash=$1 WHERE id=$2",[newHash,session.userId]);
   await client.query("DELETE FROM sessions WHERE user_id=$1",[session.userId]);
   await client.query("INSERT INTO audit_events(tenant_id,actor_id,action,record_id,details) VALUES($1,$2,'security.password_changed',$3,$4)",
    [session.tenantId,session.userId,session.userId,JSON.stringify({allSessionsRevoked:true})]);
   return true;
  });
  if(!done)return jsonError("Current password is incorrect.",403);
  await clearSessionCookie();
  return NextResponse.json({ok:true,allSessionsRevoked:true},{headers:{"Cache-Control":"no-store"}});
 }catch(error){return unexpected(error);}
}
