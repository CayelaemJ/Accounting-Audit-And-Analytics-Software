import {redirect} from "next/navigation";
import {currentSession} from "@/lib/auth";
import BankReview from "./review-client";
export const dynamic="force-dynamic";
export const runtime="nodejs";
export default async function Page(){
 const session=await currentSession();
 if(!session)redirect("/login");
 return <BankReview canMatch={["owner","finance_manager","accountant"].includes(session.role)}/>;
}
