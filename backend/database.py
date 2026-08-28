"""
database.py — Neon PostgreSQL authoritative database persistence with safe migrations.

Rules:
- NEVER drops existing tables or deletes existing rows.
- Uses CREATE TABLE IF NOT EXISTS everywhere.
- Adds columns with ALTER TABLE only when they are missing (safe migration).
- Creates indexes after tables are confirmed to exist.
- In production (Vercel): STRICTLY uses PostgreSQL (Neon). If DATABASE_URL is missing or fails, FAILS LOUDLY.
- In local development: Connects to PostgreSQL if DATABASE_URL is set, else uses local database/civic.db.
"""

import sqlite3
import os
import logging
import re
import urllib.parse
from pathlib import Path
from typing import Any, Optional, Dict, List, Union

logger = logging.getLogger(__name__)

# ── Path resolution ────────────────────────────────────────────────────────────
_BACKEND_DIR = Path(__file__).resolve().parent          # …/backend
_PROJECT_ROOT = _BACKEND_DIR.parent                      # …/CEVIC-RESOLVER-AI--main
DB_DIR  = _PROJECT_ROOT / "database"
DB_PATH = DB_DIR / "civic.db"

# Uploads live next to database/
UPLOADS_DIR            = _PROJECT_ROOT / "uploads"
UPLOADS_COMPLAINTS_DIR = UPLOADS_DIR / "complaints"
UPLOADS_RESOLUTIONS_DIR = UPLOADS_DIR / "resolutions"

try:
    if os.environ.get("VERCEL"):
        UPLOADS_DIR = Path("/tmp/uploads")
        UPLOADS_COMPLAINTS_DIR = UPLOADS_DIR / "complaints"
        UPLOADS_RESOLUTIONS_DIR = UPLOADS_DIR / "resolutions"
    UPLOADS_COMPLAINTS_DIR.mkdir(parents=True, exist_ok=True)
    UPLOADS_RESOLUTIONS_DIR.mkdir(parents=True, exist_ok=True)
except Exception as exc:
    logger.warning("Uploads directory setup: %s", exc)


def is_production() -> bool:
    """Return True if running in production (Vercel Serverless or production environment)."""
    return bool(
        os.getenv("VERCEL")
        or os.getenv("ENVIRONMENT") == "production"
        or os.getenv("NODE_ENV") == "production"
        or os.getenv("PROD")
    )


def _resolve_db_url() -> Optional[str]:
    """
    Resolve and clean the PostgreSQL database connection string from environment variables.
    Canonical variable: DATABASE_URL.
    Supports full URLs (DATABASE_URL, POSTGRES_URL, NEON_DATABASE_URL, etc.) or individual PG* variables.
    """
    raw_url = (
        os.getenv("DATABASE_URL")
        or os.getenv("POSTGRES_URL")
        or os.getenv("POSTGRESQL_URL")
        or os.getenv("POSTGRES_PRISMA_URL")
        or os.getenv("POSTGRES_URL_NON_POOLING")
        or os.getenv("NEON_DATABASE_URL")
        or os.getenv("SUPABASE_DATABASE_URL")
        or os.getenv("DATABASE_PRIVATE_URL")
        or os.getenv("DATABASE_URL_UNPOOLED")
        or os.getenv("POSTGRES_DIRECT_URL")
        or os.getenv("NEON_URL")
        or os.getenv("database_url")
        or os.getenv("postgres_url")
    )

    if not raw_url:
        host = os.getenv("PGHOST") or os.getenv("POSTGRES_HOST")
        user = os.getenv("PGUSER") or os.getenv("POSTGRES_USER")
        password = os.getenv("PGPASSWORD") or os.getenv("POSTGRES_PASSWORD")
        database = os.getenv("PGDATABASE") or os.getenv("POSTGRES_DATABASE") or "Admin"
        port = os.getenv("PGPORT") or os.getenv("POSTGRES_PORT") or "5432"
        if host and user and password:
            raw_url = f"postgresql://{user}:{password}@{host}:{port}/{database}?sslmode=require"

    if not raw_url:
        return None

    cleaned = raw_url.strip().strip("'").strip('"')
    if cleaned.startswith("postgres://"):
        cleaned = "postgresql://" + cleaned[len("postgres://"):]

    # Ensure sslmode=require for remote / Neon databases if not explicitly specified
    if "sslmode=" not in cleaned and ("neon.tech" in cleaned or "amazonaws.com" in cleaned or "supabase" in cleaned or "vercel" in cleaned):
        separator = "&" if "?" in cleaned else "?"
        cleaned = f"{cleaned}{separator}sslmode=require"

    return cleaned


