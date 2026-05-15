"""Dashboard summary / cashflow / expense-by-category endpoints."""
from typing import Optional
from datetime import datetime, timezone

from fastapi import APIRouter, Depends

from db import db
from auth_lib import get_current_user

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/summary")
async def summary(
    user: dict = Depends(get_current_user),
    start: Optional[str] = None,
    end: Optional[str] = None,
):
    user_id = user["id"]
    now = datetime.now(timezone.utc)
    period_start = start or now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).date().isoformat()
    period_end = end

    accounts = await db.accounts.find({"user_id": user_id}, {"_id": 0}).to_list(500)
    total_opening = sum(a.get("opening_balance", 0) for a in accounts)

    agg_all = await db.transactions.aggregate([
        {"$match": {"user_id": user_id}},
        {"$group": {"_id": "$type", "total": {"$sum": "$amount"}}},
    ]).to_list(10)
    all_income = sum(x["total"] for x in agg_all if x["_id"] == "income")
    all_expense = sum(x["total"] for x in agg_all if x["_id"] == "expense")
    total_balance = round(total_opening + all_income - all_expense, 2)

    period_match = {"$gte": period_start}
    if period_end:
        period_match["$lte"] = period_end
    agg_month = await db.transactions.aggregate([
        {"$match": {"user_id": user_id, "date": period_match}},
        {"$group": {"_id": "$type", "total": {"$sum": "$amount"}}},
    ]).to_list(10)
    month_income = round(sum(x["total"] for x in agg_month if x["_id"] == "income"), 2)
    month_expense = round(sum(x["total"] for x in agg_month if x["_id"] == "expense"), 2)

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
        "period_start": period_start,
        "period_end": period_end,
    }


@router.get("/cashflow")
async def cashflow(user: dict = Depends(get_current_user), months: int = 6):
    user_id = user["id"]
    now = datetime.now(timezone.utc)
    buckets = []
    year, month = now.year, now.month
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
        end = (datetime(y + 1, 1, 1, tzinfo=timezone.utc) if m == 12
               else datetime(y, m + 1, 1, tzinfo=timezone.utc)).date().isoformat()
        agg = await db.transactions.aggregate([
            {"$match": {"user_id": user_id, "date": {"$gte": start, "$lt": end}}},
            {"$group": {"_id": "$type", "total": {"$sum": "$amount"}}},
        ]).to_list(10)
        income = round(sum(x["total"] for x in agg if x["_id"] == "income"), 2)
        expense = round(sum(x["total"] for x in agg if x["_id"] == "expense"), 2)
        label = datetime(y, m, 1).strftime("%b")
        result.append({"month": label, "income": income, "expense": expense})
    return result


@router.get("/expense-by-category")
async def expense_by_category(
    user: dict = Depends(get_current_user),
    start: Optional[str] = None,
    end: Optional[str] = None,
):
    user_id = user["id"]
    now = datetime.now(timezone.utc)
    period_start = start or now.replace(day=1).date().isoformat()
    date_match = {"$gte": period_start}
    if end:
        date_match["$lte"] = end
    agg = await db.transactions.aggregate([
        {"$match": {"user_id": user_id, "type": "expense", "date": date_match}},
        {"$group": {"_id": "$category_id", "total": {"$sum": "$amount"}}},
    ]).to_list(100)
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
