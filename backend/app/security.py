import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

from .config import get_settings

ALGORITHM = "HS256"


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8")[:72], bcrypt.gensalt(rounds=get_settings().bcrypt_rounds)).decode()


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8")[:72], password_hash.encode())
    except ValueError:
        return False


def create_access_token(user_id: uuid.UUID, role: str, token_version: int = 0) -> str:
    s = get_settings()
    now = datetime.now(timezone.utc)
    return jwt.encode(
        {"sub": str(user_id), "role": role, "tv": token_version, "iat": now,
         "exp": now + timedelta(minutes=s.access_token_minutes)},
        s.secret_key, algorithm=ALGORITHM,
    )


def decode_access_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, get_settings().secret_key, algorithms=[ALGORITHM], options={"require": ["exp", "sub"]})
    except jwt.PyJWTError:
        return None


def new_share_token() -> str:
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def new_passport_id() -> str:
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    part = lambda: "".join(secrets.choice(alphabet) for _ in range(4))  # noqa: E731
    return f"SCP-{part()}-{part()}"


def new_reference(prefix: str = "SCP") -> str:
    return f"{prefix}-{secrets.token_hex(5).upper()}"
