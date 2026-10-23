import {redirect} from "next/navigation";
import {currentSession} from "@/lib/auth";
import Worksheet from "./client";
export const runtime="nodejs";export const dynamic="force-dynamic";
export default async function Page(){
 if(!await currentSession())redirect("/login");
 return <Worksheet/>;
}
