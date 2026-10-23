-- Phase 1-4 operational vertical slices; tenant SQL scopes are enforced in addition to API RBAC.
BEGIN;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES users(id);
UPDATE tenants t SET created_by=m.user_id FROM memberships m
 WHERE m.tenant_id=t.id AND m.role='owner' AND t.created_by IS NULL;
ALTER TABLE tenants ALTER COLUMN created_by SET NOT NULL;
DROP POLICY IF EXISTS tenants_register ON tenants;
CREATE POLICY tenants_register ON tenants FOR INSERT WITH CHECK
 (id=app.tenant() AND created_by=app.actor());
DROP POLICY IF EXISTS tenants_creator_read ON tenants;
CREATE POLICY tenants_creator_read ON tenants FOR SELECT USING (id=app.tenant() AND created_by=app.actor());
DROP POLICY IF EXISTS memberships_register ON memberships;
CREATE POLICY memberships_register ON memberships FOR INSERT WITH CHECK
 (user_id=app.actor() AND tenant_id=app.tenant() AND role='owner'
  AND EXISTS(SELECT 1 FROM tenants t WHERE t.id=tenant_id AND t.created_by=app.actor()));
DROP POLICY IF EXISTS accounts_add ON accounts;
CREATE POLICY accounts_add ON accounts FOR INSERT WITH CHECK
 (tenant_id=app.tenant() AND app.member_of(tenant_id) AND EXISTS
 (SELECT 1 FROM memberships m WHERE m.tenant_id=accounts.tenant_id AND m.user_id=app.actor()
  AND m.active AND m.role IN ('owner','finance_manager','accountant')));
DROP POLICY IF EXISTS accounts_edit ON accounts;
CREATE POLICY accounts_edit ON accounts FOR UPDATE USING
 (tenant_id=app.tenant() AND app.member_of(tenant_id) AND EXISTS
 (SELECT 1 FROM memberships m WHERE m.tenant_id=accounts.tenant_id AND m.user_id=app.actor()
  AND m.active AND m.role IN ('owner','finance_manager','accountant')))
 WITH CHECK (tenant_id=app.tenant() AND app.member_of(tenant_id));

CREATE TABLE IF NOT EXISTS financial_periods (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES tenants(id),
 label text NOT NULL CHECK(length(label) BETWEEN 2 AND 80),
 start_date date NOT NULL, end_date date NOT NULL,
 status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','closed')),
 created_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(end_date>=start_date), UNIQUE(tenant_id,id),UNIQUE(tenant_id,start_date,end_date)
);
CREATE INDEX IF NOT EXISTS financial_periods_dates_idx ON financial_periods(tenant_id,start_date,end_date);
CREATE OR REPLACE FUNCTION app.require_open_period() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM financial_periods WHERE tenant_id=NEW.tenant_id)
 AND NOT EXISTS(SELECT 1 FROM financial_periods
  WHERE tenant_id=NEW.tenant_id AND NEW.entry_date BETWEEN start_date AND end_date AND status='open')
 THEN RAISE EXCEPTION 'Accounting period is not open for journal date'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS check_open_period ON journal_entries;
CREATE TRIGGER check_open_period BEFORE INSERT ON journal_entries FOR EACH ROW EXECUTE FUNCTION app.require_open_period();

