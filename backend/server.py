from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import uuid
import logging
import bcrypt
import jwt
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Literal

from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Response
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr, ConfigDict


# ---------- Config ----------
mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

JWT_ALGORITHM = "HS256"

app = FastAPI(title="FinFlow API")
api = APIRouter(prefix="/api")


# ---------- Helpers ----------
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def get_jwt_secret() -> str:
    return os.environ["JWT_SECRET"]


def create_access_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
        "type": "access",
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def gen_id() -> str:
    return str(uuid.uuid4())


async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


def set_auth_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        secure=False,
        samesite="lax",
        max_age=60 * 60 * 24 * 7,
        path="/",
    )


# ---------- Models ----------
class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: str
    business_name: Optional[str] = None


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: str
    email: str
    name: str
    business_name: Optional[str] = None
    currency: str = "USD"
    role: str = "user"
    created_at: str


class SettingsUpdate(BaseModel):
    name: Optional[str] = None
    business_name: Optional[str] = None
    currency: Optional[Literal["USD", "INR"]] = None


# Accounts
class AccountIn(BaseModel):
    name: str
    type: Literal["bank", "cash", "credit_card"]
    opening_balance: float = 0.0
    color: Optional[str] = "#10b981"


class Account(AccountIn):
    id: str
    user_id: str
    created_at: str


# Clients
class ClientIn(BaseModel):
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    company: Optional[str] = None
    address: Optional[str] = None


class Client(ClientIn):
    id: str
    user_id: str
    created_at: str


# Categories
class CategoryIn(BaseModel):
    name: str
    type: Literal["income", "expense"]
    color: Optional[str] = "#78716c"
    icon: Optional[str] = "Tag"


class Category(CategoryIn):
    id: str
    user_id: str
    created_at: str


# Transactions
class TransactionIn(BaseModel):
    type: Literal["income", "expense"]
    amount: float
    account_id: str
    category_id: Optional[str] = None
    date: str  # ISO date
    description: Optional[str] = ""
    client_id: Optional[str] = None


class Transaction(TransactionIn):
    id: str
    user_id: str
    created_at: str


# Invoices
class InvoiceItem(BaseModel):
    description: str
    quantity: float = 1.0
    unit_price: float = 0.0


class InvoiceIn(BaseModel):
    client_id: str
    invoice_number: str
    issue_date: str
    due_date: str
    items: List[InvoiceItem]
    tax_rate: float = 0.0
    notes: Optional[str] = ""
    status: Literal["draft", "sent", "paid", "overdue"] = "draft"


class Invoice(InvoiceIn):
    id: str
    user_id: str
    subtotal: float
    tax_amount: float
    total: float
    created_at: str


# ---------- Auth Routes ----------
DEFAULT_CATEGORIES = [
    {"name": "Sales", "type": "income", "color": "#059669", "icon": "TrendUp"},
    {"name": "Services", "type": "income", "color": "#10b981", "icon": "Briefcase"},
    {"name": "Other Income", "type": "income", "color": "#34d399", "icon": "Coins"},
    {"name": "Rent", "type": "expense", "color": "#be123c", "icon": "House"},
    {"name": "Utilities", "type": "expense", "color": "#dc2626", "icon": "Lightning"},
    {"name": "Salaries", "type": "expense", "color": "#9f1239", "icon": "Users"},
    {"name": "Office Supplies", "type": "expense", "color": "#a16207", "icon": "Package"},
    {"name": "Marketing", "type": "expense", "color": "#7c2d12", "icon": "Megaphone"},
    {"name": "Travel", "type": "expense", "color": "#92400e", "icon": "Airplane"},
    {"name": "Software", "type": "expense", "color": "#525252", "icon": "Cpu"},
]


async def seed_user_defaults(user_id: str) -> None:
    cats = [
        {"id": gen_id(), "user_id": user_id, "created_at": now_iso(), **c}
        for c in DEFAULT_CATEGORIES
    ]
    await db.categories.insert_many(cats)
    await db.accounts.insert_one({
        "id": gen_id(),
        "user_id": user_id,
        "name": "Main Bank",
        "type": "bank",
        "opening_balance": 0.0,
        "color": "#10b981",
        "created_at": now_iso(),
    })


@api.post("/auth/register", response_model=UserOut)
async def register(payload: RegisterIn, response: Response):
    email = payload.email.lower().strip()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already registered")
    user_id = gen_id()
    doc = {
        "id": user_id,
        "email": email,
        "name": payload.name,
        "business_name": payload.business_name,
        "password_hash": hash_password(payload.password),
        "currency": "USD",
        "role": "user",
        "created_at": now_iso(),
    }
    await db.users.insert_one(doc)
    await seed_user_defaults(user_id)
    token = create_access_token(user_id, email)
    set_auth_cookie(response, token)
    doc.pop("password_hash", None)
    doc.pop("_id", None)
    return doc


