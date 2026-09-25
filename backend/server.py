"""FinFlow API entrypoint. Routers live in routers/."""
from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import logging
import os
import asyncio
import re
import subprocess
import time
from datetime import datetime, timezone

from fastapi import FastAPI, APIRouter
from starlette.middleware.cors import CORSMiddleware

from db import client, db
from seed import seed_admin_and_backfill
from routers import auth, accounts, clients, categories, transactions, invoices, dashboard, students, users, expense_requests, notifications, applications, colleges, push, messages, leads, leave, uploads, staff, campaigns, admission_revenue, activity, webauthn, google_sheets, attendance, meta, academic


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


app = FastAPI(title="FinFlow API")

# Mount all feature routers (each already includes the /api prefix).
app.include_router(auth.router)
app.include_router(accounts.router)
app.include_router(clients.router)
app.include_router(categories.router)
app.include_router(transactions.router)
app.include_router(invoices.router)
app.include_router(dashboard.router)
app.include_router(students.router)
app.include_router(users.router)
app.include_router(expense_requests.router)
app.include_router(notifications.router)
app.include_router(applications.router)
app.include_router(applications.admin_router)
app.include_router(colleges.router)
app.include_router(colleges.public_router)
app.include_router(push.router)
app.include_router(messages.router)
app.include_router(leads.router)
app.include_router(leave.router)
app.include_router(uploads.router)
app.include_router(staff.router)
app.include_router(campaigns.router)
app.include_router(admission_revenue.router)
app.include_router(activity.router)
app.include_router(webauthn.router)
app.include_router(google_sheets.router)
app.include_router(google_sheets.oauth_router)
app.include_router(attendance.router)
app.include_router(meta.router)
app.include_router(academic.router)

# Health endpoint
health = APIRouter(prefix="/api", tags=["health"])


@health.get("/")
async def root() -> dict[str, str]:
    return {"service": "FinFlow", "status": "ok"}


# Resolve the commit SHA once at import time. Prefer the env var Emergent sets
# at deploy-time; fall back to `git rev-parse` for local/dev runs.
def _resolve_commit() -> str:
    sha = os.environ.get("GIT_COMMIT_SHA") or os.environ.get("COMMIT_SHA")
    if sha:
        return sha[:12]
    try:
        out = subprocess.check_output(
            ["git", "rev-parse", "--short=12", "HEAD"],
            cwd=ROOT_DIR.parent, stderr=subprocess.DEVNULL, timeout=2,
        )
        return out.decode().strip() or "unknown"
    except Exception:
        return "unknown"


COMMIT_SHA = _resolve_commit()
BOOTED_AT = datetime.now(timezone.utc).isoformat()


@health.get("/healthz")
async def healthz() -> dict:
    """Liveness + DB connectivity probe for Emergent uptime checks."""
    started = time.perf_counter()
    db_ok = False
    db_error: str | None = None
    try:
        await db.command("ping")
        db_ok = True
    except Exception as exc:  # narrow: any driver/network failure is "degraded"
        db_error = str(exc)
    latency_ms = round((time.perf_counter() - started) * 1000, 2)
    return {
        "service": "FinFlow",
        "status": "ok" if db_ok else "degraded",
        "db": {"connected": db_ok, "latency_ms": latency_ms, "error": db_error},
        "commit": COMMIT_SHA,
        "booted_at": BOOTED_AT,
        "checked_at": datetime.now(timezone.utc).isoformat(),
    }


app.include_router(health)

# CORS — strict allow-list (SEC-001).
# We combine an explicit ``allow_origins`` list (non-browser Capacitor/Ionic
# schemes + optional extras from the ``CORS_ORIGINS`` env var) with an
# ``allow_origin_regex`` that matches only the domains we actually serve:
#   • *.preview.emergentagent.com   — Emergent preview builds
#   • *.emergent.host               — Emergent deployed apps
#   • *.kmfoundation.co / .co.in / .online   — production FinFlow domains
#   • localhost / 127.0.0.1 (any port)       — local dev
# Using ``.*`` here with ``allow_credentials=True`` would let ANY site issue
# authenticated cross-origin requests and steal user data.
_extra_origins = [
    o.strip() for o in (os.environ.get("CORS_ORIGINS") or "").split(",")
    if o.strip() and o.strip() != "*"
]
_static_origins = [
    "capacitor://localhost",
    "http://localhost",
    "https://localhost",
    "ionic://localhost",
    *_extra_origins,
]
_ALLOW_ORIGIN_REGEX = (
    r"(?i)^https?://("
    r"localhost(:\d+)?|"
    r"127\.0\.0\.1(:\d+)?|"
    r"([a-z0-9-]+\.)*emergentagent\.com|"
    r"([a-z0-9-]+\.)*emergent\.host|"
    r"([a-z0-9-]+\.)*kmfoundation\.co|"
    r"([a-z0-9-]+\.)*kmfoundation\.co\.in|"
    r"([a-z0-9-]+\.)*kmfoundation\.online|"
    r"([a-z0-9-]+\.)*kmconnect\.co|"
    r"([a-z0-9-]+\.)*kmconnect\.co\.in|"
    r"([a-z0-9-]+\.)*kmconnect\.in|"
    r"([a-z0-9-]+\.)*kmconnect\.online"
    r")$"
)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=_static_origins,
    allow_origin_regex=_ALLOW_ORIGIN_REGEX,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
    max_age=600,  # cache preflights for 10 min → far fewer OPTIONS on flaky mobile networks
)


# Diagnostic: log any request whose Origin was blocked by CORS so we notice
# unknown-domain deployments quickly (production login-outage class of bugs).
# Cheap check — we run the same regex Starlette used and only fire on
# preflight OPTIONS to keep logs tidy.
_cors_regex = re.compile(_ALLOW_ORIGIN_REGEX)


