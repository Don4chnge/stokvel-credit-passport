"""session revocation, sign-in throttle, append-only ledger rule

Revision ID: 0003
Revises: 0002
Create Date: 2026-11-10
"""
import sqlalchemy as sa
from alembic import op

import app.models
from app.db_rules import install_ledger_guards, remove_ledger_guards

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.add_column(sa.Column("token_version", sa.Integer(), nullable=False, server_default="0"))
    op.create_table(
        "login_throttle",
        sa.Column("email_hash", sa.String(length=64), primary_key=True),
        sa.Column("failures", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("locked_until", app.models.UTCDateTime(), nullable=True),
        sa.Column("updated_at", app.models.UTCDateTime(), nullable=False),
    )
    install_ledger_guards(op.get_bind())


def downgrade() -> None:
    remove_ledger_guards(op.get_bind())
    op.drop_table("login_throttle")
    with op.batch_alter_table("users") as batch:
        batch.drop_column("token_version")
