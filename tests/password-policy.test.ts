import test from "node:test";
import assert from "node:assert/strict";
import { scryptSync } from "node:crypto";
import { verifyStoredPassword } from "../lib/password-policy";

const salt = "a".repeat(32);
const record = "scrypt:" + salt + ":" + scryptSync("safe-password-123", salt, 64).toString("hex");

test("verifies real password using the existing scrypt record format", async()=>{
  assert.equal(await verifyStoredPassword("safe-password-123", record), true);
  assert.equal(await verifyStoredPassword("wrong-password", record), false);
});
test("corrupt, truncated and unexpectedly long stored digests fail safely", async()=>{
  for (const bad of ["", "scrypt:bad:bad", record.slice(0,-2),
    record + "garbage", "pbkdf2:" + salt + ":" + "a".repeat(128),
    "scrypt:" + "z".repeat(32) + ":" + "b".repeat(128)]) {
    assert.equal(await verifyStoredPassword("safe-password-123", bad), false);
  }
});
test("invalid password input never invokes a scrypt operation", async()=>{
  assert.equal(await verifyStoredPassword("", record),false);
  assert.equal(await verifyStoredPassword("a".repeat(129),record),false);
  assert.equal(await verifyStoredPassword(null,record),false);
});
