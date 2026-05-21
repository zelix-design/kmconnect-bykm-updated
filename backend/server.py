"""FinFlow API entrypoint. Routers live in routers/."""
from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import logging
from fastapi import FastAPI, APIRouter
from starlette.middleware.cors import CORSMiddleware

from db import client, db
from seed import seed_admin_and_backfill
from routers import auth, accounts, clients, categories, transactions, invoices, dashboard, students, users, expense_requests, notifications, applications, colleges


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
app.include_router(colleges.router)
app.include_router(colleges.public_router)

# Health endpoint
health = APIRouter(prefix="/api", tags=["health"])


@health.get("/")
async def root() -> dict[str, str]:
    return {"service": "FinFlow", "status": "ok"}


app.include_router(health)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origin_regex=".*",
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


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
    await db.colleges.create_index("name_lower", unique=True)
    await _ensure_login_attempts_index()
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


@app.on_event("shutdown")
async def shutdown() -> None:
    client.close()
