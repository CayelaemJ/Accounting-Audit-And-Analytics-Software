import {redirect} from "next/navigation";
import {currentSession} from "@/lib/auth";
import RecurringClient from "./client";
export const dynamic="force-dynamic";export const runtime="nodejs";
export default async function Page(){if(!await currentSession())redirect("/login");return <RecurringClient/>;}
