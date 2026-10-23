import {pool} from "@/lib/db";
export async function isPlatformAdmin(userId:string):Promise<boolean>{
 const result=await pool().query("SELECT 1 FROM platform_admins WHERE user_id=$1 AND active=true AND role='superadmin'",[userId]);
 return Boolean(result.rowCount);
}
