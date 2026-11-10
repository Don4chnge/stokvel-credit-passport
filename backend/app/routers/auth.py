import hashlib
import uuid
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import services
from ..config import get_settings
from ..db import get_db
from ..deps import client_ip, get_current_user, serialize_user
from ..models import LenderAccount, LoginThrottle, PilotInterest, User, utcnow
from ..schemas import LoginIn, PilotIn, RegisterIn
from ..security import create_access_token, decode_access_token, hash_password, new_share_token, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])

# A constant-time dummy check keeps unknown-email and wrong-password responses alike.
_DUMMY_HASH = hash_password("not-a-real-password-0")


def _set_cookie(response: Response, token: str) -> None:
    s = get_settings()
    response.set_cookie(s.cookie_name, token, httponly=True, secure=s.cookie_secure, samesite="lax",
                        max_age=s.access_token_minutes * 60, path="/")


@router.post("/register", status_code=201)
def register(body: RegisterIn, request: Request, response: Response, db: Session = Depends(get_db)):
    email = body.email.lower()
    if db.execute(select(User).where(User.email == email)).scalar_one_or_none():
        raise HTTPException(409, "An account with this email already exists.")
    if body.account_type == "lender" and not body.organisation_name:
        raise HTTPException(422, "Lender accounts need an organisation name.")
    user = User(email=email, password_hash=hash_password(body.password), full_name=body.full_name.strip(),
                role=body.account_type, terms_accepted_at=utcnow(), terms_version=get_settings().terms_version,
                age_confirmed=True, token_version=0)
    db.add(user)
    db.flush()
    if body.account_type == "member":
        services.ensure_profile(db, user)
    else:
        db.add(LenderAccount(user_id=user.id, organisation_name=body.organisation_name.strip()))
    services.audit(db, user, "user.registered", "user", user.id, {"role": user.role}, client_ip(request))
    db.commit()
    db.refresh(user)
    token = create_access_token(user.id, user.role, user.token_version)
    _set_cookie(response, token)
    return {"access_token": token, "token_type": "bearer", "user": serialize_user(db, user)}


def _throttle(db: Session, email: str) -> LoginThrottle:
    key = hashlib.sha256(email.encode()).hexdigest()
    row = db.get(LoginThrottle, key)
    if not row:
        row = LoginThrottle(email_hash=key, failures=0)
        db.add(row)
    return row


@router.post("/login")
def login(body: LoginIn, request: Request, response: Response, db: Session = Depends(get_db)):
    s = get_settings()
    email = body.email.lower()
    throttle = _throttle(db, email)
    now = utcnow()
    if throttle.locked_until and throttle.locked_until > now:
        services.audit(db, None, "user.login_blocked", "user", None, None, client_ip(request))
        db.commit()
        raise HTTPException(429, f"Too many failed attempts. Try again in {s.login_lock_minutes} minutes.",
                            headers={"Retry-After": str(s.login_lock_minutes * 60)})
    user = db.execute(select(User).where(User.email == email)).scalar_one_or_none()
    ok = verify_password(body.password, user.password_hash if user else _DUMMY_HASH)
    if not user or not ok or not user.is_active:
        throttle.failures = (throttle.failures or 0) + 1
        if throttle.failures >= s.login_max_failures:
            throttle.locked_until, throttle.failures = now + timedelta(minutes=s.login_lock_minutes), 0
            if user:
                user.token_version += 1  # a locked account also loses its open sessions
        services.audit(db, None, "user.login_failed", "user", None, None, client_ip(request))
        db.commit()
        raise HTTPException(401, "Email or password is incorrect.")
    throttle.failures, throttle.locked_until = 0, None
    services.audit(db, user, "user.login", "user", user.id, None, client_ip(request))
    db.commit()
    token = create_access_token(user.id, user.role, user.token_version)
    _set_cookie(response, token)
    return {"access_token": token, "token_type": "bearer", "user": serialize_user(db, user)}


@router.post("/logout", status_code=204)
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    """Signs out everywhere: every token issued before now stops working, not only this browser's cookie."""
    s = get_settings()
    auth = request.headers.get("authorization", "")
    token = auth[7:].strip() if auth.lower().startswith("bearer ") else request.cookies.get(s.cookie_name)
    payload = decode_access_token(token) if token else None
    if payload:
        try:
            user = db.get(User, uuid.UUID(payload["sub"]))
        except (ValueError, KeyError):
            user = None
        if user and payload.get("tv", 0) == user.token_version:
            user.token_version += 1
            services.audit(db, user, "user.logout", "user", user.id, None, client_ip(request))
            db.commit()
    response.delete_cookie(s.cookie_name, path="/")


@router.get("/me")
def me(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return serialize_user(db, user)


pilot_router = APIRouter(tags=["pilot"])


@pilot_router.post("/pilot-interest", status_code=201)
def pilot_interest(body: PilotIn, request: Request, db: Session = Depends(get_db)):
    db.add(PilotInterest(**body.model_dump(), unsubscribe_token=new_share_token()))
    services.audit(db, None, "pilot.interest_registered", None, None, {"kind": body.kind}, client_ip(request))
    db.commit()
    return {"status": "received"}


@pilot_router.post("/pilot-interest/unsubscribe/{token}")
def pilot_unsubscribe(token: str, db: Session = Depends(get_db)):
    """One-step opt-out. Every message sent to a pilot contact must carry a link to this."""
    row = db.execute(select(PilotInterest).where(PilotInterest.unsubscribe_token == token[:64])).scalar_one_or_none()
    if row and not row.unsubscribed_at:
        row.unsubscribed_at = utcnow()
        row.consent_to_contact = False
        services.audit(db, None, "pilot.unsubscribed")
        db.commit()
    # The same answer for known and unknown tokens, so the link reveals nothing.
    return {"status": "unsubscribed"}
