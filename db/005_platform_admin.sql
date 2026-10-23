BEGIN;
ALTER TABLE users ADD COLUMN IF NOT EXISTS username text;
ALTER TABLE users ADD CONSTRAINT users_username_format CHECK
  (username IS NULL OR (username ~ '^[a-z][a-z0-9_]{2,31}$' AND username=lower(username)));
CREATE UNIQUE INDEX IF NOT EXISTS users_username_unique ON users(username) WHERE username IS NOT NULL;
CREATE TABLE IF NOT EXISTS platform_admins (
 user_id uuid PRIMARY KEY REFERENCES users(id),
 role text NOT NULL DEFAULT 'superadmin' CHECK (role='superadmin'),
 active boolean NOT NULL DEFAULT true,
 granted_at timestamptz NOT NULL DEFAULT now()
);
-- This platform registry is deliberately not writable by the web application's DB role.
-- The application can read an explicit admin identity without bypassing tenant RLS.
COMMIT;
