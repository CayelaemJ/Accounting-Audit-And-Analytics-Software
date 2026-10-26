import test from "node:test";
import assert from "node:assert/strict";
import {randomBytes,scryptSync} from "node:crypto";
import {verifyStoredPassword} from "../lib/password-policy";
const salt=randomBytes(16).toString("hex");
const stored="scrypt:"+salt+":"+scryptSync("right-password",salt,64).toString("hex");
test("valid password matches while wrong password fails",async()=>{
 assert.equal(await verifyStoredPassword("right-password",stored),true);
 assert.equal(await verifyStoredPassword("wrong-password",stored),false);
});
test("malformed hashes fail without crypto errors",async()=>{
 for(const x of ["bad","scrypt:bad:beef","scrypt:"+salt+":zzzz",null,undefined,123]){
  assert.equal(await verifyStoredPassword("right-password",x),false);
 }
});
test("disallow empty or oversized passwords",async()=>{
 assert.equal(await verifyStoredPassword("",stored),false);
 assert.equal(await verifyStoredPassword("x".repeat(129),stored),false);
});
