"""
database.py — SQLite connection, table creation, and safe migration.

Rules:
- NEVER drops existing tables or deletes existing rows.
- Uses CREATE TABLE IF NOT EXISTS everywhere.
- Adds columns with ALTER TABLE only when they are missing (safe migration).
- Creates indexes after tables are confirmed to exist.
- All multi-step writes must use explicit transactions (handled in main.py via
  context managers; connection helper is exposed here).
"""

import sqlite3
import os
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

# ── Path resolution ────────────────────────────────────────────────────────────
# backend/ sits inside the project root.  civic.db lives at project_root/database/
_BACKEND_DIR = Path(__file__).resolve().parent          # …/backend
_PROJECT_ROOT = _BACKEND_DIR.parent                      # …/CEVIC-RESOLVER-AI--main
DB_DIR  = _PROJECT_ROOT / "database"
DB_PATH = DB_DIR / "civic.db"

# Uploads live next to database/
UPLOADS_DIR            = _PROJECT_ROOT / "uploads"
UPLOADS_COMPLAINTS_DIR = UPLOADS_DIR / "complaints"
UPLOADS_RESOLUTIONS_DIR = UPLOADS_DIR / "resolutions"


# ── DDL statements ─────────────────────────────────────────────────────────────

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
    resolved_at         TEXT
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
    "CREATE INDEX IF NOT EXISTS idx_complaints_complaint_number ON complaints(complaint_number);",
    "CREATE INDEX IF NOT EXISTS idx_complaints_status           ON complaints(status);",
    "CREATE INDEX IF NOT EXISTS idx_complaints_priority         ON complaints(priority);",
    "CREATE INDEX IF NOT EXISTS idx_complaints_department       ON complaints(department);",
    "CREATE INDEX IF NOT EXISTS idx_complaints_created_at       ON complaints(created_at);",
    "CREATE INDEX IF NOT EXISTS idx_complaints_category         ON complaints(category);",
    "CREATE INDEX IF NOT EXISTS idx_updates_complaint_id        ON complaint_updates(complaint_id);",
    "CREATE INDEX IF NOT EXISTS idx_assignments_complaint_id    ON assignments(complaint_id);",
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
    ("complaint_updates", "updated_by",  "TEXT DEFAULT 'system'"),
    ("assignments", "officer",           "TEXT"),
    ("assignments", "team",              "TEXT"),
    ("assignments", "notes",             "TEXT"),
    ("assignments", "assigned_by",       "TEXT DEFAULT 'admin'"),
]


# ── Public helpers ─────────────────────────────────────────────────────────────

def get_connection() -> sqlite3.Connection:
    """
    Return a new SQLite connection with:
    - Row-factory set to sqlite3.Row (column-name access)
    - WAL journal mode (better concurrent read/write)
    - Foreign keys enforced
    """
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA foreign_keys=ON;")
    return conn


def _column_exists(conn: sqlite3.Connection, table: str, column: str) -> bool:
    """Return True if *column* already exists in *table*."""
    cur = conn.execute(f"PRAGMA table_info({table});")
    return any(row["name"] == column for row in cur.fetchall())


def _table_exists(conn: sqlite3.Connection, table: str) -> bool:
    cur = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?;", (table,)
    )
    return cur.fetchone() is not None


def init_db() -> None:
    """
    Idempotent initialisation:
    1. Create directories.
    2. Create tables (IF NOT EXISTS).
    3. Apply safe column migrations.
    4. Create indexes.
    5. Seed departments if table is empty.
    """
    # --- directories ---
    DB_DIR.mkdir(parents=True, exist_ok=True)
    UPLOADS_COMPLAINTS_DIR.mkdir(parents=True, exist_ok=True)
    UPLOADS_RESOLUTIONS_DIR.mkdir(parents=True, exist_ok=True)

    conn = get_connection()
    try:
        with conn:   # transaction
            # 1. Create tables
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
                    except sqlite3.OperationalError as exc:
                        # Column may have been added in a concurrent call — ignore
                        logger.debug("Skipping migration %s.%s: %s", table, col, exc)

            # 3. Indexes
            for stmt in _INDEXES:
                conn.execute(stmt)

        # 4. Seed departments (outside the DDL transaction so it can be skipped)
        _seed_departments(conn)

        logger.info("Database initialised: %s", DB_PATH)
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


def _seed_departments(conn: sqlite3.Connection) -> None:
    cur = conn.execute("SELECT COUNT(*) as cnt FROM departments;")
    if cur.fetchone()["cnt"] > 0:
        return   # already seeded
    with conn:
        conn.executemany(
            """
            INSERT OR IGNORE INTO departments
                (id, name, short_name, categories, head, contact, zones, teams, color)
            VALUES
                (:id, :name, :short_name, :categories, :head, :contact, :zones, :teams, :color)
            """,
            _DEPT_SEED,
        )
    logger.info("Departments seeded (%d rows)", len(_DEPT_SEED))
