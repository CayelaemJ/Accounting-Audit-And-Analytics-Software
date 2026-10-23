-- CABO Financial Intelligence initial PostgreSQL schema.
-- Execute as a non-BYPASSRLS role; application connection must never use superuser credentials.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS app;
CREATE OR REPLACE FUNCTION app.actor() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.user_id', true), '')::uuid
$$;
CREATE OR REPLACE FUNCTION app.tenant() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid
$$;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT email_canonical CHECK (email = lower(trim(email)))
);
CREATE TABLE IF NOT EXISTS tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(name) BETWEEN 2 AND 120),
  slug text NOT NULL UNIQUE,
  currency text NOT NULL DEFAULT 'ZAR' CHECK (currency ~ '^[A-Z]{3}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS memberships (
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  user_id uuid NOT NULL REFERENCES users(id),
  role text NOT NULL CHECK (role IN ('owner','finance_manager','accountant','auditor','viewer')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id)
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, user_id) REFERENCES memberships(tenant_id, user_id)
);
CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS rate_limits (
  key_hash text NOT NULL,
  window_start bigint NOT NULL,
  hits integer NOT NULL CHECK (hits > 0),
  PRIMARY KEY (key_hash, window_start)
);

CREATE TABLE IF NOT EXISTS accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  code text NOT NULL CHECK (code ~ '^[0-9A-Za-z._-]{2,20}$'),
  name text NOT NULL CHECK (length(name) BETWEEN 2 AND 120),
  type text NOT NULL CHECK (type IN ('asset','liability','equity','revenue','expense')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, id),
  UNIQUE(tenant_id, code)
);
CREATE INDEX IF NOT EXISTS accounts_tenant_type_idx ON accounts(tenant_id, type);

CREATE TABLE IF NOT EXISTS journal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  entry_date date NOT NULL,
  memo text NOT NULL CHECK (length(memo) BETWEEN 3 AND 300),
  idempotency_key uuid NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id),
  posted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, id),
  UNIQUE(tenant_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS journal_entries_tenant_date_idx ON journal_entries(tenant_id, entry_date DESC, posted_at DESC);

CREATE TABLE IF NOT EXISTS journal_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  entry_id uuid NOT NULL,
  account_id uuid NOT NULL,
  line_no smallint NOT NULL CHECK(line_no BETWEEN 1 AND 100),
  debit numeric(20,2) NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit numeric(20,2) NOT NULL DEFAULT 0 CHECK (credit >= 0),
  UNIQUE(entry_id, line_no),
  CONSTRAINT exclusively_debit_or_credit CHECK ((debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0)),
  FOREIGN KEY (tenant_id, entry_id) REFERENCES journal_entries(tenant_id, id),
  FOREIGN KEY (tenant_id, account_id) REFERENCES accounts(tenant_id, id)
);
CREATE INDEX IF NOT EXISTS journal_lines_tenant_account_idx ON journal_lines(tenant_id, account_id);

CREATE TABLE IF NOT EXISTS audit_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  title text NOT NULL CHECK(length(title) BETWEEN 5 AND 180),
  description text NOT NULL DEFAULT '',
  severity text NOT NULL CHECK(severity IN ('low','medium','high','critical')),
  status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_progress','resolved')),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS findings_tenant_status_idx ON audit_findings(tenant_id, status);
CREATE TABLE IF NOT EXISTS audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  actor_id uuid NOT NULL REFERENCES users(id),
  action text NOT NULL,
  record_id uuid NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  happened_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS audit_events_tenant_idx ON audit_events(tenant_id, happened_at DESC);

-- No destructive updates to posted entries. A deferred check validates a complete posting at COMMIT.
CREATE OR REPLACE FUNCTION app.prevent_ledger_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Posted journal records are immutable; use an authorised reversing journal';
END $$;
DROP TRIGGER IF EXISTS protect_entries ON journal_entries;
CREATE TRIGGER protect_entries BEFORE UPDATE OR DELETE ON journal_entries
FOR EACH ROW EXECUTE FUNCTION app.prevent_ledger_mutation();
DROP TRIGGER IF EXISTS protect_lines ON journal_lines;
CREATE TRIGGER protect_lines BEFORE UPDATE OR DELETE ON journal_lines
FOR EACH ROW EXECUTE FUNCTION app.prevent_ledger_mutation();

CREATE OR REPLACE FUNCTION app.check_posting() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  target_entry uuid;
  line_count integer;
  total_debit numeric(20,2);
  total_credit numeric(20,2);