CREATE TABLE IF NOT EXISTS contacts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
 kind text NOT NULL CHECK(kind IN ('customer','supplier')), name text NOT NULL CHECK(length(name) BETWEEN 2 AND 180),
 email text, created_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id)
);
CREATE INDEX IF NOT EXISTS contacts_tenant_kind_idx ON contacts(tenant_id,kind);
CREATE TABLE IF NOT EXISTS invoices (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
 kind text NOT NULL CHECK(kind IN ('sales','purchase')), reference text NOT NULL CHECK(length(reference) BETWEEN 2 AND 70),
 contact_id uuid NOT NULL, journal_id uuid NOT NULL, invoice_date date NOT NULL,
 due_date date NOT NULL, net_amount numeric(20,2) NOT NULL CHECK(net_amount>0),
 tax_amount numeric(20,2) NOT NULL DEFAULT 0 CHECK(tax_amount>=0),
 total_amount numeric(20,2) GENERATED ALWAYS AS (net_amount+tax_amount) STORED,
 status text NOT NULL DEFAULT 'posted' CHECK(status='posted'),
 created_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id),UNIQUE(tenant_id,kind,reference),UNIQUE(tenant_id,journal_id),
 FOREIGN KEY(tenant_id,contact_id) REFERENCES contacts(tenant_id,id),
 FOREIGN KEY(tenant_id,journal_id) REFERENCES journal_entries(tenant_id,id),
 CHECK(due_date>=invoice_date)
);
CREATE INDEX IF NOT EXISTS invoices_due_idx ON invoices(tenant_id,kind,due_date);
DROP TRIGGER IF EXISTS lock_invoices ON invoices;
CREATE TRIGGER lock_invoices BEFORE UPDATE OR DELETE ON invoices FOR EACH ROW EXECUTE FUNCTION app.prevent_ledger_mutation();

CREATE TABLE IF NOT EXISTS budgets (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
 account_id uuid NOT NULL, month date NOT NULL CHECK(EXTRACT(day FROM month)=1),
 amount numeric(20,2) NOT NULL CHECK(amount>=0), created_by uuid NOT NULL REFERENCES users(id),
 updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,account_id,month),
 FOREIGN KEY(tenant_id,account_id) REFERENCES accounts(tenant_id,id)
);
CREATE TABLE IF NOT EXISTS bank_transactions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
 bank_account_id uuid NOT NULL, booked_on date NOT NULL,
 description text NOT NULL CHECK(length(description) BETWEEN 1 AND 300),
 signed_amount numeric(20,2) NOT NULL CHECK(signed_amount<>0),
 source_ref text NOT NULL CHECK(length(source_ref) BETWEEN 1 AND 180),
 source_hash text NOT NULL CHECK(length(source_hash)=64),
 created_by uuid NOT NULL REFERENCES users(id),
 imported_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id),UNIQUE(tenant_id,bank_account_id,source_hash),
 FOREIGN KEY(tenant_id,bank_account_id) REFERENCES accounts(tenant_id,id)
);
CREATE INDEX IF NOT EXISTS bank_tx_tenant_date_idx ON bank_transactions(tenant_id,booked_on);
CREATE TABLE IF NOT EXISTS bank_matches (
 tenant_id uuid NOT NULL REFERENCES tenants(id),bank_transaction_id uuid NOT NULL,
 journal_id uuid NOT NULL, matched_by uuid NOT NULL REFERENCES users(id),
 matched_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,bank_transaction_id), UNIQUE(tenant_id,journal_id),
 FOREIGN KEY(tenant_id,bank_transaction_id) REFERENCES bank_transactions(tenant_id,id),
 FOREIGN KEY(tenant_id,journal_id) REFERENCES journal_entries(tenant_id,id)
);
CREATE TABLE IF NOT EXISTS audit_engagements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants(id),
 title text NOT NULL CHECK(length(title) BETWEEN 5 AND 180),
 objective text NOT NULL DEFAULT '', status text NOT NULL DEFAULT 'planned'
 CHECK(status IN ('planned','in_progress','review','closed')),
 created_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id)
);
CREATE TABLE IF NOT EXISTS audit_controls (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants(id),
 code text NOT NULL CHECK(length(code) BETWEEN 2 AND 40),
 title text NOT NULL CHECK(length(title) BETWEEN 5 AND 180),
 risk text NOT NULL DEFAULT '',owner text NOT NULL DEFAULT '',
 frequency text NOT NULL DEFAULT 'monthly'
 CHECK(frequency IN ('daily','weekly','monthly','quarterly','annual')),
 created_by uuid NOT NULL REFERENCES users(id),
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,code)
);
CREATE TABLE IF NOT EXISTS audit_tests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants(id),
 engagement_id uuid NOT NULL,control_id uuid NOT NULL,
 result text NOT NULL CHECK(result IN ('pass','fail','needs_review')),
 notes text NOT NULL DEFAULT '',tested_by uuid NOT NULL REFERENCES users(id),
 tested_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,engagement_id) REFERENCES audit_engagements(tenant_id,id),
 FOREIGN KEY(tenant_id,control_id) REFERENCES audit_controls(tenant_id,id)
);
CREATE INDEX IF NOT EXISTS audit_tests_tenant_idx ON audit_tests(tenant_id,tested_at DESC);
ALTER TABLE audit_findings ADD CONSTRAINT audit_findings_tenant_id_unique UNIQUE(tenant_id,id);
CREATE TABLE IF NOT EXISTS remediation_actions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
 finding_id uuid NOT NULL REFERENCES audit_findings(id), description text NOT NULL CHECK(length(description) BETWEEN 5 AND 1000),
 due_date date NOT NULL, status text NOT NULL DEFAULT 'open'
 CHECK(status IN ('open','in_progress','completed')),
 created_by uuid NOT NULL REFERENCES users(id), updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,finding_id) REFERENCES audit_findings(tenant_id,id)
);

