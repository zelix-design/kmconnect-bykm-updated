"""Google Sheets + Drive lead-import integration.

Server-side OAuth 2.0 Authorization Code flow. The browser NEVER receives a
Google access/refresh token — FastAPI exchanges the code and stores the
credentials (encrypted with Fernet) against the already-authenticated app user
in ``db.google_connections``.

Two routers are exposed:
  * ``router``       (prefix ``/api/google``)         — app data endpoints, JWT-guarded.
  * ``oauth_router`` (prefix ``/api/oauth/sheets``)   — the OAuth callback Google
    redirects the browser to (no JWT; identified by the one-time ``state``).
"""
from __future__ import annotations

import logging
import os
import secrets
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field

from db import db
from auth_lib import get_current_user, gen_id, now_iso
from lib.activity_log import log_event

log = logging.getLogger("server")

router = APIRouter(prefix="/api/google", tags=["google-sheets"])
oauth_router = APIRouter(prefix="/api/oauth/sheets", tags=["google-oauth"])

CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "")
CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET", "")
REDIRECT_URI = os.environ.get("GOOGLE_REDIRECT_URI", "")
FRONTEND_URL = os.environ.get("FRONTEND_URL", "").rstrip("/")
ENC_KEY = os.environ.get("GOOGLE_TOKEN_ENCRYPTION_KEY", "")

SCOPES = [
    "https://www.googleapis.com/auth/drive.readonly",
    "https://www.googleapis.com/auth/spreadsheets",
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
]

LEAD_SOURCES = ("walk_in", "referral", "social", "website", "csv", "google_sheets", "other")

_fernet = None
if ENC_KEY:
    from cryptography.fernet import Fernet
    _fernet = Fernet(ENC_KEY.encode())


def _configured() -> bool:
    return bool(CLIENT_ID and CLIENT_SECRET and REDIRECT_URI and _fernet)


def _guard_configured() -> None:
    if not _configured():
        raise HTTPException(503, "Google Sheets is not configured on the server.")


def _require_admin(user: dict) -> None:
    if user.get("role") not in ("super_admin", "office_admin"):
        raise HTTPException(403, "Only admins can manage the Google Sheets connection")


def _enc(value: Optional[str]) -> Optional[str]:
    return _fernet.encrypt(value.encode()).decode() if value else None


def _dec(value: Optional[str]) -> Optional[str]:
    return _fernet.decrypt(value.encode()).decode() if value else None


def _client_config() -> dict:
    return {"web": {
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "auth_uri": "https://accounts.google.com/o/oauth2/v2/auth",
        "token_uri": "https://oauth2.googleapis.com/token",
        "redirect_uris": [REDIRECT_URI],
    }}


def _new_flow():
    from google_auth_oauthlib.flow import Flow
    flow = Flow.from_client_config(_client_config(), scopes=SCOPES)
    flow.redirect_uri = REDIRECT_URI
    return flow


async def _save_credentials(uid: str, creds, email: Optional[str] = None) -> None:
    old = await db.google_connections.find_one({"user_id": uid, "provider": "google_sheets"})
    # Google omits refresh_token on subsequent exchanges — preserve the old one.
    refresh = creds.refresh_token or (_dec(old.get("refresh_token")) if old else None)
    doc = {
        "user_id": uid,
        "provider": "google_sheets",
        "google_email": email or (old.get("google_email") if old else None),
        "access_token": _enc(creds.token),
        "refresh_token": _enc(refresh),
        "expiry": creds.expiry,
        "scopes": list(creds.scopes or SCOPES),
        "updated_at": datetime.now(timezone.utc),
        "refresh_error": None,
    }
    await db.google_connections.update_one(
        {"user_id": uid, "provider": "google_sheets"}, {"$set": doc}, upsert=True
    )


