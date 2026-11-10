"""Relational model. Money is Decimal (NUMERIC), timestamps are UTC, public ids are UUIDs."""
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import (
    JSON, Boolean, Date, DateTime, ForeignKey, Index, Integer, Numeric, String, Text,
    TypeDecorator, UniqueConstraint, Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class UTCDateTime(TypeDecorator):
    """Always store UTC and always return timezone-aware datetimes (SQLite drops tzinfo)."""

    impl = DateTime(timezone=True)
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)


Money = Numeric(14, 2)


def pk() -> Mapped[uuid.UUID]:
    return mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)


class Timestamps:
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, onupdate=utcnow)


# ---------------------------------------------------------------- identity
class User(Base, Timestamps):
    __tablename__ = "users"
    id: Mapped[uuid.UUID] = pk()
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    full_name: Mapped[str] = mapped_column(String(160))
    # platform role: member | lender | platform_admin. Stokvel roles live on memberships.
    role: Mapped[str] = mapped_column(String(32), default="member", index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_synthetic: Mapped[bool] = mapped_column(Boolean, default=False)
    deletion_requested_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)

    profile: Mapped["MemberProfile | None"] = relationship(back_populates="user", uselist=False)
    lender_account: Mapped["LenderAccount | None"] = relationship(back_populates="user", uselist=False)


class MemberProfile(Base, Timestamps):
    __tablename__ = "member_profiles"
    id: Mapped[uuid.UUID] = pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    passport_id: Mapped[str] = mapped_column(String(24), unique=True, index=True)
    phone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    analytics_consent: Mapped[bool] = mapped_column(Boolean, default=False)
    user: Mapped[User] = relationship(back_populates="profile")


class MemberDemographics(Base):
    """Protected attributes. Stored apart from every scoring input and read only by the fairness audit."""

    __tablename__ = "member_demographics"
    id: Mapped[uuid.UUID] = pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    age_band: Mapped[str | None] = mapped_column(String(16), nullable=True)
    gender: Mapped[str | None] = mapped_column(String(24), nullable=True)
    # Synthetic-only label used to demonstrate error-rate analysis. Never present for real members.
    synthetic_archetype: Mapped[str | None] = mapped_column(String(24), nullable=True)


class LenderAccount(Base, Timestamps):
    __tablename__ = "lender_accounts"
    id: Mapped[uuid.UUID] = pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    organisation_name: Mapped[str] = mapped_column(String(160))
    is_synthetic: Mapped[bool] = mapped_column(Boolean, default=False)
    user: Mapped[User] = relationship(back_populates="lender_account")


# ---------------------------------------------------------------- stokvels
class StokvelRole(Base):
    __tablename__ = "stokvel_roles"
    name: Mapped[str] = mapped_column(String(32), primary_key=True)  # owner | treasurer | administrator | member
    description: Mapped[str] = mapped_column(String(255))
    can_manage_members: Mapped[bool] = mapped_column(Boolean, default=False)
    can_verify_contributions: Mapped[bool] = mapped_column(Boolean, default=False)
    can_assign_roles: Mapped[bool] = mapped_column(Boolean, default=False)


class Stokvel(Base, Timestamps):
    __tablename__ = "stokvels"
    id: Mapped[uuid.UUID] = pk()
    name: Mapped[str] = mapped_column(String(160))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    purpose: Mapped[str] = mapped_column(String(48), default="savings")
    frequency: Mapped[str] = mapped_column(String(16), default="monthly")  # weekly | monthly
    contribution_amount: Mapped[Decimal] = mapped_column(Money)
    currency: Mapped[str] = mapped_column(String(3), default="ZAR")
    join_code: Mapped[str] = mapped_column(String(16), unique=True, index=True)
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    is_synthetic: Mapped[bool] = mapped_column(Boolean, default=False)

    memberships: Mapped[list["StokvelMembership"]] = relationship(back_populates="stokvel")
    schedules: Mapped[list["ContributionSchedule"]] = relationship(back_populates="stokvel")


