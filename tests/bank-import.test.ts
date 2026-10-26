import test from "node:test";
import assert from "node:assert/strict";
import {normaliseBankRow} from "../lib/bank-import";
const row={bookedOn:"2026-10-23",description:"Monthly  bank fee",signedAmount:"-12.3",sourceRef:"FIT-123"};
test("canonical banking amounts deduplicate equivalent textual formats",()=>{
 const a=normaliseBankRow(row);
 const b=normaliseBankRow({...row,signedAmount:"-12.30",description:"Monthly bank fee"});
 assert.equal(a.signedAmount,"-12.30");
 assert.equal(a.sourceHash,b.sourceHash);
 assert.equal(a.description,"Monthly bank fee");
});
test("invalid or impossible booking dates are rejected",()=>{
 for(const bookedOn of ["2026-02-30","2026-13-01","bad-date"]){
  assert.throws(()=>normaliseBankRow({...row,bookedOn}),/booking date/);
 }
});
test("zero-value and negative-zero entries are rejected",()=>{
 for(const signedAmount of ["0","-0.00"]){
  assert.throws(()=>normaliseBankRow({...row,signedAmount}),/Zero-value/);
 }
});
