"""Shared test configuration & fixtures for FinFlow integration tests.

Centralises the credential resolution so individual test modules don't hardcode
admin/office passwords. Override via environment variables:

  TEST_BACKEND_URL    — base URL (defaults to REACT_APP_BACKEND_URL from .env)
  TEST_ADMIN_EMAIL    — super-admin email
  TEST_ADMIN_PASSWORD — super-admin password
  TEST_OFFICE_EMAIL   — office-admin email
  TEST_OFFICE_PASSWORD — office-admin password

Test credentials.md is the canonical source of dev creds; CI should inject
secrets via environment.
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Tuple


def _read_frontend_env_var(key: str) -> str | None:
    env_file = Path("/app/frontend/.env")
    if not env_file.exists():
        return None
    for line in env_file.read_text().splitlines():
        line = line.strip()
        if line.startswith(f"{key}="):
            return line.split("=", 1)[1].strip()
    return None


def backend_url() -> str:
    return (
        os.getenv("TEST_BACKEND_URL")
        or _read_frontend_env_var("REACT_APP_BACKEND_URL")
        or "http://localhost:8001"
    )


def api_base() -> str:
    return f"{backend_url().rstrip('/')}/api"


def admin_credentials() -> Tuple[str, str]:
    """(email, password) for the seeded super-admin."""
    return (
        os.getenv("TEST_ADMIN_EMAIL", "admin@finflow.com"),
        os.getenv("TEST_ADMIN_PASSWORD", "Admin@123"),
    )


def office_credentials(office: str = "blr1") -> Tuple[str, str]:
    """(email, password) for a seeded office-admin account."""
    return (
        os.getenv("TEST_OFFICE_EMAIL", f"{office}@finflow.com"),
        os.getenv("TEST_OFFICE_PASSWORD", "Office@123"),
    )
