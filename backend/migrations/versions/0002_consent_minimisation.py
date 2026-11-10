"""consent records, data minimisation, unsubscribe

Revision ID: 0002
Revises: 0001
Create Date: 2026-11-10
"""
import secrets

import sqlalchemy as sa
from alembic import op

import app.models

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.add_column(sa.Column("terms_accepted_at", app.models.UTCDateTime(), nullable=True))
        batch.add_column(sa.Column("terms_version", sa.String(length=16), nullable=True))
        batch.add_column(sa.Column("age_confirmed", sa.Boolean(), nullable=False, server_default=sa.false()))
    with op.batch_alter_table("member_profiles") as batch:
        batch.drop_column("phone")  # never used: data minimisation
    with op.batch_alter_table("pilot_interest") as batch:
        batch.add_column(sa.Column("unsubscribe_token", sa.String(length=64), nullable=True))
        batch.add_column(sa.Column("unsubscribed_at", app.models.UTCDateTime(), nullable=True))
    conn = op.get_bind()
    for (row_id,) in conn.execute(sa.text("SELECT id FROM pilot_interest")).fetchall():
        conn.execute(sa.text("UPDATE pilot_interest SET unsubscribe_token = :t WHERE id = :i"),
                     {"t": secrets.token_urlsafe(32), "i": row_id})
    with op.batch_alter_table("pilot_interest") as batch:
        batch.alter_column("unsubscribe_token", existing_type=sa.String(length=64), nullable=False)
        batch.create_index("ix_pilot_interest_unsubscribe_token", ["unsubscribe_token"], unique=True)


def downgrade() -> None:
    with op.batch_alter_table("pilot_interest") as batch:
        batch.drop_index("ix_pilot_interest_unsubscribe_token")
        batch.drop_column("unsubscribed_at")
        batch.drop_column("unsubscribe_token")
    with op.batch_alter_table("member_profiles") as batch:
        batch.add_column(sa.Column("phone", sa.String(length=32), nullable=True))
    with op.batch_alter_table("users") as batch:
        batch.drop_column("age_confirmed")
        batch.drop_column("terms_version")
        batch.drop_column("terms_accepted_at")
