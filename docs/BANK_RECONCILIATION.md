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

## Bank OFX/QFX document imports

An authorised finance user can now upload a bank-generated OFX/QFX statement from **Financial operations → Bank reconciliation**. The server parses and validates the document, checks the ledger account and tenant currency, verifies booking dates and signed decimal amounts, and saves no more than 250 transaction entries per 512-KB file in one atomic database transaction. The importer refuses document type declarations and external entities.

- The source's `FITID` is hashed to form a stable account-scoped deduplication identifier. Repeated statement imports do not double count bank transactions.
- A repeated transaction ID with a changed amount or booking date is rejected rather than silently overwriting bank data.
- The user must select the relevant ledger asset account. The source account's last four digits are returned for review, **but there is not yet a verified mapping to an actual bank account registry**.
- Imports stage bank transactions only; they **do not** create journal entries or mark transactions reconciled. Users must still review suggested matches and approve them.
- Live bank APIs and unattended scheduled feed collection remain unconnected and will require bank-specific credentials, consent, and a secure webhook/polling contract.

## User-confirmed bank-source binding

New OFX imports now require the last four characters of the source account shown on the bank statement. Only an organisation owner or finance manager may create its first source-to-asset-ledger binding. The server calculates a keyed HMAC-SHA-256 fingerprint of the organisation, bank institution identifier and statement account identifier; it stores the fingerprint and masked last-four suffix only, never the raw bank account identifier.

The binding is immutable within the application. Imports that attempt to use an already-bound statement source with a different asset account, or a bound ledger asset with a different source, are rejected. An accountant may import additional statements once an owner or finance manager has bound that source.

**Required configuration:** Set `BANK_SOURCE_HMAC_KEY` to a unique, cryptographically random 32-byte key encoded as 64 hexadecimal characters on the application service. Use the test-only key in CI, never in a hosted environment. Changes to this key invalidate prior source fingerprints; establish a planned audited rebinding process before any rotation.

**Scope:** These are *user-confirmed* statement-to-ledger bindings, not independently verified connections with a financial institution. A bank provider API integration, bank-specific account metadata verification, and documented reconnection workflow are still required before describing the integration as bank-verified.