async def _credentials_for(uid: str):
    from google.oauth2.credentials import Credentials
    from google.auth.transport.requests import Request
    row = await db.google_connections.find_one({"user_id": uid, "provider": "google_sheets"})
    if not row or not row.get("refresh_token"):
        raise HTTPException(404, "Google account is not connected")
    creds = Credentials(
        token=_dec(row.get("access_token")),
        refresh_token=_dec(row["refresh_token"]),
        token_uri="https://oauth2.googleapis.com/token",
        client_id=CLIENT_ID,
        client_secret=CLIENT_SECRET,
        scopes=row.get("scopes") or SCOPES,
        expiry=row.get("expiry"),
    )
    if not creds.valid:
        if not creds.refresh_token:
            raise HTTPException(401, "Google connection expired — please reconnect")
        try:
            creds.refresh(Request())
            await _save_credentials(uid, creds, row.get("google_email"))
        except Exception as exc:  # noqa: BLE001
            log.warning("[google] token refresh failed for user=%s: %s", uid, exc)
            await db.google_connections.update_one(
                {"user_id": uid, "provider": "google_sheets"},
                {"$set": {"refresh_error": str(exc)[:200], "updated_at": datetime.now(timezone.utc)}},
            )
            raise HTTPException(401, "Google authorization must be renewed — please reconnect")
    return creds


def _services(creds):
    from googleapiclient.discovery import build
    return (
        build("drive", "v3", credentials=creds, cache_discovery=False),
        build("sheets", "v4", credentials=creds, cache_discovery=False),
    )


def _google_error(exc):
    from googleapiclient.errors import HttpError
    if isinstance(exc, HttpError):
        status = getattr(exc.resp, "status", 502)
        try:
            status = int(status)
        except (TypeError, ValueError):
            status = 502
        raise HTTPException(status if status in (400, 401, 403, 404) else 502,
                            "Google API request failed. Check sheet access and try again.")
    log.exception("[google] unexpected API error")
    raise HTTPException(502, "Google request failed")


# ------------------------------------------------------------------ status / connect
@router.get("/status")
async def google_status(user: dict = Depends(get_current_user)):
    if not _configured():
        return {"configured": False, "connected": False}
    row = await db.google_connections.find_one(
        {"user_id": user["id"], "provider": "google_sheets"},
        {"_id": 0, "google_email": 1, "updated_at": 1, "refresh_error": 1},
    )
    return {
        "configured": True,
        "connected": bool(row),
        "google_email": (row or {}).get("google_email"),
        "connected_at": (row or {}).get("updated_at"),
        "needs_reconnect": bool((row or {}).get("refresh_error")),
    }


_indexes_ready = False


async def _ensure_indexes() -> None:
    global _indexes_ready
    if _indexes_ready:
        return
    try:
        # Abandoned OAuth flows self-expire after 10 min (row never reaches the callback).
        await db.oauth_states.create_index("created_at", expireAfterSeconds=600)
    except Exception:  # noqa: BLE001 — index may already exist / race
        pass
    _indexes_ready = True


@router.get("/connect")
async def google_connect(user: dict = Depends(get_current_user)):
    _guard_configured()
    _require_admin(user)
    await _ensure_indexes()
    state = secrets.token_urlsafe(32)
    await db.oauth_states.insert_one({
        "state": state,
        "user_id": user["id"],
        "provider": "google_sheets",
        "created_at": datetime.now(timezone.utc),
        "expires_at": datetime.now(timezone.utc).timestamp() + 600,
    })
    flow = _new_flow()
    url, _ = flow.authorization_url(
        access_type="offline",
        prompt="consent",
        include_granted_scopes="true",
        state=state,
    )
    return {"authorization_url": url}


@router.delete("/disconnect")
async def google_disconnect(user: dict = Depends(get_current_user)):
    _require_admin(user)
    row = await db.google_connections.find_one({"user_id": user["id"], "provider": "google_sheets"})
    if row:
        token = _dec(row.get("refresh_token")) if _fernet else None
        if token:
            try:
                import httpx
                async with httpx.AsyncClient(timeout=10) as client:
                    await client.post("https://oauth2.googleapis.com/revoke", data={"token": token})
            except Exception:  # noqa: BLE001 — best-effort revoke
                pass
        await db.google_connections.delete_one({"_id": row["_id"]})
    return {"disconnected": True}


