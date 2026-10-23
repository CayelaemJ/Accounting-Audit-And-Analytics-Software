import {NextRequest,NextResponse} from "next/server";
import {z} from "zod";
import {currentSession,canWrite} from "@/lib/auth";
import {tenantTx} from "@/lib/db";
import {jsonError,requireSameOrigin,unexpected} from "@/lib/http";
export const runtime="nodejs";
const schema=z.object({kind:z.enum(["customer","supplier"]),name:z.string().trim().min(2).max(180),email:z.string().trim().email().max(200).optional()}).strict();
export async function POST(req:NextRequest){
 try{
 requireSameOrigin(req);const user=await currentSession();
 if(!user)return jsonError("Sign in required.",401);
 if(!canWrite(user.role))return jsonError("Finance permission required.",403);
 const val=schema.safeParse(await req.json());if(!val.success)return jsonError("Invalid contact details.");
 const contact=await tenantTx(user,async c=>{
 const q=await c.query("INSERT INTO contacts(tenant_id,kind,name,email,created_by) VALUES($1,$2,$3,$4,$5) RETURNING id,kind,name,email",[user.tenantId,val.data.kind,val.data.name,val.data.email||null,user.userId]);
 await c.query("INSERT INTO audit_events(tenant_id,actor_id,action,record_id) VALUES($1,$2,'contact.created',$3)",[user.tenantId,user.userId,q.rows[0].id]);
 return q.rows[0];
 });return NextResponse.json({contact},{status:201});
 }catch(e){return unexpected(e);}
}
