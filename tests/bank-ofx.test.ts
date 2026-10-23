import test from "node:test";
import assert from "node:assert/strict";
import {parseOFX} from "../lib/bank-ofx";

const start=`OFXHEADER:100
DATA:OFXSGML
VERSION:102
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS>
<CURDEF>ZAR
<BANKACCTFROM><BANKID>123456<ACCTID>000123987654<ACCTTYPE>CHECKING</BANKACCTFROM>
<BANKTRANLIST>`;
const end=`</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
const t=(id:string,posted:string,amount:string,name:string)=>`<STMTTRN>
<TRNTYPE>OTHER
<DTPOSTED>${posted}
<TRNAMT>${amount}
<FITID>${id}
<NAME>${name}
</STMTTRN>`;
test("reads South African currency OFX signed deposits and expenses without floats",()=>{
 const statement=parseOFX(start+t("txn-1","20261023110000","1200.50","Customer &amp; Partner")
  +t("txn-2","20261022110000","-30.05","Transaction fee")+end);
 assert.equal(statement.currency,"ZAR");
 assert.equal(statement.accountLast4,"7654");
 assert.equal(statement.transactions.length,2);
 assert.equal(statement.transactions[0].signedAmount,"1200.50");
 assert.equal(statement.transactions[1].signedAmount,"-30.05");
 assert.equal(statement.transactions[0].description,"Customer & Partner");
 assert.match(statement.transactions[0].sourceHash,/^[0-9a-f]{64}$/);
});
test("a repeat of the same FITID with identical values is deduplicated",()=>{
 const row=t("unique-1","20261023","15.00","Bank fee");
 const statement=parseOFX(start+row+row+end);
 assert.equal(statement.transactions.length,1);
});
test("same FITID with conflicting transactions is rejected",()=>{
 assert.throws(()=>parseOFX(start+t("id-1","20261023","15.00","Test")
  +t("id-1","20261023","17.00","Test")+end),/conflicting/);
});
test("prevents XML DTD and external entity declarations",()=>{
 assert.throws(()=>parseOFX('<!DOCTYPE OFX [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>'+start+t("1","20261023","10.00","Hi")+end),/DTD/);
});
test("rejects invalid date, zero amounts and missing FITID",()=>{
 assert.throws(()=>parseOFX(start+t("id","20260230","1","Test")+end),/date/);
 assert.throws(()=>parseOFX(start+t("id","20261023","0.00","Test")+end),/zero/);
 assert.throws(()=>parseOFX(start+'<STMTTRN><DTPOSTED>20261023<TRNAMT>1.00</STMTTRN>'+end),/FITID/);
});
test("supports XML-closing transaction fields, positive signs, decimal fragments",()=>{
 const row='<STMTTRN><DTPOSTED>20261023</DTPOSTED><TRNAMT>+.99</TRNAMT><FITID>ID-XML</FITID><MEMO>Interest</MEMO></STMTTRN>';
 const statement=parseOFX(start+row+end);
 assert.equal(statement.transactions[0].signedAmount,"0.99");
 assert.equal(statement.transactions[0].description,"Interest");
});