def get_database_host() -> Optional[str]:
    """
    Safely extract and sanitize the database hostname without exposing credentials.
    Example: 'ep-cool-fog-12345.us-east-2.aws.neon.tech'
    """
    url = _resolve_db_url()
    if not url:
        return None
    try:
        parsed = urllib.parse.urlparse(url)
        return parsed.hostname
    except Exception:
        return "configured-host"


def log_db_operation(operation: str, count: Optional[int] = None) -> None:
    """Safe diagnostic logging without credentials or secrets."""
    db_url = _resolve_db_url()
    engine = "postgresql" if db_url else "sqlite"
    host = get_database_host() or ("local" if engine == "sqlite" else "unknown")
    if count is not None:
        logger.info("[DB] engine=%s host=%s op=%s count=%d", engine, host, operation, count)
    else:
        logger.info("[DB] engine=%s host=%s op=%s", engine, host, operation)


# ── DDL statements ─────────────────────────────────────────────────────────────

_CREATE_USERS = """
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

_CREATE_COMPLAINTS = """
CREATE TABLE IF NOT EXISTS complaints (
    id                  TEXT PRIMARY KEY,
    complaint_number    TEXT UNIQUE NOT NULL,
    title               TEXT NOT NULL DEFAULT '',
    description         TEXT NOT NULL,
    category            TEXT NOT NULL DEFAULT 'Other',
    subcategory         TEXT,
    department          TEXT,
    priority            TEXT NOT NULL DEFAULT 'LOW',
    severity            INTEGER DEFAULT 5,
    status              TEXT NOT NULL DEFAULT 'NEW',
    latitude            REAL,
    longitude           REAL,
    location_accuracy   REAL,
    location            TEXT,
    address             TEXT,
    landmark            TEXT,
    image_path          TEXT,
    ai_analysis         TEXT,          -- JSON blob
    ai_confidence       INTEGER,
    ai_reason           TEXT,
    assigned_officer    TEXT,
    assigned_team       TEXT,
    estimated_response  TEXT,
    zone                TEXT,
    citizen_id          INTEGER,
    is_anonymous        INTEGER NOT NULL DEFAULT 0,
    contact_preference  TEXT DEFAULT 'email',
    escalation_level    INTEGER DEFAULT 0,
    source              TEXT DEFAULT 'Web',
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
    resolved_at         TEXT,
    citizen_rating      INTEGER,
    citizen_feedback    TEXT,
    rated_at            TEXT
);
"""

_CREATE_COMPLAINT_UPDATES = """
CREATE TABLE IF NOT EXISTS complaint_updates (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    complaint_id    TEXT NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
    status          TEXT NOT NULL,
    message         TEXT,
    updated_by      TEXT DEFAULT 'system',
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
"""

_CREATE_ASSIGNMENTS = """
CREATE TABLE IF NOT EXISTS assignments (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    complaint_id    TEXT NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
    department      TEXT NOT NULL,
    officer         TEXT,
    team            TEXT,
    notes           TEXT,
    assigned_by     TEXT DEFAULT 'admin',
    assigned_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
"""

_CREATE_DEPARTMENTS = """
CREATE TABLE IF NOT EXISTS departments (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    short_name      TEXT,
    categories      TEXT,              -- comma-separated
    head            TEXT,
    contact         TEXT,
    zones           TEXT,              -- comma-separated
    teams           TEXT,              -- JSON array
    color           TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
"""

# ── Index DDL (all IF NOT EXISTS so re-runs are safe) ──────────────────────────
_INDEXES = [
    "CREATE INDEX IF NOT EXISTS idx_users_email                 ON users(email);",
    "CREATE INDEX IF NOT EXISTS idx_complaints_complaint_number  ON complaints(complaint_number);",
    "CREATE INDEX IF NOT EXISTS idx_complaints_citizen_id        ON complaints(citizen_id);",
    "CREATE INDEX IF NOT EXISTS idx_complaints_status            ON complaints(status);",
    "CREATE INDEX IF NOT EXISTS idx_complaints_priority          ON complaints(priority);",
    "CREATE INDEX IF NOT EXISTS idx_complaints_department        ON complaints(department);",
    "CREATE INDEX IF NOT EXISTS idx_complaints_created_at        ON complaints(created_at);",
    "CREATE INDEX IF NOT EXISTS idx_complaints_category          ON complaints(category);",
    "CREATE INDEX IF NOT EXISTS idx_complaints_citizen_created   ON complaints(citizen_id, created_at);",
    "CREATE INDEX IF NOT EXISTS idx_complaints_citizen_status    ON complaints(citizen_id, status);",
    "CREATE INDEX IF NOT EXISTS idx_complaints_status_priority   ON complaints(status, priority);",
    "CREATE INDEX IF NOT EXISTS idx_complaints_dept_status       ON complaints(department, status);",
    "CREATE INDEX IF NOT EXISTS idx_complaints_status_created    ON complaints(status, created_at);",
    "CREATE INDEX IF NOT EXISTS idx_complaints_prio_created      ON complaints(priority, created_at);",
    "CREATE INDEX IF NOT EXISTS idx_complaints_cat_created       ON complaints(category, created_at);",
    "CREATE INDEX IF NOT EXISTS idx_complaints_dept_created      ON complaints(department, created_at);",
    "CREATE INDEX IF NOT EXISTS idx_complaints_geo_active        ON complaints(latitude, longitude, status);",
    "CREATE INDEX IF NOT EXISTS idx_updates_complaint_id         ON complaint_updates(complaint_id);",
    "CREATE INDEX IF NOT EXISTS idx_updates_comp_created         ON complaint_updates(complaint_id, created_at);",
    "CREATE INDEX IF NOT EXISTS idx_assignments_complaint_id     ON assignments(complaint_id);",
]

# ── Columns added in migrations (safe ALTER TABLE) ─────────────────────────────
# Each tuple: (table, column_name, column_definition)
_MIGRATION_COLUMNS = [
    ("complaints", "title",              "TEXT NOT NULL DEFAULT ''"),
    ("complaints", "subcategory",        "TEXT"),
    ("complaints", "severity",           "INTEGER DEFAULT 5"),
    ("complaints", "location_accuracy",  "REAL"),
    ("complaints", "location",           "TEXT"),
    ("complaints", "address",            "TEXT"),
    ("complaints", "ai_analysis",        "TEXT"),
    ("complaints", "ai_confidence",      "INTEGER"),
    ("complaints", "ai_reason",          "TEXT"),
    ("complaints", "assigned_officer",   "TEXT"),
    ("complaints", "assigned_team",      "TEXT"),
    ("complaints", "estimated_response", "TEXT"),
    ("complaints", "zone",               "TEXT"),
    ("complaints", "citizen_id",         "INTEGER"),
    ("complaints", "is_anonymous",       "INTEGER NOT NULL DEFAULT 0"),
    ("complaints", "contact_preference", "TEXT DEFAULT 'email'"),
    ("complaints", "escalation_level",   "INTEGER DEFAULT 0"),
    ("complaints", "source",             "TEXT DEFAULT 'Web'"),
    ("complaints", "resolved_at",        "TEXT"),
    ("complaints", "complaint_number",   "TEXT"),   # may already exist
    ("complaints", "evidence_quality",   "TEXT DEFAULT 'LOW — No photo proof provided'"),
    ("complaints", "public_safety_impact","TEXT"),
    ("complaints", "inspection_required","INTEGER DEFAULT 0"),
    ("complaints", "location_risk",      "TEXT"),
    ("complaints", "action_plan",        "TEXT"),
    ("complaints", "citizen_rating",     "INTEGER"),
    ("complaints", "citizen_feedback",   "TEXT"),
    ("complaints", "rated_at",           "TEXT"),
    ("complaint_updates", "updated_by",  "TEXT DEFAULT 'system'"),
    ("assignments", "officer",           "TEXT"),
    ("assignments", "team",              "TEXT"),
    ("assignments", "notes",             "TEXT"),
    ("assignments", "assigned_by",       "TEXT DEFAULT 'admin'"),
]


class RowWrapper(dict):
    """
    Dictionary wrapper that allows both column-name and integer index access,
    mirroring sqlite3.Row behavior, with case-insensitive key resolution.
    """
    def __getitem__(self, key):
        if isinstance(key, int):
            vals = list(self.values())
            if 0 <= key < len(vals):
                return vals[key]
            raise IndexError(f"Tuple index {key} out of range ({len(vals)} items)")
        if isinstance(key, str):
            if key in self:
                return super().__getitem__(key)
            lower_map = {k.lower(): k for k in self.keys()}
            if key.lower() in lower_map:
                return super().__getitem__(lower_map[key.lower()])
        return super().__getitem__(key)

    def get(self, key, default=None):
        if isinstance(key, int):
            vals = list(self.values())
            return vals[key] if 0 <= key < len(vals) else default
        if isinstance(key, str):
            if key in self:
                return super().get(key, default)
            lower_map = {k.lower(): k for k in self.keys()}
            if key.lower() in lower_map:
                return super().get(lower_map[key.lower()], default)
        return super().get(key, default)


def _convert_sql_to_postgres(sql: str) -> str:
    pg_sql = sql.replace("?", "%s")
    pg_sql = re.sub(r"DEFAULT\s*\(\s*datetime\('now'\)\s*\)", "DEFAULT (CURRENT_TIMESTAMP::text)", pg_sql, flags=re.IGNORECASE)
    pg_sql = re.sub(r"date\('now',\s*'start of day'\)", "CURRENT_DATE::text", pg_sql, flags=re.IGNORECASE)
    pg_sql = re.sub(r"date\('now'\)", "CURRENT_DATE::text", pg_sql, flags=re.IGNORECASE)
    pg_sql = re.sub(r"datetime\('now',\s*'-(\d+)\s+hours'\)", r"(NOW() - INTERVAL '\1 hours')::text", pg_sql, flags=re.IGNORECASE)
    pg_sql = re.sub(r"datetime\('now',\s*'-(\d+)\s+days'\)", r"(NOW() - INTERVAL '\1 days')::text", pg_sql, flags=re.IGNORECASE)
    pg_sql = re.sub(r"datetime\('now'\)", "(CURRENT_TIMESTAMP::text)", pg_sql, flags=re.IGNORECASE)
    pg_sql = re.sub(r"\bINTEGER\s+PRIMARY\s+KEY\s+AUTOINCREMENT\b", "SERIAL PRIMARY KEY", pg_sql, flags=re.IGNORECASE)
    pg_sql = re.sub(r"\bAUTOINCREMENT\b", "", pg_sql, flags=re.IGNORECASE)
    pg_sql = re.sub(r"\bINSERT\s+OR\s+IGNORE\s+INTO\b", "INSERT INTO", pg_sql, flags=re.IGNORECASE)
    return pg_sql


class PostgresCursorWrapper:
    def __init__(self, cur):
        self._cur = cur
        self.lastrowid = None

    def execute(self, sql: str, params: Any = None):
        pg_sql = _convert_sql_to_postgres(sql)

        # Ignore SQLite PRAGMAs on Postgres
        if pg_sql.strip().upper().startswith("PRAGMA"):
            return self

        # Handle INSERT OR IGNORE conflict clause if missing
        if re.search(r"\bINSERT\s+OR\s+IGNORE\b", sql, re.IGNORECASE) and "ON CONFLICT" not in pg_sql.upper():
            pg_sql = pg_sql.rstrip().rstrip(";") + " ON CONFLICT DO NOTHING"

        # Capture inserted id for tables with RETURNING
        is_insert = re.search(r"INSERT\s+INTO\s+(\w+)\b", pg_sql, re.IGNORECASE)
        if is_insert and "RETURNING" not in pg_sql.upper() and "ON CONFLICT DO NOTHING" not in pg_sql.upper():
            table_name = is_insert.group(1).lower()
            if table_name in ("users", "complaint_updates", "assignments"):
                pg_sql = pg_sql.rstrip().rstrip(";") + " RETURNING id;"
                self._cur.execute(pg_sql, params or ())
                res = self._cur.fetchone()
                if res and "id" in res:
                    self.lastrowid = res["id"]
                return self

        self._cur.execute(pg_sql, params or ())
        return self

    def executemany(self, sql: str, params_seq: Any):
        pg_sql = _convert_sql_to_postgres(sql)
        if re.search(r"\bINSERT\s+OR\s+IGNORE\b", sql, re.IGNORECASE) and "ON CONFLICT" not in pg_sql.upper():
            pg_sql = pg_sql.rstrip().rstrip(";") + " ON CONFLICT DO NOTHING"
        self._cur.executemany(pg_sql, params_seq)
        return self

    def fetchone(self):
        row = self._cur.fetchone()
        return RowWrapper(row) if row is not None else None

    def fetchall(self):
        rows = self._cur.fetchall()
        return [RowWrapper(r) for r in rows]

    @property
    def rowcount(self):
        return self._cur.rowcount

    def close(self):
        self._cur.close()


import threading

_PG_POOL: Any = None
_PG_POOL_LOCK = threading.Lock()


def _get_pg_pool(db_url: str):
    global _PG_POOL
    if _PG_POOL is None:
        with _PG_POOL_LOCK:
            if _PG_POOL is None:
                try:
                    from psycopg2 import pool
                    _PG_POOL = pool.ThreadedConnectionPool(minconn=1, maxconn=20, dsn=db_url)
                except Exception as e:
                    logger.warning("Could not initialize ThreadedConnectionPool: %s", e)
                    _PG_POOL = None
    return _PG_POOL


class PostgresConnectionWrapper:
    def __init__(self, conn, pool_instance=None):
        self._conn = conn
        self._pool = pool_instance

    def execute(self, sql: str, params: Any = None):
        cur = self.cursor()
        cur.execute(sql, params)
        return cur

    def executemany(self, sql: str, params_seq: Any):
        cur = self.cursor()
        cur.executemany(sql, params_seq)
        return cur

    def cursor(self):
        from psycopg2.extras import RealDictCursor
        cur = self._conn.cursor(cursor_factory=RealDictCursor)
        return PostgresCursorWrapper(cur)

    def commit(self):
        if self._conn and not self._conn.closed:
            self._conn.commit()

    def rollback(self):
        try:
            if self._conn and not self._conn.closed:
                self._conn.rollback()
        except Exception:
            pass

    def close(self):
        if self._pool and self._conn:
            try:
                self._pool.putconn(self._conn)
            except Exception:
                try:
                    self._conn.close()
                except Exception:
                    pass
            self._conn = None
        elif self._conn:
            try:
                self._conn.close()
            except Exception:
                pass
            self._conn = None

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        if exc_type:
            self.rollback()
        else:
            self.commit()


_SQLITE_LOCAL = threading.local()


class SQLiteConnectionWrapper:
    """
    High-performance thread-local connection wrapper for local SQLite.
    Prevents repeated connection setup and PRAGMA execution overhead across requests.
    """
    def __init__(self, conn: sqlite3.Connection):
        self._conn = conn

    def execute(self, sql: str, params: Any = ()):
        return self._conn.execute(sql, params)

    def executemany(self, sql: str, params_seq: Any):
        return self._conn.executemany(sql, params_seq)

    def cursor(self):
        return self._conn.cursor()

    def commit(self):
        self._conn.commit()

    def rollback(self):
        try:
            self._conn.rollback()
        except Exception:
            pass

    def close(self):
        # Connection is preserved in thread-local storage for rapid reuse
        pass

    def __enter__(self):
        return self._conn.__enter__()

    def __exit__(self, exc_type, exc_val, exc_tb):
        return self._conn.__exit__(exc_type, exc_val, exc_tb)

    def __getattr__(self, name: str):
        return getattr(self._conn, name)


def _get_thread_sqlite_conn() -> sqlite3.Connection:
    conn = getattr(_SQLITE_LOCAL, "conn", None)
    if conn is None:
        DB_DIR.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(str(DB_PATH), check_same_thread=False, timeout=15.0)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA synchronous=NORMAL;")
        conn.execute("PRAGMA cache_size=10000;")
        conn.execute("PRAGMA temp_store=MEMORY;")
        conn.execute("PRAGMA foreign_keys=ON;")
        conn.execute("PRAGMA busy_timeout=5000;")
        _SQLITE_LOCAL.conn = conn
    return conn


def get_connection():
    """
    Return an active database connection.
    In production (Vercel):
      - Connects ONLY to PostgreSQL (Neon) using high-performance connection pooling.
      - If DATABASE_URL is missing or fails, FAILS LOUDLY without falling back to ephemeral SQLite.
    In local development:
      - Connects to PostgreSQL if DATABASE_URL is set; otherwise falls back to local database/civic.db with thread-local pooling.
    """
    db_url = _resolve_db_url()
    is_prod = is_production()

    if db_url and db_url.startswith(("postgres://", "postgresql://")):
        try:
            import psycopg2
            pg_pool = _get_pg_pool(db_url)
            if pg_pool:
                try:
                    conn = pg_pool.getconn()
                    if conn.closed:
                        conn = psycopg2.connect(db_url)
                    conn.autocommit = True
                    return PostgresConnectionWrapper(conn, pool_instance=pg_pool)
                except Exception as pool_err:
                    logger.warning("Pool checkout failed, falling back to direct connection: %s", pool_err)
            
            # Fallback to direct connection if pool unavailable
            conn = psycopg2.connect(db_url)
            conn.autocommit = True
            return PostgresConnectionWrapper(conn)
        except Exception as exc:
            logger.error("PostgreSQL connection error: %s", exc)
            if is_prod:
                raise RuntimeError(
                    f"CRITICAL: Failed to connect to PostgreSQL in production database configuration: {exc}. "
                    "Ephemeral SQLite fallback is strictly disabled in production."
                ) from exc
            logger.warning("Local development: falling back to SQLite because PostgreSQL failed.")
    elif is_prod:
        raise RuntimeError(
            "CRITICAL: DATABASE_URL is not configured in production environment. "
            "Ephemeral SQLite fallback is strictly disabled in production to guarantee data consistency across lambdas."
        )

    # Local development SQLite connection with thread-local high-throughput reuse
    return SQLiteConnectionWrapper(_get_thread_sqlite_conn())


def get_database_diagnostics() -> dict:
    """
    Perform a safe diagnostic probe of the database.
    Exposes safe telemetry without private keys, passwords, or full URLs.
    """
    is_prod = is_production()
    db_url = _resolve_db_url()
    has_db_url = bool(db_url)
    host = get_database_host()
    engine = "Unknown"
    persistent = False
    users_count = 0
    complaints_count = 0
    error_msg = None

    conn = None
    try:
        conn = get_connection()
        is_pg = isinstance(conn, PostgresConnectionWrapper)
        engine = "PostgreSQL" if is_pg else "SQLite"
        persistent = is_pg or not is_prod

        u_row = conn.execute("SELECT COUNT(*) FROM users;").fetchone()
        users_count = int(u_row[0]) if u_row else 0

        c_row = conn.execute("SELECT COUNT(*) FROM complaints;").fetchone()
        complaints_count = int(c_row[0]) if c_row else 0
    except Exception as exc:
        error_msg = str(exc)
        engine = "Configuration Error"
        persistent = False
    finally:
        if conn is not None:
            try:
                conn.close()
            except Exception:
                pass

    return {
        "status": "healthy" if error_msg is None else "unhealthy",
        "service": "CivicResolve AI API",
        "version": "1.0.0",
        "database_engine": engine,
        "database_persistent": persistent,
        "database_host_configured": has_db_url,
        "database_host": host or ("localhost/sqlite" if engine == "SQLite" else None),
        "users_count": users_count,
        "complaints_count": complaints_count,
        "total_complaints": complaints_count,
        "total_users": users_count,
        "environment": "production" if is_prod else "development",
        "error": error_msg,
    }


def _column_exists(conn, table: str, column: str) -> bool:
    """Return True if *column* already exists in *table*."""
    try:
        if isinstance(conn, PostgresConnectionWrapper):
            cur = conn.execute(
                "SELECT 1 FROM information_schema.columns WHERE table_name = %s AND column_name = %s;",
                (table.lower(), column.lower()),
            )
            return cur.fetchone() is not None
        cur = conn.execute(f"PRAGMA table_info({table});")
        return any(row["name"] == column for row in cur.fetchall())
    except Exception:
        return False


def _table_exists(conn, table: str) -> bool:
    try:
        if isinstance(conn, PostgresConnectionWrapper):
            cur = conn.execute(
                "SELECT 1 FROM information_schema.tables WHERE table_name = %s;",
                (table.lower(),),
            )
            return cur.fetchone() is not None
        cur = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name=?;", (table,)
        )
        return cur.fetchone() is not None
    except Exception:
        return True


def init_db() -> None:
    """
    Idempotent initialisation:
    1. Create directories.
    2. Create tables (IF NOT EXISTS).
    3. Apply safe column migrations.
    4. Create indexes.
    5. Seed departments if table is empty.
    """
    if not is_production():
        DB_DIR.mkdir(parents=True, exist_ok=True)
    UPLOADS_COMPLAINTS_DIR.mkdir(parents=True, exist_ok=True)
    UPLOADS_RESOLUTIONS_DIR.mkdir(parents=True, exist_ok=True)

    conn = get_connection()
    try:
        with conn:   # transaction
            # 1. Create core tables
            conn.execute(_CREATE_USERS)
            conn.execute(_CREATE_COMPLAINTS)
            conn.execute(_CREATE_COMPLAINT_UPDATES)
            conn.execute(_CREATE_ASSIGNMENTS)
            conn.execute(_CREATE_DEPARTMENTS)

            # 2. Safe column migrations
            for table, col, defn in _MIGRATION_COLUMNS:
                if _table_exists(conn, table) and not _column_exists(conn, table, col):
                    try:
                        conn.execute(f"ALTER TABLE {table} ADD COLUMN {col} {defn};")
                        logger.info("Migration: added column %s.%s", table, col)
                    except Exception as exc:
                        # Column may have been added concurrently — ignore
                        logger.debug("Skipping migration %s.%s: %s", table, col, exc)

            # 3. Indexes
            for stmt in _INDEXES:
                try:
                    conn.execute(stmt)
                except Exception as exc:
                    logger.debug("Index creation note: %s", exc)

            # 4. Clean up any historical seed claim
            try:
                conn.execute("UPDATE complaints SET citizen_id = NULL, is_anonymous = 1 WHERE id IN ('CR-2026-123994', 'CR-2026-004821', 'CR-2026-004820', 'CR-2026-004819');")
            except Exception:
                pass

        # 5. Seed departments
        _seed_departments(conn)

        logger.info("Database initialised successfully")
    finally:
        conn.close()


# ── Department seed data (mirrors mockDepartments.ts) ─────────────────────────

_DEPT_SEED = [
    {
        "id": "dept-roads",
        "name": "Municipal Roads & Infrastructure Department",
        "short_name": "Roads Dept",
        "categories": "Roads,Infrastructure",
        "head": "Suresh Kumar",
        "contact": "+91-80-2345-6789",
        "zones": "Zone 1,Zone 2,Zone 3,Zone 4",
        "teams": '["North Roads Team","South Roads Team","Central Roads Team","Emergency Response Team"]',
        "color": "#ef4444",
    },
    {
        "id": "dept-sanitation",
        "name": "Sanitation & Waste Management Department",
        "short_name": "Sanitation Dept",
        "categories": "Garbage",
        "head": "Priya Sharma",
        "contact": "+91-80-2345-6790",
        "zones": "Zone 1,Zone 2,Zone 3,Zone 4,Zone 5",
        "teams": '["Zone 1 Sanitation Team","Zone 2 Sanitation Team","Zone 3 Sanitation Team","Market Sanitation Team"]',
        "color": "#f97316",
    },
    {
        "id": "dept-drainage",
        "name": "Drainage & Stormwater Management",
        "short_name": "Drainage Dept",
        "categories": "Drainage",
        "head": "Rajesh Patel",
        "contact": "+91-80-2345-6791",
        "zones": "Zone 1,Zone 2,Zone 3",
        "teams": '["Drainage Inspection Team","Emergency Pump Team","Maintenance Team"]',
        "color": "#3b82f6",
    },
    {
        "id": "dept-water",
        "name": "Water Supply & Distribution Department",
        "short_name": "Water Dept",
        "categories": "Water",
        "head": "Anita Singh",
        "contact": "+91-80-2345-6792",
        "zones": "Zone 1,Zone 2,Zone 3,Zone 4",
        "teams": '["Pipeline Repair Team","Supply Management Team","Emergency Water Team"]',
        "color": "#06b6d4",
    },
    {
        "id": "dept-electrical",
        "name": "Electrical & Street Lighting Division",
        "short_name": "Electrical Dept",
        "categories": "Streetlights",
        "head": "Vikram Reddy",
        "contact": "+91-80-2345-6793",
        "zones": "Zone 1,Zone 2,Zone 3",
        "teams": '["Lighting Maintenance Team","Emergency Electrical Team","North Lighting Team","South Lighting Team"]',
        "color": "#eab308",
    },
    {
        "id": "dept-infra",
        "name": "Public Works & Infrastructure Department",
        "short_name": "PWD",
        "categories": "Infrastructure,Other",
        "head": "Meena Krishnan",
        "contact": "+91-80-2345-6794",
        "zones": "Zone 1,Zone 2,Zone 3,Zone 4",
        "teams": '["Civil Works Team","Bridge Maintenance Team","Public Facility Team"]',
        "color": "#8b5cf6",
    },
]


def _seed_departments(conn) -> None:
    try:
        cur = conn.execute("SELECT COUNT(*) as cnt FROM departments;")
        row = cur.fetchone()
        cnt = row["cnt"] if row and "cnt" in row else (row[0] if row else 0)
        if cnt > 0:
            return   # already seeded
    except Exception:
        pass

    for d in _DEPT_SEED:
        try:
            conn.execute(
                """
                INSERT INTO departments
                    (id, name, short_name, categories, head, contact, zones, teams, color)
                VALUES
                    (?, ?, ?, ?, ?, ?, ?, ?, ?);
                """,
                (
                    d["id"], d["name"], d["short_name"], d["categories"],
                    d["head"], d["contact"], d["zones"], d["teams"], d["color"]
                ),
            )
        except Exception as exc:
            logger.debug("Seed department %s note: %s", d["id"], exc)
    try:
        conn.commit()
    except Exception:
        pass
    logger.info("Departments seeded (%d rows)", len(_DEPT_SEED))



