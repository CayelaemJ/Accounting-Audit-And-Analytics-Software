import {redirect} from "next/navigation";
import {currentSession} from "@/lib/auth";
import {isPlatformAdmin} from "@/lib/platform-admin";
import AdminWorkspace from "./workspace";
export const runtime="nodejs";export const dynamic="force-dynamic";
export default async function AdminPage(){
 const session=await currentSession();
 if(!session)redirect("/login");
 if(!await isPlatformAdmin(session.userId))redirect("/dashboard");
 return <AdminWorkspace/>;
}
