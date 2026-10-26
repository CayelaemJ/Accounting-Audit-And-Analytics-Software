import test from "node:test";
import assert from "node:assert/strict";
import { validSameOriginRequest } from "../lib/origin-policy";

const host = "cabo-financial-intelligence.onrender.com";
const trusted = "https://" + host;

test("financial POST accepts full expected HTTPS Origin", () => {
  assert.equal(validSameOriginRequest(trusted, host, true), true);
  assert.equal(validSameOriginRequest(trusted, host, true, trusted), true);
});
test("production rejects same-host plaintext and changed port or hostname", () => {
  for (const origin of [
    "http://" + host, trusted + ":8443",
    "https://" + host + ".attacker.invalid", "https://attacker.invalid",
    trusted + "/other", trusted + "?x=1", "null"
  ]) assert.equal(validSameOriginRequest(origin, host, true), false, origin);
});
test("missing and malformed origins fail closed", () => {
  for (const origin of [null, "", "https://user:pass@" + host, "not-a-url"])
    assert.equal(validSameOriginRequest(origin, host, true), false, String(origin));
  assert.equal(validSameOriginRequest(trusted, "bad/path", true), false);
});
test("an explicit public origin rejects forged Host headers", () => {
  assert.equal(validSameOriginRequest("https://attacker.invalid", "attacker.invalid", true, trusted), false);
  assert.equal(validSameOriginRequest(trusted, host, true, "https://other.example"), false);
});
test("local development allows matching HTTP Origin", () => {
  assert.equal(validSameOriginRequest("http://localhost:3000", "localhost:3000", false), true);
});
