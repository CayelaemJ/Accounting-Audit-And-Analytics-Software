# Financial SaaS browser-origin protection — 26 October 2026

## Confirmed code observation
Before this change, `requireSameOrigin` compared only the Host component of a supplied `Origin`. An origin using plaintext HTTP on the same host was considered equivalent to production HTTPS. It also raised a generic exception, which the common handler returned as HTTP 500 rather than a security denial.

## Remediation
- Compare the complete browser Origin including scheme and port.
- Require HTTPS Origin in production.
- Reject missing, malformed, credential-bearing, or URL-shaped values.
- Reject untrusted Host input if `CABO_PUBLIC_ORIGIN` is configured.
- Return HTTP 403 for rejected origins without logging arbitrary request values.
- Preserve same-origin local HTTP development.
- Add unit tests and run them under the existing `npm test` CI command.

## Production release gate
- **REQUIRES OPERATIONS INPUT:** verify the actual public application origin and set `CABO_PUBLIC_ORIGIN` to the origin only, e.g. `https://<approved-domain>`, with no slash/path/credentials. Do not guess the hostname.
- Verify trusted reverse proxy/CDN Host rewriting and TLS termination.
- Run staging browser regression for login, logout, journal posting, invoice issuing and AI requests, including `403` negative-origin cases.
- Confirm CircleCI is running and publishing check status and that merge rules require successful checks.
- Any mobile/native API clients that write financial data require an explicitly designed token-authentication route with equivalent CSRF protection; do not disable browser-origin checking to permit them.

## Remaining control gaps
Rate limits are backed by PostgreSQL, but complete route coverage, tenant isolation, logging, retention, invoice integrity, financial regulatory applicability and processing agreements require separate validation. This code change does not establish legal compliance.
