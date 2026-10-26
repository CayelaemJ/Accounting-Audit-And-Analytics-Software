import test from "node:test";
import assert from "node:assert/strict";
import {validSameOriginRequest} from "../lib/origin-policy";
const host="cabo-financial-staging.onrender.com",origin="https://"+host;
test("production financial requests require HTTPS and exact origin",()=>{
 assert.equal(validSameOriginRequest(origin,host,true),true);
 assert.equal(validSameOriginRequest(origin,host,true,origin),true);
 for(const bad of ["http://"+host,origin+":443",origin+"/path",origin+"?x=1","null","https://attacker.invalid"]){
  assert.equal(validSameOriginRequest(bad,host,true),false,bad);
 }
});
test("reject malformed origins and configuration mismatch",()=>{
 assert.equal(validSameOriginRequest(null,host,true),false);
 assert.equal(validSameOriginRequest("https://user:secret@"+host,host,true),false);
 assert.equal(validSameOriginRequest(origin,host,true,"https://other.example"),false);
 assert.equal(validSameOriginRequest("https://attacker.invalid","attacker.invalid",true,origin),false);
});
test("local development can use exact matching HTTP origin",()=>{
 assert.equal(validSameOriginRequest("http://localhost:3123","localhost:3123"),true);
});
