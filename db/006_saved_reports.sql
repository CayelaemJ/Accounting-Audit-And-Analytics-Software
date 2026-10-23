BEGIN;
CREATE TABLE IF NOT EXISTS saved_reports(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES tenants(id),
 name text NOT NULL CHECK(length(name) BETWEEN 3 AND 120),
 template text NOT NULL CHECK(template IN ('trial_balance','income_summary','audit_findings','bank_reconciliation','budget_variance')),
 created_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id)
);
CREATE INDEX IF NOT EXISTS saved_reports_tenant_idx ON saved_reports(tenant_id,created_at DESC);
ALTER TABLE saved_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_reports FORCE ROW LEVEL SECURITY;
CREATE POLICY saved_reports_read ON saved_reports FOR SELECT USING (tenant_id=app.tenant() AND app.member_of(tenant_id));
CREATE POLICY saved_reports_insert ON saved_reports FOR INSERT WITH CHECK
 (tenant_id=app.tenant() AND created_by=app.actor() AND app.member_of(tenant_id)
 AND current_setting('app.user_role',true) IN ('owner','finance_manager','accountant','auditor'));
CREATE POLICY saved_reports_remove ON saved_reports FOR DELETE USING
 (tenant_id=app.tenant() AND app.member_of(tenant_id)
 AND (created_by=app.actor() OR current_setting('app.user_role',true)='owner'));
COMMIT;
