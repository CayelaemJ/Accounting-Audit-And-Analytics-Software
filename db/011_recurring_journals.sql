BEGIN;
CREATE TABLE recurring_journal_templates(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES tenants(id),
 name text NOT NULL CHECK(length(name) BETWEEN 3 AND 120),
 memo text NOT NULL CHECK(length(memo) BETWEEN 3 AND 300),
 lines jsonb NOT NULL CHECK(jsonb_typeof(lines)='array' AND jsonb_array_length(lines) BETWEEN 2 AND 100),
 created_by uuid NOT NULL REFERENCES users(id),
 active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id)
);
CREATE TABLE recurring_journal_postings(
 tenant_id uuid NOT NULL REFERENCES tenants(id),
 template_id uuid NOT NULL,
 posting_date date NOT NULL,
 journal_id uuid NOT NULL,
 posted_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,template_id,posting_date),
 UNIQUE(tenant_id,journal_id),
 FOREIGN KEY(tenant_id,template_id) REFERENCES recurring_journal_templates(tenant_id,id),
 FOREIGN KEY(tenant_id,journal_id) REFERENCES journal_entries(tenant_id,id)
);
CREATE INDEX recurring_journal_tenant_idx ON recurring_journal_templates(tenant_id,created_at DESC);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['recurring_journal_templates','recurring_journal_postings'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
 EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING(tenant_id=app.tenant() AND app.member_of(tenant_id))',t||'_read',t);
 END LOOP;
END $$;
CREATE POLICY recurring_template_add ON recurring_journal_templates FOR INSERT WITH CHECK
 (tenant_id=app.tenant() AND created_by=app.actor() AND app.member_of(tenant_id)
 AND current_setting('app.user_role',true) IN ('owner','finance_manager','accountant'));
CREATE POLICY recurring_template_update ON recurring_journal_templates FOR UPDATE USING
 (tenant_id=app.tenant() AND app.member_of(tenant_id)
 AND current_setting('app.user_role',true) IN ('owner','finance_manager','accountant'))
 WITH CHECK(tenant_id=app.tenant() AND app.member_of(tenant_id));
CREATE POLICY recurring_posting_add ON recurring_journal_postings FOR INSERT WITH CHECK
 (tenant_id=app.tenant() AND posted_by=app.actor() AND app.member_of(tenant_id)
 AND current_setting('app.user_role',true) IN ('owner','finance_manager','accountant'));
CREATE TRIGGER protect_recurring_postings BEFORE UPDATE OR DELETE ON recurring_journal_postings
 FOR EACH ROW EXECUTE FUNCTION app.prevent_ledger_mutation();
COMMIT;