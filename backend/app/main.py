from contextlib import asynccontextmanager
from app.api import (
    auth,
    users,
    agents,
    telemetry,
    admin,
    ai,
    timetable,
    scheduler,
    staff,
    dev_seed,
)
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.database import engine, Base
from app.middleware.audit import AuditLoggingMiddleware
from app.middleware.authz import AuthorizationMiddleware


@asynccontextmanager
async def lifespan(app: FastAPI):
    if settings.secret_key == "change-me-in-production":
        import logging

        logging.getLogger("uvicorn.error").warning(
            "SECRET_KEY is default; set a secure value in production (e.g. openssl rand -base64 32)"
        )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Self-heal database on startup
    from app.startup.db_fix import fix_user_roles
    from app.startup.db_seed import seed_departments

    await fix_user_roles()
    await seed_departments()

    yield
    await engine.dispose()


app = FastAPI(
    title=settings.app_name,
    description="Control Plane for the Atlas AI Command Center. Handles auth, agent registry, and telemetry.",
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# ============================================================================
# CORS MIDDLEWARE MUST BE FIRST - before any custom middleware
# This ensures preflight OPTIONS requests are handled before auth checks
# ============================================================================
_origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# Custom middleware comes AFTER CORS
app.add_middleware(AuthorizationMiddleware)
app.add_middleware(AuditLoggingMiddleware)
app.include_router(timetable.router, prefix="/api")
app.include_router(auth.router, prefix="/api")
app.include_router(users.router, prefix="/api")
app.include_router(agents.router, prefix="/api")
app.include_router(telemetry.router, prefix="/api")
app.include_router(admin.router, prefix="/api")
app.include_router(ai.router, prefix="/api")
app.include_router(scheduler.router, prefix="/api")
app.include_router(staff.router, prefix="/api")
app.include_router(dev_seed.router, prefix="/api")


@app.get("/health")
async def health():
    return {"status": "ok"}


# ============================================================================
# FALLBACK OPTIONS HANDLER - Catches any OPTIONS requests not handled by CORS
# ============================================================================
@app.options("/{full_path:path}")
async def options_handler(request: Request):
    from fastapi.responses import Response

    return Response(status_code=200)
