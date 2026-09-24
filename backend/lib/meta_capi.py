"""Meta (Facebook) Conversions API — server-side "Lead" events.

Fires one hashed `Lead` event to Meta when a CRM lead genuinely converts.
Credentials (Pixel/Dataset ID + Access Token) are entered by admins on the
Settings page and stored in ``db.app_settings`` under key ``meta_capi``.

Matching (Option A): match on hashed email (``em``) + phone (``ph``); the
CRM's own lead id is attached only as a plain reference in ``custom_data``
(never as Meta's own Lead-Ads ``lead_id``).

Every send is best-effort: failures never raise — callers get
``{"ok": False, "detail": ...}`` so the conversion flow keeps working.
"""
from __future__ import annotations

import hashlib
import logging
import os
import re
from datetime import datetime, timezone

import httpx

from db import db

log = logging.getLogger("finflow.meta_capi")

SETTINGS_KEY = "meta_capi"
DEFAULT_GRAPH_VERSION = "v21.0"
GRAPH_BASE = "https://graph.facebook.com"


async def get_settings() -> dict:
    doc = await db.app_settings.find_one({"key": SETTINGS_KEY})
    if doc and isinstance(doc.get("value"), dict):
        return doc["value"]
    return {}


async def save_settings(value: dict) -> None:
    await db.app_settings.update_one(
        {"key": SETTINGS_KEY},
        {"$set": {"key": SETTINGS_KEY, "value": value}},
        upsert=True,
    )


def is_configured(s: dict) -> bool:
    return bool((s.get("pixel_id") or "").strip() and (s.get("access_token") or "").strip())


def public_status(s: dict) -> dict:
    """Masked view for the frontend — never leaks the access token."""
    pixel = (s.get("pixel_id") or "").strip()
    return {
        "configured": is_configured(s),
        "enabled": bool(s.get("enabled", True)),
        "pixel_id": pixel,
        "has_token": bool((s.get("access_token") or "").strip()),
        "test_event_code": (s.get("test_event_code") or "").strip(),
        "graph_version": (s.get("graph_version") or DEFAULT_GRAPH_VERSION).strip(),
        "default_country_code": (s.get("default_country_code") or "+91").strip(),
        "updated_at": s.get("updated_at"),
        "updated_by": s.get("updated_by"),
    }


def _sha256(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def hash_email(email: str) -> str:
    return _sha256(email.strip().lower())


def hash_phone(phone: str, default_cc: str = "+91") -> str | None:
    """Normalize to international digits (country code, no plus, no leading
    zeros) then SHA-256. A bare 10-digit number gets the default country code."""
    digits = re.sub(r"[^0-9]", "", phone or "")
    if not digits:
        return None
    cc = re.sub(r"[^0-9]", "", default_cc or "")
    if len(digits) == 10 and cc:
        digits = cc + digits
    digits = digits.lstrip("0")
    if len(digits) < 8:
        return None
    return _sha256(digits)


async def _record(lead_id: str, result: dict, *, auto: bool, test: bool) -> None:
    """Persist the latest send outcome on the lead doc for the UI."""
    entry = {
        "last_status": "sent" if result.get("ok") else "failed",
        "detail": result.get("detail"),
        "events_received": result.get("events_received"),
        "fbtrace_id": result.get("fbtrace_id"),
        "test": test,
        "at": datetime.now(timezone.utc).isoformat(),
    }
    set_doc = {"meta_lead": entry}
    if result.get("ok") and auto and not test:
        set_doc["meta_lead"]["auto_sent"] = True
    try:
        # Preserve auto_sent across manual re-sends by merging field-by-field.
        await db.leads.update_one({"id": lead_id}, {"$set": {f"meta_lead.{k}": v for k, v in set_doc["meta_lead"].items()}})
    except Exception:  # pragma: no cover - persistence is best-effort
        log.warning("meta_capi: could not persist result for lead %s", lead_id)


async def send_lead_event(
    lead: dict,
    *,
    actor: dict | None = None,
    use_test: bool = False,
    manual: bool = False,
    record: bool = True,
) -> dict:
    """Send a single `Lead` conversion event to Meta.

    ``manual`` bypasses the enabled toggle (explicit admin re-send).
    ``use_test`` attaches the configured Test Event Code so the event shows up
    only under Events Manager → Test Events.
    """
    s = await get_settings()
    if not is_configured(s):
        return {"ok": False, "detail": "Meta Conversions API is not configured yet."}
    if not manual and not s.get("enabled", True):
        return {"ok": False, "detail": "Meta Conversions API sending is turned off."}

    email = (lead.get("email") or "").strip()
    phone = (lead.get("phone") or "").strip()
    user_data: dict = {}
    if email:
        user_data["em"] = hash_email(email)
    if phone:
        ph = hash_phone(phone, s.get("default_country_code") or "+91")
        if ph:
            user_data["ph"] = ph
    if not user_data:
        return {"ok": False, "detail": "This lead has no email or phone to match with Meta."}

    lead_id = lead.get("id") or ""
    event = {
        "event_name": "Lead",
        "event_time": int(datetime.now(timezone.utc).timestamp()),
        "action_source": "system_generated",
        "event_id": f"lead-{lead_id}",  # dedup key
        "user_data": user_data,
        "custom_data": {
            "lead_id": lead_id,          # plain CRM reference (not Meta's lead_id)
            "event_source": "crm",
            "lead_name": lead.get("name") or "",
        },
    }
    body: dict = {"data": [event]}
    test_code = (s.get("test_event_code") or "").strip()
    if use_test and test_code:
        body["test_event_code"] = test_code

    version = (s.get("graph_version") or DEFAULT_GRAPH_VERSION).strip()
    pixel = (s.get("pixel_id") or "").strip()
    token = (s.get("access_token") or "").strip()
    url = f"{GRAPH_BASE}/{version}/{pixel}/events"

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(url, params={"access_token": token}, json=body)
        try:
            data = resp.json()
        except ValueError:
            data = {}
        if resp.status_code >= 400:
            err = (data.get("error") or {}) if isinstance(data, dict) else {}
            detail = err.get("message") or f"Meta rejected the event (HTTP {resp.status_code})."
            result = {"ok": False, "detail": detail, "fbtrace_id": err.get("fbtrace_id")}
        else:
            result = {
                "ok": True,
                "detail": "Test event sent to Meta." if use_test else "Lead event sent to Meta.",
                "events_received": data.get("events_received"),
                "fbtrace_id": data.get("fbtrace_id"),
            }
    except httpx.HTTPError as exc:
        log.warning("meta_capi network error: %s", exc)
        result = {"ok": False, "detail": "Could not reach Meta. Please try again."}

    if record and lead_id:
        await _record(lead_id, result, auto=not manual, test=use_test)
    return result
