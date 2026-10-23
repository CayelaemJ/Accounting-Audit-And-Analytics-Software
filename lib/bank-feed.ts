import {createHash,randomBytes} from "node:crypto";

export function issueBankFeedToken(tenantId:string,userId:string){
 const raw=tenantId+"."+userId+"."+randomBytes(32).toString("base64url");
 return {token:raw,hash:hashBankFeedToken(raw)};
}
export function hashBankFeedToken(raw:string){
 return createHash("sha256").update("cabo-bank-feed-auth-v1\0"+raw).digest("hex");
}
export function parseBankFeedToken(raw:string){
 const match=/^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.([A-Za-z0-9_-]{43})$/.exec(raw);
 if(!match)return null;
 return {tenantId:match[1],userId:match[2],hash:hashBankFeedToken(raw)};
}
