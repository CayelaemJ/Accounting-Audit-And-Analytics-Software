BEGIN;
-- A tenant may bind a ledger asset to exactly one user-confirmed bank statement source.
-- We persist only a keyed fingerprint and final four account characters, never the raw identifier.
CREATE TABLE bank_statement_sources(
 tenant_id uuid NOT NULL REFERENCES tenants(id),
 bank_account_id uuid NOT NULL,
 source_fingerprint text NOT NULL CHECK(source_fingerprint ~ '^[0-9a-f]{64}$'),
 account_last4 text NOT NULL CHECK(account_last4 ~ '^[A-Za-z0-9._-]{1,4}$'),
 currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
 bound_by uuid NOT NULL REFERENCES users(id),
 bound_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,bank_account_id),
 UNIQUE(tenant_id,source_fingerprint),
 FOREIGN KEY(tenant_id,bank_account_id) REFERENCES accounts(tenant_id,id)
);
ALTER TABLE bank_statement_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_statement_sources FORCE ROW LEVEL SECURITY;
CREATE POLICY bank_sources_select ON bank_statement_sources FOR SELECT
 USING(tenant_id=app.tenant() AND app.member_of(tenant_id));
CREATE POLICY bank_sources_insert ON bank_statement_sources FOR INSERT
 WITH CHECK(tenant_id=app.tenant() AND bound_by=app.actor() AND app.member_of(tenant_id)
 AND current_setting('app.user_role',true) IN ('owner','finance_manager'));
-- Bindings are immutable. A change needs an audited, separately reviewed relinking workflow.
CREATE TRIGGER lock_bank_source_binding BEFORE UPDATE OR DELETE ON bank_statement_sources
 FOR EACH ROW EXECUTE FUNCTION app.prevent_ledger_mutation();
COMMIT;
