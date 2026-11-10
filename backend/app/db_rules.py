"""Database rules for the ledger: the table accepts INSERT and nothing else.

Installed by migration 0003. This stops application bugs and casual edits. It does not stop a database
superuser, who is able to drop the trigger. That is why ledger checkpoints must be published externally.
"""
from sqlalchemy import text
from sqlalchemy.engine import Connection

POSTGRES = [
    """
    CREATE OR REPLACE FUNCTION scp_ledger_is_append_only() RETURNS trigger AS $$
    BEGIN
        RAISE EXCEPTION 'ledger_events is append-only: % is not allowed', TG_OP USING ERRCODE = 'integrity_constraint_violation';
    END;
    $$ LANGUAGE plpgsql
    """,
    "DROP TRIGGER IF EXISTS scp_ledger_no_update ON ledger_events",
    "CREATE TRIGGER scp_ledger_no_update BEFORE UPDATE OR DELETE ON ledger_events FOR EACH ROW EXECUTE FUNCTION scp_ledger_is_append_only()",
    "DROP TRIGGER IF EXISTS scp_ledger_no_truncate ON ledger_events",
    "CREATE TRIGGER scp_ledger_no_truncate BEFORE TRUNCATE ON ledger_events FOR EACH STATEMENT EXECUTE FUNCTION scp_ledger_is_append_only()",
]
SQLITE = [
    "DROP TRIGGER IF EXISTS scp_ledger_no_update",
    "CREATE TRIGGER scp_ledger_no_update BEFORE UPDATE ON ledger_events BEGIN SELECT RAISE(ABORT, 'ledger_events is append-only: UPDATE is not allowed'); END",
    "DROP TRIGGER IF EXISTS scp_ledger_no_delete",
    "CREATE TRIGGER scp_ledger_no_delete BEFORE DELETE ON ledger_events BEGIN SELECT RAISE(ABORT, 'ledger_events is append-only: DELETE is not allowed'); END",
]
POSTGRES_DROP = ["DROP TRIGGER IF EXISTS scp_ledger_no_update ON ledger_events", "DROP TRIGGER IF EXISTS scp_ledger_no_truncate ON ledger_events",
                 "DROP FUNCTION IF EXISTS scp_ledger_is_append_only()"]
SQLITE_DROP = ["DROP TRIGGER IF EXISTS scp_ledger_no_update", "DROP TRIGGER IF EXISTS scp_ledger_no_delete"]

# Least privilege for the application's database role. Run once as the database owner, then connect the app as scp_app.
APP_ROLE_SQL = """
-- CREATE ROLE scp_app LOGIN PASSWORD '<generate one>';
GRANT USAGE ON SCHEMA public TO scp_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO scp_app;
REVOKE UPDATE, DELETE, TRUNCATE ON ledger_events, ledger_checkpoints, audit_logs, passport_access_logs FROM scp_app;
REVOKE ALL ON alembic_version FROM scp_app;
"""


def install_ledger_guards(conn: Connection) -> None:
    for statement in (POSTGRES if conn.dialect.name == "postgresql" else SQLITE):
        conn.execute(text(statement))


def remove_ledger_guards(conn: Connection) -> None:
    for statement in (POSTGRES_DROP if conn.dialect.name == "postgresql" else SQLITE_DROP):
        conn.execute(text(statement))
