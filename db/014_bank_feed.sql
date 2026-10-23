BEGIN;
-- A connection is issued only for an existing, user-confirmed statement source.
-- No plaintext API token or raw banking identifier is persisted.
CREATE TABLE bank_feed_connections(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES tenants(id),
 bank_account_id uuid NOT NULL,
 token_hash text NOT NULL UNIQUE CHECK(token_hash ~ '^[0-9a-f]{64}$'),
 issued_by uuid NOT NULL REFERENCES users(id),
 active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(),
 last_used_at timestamptz,
 UNIQUE(tenant_id,id),
 UNIQUE(tenant_id,bank_account_id),
 FOREIGN KEY(tenant_id,bank_account_id) REFERENCES bank_statement_sources(tenant_id,bank_account_id)
);
CREATE TABLE bank_feed_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES tenants(id),
 connection_id uuid NOT NULL,
 event_id text NOT NULL CHECK(length(event_id) BETWEEN 4 AND 120),
 payload_hash text NOT NULL CHECK(payload_hash ~ '^[0-9a-f]{64}$'),
 imported int NOT NULL CHECK(imported>=0),
 duplicates int NOT NULL CHECK(duplicates>=0),
 received_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id),
 UNIQUE(tenant_id,connection_id,event_id),
 FOREIGN KEY(tenant_id,connection_id) REFERENCES bank_feed_connections(tenant_id,id)
);
CREATE INDEX bank_feed_events_tenant_idx ON bank_feed_events(tenant_id,received_at DESC);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['bank_feed_connections','bank_feed_events'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
 EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING(tenant_id=app.tenant() AND app.member_of(tenant_id))',t||'_read',t);
 END LOOP;
END $$;
CREATE POLICY feed_connections_add ON bank_feed_connections FOR INSERT WITH CHECK
 (tenant_id=app.tenant() AND issued_by=app.actor() AND app.member_of(tenant_id)
 AND current_setting('app.user_role',true) IN ('owner','finance_manager'));
CREATE POLICY feed_connections_edit ON bank_feed_connections FOR UPDATE
 USING(tenant_id=app.tenant() AND app.member_of(tenant_id)
 AND current_setting('app.user_role',true) IN ('owner','finance_manager'))
 WITH CHECK(tenant_id=app.tenant() AND app.member_of(tenant_id)
 AND current_setting('app.user_role',true) IN ('owner','finance_manager'));
CREATE POLICY feed_events_add ON bank_feed_events FOR INSERT WITH CHECK
 (tenant_id=app.tenant() AND app.member_of(tenant_id)
 AND current_setting('app.user_role',true) IN ('owner','finance_manager'));
CREATE TRIGGER protect_bank_feed_events BEFORE UPDATE OR DELETE ON bank_feed_events
 FOR EACH ROW EXECUTE FUNCTION app.prevent_ledger_mutation();
CREATE OR REPLACE FUNCTION app.guard_bank_feed_connection_update() RETURNS trigger
 LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.id IS DISTINCT FROM OLD.id OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
 OR NEW.bank_account_id IS DISTINCT FROM OLD.bank_account_id
 OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
  RAISE EXCEPTION 'Bank feed source bindings are immutable';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_bank_feed_connections BEFORE UPDATE ON bank_feed_connections
 FOR EACH ROW EXECUTE FUNCTION app.guard_bank_feed_connection_update();
COMMIT;
