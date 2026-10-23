import {createHmac} from "node:crypto";
export function bankSourceFingerprint(secret:string,tenantId:string,bankId:string,accountId:string):string{
 if(!/^[0-9a-fA-F]{64}$/.test(secret))throw Error("Bank-source HMAC key must be 32 random bytes in hex");
 if(!/^[0-9a-f-]{36}$/i.test(tenantId))throw Error("Invalid organisation context");
 if(!/^[A-Za-z0-9._-]{0,40}$/.test(bankId))throw Error("Invalid OFX bank identifier");
 if(!/^[A-Za-z0-9._-]{4,80}$/.test(accountId))throw Error("Invalid OFX bank account identifier");
 return createHmac("sha256",Buffer.from(secret,"hex"))
  .update(JSON.stringify(["cabo-bank-source-v1",tenantId,bankId,accountId]),"utf8")
  .digest("hex");
}
export function verifyStatementLast4(typed:string,actual:string):boolean{
 return /^[A-Za-z0-9._-]{4}$/.test(typed)&&typed.toLowerCase()===actual.toLowerCase();
}
