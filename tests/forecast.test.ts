import test from "node:test";import assert from "node:assert/strict";
import {projectFinancials} from "../lib/forecast";
test("historical average and revenue-only growth are deterministic",()=>{
 const r=projectFinancials([{month:"2026-08",revenue:"100.00",expenses:"40.00"},
  {month:"2026-09",revenue:"200.00",expenses:"50.00"},
  {month:"2026-10",revenue:"300.00",expenses:"60.00"}],"2026-10-23T08:00:00Z",2,10);
 assert.equal(r.history.length,12);
 assert.deepEqual(r.forecast.map(x=>x.revenue),["220.00","242.00"]);
 assert.deepEqual(r.forecast.map(x=>x.expenses),["50.00","50.00"]);
 assert.equal(r.forecast[0].profit,"170.00");
});
test("no ledger data never creates invented financial figures",()=>{
 const r=projectFinancials([],"2026-10-23T08:00:00Z",3,0);
 assert.equal(r.hasActivity,false);assert.equal(r.forecast[0].revenue,"0.00");
});
test("reject unbounded and invalid forecast assumptions",()=>{
 assert.throws(()=>projectFinancials([],"2026-10-23T00:00:00Z",13,0));
 assert.throws(()=>projectFinancials([],"2026-10-23T00:00:00Z",6,51));
});