-- RLS: no reads without matching verified session actor and tenant; writes require permitted role.
DO $$DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['financial_periods','contacts','invoices','budgets','bank_transactions',
   'bank_matches','audit_engagements','audit_controls','audit_tests','remediation_actions'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (tenant_id=app.tenant() AND app.member_of(tenant_id))',t||'_read',t);
 END LOOP;
END $$;
CREATE POLICY periods_insert ON financial_periods FOR INSERT WITH CHECK
 (tenant_id=app.tenant() AND created_by=app.actor() AND app.member_of(tenant_id));
CREATE POLICY periods_update ON financial_periods FOR UPDATE
 USING(tenant_id=app.tenant() AND app.member_of(tenant_id))
 WITH CHECK(tenant_id=app.tenant() AND app.member_of(tenant_id));
CREATE POLICY contacts_insert ON contacts FOR INSERT WITH CHECK
 (tenant_id=app.tenant() AND created_by=app.actor() AND app.member_of(tenant_id));
CREATE POLICY invoices_insert ON invoices FOR INSERT WITH CHECK
 (tenant_id=app.tenant() AND created_by=app.actor() AND app.member_of(tenant_id));
CREATE POLICY budgets_insert ON budgets FOR INSERT WITH CHECK
 (tenant_id=app.tenant() AND created_by=app.actor() AND app.member_of(tenant_id));
CREATE POLICY budgets_update ON budgets FOR UPDATE
 USING(tenant_id=app.tenant() AND app.member_of(tenant_id))
 WITH CHECK(tenant_id=app.tenant() AND app.member_of(tenant_id));
CREATE POLICY bank_transactions_insert ON bank_transactions FOR INSERT WITH CHECK
 (tenant_id=app.tenant() AND created_by=app.actor() AND app.member_of(tenant_id));
CREATE POLICY bank_matches_insert ON bank_matches FOR INSERT WITH CHECK
 (tenant_id=app.tenant() AND matched_by=app.actor() AND app.member_of(tenant_id));
CREATE POLICY engagements_insert ON audit_engagements FOR INSERT WITH CHECK
 (tenant_id=app.tenant() AND created_by=app.actor() AND app.member_of(tenant_id));
CREATE POLICY engagements_update ON audit_engagements FOR UPDATE
 USING(tenant_id=app.tenant() AND app.member_of(tenant_id))
 WITH CHECK(tenant_id=app.tenant() AND app.member_of(tenant_id));
CREATE POLICY controls_insert ON audit_controls FOR INSERT WITH CHECK
 (tenant_id=app.tenant() AND created_by=app.actor() AND app.member_of(tenant_id));
CREATE POLICY tests_insert ON audit_tests FOR INSERT WITH CHECK
 (tenant_id=app.tenant() AND tested_by=app.actor() AND app.member_of(tenant_id));
CREATE POLICY actions_insert ON remediation_actions FOR INSERT WITH CHECK
 (tenant_id=app.tenant() AND created_by=app.actor() AND app.member_of(tenant_id));
CREATE POLICY actions_update ON remediation_actions FOR UPDATE
 USING(tenant_id=app.tenant() AND app.member_of(tenant_id))
 WITH CHECK(tenant_id=app.tenant() AND app.member_of(tenant_id));
COMMIT;