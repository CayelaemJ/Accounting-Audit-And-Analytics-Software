BEGIN;
-- Founding tenant owner can add already-registered collaborators, not arbitrary tenant owners.
CREATE POLICY membership_admin_read ON memberships FOR SELECT USING
 (tenant_id=app.tenant() AND user_id<>app.actor() AND current_setting('app.user_role',true)='owner');
CREATE POLICY membership_admin_add ON memberships FOR INSERT WITH CHECK
 (tenant_id=app.tenant() AND role IN ('finance_manager','accountant','auditor','viewer')
  AND current_setting('app.user_role',true)='owner');
CREATE POLICY membership_admin_update ON memberships FOR UPDATE USING
 (tenant_id=app.tenant() AND role<>'owner' AND current_setting('app.user_role',true)='owner')
 WITH CHECK
 (tenant_id=app.tenant() AND role IN ('finance_manager','accountant','auditor','viewer')
  AND current_setting('app.user_role',true)='owner');
COMMIT;
