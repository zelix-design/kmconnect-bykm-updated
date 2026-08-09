"""WebAuthn / Passkey biometric unlock (Face ID / Touch ID / Windows Hello).

This is the second (optional) unlock method on top of the existing password +
4-digit PIN. The PIN remains the mandatory fallback — biometric registration
is refused unless the user has already installed a PIN.

Endpoints (all under ``/api/webauthn``):
  * ``POST /register/begin``    — issues platform-authenticator registration options
  * ``POST /register/finish``   — verifies the attestation + stores the credential
  * ``POST /auth/begin``        — issues authentication options for the caller
  * ``POST /auth/finish``       — verifies the assertion + returns a fresh JWT
  * ``DELETE /credentials``     — removes all passkeys for the caller

Storage: two collections, both with TTL / uniqueness indexes:
  * ``webauthn_challenges``     — short-lived per-ceremony challenges
  * ``webauthn_credentials``    — long-lived credential public keys
"""
from __future__ import annotations

import base64
import json
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel

from webauthn import (
    generate_authentication_options,
    generate_registration_options,
    options_to_json,
    verify_authentication_response,
    verify_registration_response,
)
from webauthn.helpers.structs import (
    AttestationConveyancePreference,
    AuthenticatorAttachment,
    AuthenticatorSelectionCriteria,
    PublicKeyCredentialDescriptor,
    ResidentKeyRequirement,
    UserVerificationRequirement,
)

from db import db
from auth_lib import get_current_user, create_access_token, set_auth_cookie

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/webauthn", tags=["webauthn"])

RP_ID = os.environ.get("WEBAUTHN_RP_ID", "").strip()
RP_NAME = os.environ.get("WEBAUTHN_RP_NAME", "KM Connect").strip()
ORIGIN = os.environ.get("WEBAUTHN_ORIGIN", "").strip()
CHALLENGE_TTL_SECONDS = int(os.environ.get("WEBAUTHN_CHALLENGE_TTL_SECONDS", "300"))


def _b64url_encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode()


def _b64url_decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def _now_dt() -> datetime:
    return datetime.now(timezone.utc)


async def _ensure_indexes() -> None:
    """Create the TTL + uniqueness indexes on first import. Safe to re-run."""
    try:
        await db.webauthn_challenges.create_index("expires_at", expireAfterSeconds=0)
        await db.webauthn_credentials.create_index(
            [("user_id", 1), ("credential_id", 1)], unique=True
        )
    except Exception:  # noqa: BLE001 — index setup is best-effort
        log.exception("[webauthn] index setup failed")


class CredentialBody(BaseModel):
    """Payload from the browser after ``navigator.credentials.create/get()``.

    ``credential`` is the JSON-ified PublicKeyCredential (base64url-encoded
    binary fields). ``challenge_id`` is the exact challenge string that the
    ``/begin`` endpoint issued — kept out of the credential blob so it is
    always a scalar we can index into the challenges collection.
    """
    credential: dict
    challenge_id: str


def _guard_config() -> None:
    """Fail fast when the deployer forgot to configure the RP identifiers."""
    if not RP_ID or not ORIGIN:
        raise HTTPException(
            503,
            "Biometric unlock is not configured on this deployment "
            "(WEBAUTHN_RP_ID / WEBAUTHN_ORIGIN env vars missing).",
        )


# ---------- Registration ----------
@router.post("/register/begin")
async def register_begin(user: dict = Depends(get_current_user)):
    """Issue platform-authenticator registration options for the caller.

    Refuses when the user hasn't set a PIN — that would leave them with
    biometric-only access, and biometrics on a shared device would let anyone
    with a face/finger in enrol themselves as the user.
    """
    _guard_config()
    await _ensure_indexes()
    full = await db.users.find_one({"id": user["id"]}, {"_id": 0, "pin_hash": 1})
    if not full or not full.get("pin_hash"):
        raise HTTPException(400, "Please set your PIN first — biometric unlock uses it as a fallback.")

    existing = await db.webauthn_credentials.find(
        {"user_id": user["id"]}, {"_id": 0, "credential_id": 1}
    ).to_list(50)
    exclude = [PublicKeyCredentialDescriptor(id=_b64url_decode(x["credential_id"])) for x in existing]

    options = generate_registration_options(
        rp_id=RP_ID,
        rp_name=RP_NAME,
        user_id=user["id"].encode("utf-8"),
        user_name=user.get("email", ""),
        user_display_name=user.get("name") or user.get("email", ""),
        attestation=AttestationConveyancePreference.NONE,
        authenticator_selection=AuthenticatorSelectionCriteria(
            authenticator_attachment=AuthenticatorAttachment.PLATFORM,
            resident_key=ResidentKeyRequirement.REQUIRED,
            user_verification=UserVerificationRequirement.REQUIRED,
        ),
        exclude_credentials=exclude,
    )
    parsed = json.loads(options_to_json(options))
    await db.webauthn_challenges.insert_one({
        "_id": parsed["challenge"],
        "user_id": user["id"],
        "kind": "registration",
        "consumed": False,
        "expires_at": _now_dt() + timedelta(seconds=CHALLENGE_TTL_SECONDS),
    })
    return {"options": parsed, "challenge_id": parsed["challenge"]}


