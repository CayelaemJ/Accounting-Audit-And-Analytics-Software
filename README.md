# CABO Financial Intelligence

A CABO Solutions financial operations platform, using the official CABO palette and a modular Next.js/TypeScript + PostgreSQL stack. **Current environment: gated staging, not production.**

## Working phases 1–4 foundation

| Phase | Implemented | Not yet included |
| --- | --- | --- |
| 1. Secure platform | Organisation registration/login, sessions, tenant RLS, company accounts, roles, existing-user collaborator membership and tenant switching, migrations, CI, staging environment, platform administration groundwork | MFA/SSO, email invitations, production onboarding, access reviews |
| 2. Accounting | Chart of accounts, exact decimal double-entry ledger, immutable journals, contacts, sales/purchase invoices, atomic invoice settlements, period locking, trial balance, management P&L snapshot | Credits/returns, inventory, fixed assets, complex tax treatment, recurring journals, full year-end close |
| 3. Banking & reports | CSV banking imports, deduplication, exact-match reconciliation against posted cash-account movement, monthly budgets, budget/actual tables, management income and financial-position summaries, 30-second refresh | Live bank feeds, split/partial bank matching, formal IFRS/SARS financial statements, direct cash-flow statement, real-time streaming |
| 4. Auditing & controls | Engagements, control register, testing results, findings, corrective actions, due dates, evidence-reference hashes, draft reports with independent reviewer approval, four deterministic continuous monitoring rules | Actual file evidence storage, complex sampling, full working-paper workflow, management approvals, audit opinion |

**Bonus:** A read-only Groq-powered financial explanation page under `/assistant`. LLM output does not alter accounting and must be verified.

## Live staging

- [CABO Financial Intelligence](https://cabo-financial-staging.onrender.com) — protected by Render-hosted staging credentials.
- `/dashboard` — financial overview, accounts, journals and audit findings.
- `/operations` — accounting, invoices, payments, banks, budgets, periods, audit evidence and monitoring.
- `/assistant` — read-only applied AI.
- `/api/health` — health endpoint.

Credentials must be stored in Render or Neon; do not commit keys or database passwords. Staging is **not cleared for real client financial data**.

## Local setup

1. Install Node.js 22 and PostgreSQL 16.
2. Configure `DATABASE_URL` in your shell (or local environment, never Git).
3. `npm install`.
4. `npm run db:migrate` to apply all `db/NNN_*.sql` files in order, recorded in `schema_migrations`.
5. `npm run dev`, then open `/register`.
6. Verify with `npm run typecheck`, `npm test`, `npm run test:db` and `npm run build`. DB tests require a dedicated non-superuser, non-BYPASSRLS role.

The migration owner and application runtime must have **different roles** in staging/production. Only the migration owner can change database DDL; the runtime role needs explicitly scoped table grants. See [security notes](docs/SECURITY.md).

## Operational user journey

Create organisation → create contact → issue sales/purchase invoice → post payment → inspect ledger and outstanding balance → import bank statement CSV → reconcile exact matching transaction → view management statements → build audit engagement → test controls → log finding → add remediation → register evidence reference → draft report → independent reviewer approves.

All completed operations persist in PostgreSQL and carry tenant IDs and audit-event references. Calculated management reports must not be described as statutory certified statements.

## Banking CSV format

Headers must be **exactly** `bookedOn,description,signedAmount,sourceRef` (additional columns may be accepted if they are well-formed). Positive signed amounts mean deposits; negative mean withdrawals.

## Key routes

- `/api/operations/contacts` — customers/suppliers
- `/api/operations/invoices` — post invoices into GL
- `/api/operations/payments` — allocate invoice payments and post settlement journals
- `/api/operations/banking` — import bank transactions and exact-match reconciliation
- `/api/operations/periods` — create/close periods; database blocks journals in closed periods
- `/api/operations/budgets` — monthly budgets
- `/api/operations/reports` — authorised reports
- `/api/operations/audit` — audit engagements, controls, tests, corrective actions
- `/api/operations/evidence` — evidence references, draft reports, independent approvals
- `/api/operations/monitor` — deterministic exception signals
- `/api/operations/team` — existing-user role membership management

## Critical precautions

- Figures use deterministic PostgreSQL calculation; AI interpretation is a separate layer.
- VAT is not automatically calculated or certified. For nonzero manually verified tax, relevant tax accounts must be configured.
- Accounting entries are immutable; correcting-entry/reversal workflows still need to be built.
- Audit observations are not proof of fraud.
- The evidence-reference digest fingerprints supplied metadata/notes; it **does not mean an uploaded original file has been verified or stored**.
- Draft audit reports require approval from a *different* authorised reviewer.
- Do not claim security certification, statutory audit assurance, POPIA compliance certification or production readiness without evidence.

## Deployment and tests

Feature development is tracked through [GitHub PR #1](https://github.com/CayelaemJ/Accounting-Audit-And-Analytics-Software/pull/1). CI runs PostgreSQL 16 integration tests, RLS isolation tests, unit tests, TypeScript and Next.js production build. Keep the PR under review and validate user journeys against staging before merging.
