import test from "node:test";
import assert from "node:assert/strict";
import {toCents,fromCents,validatePosting,type PostingLine} from "../lib/money";
import {agingBucket,validISODate} from "../lib/aging";
import {projectFinancials} from "../lib/forecast";
import {validSameOriginRequest} from "../lib/origin-policy";
import {verifyStoredPassword} from "../lib/password-policy";
import {scryptSync} from "node:crypto";

const amounts: [string,bigint][] = [
 ["0",0n],["0.0",0n],["0.01",1n],["1.2",120n],["1000000000000.01",100000000000001n],
 ["999999999999999.99",99999999999999999n],["90071992547409.93",9007199254740993n]
];
for(const [input,expected] of amounts) test("decimal exact: "+input,()=>assert.equal(toCents(input),expected));
for(const input of [""," ","+1","1."," .01","0.001","00","1_000","1,00","0x10","Infinity","1000000000000000","1\n"])
 test("decimal rejects "+JSON.stringify(input),()=>assert.throws(()=>toCents(input)));
const formatted:[bigint,string][]=[[0n,"0.00"],[1n,"0.01"],[-1n,"-0.01"],[100n,"1.00"],[99999999999999999n,"999999999999999.99"]];
for(const [input,expected] of formatted) test("format cents: "+input,()=>assert.equal(fromCents(input),expected));
const debit=(amount:string):PostingLine=>({accountId:"cash",side:"debit",amount});
const credit=(amount:string):PostingLine=>({accountId:"capital",side:"credit",amount});
test("split debit balances a single credit",()=>assert.deepEqual(validatePosting([debit("0.01"),debit("0.02"),credit("0.03")]),{debit:"0.03",credit:"0.03"}));
test("100 lines are permitted",()=>assert.deepEqual(validatePosting([...Array.from({length:99},()=>debit("0.01")),credit("0.99")]),{debit:"0.99",credit:"0.99"}));
test("large journals preserve precision beyond safe integers",()=>assert.deepEqual(validatePosting([debit("999999999999999.99"),credit("999999999999999.99")]),{debit:"999999999999999.99",credit:"999999999999999.99"}));
const badPostings:[string,PostingLine[]][]=[
 ["empty",[]],["one line",[debit("1")]],["101 lines",[...Array.from({length:100},()=>debit("0.01")),credit("1")]],
 ["only credits",[credit("1"),credit("1")]],["only debits",[debit("1"),debit("1")]],
 ["one cent imbalance",[debit("1"),credit("1.01")]],["zero line despite otherwise balanced",[debit("0"),debit("1"),credit("1")]],
 ["invalid side",[debit("1"),{...credit("1"),side:"other" as PostingLine["side"]}]]
];
for(const [name,lines] of badPostings) test("journal rejects "+name,()=>assert.throws(()=>validatePosting(lines)));
for(const date of ["2000-02-29","2024-02-29","2026-12-31","2026-01-01"]) test("valid accounting date "+date,()=>assert.equal(validISODate(date),true));
for(const date of ["1900-02-29","2100-02-29","2026-04-31","2026-00-01","2026-01-00","2026-11-31","2026-01-01T00:00:00Z","2026-01-01 "])
 test("invalid accounting date "+date,()=>assert.equal(validISODate(date),false));
test("leap day aging counts calendar days",()=>assert.equal(agingBucket("2024-03-01","2024-02-28"),"days_1_30"));
test("new year aging uses elapsed calendar days",()=>assert.equal(agingBucket("2027-01-01","2026-12-01"),"days_31_60"));
test("forecast crosses year boundary without dropping periods",()=>assert.deepEqual(projectFinancials([],"2026-12-31T00:00:00Z",2,0).forecast.map(x=>x.month),["2027-01","2027-02"]));
test("forecast accepts lower growth boundary",()=>assert.equal(projectFinancials([{month:"2026-10",revenue:"300.00",expenses:"0.00"}],"2026-10-31",1,-25).forecast[0].revenue,"75.00"));
test("forecast accepts upper growth boundary",()=>assert.equal(projectFinancials([{month:"2026-10",revenue:"300.00",expenses:"0.00"}],"2026-10-31",1,25).forecast[0].revenue,"125.00"));
test("negative profit is preserved",()=>assert.equal(projectFinancials([{month:"2026-10",revenue:"0.00",expenses:"300.00"}],"2026-10-31",1,0).forecast[0].profit,"-100.00"));
for(const n of [0,1.5,NaN,Infinity,-1]) test("reject forecast horizon "+String(n),()=>assert.throws(()=>projectFinancials([],"2026-10-31",n,0)));
for(const n of [-25.01,25.01,NaN,Infinity]) test("reject growth "+String(n),()=>assert.throws(()=>projectFinancials([],"2026-10-31",1,n)));
const origin="https://ledger.example.test",host="ledger.example.test";
const originCases:[string,string|null,string|null,boolean,string|undefined,boolean][]=[
 ["exact HTTPS",origin,host,true,origin,true],["case-insensitive host",origin,host.toUpperCase(),true,undefined,true],
 ["non-default port matches",origin+":8443",host+":8443",true,undefined,true],
 ["wrong port",origin+":8443",host,true,undefined,false],["missing host",origin,null,true,undefined,false],
 ["forwarded host list",origin,host+",attacker.example",true,undefined,false],
 ["host suffix confusion","https://"+host+".attacker.example",host,true,undefined,false],
 ["fragment",origin+"#fragment",host,true,undefined,false],["noncanonical configured origin",origin,host,true,origin+"/",false],
 ["HTTP production","http://"+host,host,true,undefined,false]
];
for(const [name,o,h,production,configured,expected] of originCases) test("origin policy: "+name,()=>assert.equal(validSameOriginRequest(o,h,production,configured),expected));
const salt="0".repeat(32),password="fixture-password";
const stored="scrypt:"+salt+":"+scryptSync(password,salt,64).toString("hex");
test("password fixture verifies",async()=>assert.equal(await verifyStoredPassword(password,stored),true));
test("password case is significant",async()=>assert.equal(await verifyStoredPassword(password.toUpperCase(),stored),false));
test("password whitespace is significant",async()=>assert.equal(await verifyStoredPassword(password+" ",stored),false));
test("password non-string rejected",async()=>assert.equal(await verifyStoredPassword(123,stored),false));
test("truncated hash rejected",async()=>assert.equal(await verifyStoredPassword(password,stored.slice(0,-2)),false));