@api.post("/auth/login", response_model=UserOut)
async def login(payload: LoginIn, response: Response):
    email = payload.email.lower().strip()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_access_token(user["id"], email)
    set_auth_cookie(response, token)
    user.pop("password_hash", None)
    user.pop("_id", None)
    return user


@api.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    return {"ok": True}


@api.get("/auth/me", response_model=UserOut)
async def me(user: dict = Depends(get_current_user)):
    return user


@api.patch("/auth/me", response_model=UserOut)
async def update_settings(payload: SettingsUpdate, user: dict = Depends(get_current_user)):
    update = {k: v for k, v in payload.model_dump(exclude_none=True).items()}
    if update:
        await db.users.update_one({"id": user["id"]}, {"$set": update})
    fresh = await db.users.find_one({"id": user["id"]}, {"_id": 0, "password_hash": 0})
    return fresh


# ---------- Accounts ----------
@api.get("/accounts")
async def list_accounts(user: dict = Depends(get_current_user)):
    accounts = await db.accounts.find({"user_id": user["id"]}, {"_id": 0}).to_list(500)
    # Compute current balances
    for a in accounts:
        agg = await db.transactions.aggregate([
            {"$match": {"user_id": user["id"], "account_id": a["id"]}},
            {"$group": {
                "_id": "$type",
                "total": {"$sum": "$amount"},
            }},
        ]).to_list(10)
        income = sum(x["total"] for x in agg if x["_id"] == "income")
        expense = sum(x["total"] for x in agg if x["_id"] == "expense")
        a["current_balance"] = round(a.get("opening_balance", 0) + income - expense, 2)
    return accounts


@api.post("/accounts")
async def create_account(payload: AccountIn, user: dict = Depends(get_current_user)):
    doc = {
        "id": gen_id(),
        "user_id": user["id"],
        "created_at": now_iso(),
        **payload.model_dump(),
    }
    await db.accounts.insert_one(doc)
    doc.pop("_id", None)
    doc["current_balance"] = doc["opening_balance"]
    return doc


