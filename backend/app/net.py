"""Client address resolution.

X-Forwarded-For is written by whoever sends the request, so the left-most entry is attacker-controlled.
Only the last TRUSTED_PROXY_HOPS entries were appended by proxies we run behind, so the client address is
the entry that many hops from the right. With 0 hops the header is ignored and the socket peer is used.
"""
from starlette.requests import Request

from .config import get_settings


def client_ip(request: Request) -> str:
    peer = request.client.host if request.client else "unknown"
    hops = get_settings().trusted_proxy_hops
    if hops <= 0:
        return peer
    chain = [p.strip() for p in request.headers.get("x-forwarded-for", "").split(",") if p.strip()]
    return chain[-hops] if len(chain) >= hops else peer
