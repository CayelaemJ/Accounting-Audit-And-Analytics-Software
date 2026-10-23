BEGIN;
-- Founding tenant owner can add already-registered collaborators, not arbitrary tenant owners.
CREATE POLICY membership_admin_read ON memberships FOR SELECT USING
 (tenant_id=app.tenant() AND user_id<>app.actor() AND EXISTS
  (SELECT 1 FROM tenants t WHERE t.id=tenant_id AND t.created_by=app.actor()));
CREATE POLICY membership_admin_add ON memberships FOR INSERT WITH CHECK
 (tenant_id=app.tenant() AND role IN ('finance_manager','accountant','auditor','viewer')
  AND EXISTS(SELECT 1 FROM tenants t WHERE t.id=tenant_id AND t.created_by=app.actor()));
CREATE POLICY membership_admin_update ON memberships FOR UPDATE USING
 (tenant_id=app.tenant() AND role<>'owner' AND EXISTS
  (SELECT 1 FROM tenants t WHERE t.id=tenant_id AND t.created_by=app.actor()))
 WITH CHECK
 (tenant_id=app.tenant() AND role IN ('finance_manager','accountant','auditor','viewer')
  AND EXISTS(SELECT 1 FROM tenants t WHERE t.id=tenant_id AND t.created_by=app.actor()));
COMMIT;