@oauth_router.get("/callback")
async def google_callback(code: Optional[str] = None, state: Optional[str] = None,
                          error: Optional[str] = None):
    dest = f"{FRONTEND_URL}/settings"
    if error or not code or not state:
        return RedirectResponse(f"{dest}?google=error")
    row = await db.oauth_states.find_one_and_delete({"state": state, "provider": "google_sheets"})
    if not row or row["expires_at"] < datetime.now(timezone.utc).timestamp():
        return RedirectResponse(f"{dest}?google=error")
    if not _configured():
        return RedirectResponse(f"{dest}?google=error")
    try:
        flow = _new_flow()
        flow.fetch_token(code=code)
        creds = flow.credentials
        email = None
        try:
            from googleapiclient.discovery import build
            oauth2 = build("oauth2", "v2", credentials=creds, cache_discovery=False)
            email = oauth2.userinfo().get().execute().get("email")
        except Exception:  # noqa: BLE001
            email = None
        await _save_credentials(row["user_id"], creds, email)
    except Exception as exc:  # noqa: BLE001
        log.warning("[google] callback token exchange failed: %s", exc)
        return RedirectResponse(f"{dest}?google=error")
    return RedirectResponse(f"{dest}?google=connected")


# ------------------------------------------------------------------ spreadsheets
@router.get("/spreadsheets")
async def list_spreadsheets(user: dict = Depends(get_current_user)):
    _require_admin(user)
    creds = await _credentials_for(user["id"])
    drive, _ = _services(creds)
    try:
        files, token = [], None
        while True:
            resp = drive.files().list(
                q="mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false",
                spaces="drive", pageSize=200, pageToken=token, orderBy="modifiedTime desc",
                fields="nextPageToken,files(id,name,modifiedTime)",
            ).execute()
            files += resp.get("files", [])
            token = resp.get("nextPageToken")
            if not token or len(files) >= 500:
                break
        return {"files": files}
    except Exception as exc:  # noqa: BLE001
        _google_error(exc)


@router.get("/spreadsheets/{spreadsheet_id}/worksheets")
async def list_worksheets(spreadsheet_id: str, user: dict = Depends(get_current_user)):
    _require_admin(user)
    creds = await _credentials_for(user["id"])
    _, sheets = _services(creds)
    try:
        data = sheets.spreadsheets().get(
            spreadsheetId=spreadsheet_id, includeGridData=False,
            fields="spreadsheetId,properties.title,sheets(properties(sheetId,title,index))",
        ).execute()
        return {
            "spreadsheet_id": data["spreadsheetId"],
            "title": data["properties"]["title"],
            "worksheets": [s["properties"] for s in data.get("sheets", [])],
        }
    except Exception as exc:  # noqa: BLE001
        _google_error(exc)


@router.get("/spreadsheets/{spreadsheet_id}/values")
async def read_values(spreadsheet_id: str, sheet: str = Query(...),
                      user: dict = Depends(get_current_user)):
    _require_admin(user)
    creds = await _credentials_for(user["id"])
    _, sheets = _services(creds)
    try:
        safe = sheet.replace("'", "''")
        range_a1 = f"'{safe}'!A:Z"
        result = sheets.spreadsheets().values().get(
            spreadsheetId=spreadsheet_id, range=range_a1,
            majorDimension="ROWS", valueRenderOption="UNFORMATTED_VALUE",
        ).execute()
        return {"range": result.get("range"), "values": result.get("values", [])}
    except Exception as exc:  # noqa: BLE001
        _google_error(exc)


class TemplateIn(BaseModel):
    title: str = Field(default="KM Connect — Leads Import", min_length=1, max_length=200)


@router.post("/template")
async def create_template(body: TemplateIn, user: dict = Depends(get_current_user)):
    _require_admin(user)
    creds = await _credentials_for(user["id"])
    _, sheets = _services(creds)
    headers = [["name", "phone", "email", "course", "place", "source", "notes"]]
    try:
        created = sheets.spreadsheets().create(
            body={"properties": {"title": body.title},
                  "sheets": [{"properties": {"title": "Leads"}}]},
            fields="spreadsheetId,spreadsheetUrl,properties.title",
        ).execute()
        sid = created["spreadsheetId"]
        sheets.spreadsheets().values().update(
            spreadsheetId=sid, range="Leads!A1:G1", valueInputOption="RAW",
            body={"values": headers},
        ).execute()
        return {"spreadsheet_id": sid, "url": created.get("spreadsheetUrl"), "headers": headers[0]}
    except Exception as exc:  # noqa: BLE001
        _google_error(exc)


# ------------------------------------------------------------------ import
class ImportRow(BaseModel):
    name: str = ""
    phone: str = ""
    email: str = ""
    course: str = ""
    place: str = ""
    source: str = ""
    notes: str = ""


