"""Default category catalogue + seeding / backfill helpers."""
import os

from db import db
from auth_lib import hash_password, verify_password, gen_id, now_iso


DEFAULT_CATEGORIES = [
    {"name": "Sales", "type": "income", "color": "#059669", "icon": "TrendUp"},
    {"name": "Services", "type": "income", "color": "#10b981", "icon": "Briefcase"},
    {"name": "Other Income", "type": "income", "color": "#34d399", "icon": "Coins"},
    {"name": "Admission Fees", "type": "income", "color": "#0d9488", "icon": "GraduationCap"},
    {"name": "Booking Amount", "type": "income", "color": "#0891b2", "icon": "BookmarkSimple"},
    {"name": "Fees (part payment)", "type": "income", "color": "#0284c7", "icon": "Coin"},
    {"name": "Tution Fees", "type": "income", "color": "#2563eb", "icon": "BookOpen"},
    {"name": "Sem Fees", "type": "income", "color": "#4f46e5", "icon": "Books"},
    {"name": "Yearly Fees", "type": "income", "color": "#7c3aed", "icon": "Calendar"},
    {"name": "Other Fees", "type": "income", "color": "#0f766e", "icon": "Receipt"},
    {"name": "Rent", "type": "expense", "color": "#be123c", "icon": "House"},
    {"name": "Fuel Exp", "type": "expense", "color": "#b91c1c", "icon": "GasPump"},
    {"name": "Toll", "type": "expense", "color": "#c2410c", "icon": "Road"},
    {"name": "Cab Exp", "type": "expense", "color": "#a16207", "icon": "Car"},
    {"name": "Train/Bus Booking", "type": "expense", "color": "#7c2d12", "icon": "Train"},
    {"name": "Food", "type": "expense", "color": "#dc2626", "icon": "ForkKnife"},
    {"name": "Utilities", "type": "expense", "color": "#9f1239", "icon": "Lightning"},
    {"name": "Salaries", "type": "expense", "color": "#525252", "icon": "Users"},
    {"name": "Office Supplies", "type": "expense", "color": "#92400e", "icon": "Package"},
    {"name": "Marketing", "type": "expense", "color": "#7c2d12", "icon": "Megaphone"},
    {"name": "Travel", "type": "expense", "color": "#0e7490", "icon": "Airplane"},
    {"name": "Software", "type": "expense", "color": "#4338ca", "icon": "Cpu"},
    {"name": "Other", "type": "expense", "color": "#78716c", "icon": "DotsThree"},
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


async def seed_admin_and_backfill() -> None:
    """Idempotent: ensures admin user exists, password is fresh, and every user
    has the full default category set.

    Migration: if ``ADMIN_EMAIL`` has changed (e.g. moving from a placeholder
    domain to a real one) and no user yet matches the new email, but the
    legacy ``admin@finflow.com`` row exists as super_admin, we *migrate* that
    row's email + password instead of creating a duplicate super admin.
    """
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@finflow.com").lower()
    admin_password = os.environ.get("ADMIN_PASSWORD", "Admin@123")
    existing = await db.users.find_one({"email": admin_email})

    # One-time migration of the seeded admin email/password (idempotent: only
    # runs when the new email isn't claimed yet AND the legacy one is present).
    if existing is None and admin_email != "admin@finflow.com":
        legacy = await db.users.find_one({"email": "admin@finflow.com"})
        if legacy and legacy.get("role") == "super_admin":
            await db.users.update_one(
                {"id": legacy["id"]},
                {"$set": {
                    "email": admin_email,
                    "password_hash": hash_password(admin_password),
                    "approval_status": "approved",
                    "role": "super_admin",
                }},
            )
            existing = await db.users.find_one({"email": admin_email})

    if existing is None:
        user_id = gen_id()
        await db.users.insert_one({
            "id": user_id,
            "email": admin_email,
            "name": "Super Admin",
            "business_name": "FinFlow by KM Foundation",
            "password_hash": hash_password(admin_password),
            "currency": "INR",
            "role": "super_admin",
            "office": None,
            "approval_status": "approved",
            "created_at": now_iso(),
        })
        await seed_user_defaults(user_id)
    else:
        # Ensure role / approval_status are correct (idempotent backfill)
        patch = {}
        if existing.get("role") != "super_admin":
            patch["role"] = "super_admin"
        if existing.get("approval_status") != "approved":
            patch["approval_status"] = "approved"
        if not verify_password(admin_password, existing["password_hash"]):
            patch["password_hash"] = hash_password(admin_password)
        if patch:
            await db.users.update_one({"email": admin_email}, {"$set": patch})

    # Backfill role + approval_status for legacy users so they can still log in.
    await db.users.update_many(
        {"role": {"$nin": ["super_admin", "office_admin"]}},
        {"$set": {"role": "office_admin"}},
    )
    await db.users.update_many(
        {"approval_status": {"$exists": False}},
        {"$set": {"approval_status": "approved"}},  # existing users remain logged in
    )

    # Backfill missing default categories for existing users (idempotent)
    async for u in db.users.find({}, {"id": 1, "_id": 0}):
        existing_cats = await db.categories.find(
            {"user_id": u["id"]}, {"_id": 0, "name": 1, "type": 1}
        ).to_list(1000)
        existing_keys = {(c["name"].lower(), c["type"]) for c in existing_cats}
        missing = [
            {"id": gen_id(), "user_id": u["id"], "created_at": now_iso(), **c}
            for c in DEFAULT_CATEGORIES
            if (c["name"].lower(), c["type"]) not in existing_keys
        ]
        if missing:
            await db.categories.insert_many(missing)
