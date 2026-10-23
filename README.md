# CABO Financial Intelligence

**A CABO Solutions product.** A tenant-aware financial operating platform for South African organisations. This repository contains a working initial vertical slice of **accounting + audit tracking + live reporting**. Advanced AI, integrations, subscriptions, formal statutory reports and production certification are future work, not delivered functionality.

## Implemented in the foundation

- Next.js/React/TypeScript responsive interface using CABO colours from `CABOSOLUTIONS/src/styles/theme.css`.
- Organisation registration, scrypt password hashing, server-side sessions, sign-in and sign-out.
- PostgreSQL multi-tenant schema with Row-Level Security (RLS) and transaction-scoped actor/tenant context.
- Chart of accounts per tenant with account code uniqueness.
- Decimal-string and bigint validation, atomic double-entry posting, commit-time balance constraints, idempotency keys and immutable posted journals.
- Tenant-scoped journal drill-down, trial balance, revenue/expenses/assets/liabilities, manual audit findings, status tracking and activity events.
- CSV trial balance export, periodic refresh with last-updated indicator, origin checks and persisted authentication rate counters.
- Smoke health endpoint and GitHub CI configuration.

## Local development

Requirements: Node.js 22 and PostgreSQL 15+.

1. Create a PostgreSQL database and a **non-superuser, non-BYPASSRLS** application/migration role. Never use service-role or superuser credentials in the running app.
2. Copy `.env.example` to `.env.local` and set `DATABASE_URL`. The migration script reads process environment; export `DATABASE_URL` in your shell when invoking it.
3. Run `npm install`.
4. Run `npm run db:migrate` and then `npm run dev`.
5. Visit `http://localhost:3000/register` to create a tenant and owner account. No default admin passwords or automatically public demo records are created.

Example local PostgreSQL setup (run in a trusted administrative psql session):

```sql
CREATE ROLE cabo_app LOGIN PASSWORD 'REPLACE_WITH_STRONG_SECRET' NOSUPERUSER NOBYPASSRLS;
CREATE DATABASE cabo_financial OWNER cabo_app;
```

Use this dedicated role, not a superuser, to apply the migration and serve requests. In production, the migration owner and runtime should be **separate** least-privileged roles with grants tailored to the app; this separation is still a release blocker.

## Functional first workflow

Sign up → choose/add accounts → post a balanced debit/credit journal → drill into posted lines → review cumulative trial balance → create and resolve an audit observation. All records are persisted; no fake financial metrics are seeded.

### API contracts

- `POST /api/auth/register` — register owner and organisation
- `POST /api/auth/login` / `POST /api/auth/logout` — manage sessions
- `POST /api/accounts` — create a financial account
- `POST /api/journals` — post 2–100 balanced lines with an idempotency UUID
- `GET /api/journals/:id` — read posted entry and lines
- `GET /api/overview` — tenant-filtered ledger and financial summary
- `POST /api/findings` / `PATCH /api/findings/:id` — manage audit observations
- `GET /api/health` — database connectivity probe

Posting example (authenticated browser same-origin request):

```json
{
  "entryDate": "2026-10-23",
  "memo": "Sample owner capital contribution",
  "idempotencyKey": "959d2e0f-b4bc-4f48-a2a3-d5ce3aaae0a6",
  "lines": [
    {"accountId":"<cash account UUID>","side":"debit","amount":"1000.00"},
    {"accountId":"<equity account UUID>","side":"credit","amount":"1000.00"}
  ]
}
```

## Deployment

`render.yaml` supplies the Node service skeleton. Provision PostgreSQL, configure `DATABASE_URL` securely, run migrations before enabling traffic, configure health checks, and monitor logs. No live deployment, Neon database, banking provider, billing gateway or LLM has been provisioned by this commit. **Do not enable customer onboarding or accept real financial records until an independent security/accounting review and the release-blocking controls in docs/SECURITY.md are completed.**

## Technical boundaries

The trial balance is cumulative transaction activity rather than a period-specific net balance trial balance. Revenue less expenses is a simplified pre-tax measure. Multi-currency, reversals, period locks, bank reconciliation, IFRS/SARS statements, document evidence, automated control monitoring, workflow automation, customer subscriptions, advanced analytics, AI, backups and recoverability are not implemented. Do not describe the application as production-ready.
