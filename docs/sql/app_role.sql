-- Least-privilege database role for the application.
-- Run once as the database owner (in Neon: the SQL editor), then set DATABASE_URL to connect as scp_app.
-- Migrations keep running as the owner role.
-- CREATE ROLE scp_app LOGIN PASSWORD '<generate one>';
GRANT USAGE ON SCHEMA public TO scp_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO scp_app;
REVOKE UPDATE, DELETE, TRUNCATE ON ledger_events, ledger_checkpoints, audit_logs, passport_access_logs FROM scp_app;
REVOKE ALL ON alembic_version FROM scp_app;
