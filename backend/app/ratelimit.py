"""Small in-memory sliding-window limiter. Use a shared store such as Redis when running several instances."""
import time
from collections import defaultdict, deque

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from .config import get_settings
from .net import client_ip

AUTH_PATHS = ("/auth/login", "/auth/register")
# Public endpoints that accept guesses or free text: tighter than the general limit.
SENSITIVE_PATHS = ("/pilot-interest", "/passport/verify/", "/passport/shared/", "/payments/webhook/")
MAX_KEYS = 50_000


HITS: dict[str, deque] = defaultdict(deque)  # process-wide, so tests are able to reset it


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app):
        super().__init__(app)
        self.hits = HITS

    def _prune(self, now: float) -> None:
        for key in [k for k, q in self.hits.items() if not q or now - q[-1] > 60]:
            del self.hits[key]

    async def dispatch(self, request, call_next):
        s = get_settings()
        path = request.url.path
        if not s.rate_limit_enabled or not path.startswith("/api/"):
            return await call_next(request)
        if any(p in path for p in AUTH_PATHS):
            bucket, limit = "auth", s.auth_rate_limit_per_minute
        elif any(p in path for p in SENSITIVE_PATHS):
            bucket, limit = "sensitive", s.sensitive_rate_limit_per_minute
        else:
            bucket, limit = "api", s.rate_limit_per_minute
        now = time.monotonic()
        if len(self.hits) > MAX_KEYS:
            self._prune(now)
        q = self.hits[f"{client_ip(request)}:{bucket}"]
        while q and now - q[0] > 60:
            q.popleft()
        if len(q) >= limit:
            return JSONResponse({"detail": "Too many requests. Wait a minute and try again."}, status_code=429,
                                headers={"Retry-After": "60"})
        q.append(now)
        return await call_next(request)