@api.patch("/accounts/{account_id}")
async def update_account(account_id: str, payload: AccountIn, user: dict = Depends(get_current_user)):
    res = await db.accounts.update_one(
        {"id": account_id, "user_id": user["id"]},
        {"$set": payload.model_dump()},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Account not found")
    fresh = await db.accounts.find_one({"id": account_id}, {"_id": 0})
    return fresh


@api.delete("/accounts/{account_id}")
async def delete_account(account_id: str, user: dict = Depends(get_current_user)):
    res = await db.accounts.delete_one({"id": account_id, "user_id": user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(404, "Account not found")
    return {"ok": True}


# ---------- Clients ----------
@api.get("/clients")
async def list_clients(user: dict = Depends(get_current_user)):
    return await db.clients.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(1000)


@api.post("/clients")
async def create_client(payload: ClientIn, user: dict = Depends(get_current_user)):
    doc = {"id": gen_id(), "user_id": user["id"], "created_at": now_iso(), **payload.model_dump()}
    await db.clients.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.patch("/clients/{client_id}")
async def update_client(client_id: str, payload: ClientIn, user: dict = Depends(get_current_user)):
    res = await db.clients.update_one(
        {"id": client_id, "user_id": user["id"]},
        {"$set": payload.model_dump()},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Client not found")
    return await db.clients.find_one({"id": client_id}, {"_id": 0})


@api.delete("/clients/{client_id}")
async def delete_client(client_id: str, user: dict = Depends(get_current_user)):
    res = await db.clients.delete_one({"id": client_id, "user_id": user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(404, "Client not found")
    return {"ok": True}


# ---------- Categories ----------
@api.get("/categories")
async def list_categories(user: dict = Depends(get_current_user)):
    return await db.categories.find({"user_id": user["id"]}, {"_id": 0}).to_list(500)


@api.post("/categories")
async def create_category(payload: CategoryIn, user: dict = Depends(get_current_user)):
    doc = {"id": gen_id(), "user_id": user["id"], "created_at": now_iso(), **payload.model_dump()}
    await db.categories.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.patch("/categories/{category_id}")
async def update_category(category_id: str, payload: CategoryIn, user: dict = Depends(get_current_user)):
    res = await db.categories.update_one(
        {"id": category_id, "user_id": user["id"]},
        {"$set": payload.model_dump()},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Category not found")
    return await db.categories.find_one({"id": category_id}, {"_id": 0})


@api.delete("/categories/{category_id}")
async def delete_category(category_id: str, user: dict = Depends(get_current_user)):
    res = await db.categories.delete_one({"id": category_id, "user_id": user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(404, "Category not found")
    return {"ok": True}


# ---------- Transactions ----------
@api.get("/transactions")
async def list_transactions(
    user: dict = Depends(get_current_user),
    type: Optional[str] = None,
    account_id: Optional[str] = None,
    category_id: Optional[str] = None,
    start: Optional[str] = None,
    end: Optional[str] = None,
    limit: int = 200,
):
    q: dict = {"user_id": user["id"]}
    if type:
        q["type"] = type
    if account_id:
        q["account_id"] = account_id
    if category_id:
        q["category_id"] = category_id
    if start or end:
        q["date"] = {}
        if start:
            q["date"]["$gte"] = start
        if end:
            q["date"]["$lte"] = end
    return await db.transactions.find(q, {"_id": 0}).sort("date", -1).limit(limit).to_list(limit)


@api.post("/transactions")
async def create_transaction(payload: TransactionIn, user: dict = Depends(get_current_user)):
    doc = {"id": gen_id(), "user_id": user["id"], "created_at": now_iso(), **payload.model_dump()}
    await db.transactions.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.patch("/transactions/{tx_id}")
async def update_transaction(tx_id: str, payload: TransactionIn, user: dict = Depends(get_current_user)):
    res = await db.transactions.update_one(
        {"id": tx_id, "user_id": user["id"]},
        {"$set": payload.model_dump()},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Transaction not found")
    return await db.transactions.find_one({"id": tx_id}, {"_id": 0})


@api.delete("/transactions/{tx_id}")
async def delete_transaction(tx_id: str, user: dict = Depends(get_current_user)):
    res = await db.transactions.delete_one({"id": tx_id, "user_id": user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(404, "Transaction not found")
    return {"ok": True}


# ---------- Invoices ----------
def _compute_invoice_totals(items: List[dict], tax_rate: float) -> dict:
    subtotal = sum(it["quantity"] * it["unit_price"] for it in items)
    tax_amount = round(subtotal * (tax_rate / 100.0), 2)
    total = round(subtotal + tax_amount, 2)
    return {"subtotal": round(subtotal, 2), "tax_amount": tax_amount, "total": total}


@api.get("/invoices")
async def list_invoices(user: dict = Depends(get_current_user)):
    return await db.invoices.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(500)


@api.post("/invoices")
async def create_invoice(payload: InvoiceIn, user: dict = Depends(get_current_user)):
    items = [i.model_dump() for i in payload.items]
    totals = _compute_invoice_totals(items, payload.tax_rate)
    doc = {
        "id": gen_id(),
        "user_id": user["id"],
        "created_at": now_iso(),
        **payload.model_dump(),
        **totals,
    }
    await db.invoices.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.patch("/invoices/{invoice_id}")
async def update_invoice(invoice_id: str, payload: InvoiceIn, user: dict = Depends(get_current_user)):
    items = [i.model_dump() for i in payload.items]
    totals = _compute_invoice_totals(items, payload.tax_rate)
    update = {**payload.model_dump(), **totals}
    res = await db.invoices.update_one(
        {"id": invoice_id, "user_id": user["id"]},
        {"$set": update},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Invoice not found")
    return await db.invoices.find_one({"id": invoice_id}, {"_id": 0})


@api.patch("/invoices/{invoice_id}/status")
async def set_invoice_status(invoice_id: str, body: dict, user: dict = Depends(get_current_user)):
    status = body.get("status")
    if status not in {"draft", "sent", "paid", "overdue"}:
        raise HTTPException(400, "Invalid status")
    res = await db.invoices.update_one(
        {"id": invoice_id, "user_id": user["id"]},
        {"$set": {"status": status}},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Invoice not found")
    return await db.invoices.find_one({"id": invoice_id}, {"_id": 0})


@api.delete("/invoices/{invoice_id}")
async def delete_invoice(invoice_id: str, user: dict = Depends(get_current_user)):
    res = await db.invoices.delete_one({"id": invoice_id, "user_id": user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(404, "Invoice not found")
    return {"ok": True}


# ---------- Dashboard ----------
@api.get("/dashboard/summary")
async def dashboard_summary(user: dict = Depends(get_current_user)):
    user_id = user["id"]
    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).date().isoformat()
    # Totals
    accounts = await db.accounts.find({"user_id": user_id}, {"_id": 0}).to_list(500)
    total_opening = sum(a.get("opening_balance", 0) for a in accounts)

    agg_all = await db.transactions.aggregate([
        {"$match": {"user_id": user_id}},
        {"$group": {"_id": "$type", "total": {"$sum": "$amount"}}},
    ]).to_list(10)
    all_income = sum(x["total"] for x in agg_all if x["_id"] == "income")
    all_expense = sum(x["total"] for x in agg_all if x["_id"] == "expense")
    total_balance = round(total_opening + all_income - all_expense, 2)

    agg_month = await db.transactions.aggregate([
        {"$match": {"user_id": user_id, "date": {"$gte": month_start}}},
        {"$group": {"_id": "$type", "total": {"$sum": "$amount"}}},
    ]).to_list(10)
    month_income = round(sum(x["total"] for x in agg_month if x["_id"] == "income"), 2)
    month_expense = round(sum(x["total"] for x in agg_month if x["_id"] == "expense"), 2)

    # Outstanding invoices
    outstanding_agg = await db.invoices.aggregate([
        {"$match": {"user_id": user_id, "status": {"$in": ["sent", "overdue"]}}},
        {"$group": {"_id": None, "total": {"$sum": "$total"}}},
    ]).to_list(1)
    outstanding = round(outstanding_agg[0]["total"], 2) if outstanding_agg else 0.0

    return {
        "total_balance": total_balance,
        "month_income": month_income,
        "month_expense": month_expense,
        "month_cashflow": round(month_income - month_expense, 2),
        "outstanding_invoices": outstanding,
        "currency": user.get("currency", "USD"),
    }


@api.get("/dashboard/cashflow")
async def dashboard_cashflow(user: dict = Depends(get_current_user), months: int = 6):
    user_id = user["id"]
    now = datetime.now(timezone.utc)
    # Build buckets
    buckets = []
    year = now.year
    month = now.month
    for _ in range(months):
        buckets.append((year, month))
        month -= 1
        if month == 0:
            month = 12
            year -= 1
    buckets.reverse()

    result = []
    for y, m in buckets:
        start = datetime(y, m, 1, tzinfo=timezone.utc).date().isoformat()
        if m == 12:
            end = datetime(y + 1, 1, 1, tzinfo=timezone.utc).date().isoformat()
        else:
            end = datetime(y, m + 1, 1, tzinfo=timezone.utc).date().isoformat()
        agg = await db.transactions.aggregate([
            {"$match": {"user_id": user_id, "date": {"$gte": start, "$lt": end}}},
            {"$group": {"_id": "$type", "total": {"$sum": "$amount"}}},
        ]).to_list(10)
        income = round(sum(x["total"] for x in agg if x["_id"] == "income"), 2)
        expense = round(sum(x["total"] for x in agg if x["_id"] == "expense"), 2)
        label = datetime(y, m, 1).strftime("%b")
        result.append({"month": label, "income": income, "expense": expense})
    return result


@api.get("/dashboard/expense-by-category")
async def expense_by_category(user: dict = Depends(get_current_user)):
    user_id = user["id"]
    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1).date().isoformat()
    pipeline = [
        {"$match": {"user_id": user_id, "type": "expense", "date": {"$gte": month_start}}},
        {"$group": {"_id": "$category_id", "total": {"$sum": "$amount"}}},
    ]
    agg = await db.transactions.aggregate(pipeline).to_list(100)
    cats = await db.categories.find({"user_id": user_id}, {"_id": 0}).to_list(500)
    cat_map = {c["id"]: c for c in cats}
    out = []
    for row in agg:
        c = cat_map.get(row["_id"])
        out.append({
            "category_id": row["_id"],
            "name": c["name"] if c else "Uncategorized",
            "color": c["color"] if c else "#a8a29e",
            "total": round(row["total"], 2),
        })
    out.sort(key=lambda x: x["total"], reverse=True)
    return out


# ---------- Health ----------
@api.get("/")
async def root():
    return {"service": "FinFlow", "status": "ok"}


# ---------- Startup ----------
@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.accounts.create_index("user_id")
    await db.clients.create_index("user_id")
    await db.categories.create_index("user_id")
    await db.transactions.create_index([("user_id", 1), ("date", -1)])
    await db.invoices.create_index("user_id")

    # Seed admin/demo user
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@finflow.com").lower()
    admin_password = os.environ.get("ADMIN_PASSWORD", "Admin@123")
    existing = await db.users.find_one({"email": admin_email})
    if existing is None:
        user_id = gen_id()
        await db.users.insert_one({
            "id": user_id,
            "email": admin_email,
            "name": "Demo Admin",
            "business_name": "FinFlow Demo Co.",
            "password_hash": hash_password(admin_password),
            "currency": "USD",
            "role": "admin",
            "created_at": now_iso(),
        })
        await seed_user_defaults(user_id)
    elif not verify_password(admin_password, existing["password_hash"]):
        await db.users.update_one(
            {"email": admin_email},
            {"$set": {"password_hash": hash_password(admin_password)}},
        )


app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_origin_regex=".*",
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@app.on_event("shutdown")
async def shutdown():
    client.close()
