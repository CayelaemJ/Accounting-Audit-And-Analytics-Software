BEGIN;
CREATE TABLE IF NOT EXISTS journal_reversals(
 tenant_id uuid NOT NULL REFERENCES tenants(id),
 original_entry_id uuid NOT NULL,
 reversal_entry_id uuid NOT NULL,
 reason text NOT NULL CHECK(length(reason) BETWEEN 10 AND 500),
 reversed_by uuid NOT NULL REFERENCES users(id),
 reversed_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,original_entry_id),
 UNIQUE(tenant_id,reversal_entry_id),
 FOREIGN KEY(tenant_id,original_entry_id) REFERENCES journal_entries(tenant_id,id),
 FOREIGN KEY(tenant_id,reversal_entry_id) REFERENCES journal_entries(tenant_id,id),
 CHECK(original_entry_id<>reversal_entry_id)
);
ALTER TABLE journal_reversals ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_reversals FORCE ROW LEVEL SECURITY;
CREATE POLICY journal_reversals_read ON journal_reversals FOR SELECT USING(tenant_id=app.tenant() AND app.member_of(tenant_id));
CREATE POLICY journal_reversals_add ON journal_reversals FOR INSERT WITH CHECK(
 tenant_id=app.tenant() AND reversed_by=app.actor() AND app.member_of(tenant_id)
 AND current_setting('app.user_role',true) IN ('owner','finance_manager','accountant'));
CREATE OR REPLACE FUNCTION app.prevent_reversal_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'Posted reversal records are immutable';
END $$;
CREATE TRIGGER protect_reversals BEFORE UPDATE OR DELETE ON journal_reversals FOR EACH ROW EXECUTE FUNCTION app.prevent_reversal_mutation();
CREATE INDEX IF NOT EXISTS journal_reversals_reverse_idx ON journal_reversals(tenant_id,reversal_entry_id);
COMMIT;
