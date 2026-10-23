import {redirect} from "next/navigation";
import {currentSession} from "@/lib/auth";
import AuditTrailClient from "./client";
export const dynamic="force-dynamic";export const runtime="nodejs";
export default async function Page(){
 const session=await currentSession();
 if(!session)redirect("/login");
 if(!["owner","finance_manager","auditor"].includes(session.role))redirect("/dashboard");
 return <AuditTrailClient/>;
}