BEGIN
  IF TG_TABLE_NAME = 'journal_entries' THEN
    target_entry := NEW.id;
  ELSE
    target_entry := NEW.entry_id;
  END IF;
  SELECT count(*), coalesce(sum(debit), 0), coalesce(sum(credit), 0)
    INTO line_count, total_debit, total_credit
    FROM journal_lines WHERE entry_id = target_entry;
  IF line_count < 2 OR total_debit = 0 OR total_debit <> total_credit THEN
    RAISE EXCEPTION 'Unbalanced or incomplete double-entry journal %', target_entry;
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS check_entry_posting ON journal_entries;
CREATE CONSTRAINT TRIGGER check_entry_posting AFTER INSERT ON journal_entries
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.check_posting();
DROP TRIGGER IF EXISTS check_line_posting ON journal_lines;
CREATE CONSTRAINT TRIGGER check_line_posting AFTER INSERT ON journal_lines
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.check_posting();

-- Own memberships are visible only when actor context was established by the server.
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships FORCE ROW LEVEL SECURITY;
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts FORCE ROW LEVEL SECURITY;
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entries FORCE ROW LEVEL SECURITY;
ALTER TABLE journal_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_lines FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_findings FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events FORCE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION app.member_of(tid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER AS $$
  SELECT EXISTS(SELECT 1 FROM memberships
    WHERE tenant_id = tid AND user_id = app.actor() AND active = true)
$$;

DROP POLICY IF EXISTS memberships_read ON memberships;
CREATE POLICY memberships_read ON memberships FOR SELECT USING (user_id = app.actor());
DROP POLICY IF EXISTS memberships_register ON memberships;
CREATE POLICY memberships_register ON memberships FOR INSERT WITH CHECK
  (user_id = app.actor() AND tenant_id = app.tenant() AND role = 'owner');

DROP POLICY IF EXISTS tenants_read ON tenants;
CREATE POLICY tenants_read ON tenants FOR SELECT USING
  (id = app.tenant() AND app.member_of(id));
DROP POLICY IF EXISTS tenants_register ON tenants;
CREATE POLICY tenants_register ON tenants FOR INSERT WITH CHECK(id = app.tenant());

DROP POLICY IF EXISTS accounts_read ON accounts;
CREATE POLICY accounts_read ON accounts FOR SELECT USING(tenant_id = app.tenant() AND app.member_of(tenant_id));
DROP POLICY IF EXISTS accounts_add ON accounts;
CREATE POLICY accounts_add ON accounts FOR INSERT WITH CHECK(tenant_id = app.tenant() AND app.member_of(tenant_id));
DROP POLICY IF EXISTS accounts_edit ON accounts;
CREATE POLICY accounts_edit ON accounts FOR UPDATE
USING(tenant_id = app.tenant() AND app.member_of(tenant_id))
WITH CHECK(tenant_id = app.tenant() AND app.member_of(tenant_id));

DROP POLICY IF EXISTS entries_read ON journal_entries;
CREATE POLICY entries_read ON journal_entries FOR SELECT USING(tenant_id = app.tenant() AND app.member_of(tenant_id));
DROP POLICY IF EXISTS entries_add ON journal_entries;
CREATE POLICY entries_add ON journal_entries FOR INSERT WITH CHECK(tenant_id = app.tenant() AND app.member_of(tenant_id) AND created_by = app.actor());
DROP POLICY IF EXISTS lines_read ON journal_lines;
CREATE POLICY lines_read ON journal_lines FOR SELECT USING(tenant_id = app.tenant() AND app.member_of(tenant_id));
DROP POLICY IF EXISTS lines_add ON journal_lines;
CREATE POLICY lines_add ON journal_lines FOR INSERT WITH CHECK(tenant_id = app.tenant() AND app.member_of(tenant_id));

DROP POLICY IF EXISTS findings_read ON audit_findings;
CREATE POLICY findings_read ON audit_findings FOR SELECT USING(tenant_id = app.tenant() AND app.member_of(tenant_id));
DROP POLICY IF EXISTS findings_add ON audit_findings;
CREATE POLICY findings_add ON audit_findings FOR INSERT WITH CHECK(tenant_id = app.tenant() AND app.member_of(tenant_id) AND created_by = app.actor());
DROP POLICY IF EXISTS findings_update ON audit_findings;
CREATE POLICY findings_update ON audit_findings FOR UPDATE USING(tenant_id = app.tenant() AND app.member_of(tenant_id))
WITH CHECK(tenant_id = app.tenant() AND app.member_of(tenant_id));

DROP POLICY IF EXISTS audit_read ON audit_events;
CREATE POLICY audit_read ON audit_events FOR SELECT USING(tenant_id = app.tenant() AND app.member_of(tenant_id));
DROP POLICY IF EXISTS audit_append ON audit_events;
CREATE POLICY audit_append ON audit_events FOR INSERT WITH CHECK(tenant_id = app.tenant() AND app.member_of(tenant_id) AND actor_id = app.actor());
COMMIT;