class StokvelMembership(Base, Timestamps):
    __tablename__ = "stokvel_memberships"
    __table_args__ = (UniqueConstraint("stokvel_id", "user_id", name="uq_membership"),)
    id: Mapped[uuid.UUID] = pk()
    stokvel_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("stokvels.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    role: Mapped[str] = mapped_column(ForeignKey("stokvel_roles.name"), default="member")
    status: Mapped[str] = mapped_column(String(16), default="active")  # invited | pending | active | removed
    joined_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    left_on: Mapped[date | None] = mapped_column(Date, nullable=True)

    stokvel: Mapped[Stokvel] = relationship(back_populates="memberships")
    user: Mapped[User] = relationship()


class ContributionSchedule(Base, Timestamps):
    """One row per contribution period for a stokvel."""

    __tablename__ = "contribution_schedules"
    __table_args__ = (UniqueConstraint("stokvel_id", "due_date", name="uq_schedule_due"),)
    id: Mapped[uuid.UUID] = pk()
    stokvel_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("stokvels.id", ondelete="CASCADE"), index=True)
    period_label: Mapped[str] = mapped_column(String(32))
    due_date: Mapped[date] = mapped_column(Date, index=True)
    amount: Mapped[Decimal] = mapped_column(Money)
    stokvel: Mapped[Stokvel] = relationship(back_populates="schedules")


class Contribution(Base, Timestamps):
    __tablename__ = "contributions"
    __table_args__ = (
        UniqueConstraint("member_id", "idempotency_key", name="uq_contribution_idem"),
        Index("ix_contribution_member_stokvel", "member_id", "stokvel_id"),
    )
    id: Mapped[uuid.UUID] = pk()
    stokvel_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("stokvels.id"), index=True)
    member_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    schedule_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("contribution_schedules.id"), index=True)
    amount: Mapped[Decimal] = mapped_column(Money)
    currency: Mapped[str] = mapped_column(String(3), default="ZAR")
    # pending | verified | rejected | reversed | under_review
    status: Mapped[str] = mapped_column(String(16), default="pending", index=True)
    # self_reported | manually_verified | provider_confirmed
    verification_method: Mapped[str] = mapped_column(String(24), default="self_reported")
    channel: Mapped[str] = mapped_column(String(24), default="self_reported")  # self_reported | payshap_request
    reference: Mapped[str] = mapped_column(String(64), index=True)
    idempotency_key: Mapped[str] = mapped_column(String(80))
    paid_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    verified_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    verified_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    ledger_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    review_note: Mapped[str | None] = mapped_column(Text, nullable=True)

    stokvel: Mapped[Stokvel] = relationship()
    schedule: Mapped[ContributionSchedule] = relationship()
    member: Mapped[User] = relationship(foreign_keys=[member_id])


# ---------------------------------------------------------------- payments
class PaymentRequest(Base, Timestamps):
    __tablename__ = "payment_requests"
    id: Mapped[uuid.UUID] = pk()
    contribution_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("contributions.id"), unique=True)
    provider: Mapped[str] = mapped_column(String(32))
    provider_reference: Mapped[str] = mapped_column(String(80), unique=True)
    amount: Mapped[Decimal] = mapped_column(Money)
    currency: Mapped[str] = mapped_column(String(3), default="ZAR")
    status: Mapped[str] = mapped_column(String(16), default="pending")  # pending | succeeded | failed | reversed
    test_mode: Mapped[bool] = mapped_column(Boolean, default=True)
    contribution: Mapped[Contribution] = relationship()


class PaymentProviderEvent(Base):
    __tablename__ = "payment_provider_events"
    id: Mapped[uuid.UUID] = pk()
    payment_request_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("payment_requests.id"), index=True)
    provider_event_id: Mapped[str] = mapped_column(String(80), unique=True)  # duplicate webhook protection
    event_type: Mapped[str] = mapped_column(String(32))
    payload: Mapped[dict] = mapped_column(JSON)
    received_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)


