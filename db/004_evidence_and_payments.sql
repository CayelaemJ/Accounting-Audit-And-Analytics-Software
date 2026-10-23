BEGIN;
CREATE TABLE IF NOT EXISTS invoice_allocations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES tenants(id),
 invoice_id uuid NOT NULL,
 journal_id uuid NOT NULL,
 amount numeric(20,2) NOT NULL CHECK(amount>0),
 payment_date date NOT NULL,
 posted_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,journal_id),
 FOREIGN KEY(tenant_id,invoice_id) REFERENCES invoices(tenant_id,id),
 FOREIGN KEY(tenant_id,journal_id) REFERENCES journal_entries(tenant_id,id)
);
CREATE INDEX IF NOT EXISTS allocations_invoice_idx ON invoice_allocations(tenant_id,invoice_id);
CREATE OR REPLACE FUNCTION app.validate_allocation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE maximum numeric(20,2); allocated numeric(20,2);
BEGIN
 SELECT total_amount INTO maximum FROM invoices
 WHERE tenant_id=NEW.tenant_id AND id=NEW.invoice_id FOR UPDATE;
 SELECT coalesce(sum(amount),0) INTO allocated FROM invoice_allocations
 WHERE tenant_id=NEW.tenant_id AND invoice_id=NEW.invoice_id;
 IF allocated>maximum THEN RAISE EXCEPTION 'Invoice payment exceeds remaining balance'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER enforce_invoice_allocation AFTER INSERT ON invoice_allocations
 FOR EACH ROW EXECUTE FUNCTION app.validate_allocation();
CREATE TRIGGER immutable_invoice_allocations BEFORE UPDATE OR DELETE ON invoice_allocations
 FOR EACH ROW EXECUTE FUNCTION app.prevent_ledger_mutation();
CREATE TABLE IF NOT EXISTS audit_evidence (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES tenants(id),
 engagement_id uuid NOT NULL,
 title text NOT NULL CHECK(length(title) BETWEEN 5 AND 180),
 source_ref text NOT NULL CHECK(length(source_ref) BETWEEN 3 AND 300),
 notes text NOT NULL DEFAULT '',
 evidence_sha256 text NOT NULL CHECK(evidence_sha256 ~ '^[a-f0-9]{64}$'),
 submitted_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,engagement_id) REFERENCES audit_engagements(tenant_id,id)
);
CREATE INDEX IF NOT EXISTS audit_evidence_tenant_idx ON audit_evidence(tenant_id,engagement_id);
CREATE TRIGGER protect_audit_evidence BEFORE UPDATE OR DELETE ON audit_evidence FOR EACH ROW EXECUTE FUNCTION app.prevent_ledger_mutation();
CREATE TABLE IF NOT EXISTS audit_reports (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
 engagement_id uuid NOT NULL,
 title text NOT NULL CHECK(length(title) BETWEEN 5 AND 180),
 body text NOT NULL CHECK(length(body) BETWEEN 20 AND 20000),
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','approved')),
 prepared_by uuid NOT NULL REFERENCES users(id),
 approved_by uuid REFERENCES users(id),
 approved_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,engagement_id) REFERENCES audit_engagements(tenant_id,id),
 CHECK ((status='draft' AND approved_by IS NULL AND approved_at IS NULL) OR
 (status='approved' AND approved_by IS NOT NULL AND approved_at IS NOT NULL AND approved_by<>prepared_by))
);
CREATE OR REPLACE FUNCTION app.protect_approved_report() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.status='approved' THEN RAISE EXCEPTION 'Approved reports are immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER protect_approved_report BEFORE UPDATE OR DELETE ON audit_reports
 FOR EACH ROW EXECUTE FUNCTION app.protect_approved_report();
DO $$DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['invoice_allocations','audit_evidence','audit_reports'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
 EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (tenant_id=app.tenant() AND app.member_of(tenant_id))',t||'_read',t);
 END LOOP;
END $$;
CREATE POLICY allocations_add ON invoice_allocations FOR INSERT WITH CHECK
 (tenant_id=app.tenant() AND posted_by=app.actor() AND app.member_of(tenant_id));
CREATE POLICY evidence_add ON audit_evidence FOR INSERT WITH CHECK
 (tenant_id=app.tenant() AND submitted_by=app.actor() AND app.member_of(tenant_id));
CREATE POLICY reports_add ON audit_reports FOR INSERT WITH CHECK
 (tenant_id=app.tenant() AND prepared_by=app.actor() AND app.member_of(tenant_id));
CREATE POLICY reports_update ON audit_reports FOR UPDATE
 USING(tenant_id=app.tenant() AND app.member_of(tenant_id))
 WITH CHECK(tenant_id=app.tenant() AND app.member_of(tenant_id));
COMMIT;