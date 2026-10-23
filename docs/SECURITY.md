# Security and commercial release requirements

This is an initial software foundation, not a security certification.

## Delivered
- Server-side PostgreSQL with RLS on tenant-scoped tables and FORCE ROW LEVEL SECURITY.
- A request's actor and tenant context are transaction-local, established on a pooled connection after session lookup.
- Accounts, journals and findings use tenant filters in application SQL alongside RLS.
- Journals are atomic; deferred database constraints reject unbalanced postings.
- A posting is immutable and has an idempotency key. Audit events append within the same transaction.
- Session tokens are random, hashed at rest, HttpOnly, Secure on HTTPS deployments and SameSite=Lax.
- Form mutations require a matching request Origin, and login/register attempts have database-backed counters.
- No AI provider keys, database credentials or default administrator password are committed.

## Critical release blockers
1. Create separate migration and runtime database roles with verified SQL grants; runtime must not be a table owner, superuser or BYPASSRLS role. Confirm tenant policies hold against all execution contexts including background jobs.
2. Automated PostgreSQL tenant isolation tests (two tenants, different roles, forced cross-tenant IDs, pooled client reuse), concurrency/idempotency tests, and full end-to-end tests against a deployed staging environment.
3. Enforce account-level permissions in a tested authorisation matrix and configure MFA/SSO, session revocation controls and password recovery.
4. CSRF threat-model review, trusted proxy configuration for rate-limiting keys, perimeter rate limits, CSP hardening with nonces, logging/redaction, and security penetration testing.
5. Accounting period locks, controlled correcting/reversing entries, close/approval workflows, reconciliations, balance sheet/statement integrity tests and professional review of calculations and tax regulations.
6. Encrypted backups, restore rehearsals, disaster recovery, retention policies, alerting, vulnerability scans, dependency lockfile, reproducible builds and capacity testing.
7. Formal onboarding terms, privacy processing agreements, POPIA assessment, scoped data subject access, access reviews and audit-evidence retention.
8. Real billing integration, entitlements, multi-entity administration, object storage policies and integration/webhook security.

## Known scope limits
- The journal entry view covers 20 most recent records; the accounting dashboard does not yet support pagination or financial periods.
- Audit findings are a manually managed register, not automated anomaly detection.
- The RLS model provides tenant-level separation; fine-grained per-department or account-level access has not been implemented.
- The current UI handles simple two-sided journals. The API accepts up to 100 lines.
- No independent security or statutory audit opinion has been performed.
