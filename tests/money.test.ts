import test from "node:test";
import assert from "node:assert/strict";
import { toCents, fromCents, validatePosting } from "../lib/money";

test("exact decimal arithmetic avoids floating point errors",()=>{
  assert.equal(toCents("0.10")+toCents("0.20"),30n);
  assert.equal(fromCents(30n),"0.30");
  assert.equal(fromCents(-1001n),"-10.01");
});
test("rejects scientific notation, negative, excess precision and malformed inputs",()=>{
  for(const value of ["1e8","-2.00","3.999","NaN","01.00","1,000"]) assert.throws(()=>toCents(value));
});
test("posting must balance and contain only positive amounts",()=>{
  assert.deepEqual(validatePosting([
    {accountId:"a",side:"debit",amount:"200.10"},
    {accountId:"b",side:"credit",amount:"200.10"}
  ]),{debit:"200.10",credit:"200.10"});
  assert.throws(()=>validatePosting([
    {accountId:"a",side:"debit",amount:"100.00"},
    {accountId:"b",side:"credit",amount:"99.99"}
  ]));
  assert.throws(()=>validatePosting([
    {accountId:"a",side:"debit",amount:"0"},
    {accountId:"b",side:"credit",amount:"0"}
  ]));
});
