import { redirect } from "next/navigation";
import { currentSession } from "@/lib/auth";
import Workbench from "./workbench";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export default async function Dashboard() {
  const session = await currentSession();
  if (!session) redirect("/login");
  return <Workbench role={session.role} userEmail={session.email}/>;
}
