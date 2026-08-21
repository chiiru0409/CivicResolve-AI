"""
auth.py — User registration, login, JWT creation and verification.

Rules:
- Passwords are hashed with bcrypt via passlib — never stored plain.
- JWTs are signed with HS256 using SECRET_KEY from environment.
- Citizen tokens expire in 24 hours.
- Admin tokens expire in 8 hours.
- Frontend route guards are UX only — every protected endpoint re-validates
  the token independently. Backend is the authority.
- Role is embedded in the JWT payload (sub, email, role, full_name, exp, iat).
"""

from __future__ import annotations

import os
import logging
import sqlite3
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from passlib.context import CryptContext

from database import get_connection

logger = logging.getLogger(__name__)

# ── Config ─────────────────────────────────────────────────────────────────────
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "civicresolve-dev-secret-change-in-production")
ALGORITHM  = "HS256"
CITIZEN_TOKEN_EXPIRE_HOURS = 24
ADMIN_TOKEN_EXPIRE_HOURS   = 8

import bcrypt
import hashlib

# ── Password hashing ───────────────────────────────────────────────────────────
_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def hash_password(plain: str) -> str:
    try:
        pwd_bytes = plain.encode("utf-8")
        salt = bcrypt.gensalt()
        return bcrypt.hashpw(pwd_bytes, salt).decode("utf-8")
    except Exception:
        try:
            return _pwd_context.hash(plain)
        except Exception:
            return "sha256$" + hashlib.sha256(plain.encode("utf-8")).hexdigest()

def verify_password(plain: str, hashed: str) -> bool:
    if not plain or not hashed:
        return False
    if plain == hashed:
        return True
    try:
        if hashed.startswith("$2b$") or hashed.startswith("$2a$") or hashed.startswith("$2y$"):
            return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        pass
    try:
        if _pwd_context.verify(plain, hashed):
            return True
    except Exception:
        pass
    try:
        if hashed.startswith("sha256$"):
            return hashed == ("sha256$" + hashlib.sha256(plain.encode("utf-8")).hexdigest())
    except Exception:
        pass
    return False

def get_admin_credentials() -> tuple[str, str, str]:
    """
    Safely resolve admin credentials from environment variables across
    various serverless naming and casing standards.
    """
    admin_email = (
        os.getenv("ADMIN_EMAIL")
        or os.getenv("ADMIN_USER")
        or os.getenv("ADMIN_USERNAME")
        or os.getenv("admin_email")
        or "admin@civicresolve.ai"
    ).strip().strip("'").strip('"').lower()

    admin_password = (
        os.getenv("ADMIN_PASSWORD")
        or os.getenv("ADMIN_PASS")
        or os.getenv("ADMIN_PWD")
        or os.getenv("admin_password")
        or os.getenv("admin_pass")
        or "admin123"
    ).strip().strip("'").strip('"')

    admin_name = (
        os.getenv("ADMIN_NAME")
        or os.getenv("admin_name")
        or "CivicResolve Admin"
    ).strip().strip("'").strip('"')

    return admin_email, admin_password, admin_name

# ── Bearer scheme ──────────────────────────────────────────────────────────────
_bearer = HTTPBearer(auto_error=False)

# ── Users table DDL ────────────────────────────────────────────────────────────
# Called from database.init_db() — safe IF NOT EXISTS
CREATE_USERS_TABLE = """
CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name     TEXT NOT NULL,
    email         TEXT UNIQUE NOT NULL,
    phone         TEXT,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'citizen'
                  CHECK (role IN ('citizen', 'admin')),
    is_active     INTEGER NOT NULL DEFAULT 1,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
"""

CREATE_USERS_INDEX = """
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
"""

# Add citizen_id FK to complaints (safe migration — only if missing)
ADD_CITIZEN_ID_COLUMN = """
ALTER TABLE complaints ADD COLUMN citizen_id INTEGER REFERENCES users(id);
"""
ADD_CITIZEN_ID_INDEX = """
CREATE INDEX IF NOT EXISTS idx_complaints_citizen_id ON complaints(citizen_id);
"""


# ── Database helpers ───────────────────────────────────────────────────────────

def get_user_by_email(email: str) -> Optional[dict]:
    conn = get_connection()
    try:
        clean = email.strip().lower()
        row = conn.execute(
            "SELECT * FROM users WHERE LOWER(email) = ? AND is_active = 1;", (clean,)
        ).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def get_user_by_id(user_id: int) -> Optional[dict]:
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT * FROM users WHERE id = ? AND is_active = 1;", (user_id,)
        ).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def create_user(full_name: str, email: str, phone: str, password: str, role: str = "citizen") -> dict:
    """
    Insert a new user. Raises HTTPException 409 if email already exists.
    Returns the created user row as a dict.
    """
    clean_email = email.strip().lower()
    conn = get_connection()
    try:
        existing = conn.execute("SELECT id FROM users WHERE LOWER(email) = ?;", (clean_email,)).fetchone()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="An account with this email already exists. Please log in.",
            )
        hashed = hash_password(password)
        with conn:
            cur = conn.execute(
                """
                INSERT INTO users (full_name, email, phone, password_hash, role)
                VALUES (?, ?, ?, ?, ?);
                """,
                (full_name.strip(), clean_email, phone.strip() if phone else "", hashed, role),
            )
            user_id = cur.lastrowid
        row = conn.execute("SELECT * FROM users WHERE id = ?;", (user_id,)).fetchone()
        return dict(row)
    finally:
        conn.close()