@router.post("/register/finish")
async def register_finish(body: CredentialBody, user: dict = Depends(get_current_user)):
    """Verify the attestation + persist the credential."""
    _guard_config()
    pending = await db.webauthn_challenges.find_one_and_update(
        {"_id": body.challenge_id, "user_id": user["id"], "kind": "registration",
         "consumed": False, "expires_at": {"$gt": _now_dt()}},
        {"$set": {"consumed": True}},
    )
    if not pending:
        raise HTTPException(400, "Expired or already-used challenge")
    try:
        verified = verify_registration_response(
            credential=body.credential,
            expected_challenge=_b64url_decode(body.challenge_id),
            expected_rp_id=RP_ID,
            expected_origin=ORIGIN,
            require_user_verification=True,
        )
    except Exception as exc:  # noqa: BLE001 — surface a friendly 4xx
        log.warning("[webauthn] register verify failed for user=%s: %s", user["id"], exc)
        raise HTTPException(400, "Could not verify biometric enrolment. Please try again.")

    credential_id = _b64url_encode(verified.credential_id)
    transports = body.credential.get("response", {}).get("transports") or ["internal"]
    try:
        await db.webauthn_credentials.insert_one({
            "_id": credential_id,
            "user_id": user["id"],
            "credential_id": credential_id,
            "public_key": _b64url_encode(verified.credential_public_key),
            "sign_count": verified.sign_count,
            "aaguid": getattr(verified, "aaguid", None),
            "transports": transports,
            "created_at": _now_dt().isoformat(),
            "last_used_at": None,
        })
    except Exception:  # duplicate credential_id → user re-enrolled same authenticator
        raise HTTPException(409, "This device is already enrolled.")
    return {"ok": True, "biometric_enabled": True}


# ---------- Authentication (unlock) ----------
@router.post("/auth/begin")
async def auth_begin(user: dict = Depends(get_current_user)):
    """Issue authentication options for a caller who already has a JWT."""
    _guard_config()
    creds = await db.webauthn_credentials.find(
        {"user_id": user["id"]}, {"_id": 0, "credential_id": 1, "transports": 1}
    ).to_list(50)
    if not creds:
        raise HTTPException(404, "No passkey enrolled on this account")

    options = generate_authentication_options(
        rp_id=RP_ID,
        allow_credentials=[
            PublicKeyCredentialDescriptor(
                id=_b64url_decode(c["credential_id"]),
                transports=c.get("transports") or None,
            ) for c in creds
        ],
        user_verification=UserVerificationRequirement.REQUIRED,
    )
    parsed = json.loads(options_to_json(options))
    await db.webauthn_challenges.insert_one({
        "_id": parsed["challenge"],
        "user_id": user["id"],
        "kind": "authentication",
        "consumed": False,
        "expires_at": _now_dt() + timedelta(seconds=CHALLENGE_TTL_SECONDS),
    })
    return {"options": parsed, "challenge_id": parsed["challenge"]}


@router.post("/auth/finish")
async def auth_finish(body: CredentialBody, response: Response, user: dict = Depends(get_current_user)):
    """Verify the assertion, return a fresh JWT, unlock the app."""
    _guard_config()
    pending = await db.webauthn_challenges.find_one_and_update(
        {"_id": body.challenge_id, "user_id": user["id"], "kind": "authentication",
         "consumed": False, "expires_at": {"$gt": _now_dt()}},
        {"$set": {"consumed": True}},
    )
    if not pending:
        raise HTTPException(400, "Expired or already-used challenge")

    cid = body.credential.get("id")
    if not cid:
        raise HTTPException(400, "Missing credential id")
    rec = await db.webauthn_credentials.find_one(
        {"user_id": user["id"], "credential_id": cid}
    )
    if not rec:
        raise HTTPException(404, "Unknown credential — please re-enrol biometrics")

    try:
        verified = verify_authentication_response(
            credential=body.credential,
            expected_challenge=_b64url_decode(body.challenge_id),
            expected_rp_id=RP_ID,
            expected_origin=ORIGIN,
            credential_public_key=_b64url_decode(rec["public_key"]),
            credential_current_sign_count=rec["sign_count"],
            require_user_verification=True,
        )
    except Exception as exc:  # noqa: BLE001
        log.warning("[webauthn] auth verify failed for user=%s: %s", user["id"], exc)
        raise HTTPException(401, "Biometric unlock failed. Try again or enter your PIN.")

    if verified.new_sign_count and verified.new_sign_count < rec["sign_count"]:
        # Counter went backwards → possible clone. Nuke the credential.
        await db.webauthn_credentials.delete_one({"_id": rec["_id"]})
        raise HTTPException(401, "Biometric credential removed (integrity check failed). Please re-enrol.")

    await db.webauthn_credentials.update_one(
        {"_id": rec["_id"]},
        {"$set": {"sign_count": verified.new_sign_count, "last_used_at": _now_dt().isoformat()}},
    )
    token = create_access_token(user["id"], user.get("email", ""))
    set_auth_cookie(response, token)
    return {"ok": True, "access_token": token}


# ---------- Management ----------
@router.get("/status")
async def status(user: dict = Depends(get_current_user)):
    """Lightweight check used by the settings UI to decide whether to show
    "Enable biometric" vs "Turn off". Also returns whether the deployment is
    configured (so we hide the whole card in dev)."""
    if not RP_ID or not ORIGIN:
        return {"configured": False, "biometric_enabled": False, "count": 0}
    count = await db.webauthn_credentials.count_documents({"user_id": user["id"]})
    return {"configured": True, "biometric_enabled": count > 0, "count": count}


@router.delete("/credentials")
async def delete_all_credentials(user: dict = Depends(get_current_user)):
    """Remove every enrolled passkey for the caller. Simpler UX than a
    per-credential list — the operator's phone can just re-enrol."""
    result = await db.webauthn_credentials.delete_many({"user_id": user["id"]})
    return {"ok": True, "removed": result.deleted_count, "biometric_enabled": False}
