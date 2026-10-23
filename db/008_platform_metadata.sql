BEGIN;
-- Read-only platform metadata is deliberately separate from customer financial ledger RLS.
CREATE OR REPLACE FUNCTION app.is_platform_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER AS $$
 SELECT EXISTS(SELECT 1 FROM platform_admins
  WHERE user_id=app.actor() AND active=true AND role='superadmin')
$$;
CREATE POLICY platform_tenants_read ON tenants FOR SELECT USING(app.is_platform_admin());
CREATE POLICY platform_memberships_read ON memberships FOR SELECT USING(app.is_platform_admin());
COMMIT;