# ---------------------------------------------------------------- ledger
class LedgerEvent(Base):
    """Append-only, hash-chained. Never updated or deleted by application code."""

    __tablename__ = "ledger_events"
    seq: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False)
    event_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), unique=True, default=uuid.uuid4)
    event_type: Mapped[str] = mapped_column(String(32))  # CONTRIBUTION_VERIFIED | _REVERSED | _CORRECTED
    member_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), index=True)
    stokvel_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), index=True)
    contribution_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), index=True)
    amount: Mapped[str] = mapped_column(String(24))  # canonical decimal string, e.g. "500.00"
    currency: Mapped[str] = mapped_column(String(3))
    transaction_reference: Mapped[str] = mapped_column(String(80))
    timestamp: Mapped[str] = mapped_column(String(32))  # canonical UTC ISO-8601 string
    verification_status: Mapped[str] = mapped_column(String(24))
    previous_hash: Mapped[str] = mapped_column(String(64))
    current_hash: Mapped[str] = mapped_column(String(64), unique=True)


class LedgerCheckpoint(Base):
    """Head hash recorded at a point in time. Publish these outside the database for independent proof."""

    __tablename__ = "ledger_checkpoints"
    id: Mapped[uuid.UUID] = pk()
    seq: Mapped[int] = mapped_column(Integer)
    head_hash: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True)


# ---------------------------------------------------------------- scoring + passport
class ScoreModel(Base, Timestamps):
    __tablename__ = "score_models"
    id: Mapped[uuid.UUID] = pk()
    version: Mapped[str] = mapped_column(String(24), unique=True)
    name: Mapped[str] = mapped_column(String(80))
    config: Mapped[dict] = mapped_column(JSON)
    is_active: Mapped[bool] = mapped_column(Boolean, default=False)


class MemberScoreSnapshot(Base):
    __tablename__ = "member_score_snapshots"
    id: Mapped[uuid.UUID] = pk()
    member_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    model_version: Mapped[str] = mapped_column(String(24))
    score: Mapped[int] = mapped_column(Integer)
    provisional: Mapped[bool] = mapped_column(Boolean, default=False)
    factors: Mapped[dict] = mapped_column(JSON)
    explanation: Mapped[dict] = mapped_column(JSON)
    inputs_digest: Mapped[str] = mapped_column(String(64))
    as_of: Mapped[date] = mapped_column(Date)
    ledger_head_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    computed_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)


class PassportReport(Base):
    __tablename__ = "passport_reports"
    id: Mapped[uuid.UUID] = pk()
    member_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    snapshot_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("member_score_snapshots.id"))
    verification_code: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    summary: Mapped[dict] = mapped_column(JSON)
    generated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)


class PassportConsent(Base):
    __tablename__ = "passport_consents"
    id: Mapped[uuid.UUID] = pk()
    member_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    report_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("passport_reports.id"))
    recipient_label: Mapped[str] = mapped_column(String(160))
    scopes: Mapped[list] = mapped_column(JSON)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)  # SHA-256; the raw token is never stored
    token_hint: Mapped[str] = mapped_column(String(8))
    expires_at: Mapped[datetime] = mapped_column(UTCDateTime)
    revoked_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)


class PassportAccessLog(Base):
    __tablename__ = "passport_access_logs"
    id: Mapped[uuid.UUID] = pk()
    consent_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("passport_consents.id", ondelete="CASCADE"), index=True)
    lender_account_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("lender_accounts.id"), nullable=True)
    outcome: Mapped[str] = mapped_column(String(24))  # granted | expired | revoked
    ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    accessed_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)


# ---------------------------------------------------------------- audit
class AuditLog(Base):
    __tablename__ = "audit_logs"
    id: Mapped[uuid.UUID] = pk()
    actor_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    action: Mapped[str] = mapped_column(String(64), index=True)
    entity_type: Mapped[str | None] = mapped_column(String(48), nullable=True)
    entity_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    detail: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, index=True)


class FairnessAuditRecord(Base):
    __tablename__ = "fairness_audit_records"
    id: Mapped[uuid.UUID] = pk()
    model_version: Mapped[str] = mapped_column(String(24))
    run_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    results: Mapped[dict] = mapped_column(JSON)
    run_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)


class PilotInterest(Base):
    """Pilot programme registrations from the public site."""

    __tablename__ = "pilot_interest"
    id: Mapped[uuid.UUID] = pk()
    contact_name: Mapped[str] = mapped_column(String(160))
    email: Mapped[str] = mapped_column(String(255))
    organisation: Mapped[str] = mapped_column(String(160))
    kind: Mapped[str] = mapped_column(String(24))  # stokvel | lender | other
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    consent_to_contact: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
