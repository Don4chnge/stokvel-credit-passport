import uuid

from fastapi import Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import get_settings
from .db import get_db
from .models import StokvelMembership, User
from .security import decode_access_token
from .services import MANAGE_ROLES


from .net import client_ip  # noqa: E402,F401  (re-exported for routers)


def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    token = None
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        token = auth[7:].strip()
    token = token or request.cookies.get(get_settings().cookie_name)
    payload = decode_access_token(token) if token else None
    if not payload:
        raise HTTPException(401, "Sign in to continue.")
    try:
        user = db.get(User, uuid.UUID(payload["sub"]))
    except (ValueError, KeyError):
        user = None
    if not user or not user.is_active or payload.get("tv", 0) != user.token_version:
        raise HTTPException(401, "Sign in to continue.")  # signed out, locked or deactivated
    return user


def require_roles(*roles: str):
    def dep(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(403, "Your account type does not allow this action.")
        return user

    return dep


require_member = require_roles("member")
require_lender = require_roles("lender")
require_admin = require_roles("platform_admin")


def serialize_user(db: Session, user: User) -> dict:
    manages = db.execute(select(StokvelMembership.stokvel_id).where(
        StokvelMembership.user_id == user.id, StokvelMembership.status == "active",
        StokvelMembership.role.in_(MANAGE_ROLES))).scalars().all()
    return {
        "id": str(user.id), "email": user.email, "full_name": user.full_name, "role": user.role,
        "is_synthetic": user.is_synthetic,
        "passport_id": user.profile.passport_id if user.profile else None,
        "analytics_consent": user.profile.analytics_consent if user.profile else False,
        "organisation_name": user.lender_account.organisation_name if user.lender_account else None,
        "manages_stokvels": [str(i) for i in manages],
        "deletion_requested_at": user.deletion_requested_at.isoformat() if user.deletion_requested_at else None,
        "terms_version": user.terms_version,
    }


def parse_uuid(value: str) -> uuid.UUID:
    try:
        return uuid.UUID(value)
    except ValueError:
        raise HTTPException(404, "Not found.")