@app.middleware("http")
async def _log_blocked_cors(request, call_next):
    origin = request.headers.get("origin")
    if origin and request.method == "OPTIONS" and not _cors_regex.match(origin) and origin not in _static_origins:
        logger.warning(
            "[cors] blocked OPTIONS origin=%s path=%s — add it to CORS regex if legitimate",
            origin, request.url.path,
        )
    return await call_next(request)


async def _ensure_login_attempts_index() -> None:
    """Build the unique index on login_attempts.email, deduping legacy rows
    that would otherwise block creation."""
    try:
        await db.login_attempts.create_index("email", unique=True)
        return
    except Exception:
        # If duplicates exist from older runs, dedupe + retry once.
        seen: set[str | None] = set()
        async for d in db.login_attempts.find({}, {"_id": 1, "email": 1}):
            email = d.get("email")
            if email in seen:
                await db.login_attempts.delete_one({"_id": d["_id"]})
            else:
                seen.add(email)
        await db.login_attempts.create_index("email", unique=True)


@app.on_event("startup")
async def startup() -> None:
    await db.users.create_index("email", unique=True)
    await db.accounts.create_index("user_id")
    await db.clients.create_index("user_id")
    await db.categories.create_index("user_id")
    await db.transactions.create_index([("user_id", 1), ("date", -1)])
    await db.transactions.create_index("linked_invoice_id")
    await db.invoices.create_index("user_id")
    await db.invoices.create_index("linked_visit_invoice_id")
    await db.students.create_index("user_id")
    # Transactions linked to student payments
    await db.transactions.create_index("linked_student_payment_id")
    await db.transactions.create_index("linked_student_id")
    await db.transactions.create_index("linked_expense_request_id")
    await db.expense_requests.create_index([("requested_by_user_id", 1), ("created_at", -1)])
    await db.expense_requests.create_index("status")
    await db.notifications.create_index([("recipient_user_id", 1), ("created_at", -1)])
    await db.notifications.create_index([("recipient_user_id", 1), ("read", 1)])
    await db.messages.create_index([("recipient_ids", 1), ("created_at", -1)])
    await db.messages.create_index([("sender_id", 1), ("created_at", -1)])
    await db.messages.create_index("thread_id")
    await db.colleges.create_index("name_lower", unique=True)
    await db.password_reset_tokens.create_index("token_hash", unique=True)
    await db.password_reset_tokens.create_index("expires_at", expireAfterSeconds=0)
    await db.leads.create_index("office")
    await db.leads.create_index("assigned_to_user_id")
    await db.leads.create_index("campaign_id")
    await db.campaigns.create_index([("office", 1), ("created_at", -1)])
    await db.leads.create_index([("status", 1), ("next_follow_up", 1)])
    await db.leads.create_index([("created_at", -1)])
    await db.students.create_index("referrer_user_id")
    await db.leave_requests.create_index([("requester_user_id", 1), ("created_at", -1)])
    await db.leave_requests.create_index([("requester_role", 1), ("office", 1), ("status", 1)])
    await _ensure_login_attempts_index()
    # Rate-limit collection TTL index (SEC-003).
    try:
        from lib.rate_limit import ensure_indexes as _rl_indexes
        await _rl_indexes()
    except Exception:
        logger.exception("[rate_limit] index setup failed")
    # Activity log TTL + query indexes (30-day retention).
    try:
        from lib.activity_log import ensure_indexes as _al_indexes
        await _al_indexes()
    except Exception:
        logger.exception("[activity_log] index setup failed")
    # One-shot backfill: legacy invoices predate the invoice_type field.
    await db.invoices.update_many(
        {"invoice_type": {"$exists": False}},
        {"$set": {"invoice_type": "campus_visit"}},
    )
    # One-shot scrub: drop ephemeral TestAgent demo rows left from earlier QA runs.
    await db.students.update_many(
        {},
        {"$pull": {"payments": {"received_in.name": "TestAgent"}}},
    )
    await seed_admin_and_backfill()
    # Initialise object storage (profile photo uploads) — non-fatal if it fails.
    try:
        from lib.storage import init_storage
        init_storage()
        logger.info("[storage] initialised")
    except Exception:
        logger.exception("[storage] init failed — uploads will retry on first use")
    # Background sweep: remind assignees of due lead follow-ups every 10 min.
    asyncio.create_task(_followup_sweep_loop())
    # Background sweep: auto-import new rows from synced Google Sheets.
    asyncio.create_task(_sheet_sync_loop())
    # Background sweep: ping admins about staff not checked in by 10:30 IST.
    asyncio.create_task(_late_alert_loop())


async def _late_alert_loop() -> None:
    await asyncio.sleep(60)
    while True:
        try:
            await attendance.sweep_late_checkins()
        except Exception:
            logger.exception("[attendance] late-alert sweep failed")
        await asyncio.sleep(900)


async def _sheet_sync_loop() -> None:
    # First pass shortly after boot, then every 30 min; each sync respects its
    # own interval_hours (default 6h) so this tick is just a cheap due-check.
    await asyncio.sleep(120)
    while True:
        try:
            await google_sheets.sweep_due_syncs()
        except Exception:
            logger.exception("[google-sync] sweep failed")
        await asyncio.sleep(1800)


async def _followup_sweep_loop() -> None:
    while True:
        try:
            await leads.sweep_due_followups()
        except Exception:
            logger.exception("[leads] follow-up sweep failed")
        await asyncio.sleep(600)


@app.on_event("shutdown")
async def shutdown() -> None:
    client.close()
