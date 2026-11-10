from decimal import Decimal
from typing import Literal

import re
from typing import Annotated

from pydantic import AfterValidator, BaseModel, Field, field_validator

_EMAIL = re.compile(r"^[A-Za-z0-9._%+\-]+@[A-Za-z0-9\-]+(\.[A-Za-z0-9\-]+)+$")


def _email(v: str) -> str:
    v = v.strip()
    if len(v) > 254 or not _EMAIL.match(v):
        raise ValueError("Enter a valid email address.")
    return v.lower()


# Syntax check only. Reserved demo domains such as .example stay usable. Deliverability is not checked.
EmailStr = Annotated[str, AfterValidator(_email)]


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=10, max_length=128)
    full_name: str = Field(min_length=2, max_length=160)
    account_type: Literal["member", "lender"] = "member"
    organisation_name: str | None = Field(default=None, max_length=160)
    accept_terms: bool = Field(default=False, validate_default=True)
    confirm_adult: bool = Field(default=False, validate_default=True)

    @field_validator("accept_terms")
    @classmethod
    def terms(cls, v: bool) -> bool:
        if not v:
            raise ValueError("Accept the terms of service and privacy policy to create an account.")
        return v

    @field_validator("confirm_adult")
    @classmethod
    def adult(cls, v: bool) -> bool:
        if not v:
            raise ValueError("You must be 18 or older to use this service.")
        return v

    @field_validator("password")
    @classmethod
    def strong(cls, v: str) -> str:
        if v.isalpha() or v.isdigit():
            raise ValueError("Use at least 10 characters with letters and numbers.")
        return v


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class StokvelIn(BaseModel):
    name: str = Field(min_length=3, max_length=160)
    description: str | None = Field(default=None, max_length=600)
    purpose: Literal["savings", "groceries", "burial", "investment", "property"] = "savings"
    frequency: Literal["weekly", "monthly"] = "monthly"
    contribution_amount: Decimal = Field(gt=0, le=Decimal("100000"), decimal_places=2)


class JoinIn(BaseModel):
    join_code: str = Field(min_length=4, max_length=16)


class InviteIn(BaseModel):
    email: EmailStr


class RoleIn(BaseModel):
    role: Literal["owner", "treasurer", "administrator", "member"]


class ContributionIn(BaseModel):
    stokvel_id: str
    schedule_id: str
    channel: Literal["self_reported", "payshap_request"] = "self_reported"
    reference: str | None = Field(default=None, max_length=64, pattern=r"^[A-Za-z0-9 ._/\-]*$")


class NoteIn(BaseModel):
    note: str | None = Field(default=None, max_length=500)


class DisputeIn(BaseModel):
    note: str = Field(min_length=5, max_length=500)


class SimulateIn(BaseModel):
    outcome: Literal["success", "fail", "reverse"]


class ShareIn(BaseModel):
    scopes: list[str] = Field(min_length=1, max_length=5)
    expires_in_days: int = Field(default=7, ge=1, le=90)
    recipient_label: str = Field(min_length=2, max_length=160)


class TamperIn(BaseModel):
    target_seq: int | None = Field(default=None, ge=1)
    new_amount: Decimal = Field(default=Decimal("5000.00"), gt=0, le=Decimal("1000000"))


class ConsentIn(BaseModel):
    analytics_consent: bool


class PilotIn(BaseModel):
    contact_name: str = Field(min_length=2, max_length=160)
    email: EmailStr
    organisation: str = Field(min_length=2, max_length=160)
    kind: Literal["stokvel", "lender", "other"]
    message: str | None = Field(default=None, max_length=1000)
    consent_to_contact: bool

    @field_validator("consent_to_contact")
    @classmethod
    def must_consent(cls, v: bool) -> bool:
        if not v:
            raise ValueError("Tick the consent box so the team is allowed to contact you.")
        return v
