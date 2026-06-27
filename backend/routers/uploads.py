"""File upload + serving (Emergent object storage)."""
import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, Header, HTTPException, Query, Response, UploadFile

from db import db
from auth_lib import get_current_user, decode_token
from lib.storage import put_object, get_object, APP_NAME

router = APIRouter(prefix="/api", tags=["uploads"])
log = logging.getLogger("uploads")

ALLOWED_IMAGE = {"image/jpeg", "image/jpg"}
MAX_BYTES = 5 * 1024 * 1024  # 5 MB


@router.post("/uploads/image")
async def upload_image(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    """Upload a profile photo (jpeg/jpg, ≤5MB). Returns a relative URL served
    back through /api/files/{path}."""
    ext = (file.filename or "").rsplit(".", 1)[-1].lower() if "." in (file.filename or "") else ""
    if ext not in ("jpg", "jpeg") or (file.content_type or "") not in ALLOWED_IMAGE:
        raise HTTPException(400, "Only JPEG/JPG images are allowed")
    data = await file.read()
    if len(data) > MAX_BYTES:
        raise HTTPException(400, "Image must be 5MB or smaller")
    if not data:
        raise HTTPException(400, "Empty file")
    path = f"{APP_NAME}/uploads/{user['id']}/{uuid.uuid4()}.jpg"
    try:
        result = put_object(path, data, "image/jpeg")
    except Exception as e:
        log.exception("[uploads] storage put failed")
        raise HTTPException(502, "Upload failed — storage unavailable") from e
    stored_path = result.get("path", path)
    await db.files.insert_one({
        "id": str(uuid.uuid4()),
        "storage_path": stored_path,
        "original_filename": file.filename,
        "content_type": "image/jpeg",
        "size": result.get("size", len(data)),
        "owner_user_id": user["id"],
        "is_deleted": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"url": f"/api/files/{stored_path}", "path": stored_path}


@router.get("/files/{path:path}")
async def serve_file(path: str, authorization: str = Header(None), auth: str = Query(None)):
    """Serve a stored file. Auth via Bearer header OR ?auth=<token> query
    param (img tags can't send headers)."""
    token = None
    if authorization and authorization.startswith("Bearer "):
        token = authorization[7:]
    elif auth:
        token = auth
    if not token or not decode_token(token):
        raise HTTPException(401, "Not authenticated")
    record = await db.files.find_one({"storage_path": path, "is_deleted": False})
    if not record:
        raise HTTPException(404, "File not found")
    try:
        data, content_type = get_object(path)
    except Exception as e:
        log.exception("[uploads] storage get failed")
        raise HTTPException(502, "Could not load file") from e
    return Response(
        content=data,
        media_type=record.get("content_type", content_type),
        headers={"Cache-Control": "private, max-age=86400"},
    )
