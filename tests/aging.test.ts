import test from "node:test";
import assert from "node:assert/strict";
import {agingBucket,validISODate} from "../lib/aging";
test("recognises real Gregorian ISO dates",()=>{
 assert.equal(validISODate("2024-02-29"),true);
 assert.equal(validISODate("2025-02-29"),false);
 assert.equal(validISODate("2026-13-01"),false);
 assert.equal(validISODate("2026-10-23"),true);
 assert.equal(validISODate("2026-1-23"),false);
});
test("ageing groups use UTC calendar days and exact boundaries",()=>{
 const asOf="2026-10-23";
 const prior=(days:number)=>new Date(Date.UTC(2026,9,23-days)).toISOString().slice(0,10);
 assert.equal(agingBucket(asOf,"2026-10-24"),"current");
 assert.equal(agingBucket(asOf,"2026-10-23"),"current");
 assert.equal(agingBucket(asOf,prior(1)),"days_1_30");
 assert.equal(agingBucket(asOf,prior(30)),"days_1_30");
 assert.equal(agingBucket(asOf,prior(31)),"days_31_60");
 assert.equal(agingBucket(asOf,prior(60)),"days_31_60");
 assert.equal(agingBucket(asOf,prior(61)),"days_61_90");
 assert.equal(agingBucket(asOf,prior(90)),"days_61_90");
 assert.equal(agingBucket(asOf,prior(91)),"days_91_plus");
});
test("invalid dates cannot be treated as valid accounting cutoffs",()=>{
 assert.throws(()=>agingBucket("2026-02-30","2026-01-01"));
 assert.throws(()=>agingBucket("2026-10-23","tomorrow"));
});
