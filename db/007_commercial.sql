BEGIN;
CREATE TABLE IF NOT EXISTS subscription_plans(
 code text PRIMARY KEY CHECK(code ~ '^[a-z][a-z0-9_]{2,32}$'),
 name text NOT NULL CHECK(length(name) BETWEEN 3 AND 80),
 description text NOT NULL DEFAULT '',
 price_zar_cents bigint CHECK(price_zar_cents>=0),
 features jsonb NOT NULL DEFAULT '[]'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO subscription_plans(code,name,description,features) VALUES
 ('evaluation','Evaluation','Internal evaluation; no billing connected','["ledger","reports","audit"]'::jsonb),
 ('team','Team','Pricing and seat allocation to be configured','["ledger","reports","audit","ai","forecast"]'::jsonb),
 ('enterprise','Enterprise','Custom commercial agreement required','["ledger","reports","audit","ai","forecast","integrations"]'::jsonb)
 ON CONFLICT(code) DO NOTHING;
CREATE TABLE IF NOT EXISTS tenant_subscriptions(
 tenant_id uuid PRIMARY KEY REFERENCES tenants(id),
 plan_code text NOT NULL REFERENCES subscription_plans(code) DEFAULT 'evaluation',
 status text NOT NULL DEFAULT 'evaluation' CHECK(status IN ('evaluation','active','past_due','cancelled')),
 external_provider text,
 external_subscription_id text,
 changed_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO tenant_subscriptions(tenant_id) SELECT id FROM tenants ON CONFLICT DO NOTHING;
ALTER TABLE tenant_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_subscriptions FORCE ROW LEVEL SECURITY;
CREATE POLICY subscriptions_read ON tenant_subscriptions FOR SELECT USING
 (tenant_id=app.tenant() AND app.member_of(tenant_id));
CREATE POLICY subscriptions_initial ON tenant_subscriptions FOR INSERT WITH CHECK
 (tenant_id=app.tenant() AND plan_code='evaluation' AND status='evaluation'
  AND EXISTS(SELECT 1 FROM tenants WHERE id=tenant_id AND created_by=app.actor()));
-- No self-service upgrade policy: only an approved server-controlled billing integration may activate a paid subscription.
COMMIT;
