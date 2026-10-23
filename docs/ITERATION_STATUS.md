# CABO Financial Intelligence — staging iteration

Implemented: public homepage and direct sign-in, tenant account workflows, reconciliations, audit and financial operations, read-only Groq integration, saved reports, scenario analysis, account-level subscription records, password change and session revocation, journal corrections, admin console and CI HTTP checks.

## Next release blockers

1. Validate a real production-like browser login as the named superadmin and verify the password in Neon; automated CI currently tests a separate provisioned admin user.
2. Rotate credentials previously exposed in chat; do not reuse disclosed passwords for production.
3. End-to-end tests against live Render and Groq with provider responses, not only test database and HTTP routes.
4. Production-grade billing with authenticated webhooks and provider reconciliation; catalogue is informational only.
5. Complete direct bank integrations, SARS/IFRS reporting reviews, evidence file storage and retention, backups/restore drills and security penetration test.
6. Obtain review and merge the staging PR only after its checks remain green and migration backups are verified.
