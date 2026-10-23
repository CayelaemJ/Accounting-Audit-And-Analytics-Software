BEGIN;
-- Audit events are append-only even if an operational account later gains UPDATE/DELETE grants.
CREATE TRIGGER protect_audit_events
 BEFORE UPDATE OR DELETE ON audit_events
 FOR EACH ROW EXECUTE FUNCTION app.prevent_ledger_mutation();
CREATE INDEX IF NOT EXISTS audit_events_tenant_cursor_idx ON audit_events(tenant_id,id DESC);
COMMIT;