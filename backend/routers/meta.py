"""Meta Conversions API settings + test endpoints.

Managed by Super Admin and Office Admin from Settings → Integrations → Meta.
The access token is stored server-side and never returned to the client.
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from auth_lib import get_current_user, now_iso
from lib import meta_capi

router = APIRouter(prefix="/api/integrations/meta", tags=["meta"])


def _require_admin(user: dict) -> None:
    if user.get("role") not in ("super_admin", "office_admin"):
        raise HTTPException(403, "Only admins can manage the Meta integration.")


class MetaSettingsIn(BaseModel):
    pixel_id: str = Field(default="", max_length=100)
    # Blank means "keep the existing token" so admins can edit other fields
    # without re-typing the secret.
    access_token: Optional[str] = Field(default=None, max_length=1000)
    test_event_code: str = Field(default="", max_length=100)
    graph_version: str = Field(default=meta_capi.DEFAULT_GRAPH_VERSION, max_length=20)
    default_country_code: str = Field(default="+91", max_length=8)
    enabled: bool = True


class MetaTestIn(BaseModel):
    email: Optional[str] = None
    phone: Optional[str] = None


@router.get("/settings")
async def get_meta_settings(user: dict = Depends(get_current_user)):
    _require_admin(user)
    return meta_capi.public_status(await meta_capi.get_settings())


@router.put("/settings")
async def put_meta_settings(payload: MetaSettingsIn, user: dict = Depends(get_current_user)):
    _require_admin(user)
    current = await meta_capi.get_settings()
    token = payload.access_token
    if token is None or token.strip() == "":
        token = current.get("access_token", "")  # keep existing
    value = {
        "pixel_id": payload.pixel_id.strip(),
        "access_token": token.strip(),
        "test_event_code": payload.test_event_code.strip(),
        "graph_version": (payload.graph_version or meta_capi.DEFAULT_GRAPH_VERSION).strip(),
        "default_country_code": (payload.default_country_code or "+91").strip(),
        "enabled": bool(payload.enabled),
        "updated_at": now_iso(),
        "updated_by": user.get("name") or user.get("email"),
    }
    await meta_capi.save_settings(value)
    return meta_capi.public_status(value)


@router.post("/test")
async def send_test_event(payload: MetaTestIn, user: dict = Depends(get_current_user)):
    _require_admin(user)
    s = await meta_capi.get_settings()
    if not meta_capi.is_configured(s):
        raise HTTPException(400, "Add your Pixel/Dataset ID and Access Token first.")
    if not (s.get("test_event_code") or "").strip():
        raise HTTPException(400, "Add a Test Event Code (from Events Manager → Test events) to send a test.")
    sample = {
        "id": "test-event",
        "name": "Meta CAPI Test",
        "email": (payload.email or "").strip() or "test.user@example.com",
        "phone": (payload.phone or "").strip() or "+919999999999",
    }
    result = await meta_capi.send_lead_event(
        sample, actor=user, use_test=True, manual=True, record=False
    )
    if not result.get("ok"):
        raise HTTPException(400, result.get("detail") or "Test event failed.")
    return result
