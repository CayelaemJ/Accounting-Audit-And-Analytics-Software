import {redirect} from "next/navigation";
import {currentSession} from "@/lib/auth";
import BankFeedClient from "./client";
export const runtime="nodejs";export const dynamic="force-dynamic";
export default async function Page(){
 const session=await currentSession();
 if(!session)redirect("/login");
 if(!["owner","finance_manager"].includes(session.role))redirect("/operations");
 return <BankFeedClient/>;
}
