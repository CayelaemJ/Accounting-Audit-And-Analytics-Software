import test from "node:test";
import assert from "node:assert/strict";
import {issueBankFeedToken,parseBankFeedToken,hashBankFeedToken} from "../lib/bank-feed";
const tenant="00000000-0000-4000-8000-000000000001",owner="00000000-0000-4000-8000-000000000002";
test("opaque 256-bit bank feed tokens bind tenant and issuing actor without embedding a key in source",()=>{
 const one=issueBankFeedToken(tenant,owner),two=issueBankFeedToken(tenant,owner);
 assert.notEqual(one.token,two.token);
 assert.match(one.hash,/^[0-9a-f]{64}$/);
 assert.equal(parseBankFeedToken(one.token)?.tenantId,tenant);
 assert.equal(parseBankFeedToken(one.token)?.userId,owner);
 assert.equal(parseBankFeedToken(one.token)?.hash,one.hash);
 assert.notEqual(one.hash,one.token);
 assert.notEqual(two.hash,one.hash);
});
test("malformed or truncated feed tokens are rejected",()=>{
 assert.equal(parseBankFeedToken(""),null);
 assert.equal(parseBankFeedToken("not-a-token"),null);
 const issued=issueBankFeedToken(tenant,owner);
 assert.equal(parseBankFeedToken(issued.token.slice(0,-1)),null);
 assert.notEqual(hashBankFeedToken(issued.token+"x"),issued.hash);
});
