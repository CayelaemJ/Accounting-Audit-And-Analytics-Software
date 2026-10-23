import test from "node:test";
import assert from "node:assert/strict";
import {bankSourceFingerprint,verifyStatementLast4} from "../lib/bank-source";
const key="11".repeat(32);
const tenantA="00000000-0000-4000-8000-000000000001",tenantB="00000000-0000-4000-8000-000000000002";
test("bank-source fingerprints cannot be reused across tenants or source identifiers",()=>{
 const first=bankSourceFingerprint(key,tenantA,"0001","00001234");
 assert.match(first,/^[0-9a-f]{64}$/);
 assert.equal(first,bankSourceFingerprint(key,tenantA,"0001","00001234"));
 assert.notEqual(first,bankSourceFingerprint(key,tenantB,"0001","00001234"));
 assert.notEqual(first,bankSourceFingerprint(key,tenantA,"0002","00001234"));
 assert.notEqual(first,bankSourceFingerprint(key,tenantA,"0001","00005678"));
 assert.ok(!first.includes("1234"));
});
test("requires strong configured key, and rejects unsafe source identifiers",()=>{
 assert.throws(()=>bankSourceFingerprint("weak",tenantA,"0001","00001234"),/HMAC key/);
 assert.throws(()=>bankSourceFingerprint(key,tenantA,"0001","123</ACCTID>"),/account identifier/);
});
test("requires a user-confirmed four-character account match",()=>{
 assert.equal(verifyStatementLast4("1234","1234"),true);
 assert.equal(verifyStatementLast4("AB7Z","ab7z"),true);
 assert.equal(verifyStatementLast4("9876","1234"),false);
 assert.equal(verifyStatementLast4("","1234"),false);
});
