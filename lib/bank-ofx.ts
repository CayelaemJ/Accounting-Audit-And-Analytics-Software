import {createHash} from "node:crypto";
import {validISODate} from "@/lib/aging";
import {fromCents,toCents} from "@/lib/money";

export type OFXTransaction={
 bookedOn:string;description:string;signedAmount:string;sourceRef:string;sourceHash:string
};
export type OFXStatement={
 accountLast4:string;sourceAccountId:string;sourceBankId:string;currency:string|null;transactions:OFXTransaction[]
};
const TRANSACTION_LIMIT=250;
const OFX_MAX_CHARS=512_000;
function tag(source:string,name:string):string|null{
 const m=new RegExp("<"+name+"(?:\\s[^>]*)?>([^<\\r\\n]*)","i").exec(source);
 return m?m[1].trim():null;
}
function xmlDecode(value:string):string{
 return value.replace(/&(?:amp|lt|gt|quot|apos|#(?:x[0-9a-fA-F]+|[0-9]+));/g,entity=>{
  const table:Record<string,string>={"&amp;":"&","&lt;":"<","&gt;":">","&quot;":'"',"&apos;":"'"};
  if(table[entity])return table[entity];
  const hex=entity.startsWith("&#x"),number=parseInt(entity.slice(hex?3:2,-1),hex?16:10);
  if(!Number.isFinite(number)||number<32||number>0x10ffff||(number>=0xd800&&number<=0xdfff))return "";
  return String.fromCodePoint(number);
 });
}
function normalizeAmount(raw:string):string{
 const v=raw.trim().replace(/^\+/,"");
 if(!/^-?(?:[0-9]{1,15}(?:\.[0-9]{1,2})?|\.[0-9]{1,2})$/.test(v))throw Error("Invalid OFX signed amount");
 const neg=v.startsWith("-");
 const stripped=neg?v.slice(1):v;
 const n=stripped.startsWith(".")?"0"+stripped:stripped;
 const norm=n.replace(/^0+(?=\d)/,"");
 const cents=toCents(norm);
 if(cents===0n)throw Error("OFX entry has zero amount");
 return fromCents(neg?-cents:cents);
}
function ofxDate(raw:string):string{
 const date=raw.slice(0,8);
 if(!/^\d{8}$/.test(date))throw Error("Invalid OFX booking date");
 const iso=date.slice(0,4)+"-"+date.slice(4,6)+"-"+date.slice(6,8);
 if(!validISODate(iso))throw Error("Invalid OFX booking date");
 return iso;
}
export function parseOFX(input:string):OFXStatement{
 if(input.length>OFX_MAX_CHARS)throw Error("OFX statement exceeds 512 KB");
 if(/<!\s*(?:DOCTYPE|ENTITY)/i.test(input))throw Error("DTD and entity declarations are not supported");
 if(!/<OFX\b[^>]*>/i.test(input)||!/<(?:BANKACCTFROM|BANKACCTFROM\s)>/i.test(input))
  throw Error("Expected an OFX bank statement");
 // Reject credit card statements explicitly; asset bank reconciliation isn't credit card posting.
 if(/<CCACCTFROM\b/i.test(input))throw Error("Credit card statements require a separate import");
 const bankAccount=tag(input,"ACCTID");
 const bankId=tag(input,"BANKID")||"";
 if(!bankAccount||!/^[A-Za-z0-9._-]{4,80}$/.test(bankAccount))
   throw Error("Missing or invalid bank account identifier");
 if(!/^[A-Za-z0-9._-]{0,40}$/.test(bankId))
   throw Error("Invalid bank institution identifier");
 const currency=tag(input,"CURDEF");
 if(currency&&(!/^[A-Z]{3}$/.test(currency)))throw Error("Invalid statement currency");
 const entries=[...input.matchAll(/<STMTTRN(?:\s[^>]*)?>([\s\S]*?)<\/STMTTRN\s*>/gi)];
 if(!entries.length)throw Error("No completed OFX bank transactions");
 if(entries.length>TRANSACTION_LIMIT)throw Error("Statement exceeds 250 entries; split the file");
 const seen=new Map<string,string>();
 const transactions:OFXTransaction[]=[];
 for(const row of entries){
  const fragment=row[1];
  const fitid=tag(fragment,"FITID"),amount=tag(fragment,"TRNAMT"),posted=tag(fragment,"DTPOSTED");
  if(!fitid||!amount||!posted)throw Error("Transaction requires FITID, amount and booking date");
  if(fitid.length>140||/[\x00-\x1f\x7f]/.test(fitid))throw Error("Invalid transaction identifier");
  const signedAmount=normalizeAmount(amount),bookedOn=ofxDate(posted);
  const name=tag(fragment,"NAME")||tag(fragment,"MEMO")||"Statement transaction";
  const description=xmlDecode(name).replace(/[\x00-\x1f\x7f]/g," ").trim().slice(0,300)||"Statement transaction";
  const hash=createHash("sha256").update("cabo-ofx-bank-v1\0"+fitid).digest("hex");
  const identity=JSON.stringify([bookedOn,signedAmount]);
  if(seen.has(hash)){
   if(seen.get(hash)!==identity)throw Error("Repeated OFX transaction ID has conflicting amount or date");
   continue;
  }
  seen.set(hash,identity);
  transactions.push({bookedOn,description,signedAmount,sourceRef:"OFX:"+fitid,sourceHash:hash});
 }
 return {accountLast4:bankAccount.slice(-4),sourceAccountId:bankAccount,sourceBankId:bankId,currency:currency||null,transactions};
}
