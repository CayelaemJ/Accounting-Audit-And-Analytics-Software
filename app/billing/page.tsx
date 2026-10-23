import {redirect} from "next/navigation";
import {currentSession} from "@/lib/auth";
import BillingClient from "./client";
export const runtime="nodejs";export const dynamic="force-dynamic";
export default async function BillingPage(){if(!await currentSession())redirect("/login");return <BillingClient/>;}
