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
from routers import auth, accounts, clients, categories, transactions, invoices, dashboard, students


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

# Health endpoint
health = APIRouter(prefix="/api", tags=["health"])


@health.get("/")
async def root():
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


@app.on_event("startup")
async def startup():
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
    # One-shot backfill: legacy invoices predate the invoice_type field.
    await db.invoices.update_many(
        {"invoice_type": {"$exists": False}},
        {"$set": {"invoice_type": "campus_visit"}},
    )
    await seed_admin_and_backfill()


@app.on_event("shutdown")
async def shutdown():
    client.close()
