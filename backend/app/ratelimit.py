"""Small in-memory sliding-window limiter. Use a shared store such as Redis when running several instances."""
import time
from collections import defaultdict, deque

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from .config import get_settings


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app):
        super().__init__(app)
        self.hits: dict[str, deque] = defaultdict(deque)

    async def dispatch(self, request, call_next):
        s = get_settings()
        if not s.rate_limit_enabled or not request.url.path.startswith("/api/"):
            return await call_next(request)
        fwd = request.headers.get("x-forwarded-for")
        ip = fwd.split(",")[0].strip() if fwd else (request.client.host if request.client else "unknown")
        is_auth = "/auth/login" in request.url.path or "/auth/register" in request.url.path
        limit = s.auth_rate_limit_per_minute if is_auth else s.rate_limit_per_minute
        key = f"{ip}:{'auth' if is_auth else 'api'}"
        now = time.monotonic()
        q = self.hits[key]
        while q and now - q[0] > 60:
            q.popleft()
        if len(q) >= limit:
            return JSONResponse({"detail": "Too many requests. Wait a minute and try again."}, status_code=429,
                                headers={"Retry-After": "60"})
        q.append(now)
        return await call_next(request)
