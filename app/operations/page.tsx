import {redirect} from "next/navigation";
import {currentSession} from "@/lib/auth";
import OperationsClient from "./operations-client";
export const runtime="nodejs";export const dynamic="force-dynamic";
export default async function OperationsPage(){
 const session=await currentSession();
 if(!session)redirect("/login");
 return <OperationsClient/>;
}
