from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from . import services
from .config import get_settings
from .db import Base, SessionLocal, engine
from .check_production import production_problems
from .ratelimit import RateLimitMiddleware
from .routers import auth, ledger, members, stokvels

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    if settings.environment == "production":
        problems = production_problems(settings)
        if problems:  # refuse to serve with unsafe settings
            raise RuntimeError("Unsafe production settings: " + " ".join(problems))
    if settings.environment != "production":
        Base.metadata.create_all(engine)  # production uses Alembic migrations
    with SessionLocal() as db:
        try:
            services.ensure_reference_data(db)
        except Exception:  # tables are missing until migrations run
            db.rollback()
    yield


app = FastAPI(
    title="Stokvel Credit Passport API",
    version="1.0.0",
    description=("Member-owned contribution records, a tamper-evident ledger and consent-based sharing. "
                 "Payments run in TEST MODE. The Contribution Reliability Index is experimental and is not a credit bureau score."),
    lifespan=lifespan, docs_url="/api/docs", openapi_url="/api/openapi.json", redoc_url=None, debug=False,
)
app.add_middleware(RateLimitMiddleware)
app.add_middleware(
    CORSMiddleware, allow_origins=[o.strip() for o in settings.cors_origins.split(",") if o.strip()],
    allow_credentials=True, allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type", "Idempotency-Key"],
)


UNSAFE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
ALLOWED_ORIGINS = {o.strip().rstrip("/") for o in (settings.cors_origins + "," + settings.frontend_url).split(",") if o.strip()}
API_CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
DOCS_CSP = ("default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
            "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; img-src 'self' data: https://fastapi.tiangolo.com; "
            "frame-ancestors 'none'; base-uri 'none'")


def _reject(status: int, detail: str) -> JSONResponse:
    return JSONResponse({"detail": detail}, status_code=status)


@app.middleware("http")
async def security_layer(request: Request, call_next):
    path, method = request.url.path, request.method

    # 1. Small bodies only. The API accepts JSON and no files.
    if method in UNSAFE_METHODS:
        length = request.headers.get("content-length")
        if length is None and request.headers.get("transfer-encoding"):
            return _reject(411, "Send a Content-Length header.")
        if length and (not length.isdigit() or int(length) > settings.max_body_bytes):
            return _reject(413, "The request is too large.")

    # 2. CSRF: a browser session (cookie, no bearer token) may only change state from our own origin.
    if (method in UNSAFE_METHODS and path.startswith("/api/v1") and settings.cookie_name in request.cookies
            and not request.headers.get("authorization")):
        origin = (request.headers.get("origin") or "").rstrip("/")
        if not origin:
            referer = request.headers.get("referer") or ""
            origin = "/".join(referer.split("/")[:3])
        if origin not in ALLOWED_ORIGINS:
            return _reject(403, "This request did not come from the Stokvel Credit Passport site.")

    response = await call_next(request)
    h = response.headers
    h.setdefault("X-Content-Type-Options", "nosniff")
    h.setdefault("X-Frame-Options", "DENY")
    h.setdefault("Referrer-Policy", "no-referrer")
    h.setdefault("Cross-Origin-Opener-Policy", "same-origin")
    h.setdefault("Cross-Origin-Resource-Policy", "same-site")
    h.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()")
    h.setdefault("Content-Security-Policy", DOCS_CSP if path.startswith("/api/docs") else API_CSP)
    if settings.cookie_secure:
        h.setdefault("Strict-Transport-Security", "max-age=63072000; includeSubDomains")
    if path.startswith("/api/v1"):
        h.setdefault("Cache-Control", "no-store")
    return response


@app.exception_handler(RequestValidationError)
async def invalid_input(request: Request, exc: RequestValidationError):
    # Say what is wrong without echoing the submitted value back. Binary bodies must not crash the handler.
    errors = [{"loc": [str(p) for p in e.get("loc", ())], "msg": str(e.get("msg", "Invalid value.")), "type": str(e.get("type", ""))}
              for e in exc.errors()]
    return JSONResponse({"detail": errors}, status_code=422)


@app.exception_handler(Exception)
async def unhandled(request: Request, exc: Exception):
    # Never leak internals in an API response.
    return JSONResponse({"detail": "Something went wrong. Try again."}, status_code=500)


API = "/api/v1"
for r in (auth.router, auth.pilot_router, members.router, stokvels.router, ledger.router):
    app.include_router(r, prefix=API)


@app.get("/api/health", tags=["meta"])
def health():
    return {"status": "ok", "payment_mode": "TEST MODE" if settings.payment_test_mode else "live",
            "payment_provider": settings.payment_provider, "environment": settings.environment}
