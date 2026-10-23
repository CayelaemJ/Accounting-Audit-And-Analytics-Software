# CABO Financial Intelligence — Secure Bank Feed Ingestion

## Status

This iteration implements a secure, unattended **inbound push** ingestion mechanism. It does not connect to a South African bank, initiate transfers, or automatically poll a third-party account. A trusted upstream integration service must be configured separately, with its own bank-specific approvals and credentials, before ongoing automated statement delivery is possible.

## Set up

1. An organisation owner or finance manager imports an OFX/QFX statement and confirms the last four account characters. This binds the statement source to a ledger asset.
2. Visit `/bank-feed` and issue a feed credential for that mapped ledger account. Copy the displayed credential once into the approved sender's secrets manager. Do not place it in logs, URLs, source code, frontend assets, email, or chat.
3. Configure the approved sender to send JSON to `POST /api/operations/feed/webhook` using `Authorization: Bearer <scoped token>` and `Content-Type: application/json`.
4. The sender must use a unique, stable event ID for every delivery and stable transaction IDs for bank entries. Retry the **identical** event payload when retrying delivery.
5. Use `/bank-review` to review and approve proposed ledger matches. No matches or financial journal postings occur automatically.

## Event contract

```json
{
  "eventId": "partner-event-0001",
  "accountLast4": "1234",
  "currency": "ZAR",
  "transactions": [
    {
      "transactionId": "bank-posting-0001",
      "bookedOn": "2026-10-23",
      "description": "Customer EFT",
      "signedAmount": "150.00"
    }
  ]
}
```

Amounts are decimal strings, with positive cash inflows and negative cash outflows. At most 250 entries and 192 KiB are accepted per event. Dates must be valid ISO calendar days no later than the processing day. Never send personally identifying free text beyond a minimal bank transaction description.

## Security and idempotency

- Each token contains 256 bits of randomness and is scoped to one organisation and issuing user. Only the SHA-256 token digest is persisted in PostgreSQL.
- The issuing member must remain active and authorised. Only an owner or finance manager can issue or rotate feed credentials.
- A disabled or rotated token immediately stops future ingestion.
- A committed database transaction atomically inserts new bank statement items, an immutable event receipt, and a business audit log.
- Event replay is idempotent. A reused event ID with a changed payload is rejected. Reused transaction IDs with contradictory dates or amounts are rejected.
- All transactions remain tenant-scoped behind forced PostgreSQL row-level security.
- There is no automatic bank-to-journal matching or accounting entry creation.
- Provider-side consent, webhook delivery authentication and security standards still require independent verification before onboarding a real financial institution.

## Operations

Review `/bank-feed` for the active authorisations, delivery counts and most recent delivery. Disable credentials immediately if a sender is no longer trusted. Do not use this API as an open public collection endpoint for arbitrary financial data.

**Still required:** a bank-specific approved upstream sender, provider-side bank authorisation, outbound token handling in a compliant secret manager, monitoring of unsuccessful deliveries, long-term retention controls, independent reconciliation, and incident response procedures.
