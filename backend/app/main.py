from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from . import services
from .config import get_settings
from .db import Base, SessionLocal, engine
from .ratelimit import RateLimitMiddleware
from .routers import auth, ledger, members, stokvels

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
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
    lifespan=lifespan, docs_url="/api/docs", openapi_url="/api/openapi.json", redoc_url=None,
)
app.add_middleware(RateLimitMiddleware)
app.add_middleware(
    CORSMiddleware, allow_origins=[o.strip() for o in settings.cors_origins.split(",") if o.strip()],
    allow_credentials=True, allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type", "Idempotency-Key"],
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    if request.url.path.startswith("/api/v1"):
        response.headers.setdefault("Cache-Control", "no-store")
    return response


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
