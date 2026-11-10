from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import services
from ..config import get_settings
from ..db import get_db
from ..deps import client_ip, get_current_user, serialize_user
from ..models import LenderAccount, PilotInterest, User, utcnow
from ..schemas import LoginIn, PilotIn, RegisterIn
from ..security import create_access_token, hash_password, new_share_token, verify_password

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
                age_confirmed=True)
    db.add(user)
    db.flush()
    if body.account_type == "member":
        services.ensure_profile(db, user)
    else:
        db.add(LenderAccount(user_id=user.id, organisation_name=body.organisation_name.strip()))
    services.audit(db, user, "user.registered", "user", user.id, {"role": user.role}, client_ip(request))
    db.commit()
    db.refresh(user)
    token = create_access_token(user.id, user.role)
    _set_cookie(response, token)
    return {"access_token": token, "token_type": "bearer", "user": serialize_user(db, user)}


@router.post("/login")
def login(body: LoginIn, request: Request, response: Response, db: Session = Depends(get_db)):
    user = db.execute(select(User).where(User.email == body.email.lower())).scalar_one_or_none()
    ok = verify_password(body.password, user.password_hash if user else _DUMMY_HASH)
    if not user or not ok or not user.is_active:
        services.audit(db, None, "user.login_failed", "user", None, None, client_ip(request))
        db.commit()
        raise HTTPException(401, "Email or password is incorrect.")
    services.audit(db, user, "user.login", "user", user.id, None, client_ip(request))
    db.commit()
    token = create_access_token(user.id, user.role)
    _set_cookie(response, token)
    return {"access_token": token, "token_type": "bearer", "user": serialize_user(db, user)}


@router.post("/logout", status_code=204)
def logout(response: Response):
    response.delete_cookie(get_settings().cookie_name, path="/")


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
