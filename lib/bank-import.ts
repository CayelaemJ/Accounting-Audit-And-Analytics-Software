import {createHash} from "node:crypto";
import {validISODate} from "@/lib/aging";
import {fromCents,toCents} from "@/lib/money";
export type BankImportRow={bookedOn:string;description:string;signedAmount:string;sourceRef:string};
export function normaliseBankRow(row:BankImportRow){
 if(!validISODate(row.bookedOn))throw new Error("Invalid bank booking date.");
 const negative=row.signedAmount.startsWith("-");
 const cents=toCents(negative?row.signedAmount.slice(1):row.signedAmount);
 if(cents===0n)throw new Error("Zero-value bank entry.");
 const amount=fromCents(negative?-cents:cents);
 const description=row.description.trim().replace(/\s+/g," ");
 const reference=row.sourceRef.trim();
 return {bookedOn:row.bookedOn,description,sourceRef:reference,signedAmount:amount,
  sourceHash:createHash("sha256").update(JSON.stringify([row.bookedOn,reference,amount,description])).digest("hex")};
}
