import {NextRequest,NextResponse} from "next/server";
import {z} from "zod";
import {currentSession,issueSessionToken,saveSession,setSessionCookie,sessionDigest} from "@/lib/auth";
import {tx,setActor} from "@/lib/db";
import {jsonError,requireSameOrigin,unexpected} from "@/lib/http";
import {cookies} from "next/headers";
export const runtime="nodejs";
export async function GET(){
 try{
  const user=await currentSession();if(!user)return jsonError("Sign in required.",401);
  const memberships=await tx(async c=>{
   await setActor(c,user.userId,user.tenantId);
   const result=await c.query("SELECT tenant_id,role FROM memberships WHERE user_id=$1 AND active=true ORDER BY created_at",[user.userId]);
   return result.rows;
  });return NextResponse.json({memberships,currentTenantId:user.tenantId});
 }catch(e){return unexpected(e);}
}
export async function POST(req:NextRequest){
 try{
 requireSameOrigin(req);const user=await currentSession();if(!user)return jsonError("Sign in required.",401);
 const v=z.object({tenantId:z.string().uuid()}).strict().safeParse(await req.json());
 if(!v.success)return jsonError("Invalid organisation.");
 const token=issueSessionToken();
 await tx(async c=>{
  await setActor(c,user.userId,v.data.tenantId);
  const member=await c.query("SELECT 1 FROM memberships WHERE tenant_id=$1 AND user_id=$2 AND active=true",[v.data.tenantId,user.userId]);
  if(!member.rowCount)throw new Error("No active membership for that organisation.");
  await saveSession(c,user.userId,v.data.tenantId,token);
  const old=(await cookies()).get("cabo_session")?.value;
  if(old)await c.query("DELETE FROM sessions WHERE token_hash=$1",[sessionDigest(old)]);
 });
 await setSessionCookie(token);
 return NextResponse.json({ok:true});
 }catch(e){if(e instanceof Error&&e.message.startsWith("No active membership"))return jsonError(e.message,403);return unexpected(e);}
}
