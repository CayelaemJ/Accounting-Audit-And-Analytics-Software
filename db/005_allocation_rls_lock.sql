BEGIN;
CREATE OR REPLACE FUNCTION app.validate_allocation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE maximum numeric(20,2); allocated numeric(20,2);
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.tenant_id::text||':'||NEW.invoice_id::text,0));
 SELECT total_amount INTO maximum FROM invoices WHERE tenant_id=NEW.tenant_id AND id=NEW.invoice_id;
 IF maximum IS NULL THEN RAISE EXCEPTION 'Invoice is not visible to this tenant'; END IF;
 SELECT coalesce(sum(amount),0) INTO allocated FROM invoice_allocations
 WHERE tenant_id=NEW.tenant_id AND invoice_id=NEW.invoice_id;
 IF allocated>maximum THEN RAISE EXCEPTION 'Invoice payment exceeds remaining balance'; END IF;
 RETURN NEW;
END $$;
COMMIT;