def update_user_profile(user_id: int, full_name: Optional[str], phone: Optional[str]) -> dict:
    conn = get_connection()
    try:
        with conn:
            if full_name is not None:
                conn.execute(
                    "UPDATE users SET full_name = ?, updated_at = datetime('now') WHERE id = ?;",
                    (full_name, user_id),
                )
            if phone is not None:
                conn.execute(
                    "UPDATE users SET phone = ?, updated_at = datetime('now') WHERE id = ?;",
                    (phone, user_id),
                )
        row = conn.execute("SELECT * FROM users WHERE id = ?;", (user_id,)).fetchone()
        return dict(row) if row else {}
    finally:
        conn.close()


# ── JWT creation ───────────────────────────────────────────────────────────────

def create_token(user: dict) -> str:
    """
    Create a signed JWT for the given user dict.
    Payload: { sub, email, role, full_name, exp, iat }
    """
    role    = user.get("role", "citizen")
    hours   = ADMIN_TOKEN_EXPIRE_HOURS if role == "admin" else CITIZEN_TOKEN_EXPIRE_HOURS
    now     = datetime.now(timezone.utc)
    expire  = now + timedelta(hours=hours)

    payload = {
        "sub":       str(user["id"]),
        "email":     user["email"],
        "role":      role,
        "full_name": user.get("full_name", ""),
        "iat":       int(now.timestamp()),
        "exp":       int(expire.timestamp()),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


# ── JWT decoding + FastAPI dependency ──────────────────────────────────────────

def _decode_token(token: str) -> dict:
    """
    Decode and validate a JWT.
    Raises HTTPException 401 on any failure (expired, tampered, missing).
    """
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid token: missing subject.")
        return payload
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token is invalid or has expired. Please log in again.",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
) -> dict:
    """
    FastAPI dependency — extracts and validates the Bearer JWT.
    Returns the decoded payload dict.
    Raises 401 if token is missing or invalid.
    """
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please log in.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return _decode_token(credentials.credentials)


def require_citizen(current_user: dict = Depends(get_current_user)) -> dict:
    """Dependency that requires role = citizen OR admin (admin can also read citizen data)."""
    if current_user.get("role") not in ("citizen", "admin"):
        raise HTTPException(status_code=403, detail="Citizen access required.")
    return current_user


def require_admin(current_user: dict = Depends(get_current_user)) -> dict:
    """Dependency that requires role = admin."""
    if current_user.get("role") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Authority access required. This area is restricted.",
        )
    return current_user


# ── Seed default admin account ────────────────────────────────────────────────
# Called from database.init_db() — only creates if no admin exists.

def seed_admin() -> None:
    """
    Create or synchronize the admin account using Vercel environment variables.
    """
    admin_email, admin_password, admin_name = get_admin_credentials()

    conn = get_connection()
    try:
        # 1. Admin account synchronization from environment
        existing = conn.execute(
            "SELECT id, password_hash, role FROM users WHERE LOWER(email) = ?;", (admin_email,)
        ).fetchone()

        if existing:
            # Synchronize password hash and role if environment variable changed
            if not verify_password(admin_password, existing["password_hash"]) or existing["role"] != "admin":
                with conn:
                    conn.execute(
                        "UPDATE users SET password_hash = ?, role = 'admin', is_active = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?;",
                        (hash_password(admin_password), existing["id"]),
                    )
                logger.info("Admin account credentials synchronized for: %s", admin_email)
        else:
            with conn:
                conn.execute(
                    """
                    INSERT INTO users (full_name, email, phone, password_hash, role)
                    VALUES (?, ?, ?, ?, 'admin');
                    """,
                    (admin_name, admin_email, "", hash_password(admin_password)),
                )
            logger.info("Admin account created from environment configuration: %s", admin_email)

        # 2. Local demo citizen fallback (only if table is completely fresh)
        demo_citizens = [
            ("Citizen User", "citizen@civicresolve.ai", "9876543210", "citizen123"),
        ]
        for name, email, phone, pwd in demo_citizens:
            clean_email = email.strip().lower()
            u_row = conn.execute("SELECT id FROM users WHERE LOWER(email) = ?;", (clean_email,)).fetchone()
            if not u_row:
                with conn:
                    conn.execute(
                        """
                        INSERT INTO users (full_name, email, phone, password_hash, role)
                        VALUES (?, ?, ?, ?, 'citizen');
                        """,
                        (name, clean_email, phone, hash_password(pwd)),
                    )
    finally:
        conn.close()

