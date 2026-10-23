import test from "node:test";
import assert from "node:assert/strict";
import {loginAttemptKey} from "../lib/login-abuse";

test("normalizes the account identity to prevent case-based rate-limit bypass",()=>{
  assert.equal(loginAttemptKey(" Alice@Example.COM "),"login:account:alice@example.com");
});
test("same account always has the same throttle key regardless of proxy headers",()=>{
  const key=loginAttemptKey("alice@example.com");
  assert.equal(key,loginAttemptKey("ALICE@EXAMPLE.COM"));
  assert.equal(key.includes("203.0.113.5"),false);
});
