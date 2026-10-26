import {scrypt as nodeScrypt,timingSafeEqual} from "node:crypto";
import {promisify} from "node:util";
const scrypt=promisify(nodeScrypt);
export async function verifyStoredPassword(password:unknown,stored:unknown):Promise<boolean>{
 if(typeof password!=="string"||password.length===0||password.length>128||typeof stored!=="string")return false;
 const m=/^scrypt:([a-f0-9]{32}):([a-f0-9]{128})$/.exec(stored);
 if(!m)return false;
 try{
  const actual=await scrypt(password,m[1],64) as Buffer;
  const expected=Buffer.from(m[2],"hex");
  return actual.length===expected.length&&timingSafeEqual(actual,expected);
 }catch{return false;}
}
