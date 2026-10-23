import {redirect} from "next/navigation";
import {currentSession} from "@/lib/auth";
import InsightClient from "./insight-client";
export const runtime="nodejs";export const dynamic="force-dynamic";
export default async function InsightsPage(){
 if(!await currentSession())redirect("/login");
 return <InsightClient/>;
}