class ImportIn(BaseModel):
    campaign_id: str
    rows: List[ImportRow]


def _phone_key(raw: str) -> str:
    digits = "".join(ch for ch in (raw or "") if ch.isdigit())
    return digits[-10:] if len(digits) >= 10 else digits


def _name_place_key(name: str, place: str) -> str:
    n = " ".join((name or "").lower().split())
    p = " ".join((place or "").lower().split())
    return f"{n}|{p}" if n else ""


@router.post("/import", status_code=201)
async def import_leads(body: ImportIn, user: dict = Depends(get_current_user)):
    """Import validated rows (from a Google Sheet) into a campaign.

    Server-side dedup is authoritative: rows whose phone (or name+place when no
    phone) already exist in the caller's lead scope — or repeat within the
    payload — are skipped. Rows without a name are invalid. Leads land unassigned
    so they can be distributed afterwards, tagged to the campaign + its office."""
    _require_admin(user)
    role = user.get("role")
    cscope = {} if role == "super_admin" else {"office": user.get("office")}
    campaign = await db.campaigns.find_one(
        {**cscope, "id": body.campaign_id}, {"_id": 0, "id": 1, "office": 1}
    )
    if not campaign:
        raise HTTPException(404, "Campaign not found")
    office = campaign["office"]

    # Dedup scope: super_admin = whole DB; office_admin = own office.
    dedup_scope = {} if role == "super_admin" else {"office": user.get("office")}
    existing = await db.leads.find(
        dedup_scope, {"_id": 0, "phone": 1, "name": 1, "place": 1}
    ).to_list(200_000)
    existing_phone: set[str] = set()
    existing_name: set[str] = set()
    for d in existing:
        pk = _phone_key(d.get("phone", ""))
        if pk:
            existing_phone.add(pk)
        else:
            nk = _name_place_key(d.get("name", ""), d.get("place", ""))
            if nk:
                existing_name.add(nk)

    created: list[dict] = []
    duplicates: list[dict] = []
    invalids: list[dict] = []
    seen_phone: set[str] = set()
    seen_name: set[str] = set()
    now = now_iso()
    for i, row in enumerate(body.rows):
        name = (row.name or "").strip()
        if not name:
            invalids.append({"row": i + 1, "reason": "missing name"})
            continue
        phone = (row.phone or "").strip()
        place = (row.place or "").strip()
        pk = _phone_key(phone)
        nk = _name_place_key(name, place) if not pk else ""
        reason: Optional[str] = None
        if pk:
            if pk in existing_phone:
                reason = "phone already in CRM"
            elif pk in seen_phone:
                reason = "phone repeated in import"
        elif nk:
            if nk in existing_name:
                reason = "name already in CRM"
            elif nk in seen_name:
                reason = "name repeated in import"
        if reason:
            duplicates.append({"row": i + 1, "name": name, "phone": phone, "reason": reason})
            continue
        if pk:
            seen_phone.add(pk)
        elif nk:
            seen_name.add(nk)
        src = (row.source or "").strip().lower()
        created.append({
            "id": gen_id(),
            "name": name,
            "phone": phone,
            "email": (row.email or "").strip(),
            "course": (row.course or "").strip(),
            "place": place,
            "source": src if src in LEAD_SOURCES else "google_sheets",
            "status": "new",
            "assigned_to_user_id": None,
            "office": office,
            "campaign_id": body.campaign_id,
            "next_follow_up": None,
            "notes": (row.notes or "").strip(),
            "follow_ups": [],
            "created_by_user_id": user["id"],
            "created_at": now,
            "updated_at": now,
        })

    if created:
        await db.leads.insert_many([dict(d) for d in created])
        await log_event(
            event_type="lead.sheets_import", actor=user,
            subject_type="lead", subject_label=f"{len(created)} leads",
            after={"count": len(created), "campaign_id": body.campaign_id},
            office=office,
            note=f"Imported {len(created)} leads from Google Sheets",
            reversible=True,
            extras={"lead_ids": [c["id"] for c in created], "campaign_id": body.campaign_id},
        )
    return {
        "created_count": len(created),
        "duplicate_count": len(duplicates),
        "invalid_count": len(invalids),
        "duplicates": duplicates[:200],
        "invalids": invalids[:200],
    }
