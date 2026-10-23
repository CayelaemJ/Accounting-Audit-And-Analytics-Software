# CABO Bank Reconciliation

Banking workflows currently accept user-uploaded CSV statement data, not a live connection to a South African banking provider. No payment initiation or bank login credentials are collected.

## Exact match suggestions

The protected `GET /api/operations/bank-suggestions` endpoint lists up to 100 most recent unmatched bank statement entries, and up to 3 suggested ledger journals each. Eligible suggestions:
- Are in the same organisation through a verified session and transaction-scoped PostgreSQL RLS.
- Have the same **account** and **signed amount** on committed journal lines.
- Are dated within 14 calendar days of the bank booking date.
- Are not already matched.

Multiple equal candidates are shown as ambiguous, never auto-resolved. Suggestions do not themselves alter records or reserve the proposed journal. Each match requires a separate confirmed user action through the existing reconciliation endpoint, which recomputes the ledger amount and uses a serialised transaction plus database uniqueness constraints. The bank row is never updated.

The dashboard summarises imported, matched and unmatched items and the **net signed sum** of unmatched imported statement entries. This is not a certified closing bank balance.

## Limitations

- No live bank feeds, OAuth connections, Open Banking credential ingestion, webhook verification or direct integrations.
- Imported CSV must use bookedOn,description,signedAmount,sourceRef columns, with reviewed bank assets.
- A missing suggestion does not mean the journal is missing. Split payments, bank fees and many-to-many settlements need explicit accountant handling; never forcibly auto-match them.
- Bank-account classification is presently an asset type, not a separately verified bank account registry.
- All payment and bank feeds require formal provider access, consent and security review before connection.

Do not promote staging to production without independent finance controls, recovery drills, audit review and credential rotations.
