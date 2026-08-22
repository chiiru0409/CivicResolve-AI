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
import re
from pathlib import Path
from typing import Any, Optional, Dict, List, Union

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

# In Vercel Serverless environment, local filesystem is read-only except /tmp
if os.environ.get("VERCEL"):
    import shutil
    DB_DIR = Path("/tmp/database")
    DB_PATH = DB_DIR / "civic.db"
    UPLOADS_DIR = Path("/tmp/uploads")
    UPLOADS_COMPLAINTS_DIR = UPLOADS_DIR / "complaints"
    UPLOADS_RESOLUTIONS_DIR = UPLOADS_DIR / "resolutions"
    try:
        DB_DIR.mkdir(parents=True, exist_ok=True)
        UPLOADS_COMPLAINTS_DIR.mkdir(parents=True, exist_ok=True)
        UPLOADS_RESOLUTIONS_DIR.mkdir(parents=True, exist_ok=True)
        bundled_db = _PROJECT_ROOT / "database" / "civic.db"
        if not DB_PATH.exists() and bundled_db.exists():
            shutil.copy2(bundled_db, DB_PATH)
    except Exception as exc:
        logger.warning("Vercel /tmp directory setup: %s", exc)


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


class RowWrapper(dict):
    """
    Dictionary wrapper that allows both column-name and integer index access,
    mirroring sqlite3.Row behavior.
    """
    def __getitem__(self, key):
        if isinstance(key, int):
            vals = list(self.values())
            if 0 <= key < len(vals):
                return vals[key]
            raise IndexError(f"Tuple index {key} out of range ({len(vals)} items)")
        return super().__getitem__(key)

    def get(self, key, default=None):
        if isinstance(key, int):
            vals = list(self.values())
            return vals[key] if 0 <= key < len(vals) else default
        return super().get(key, default)


class PostgresCursorWrapper:
    def __init__(self, cur):
        self._cur = cur
        self.lastrowid = None

    def execute(self, sql: str, params: Any = None):
        import re
        pg_sql = sql.replace("?", "%s")
        pg_sql = re.sub(r"datetime\('now'\)", "CURRENT_TIMESTAMP", pg_sql, flags=re.IGNORECASE)
        # Capture inserted user id
        is_insert_users = re.search(r"INSERT\s+INTO\s+users\b", pg_sql, re.IGNORECASE)
        if is_insert_users and "RETURNING" not in pg_sql.upper():
            pg_sql = pg_sql.rstrip().rstrip(";") + " RETURNING id;"
            self._cur.execute(pg_sql, params or ())
            res = self._cur.fetchone()
            if res and "id" in res:
                self.lastrowid = res["id"]
            return self

        self._cur.execute(pg_sql, params or ())
        return self

    def executemany(self, sql: str, params_seq: Any):
        import re
        pg_sql = sql.replace("?", "%s")
        pg_sql = re.sub(r"datetime\('now'\)", "CURRENT_TIMESTAMP", pg_sql, flags=re.IGNORECASE)
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


class PostgresConnectionWrapper:
    def __init__(self, conn):
        self._conn = conn

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
        self._conn.commit()

    def rollback(self):
        self._conn.rollback()

    def close(self):
        self._conn.close()

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        if exc_type:
            self.rollback()
        else:
            self.commit()


# ── Public helpers ─────────────────────────────────────────────────────────────

def get_connection():
    """
    Return an active database connection.
    If DATABASE_URL or POSTGRES_URL is set, connects to PostgreSQL.
    Otherwise connects to SQLite.
    """
    db_url = os.getenv("DATABASE_URL") or os.getenv("POSTGRES_URL") or os.getenv("POSTGRESQL_URL")
    if db_url and db_url.startswith(("postgres://", "postgresql://")):
        try:
            import psycopg2
            conn = psycopg2.connect(db_url)
            return PostgresConnectionWrapper(conn)
        except Exception as exc:
            logger.error("PostgreSQL connection error, falling back to SQLite: %s", exc)

    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA foreign_keys=ON;")
    return conn


def _column_exists(conn, table: str, column: str) -> bool:
    """Return True if *column* already exists in *table*."""
    try:
        cur = conn.execute(f"PRAGMA table_info({table});")
        return any(row["name"] == column for row in cur.fetchall())
    except Exception:
        return False


def _table_exists(conn, table: str) -> bool:
    try:
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

            # 4. Ensure seed complaints never claim citizen_id
            try:
                conn.execute("UPDATE complaints SET citizen_id = NULL, is_anonymous = 1 WHERE id IN ('CR-2026-123994', 'CR-2026-004821', 'CR-2026-004820', 'CR-2026-004819');")
            except Exception:
                pass

        # 5. Seed departments (outside the DDL transaction so it can be skipped)
        _seed_departments(conn)
        _seed_initial_complaints(conn)

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


_INITIAL_COMPLAINTS_SEED = [
    {
        "id": "CR-2026-123994",
        "complaint_number": "CR-2026-123994",
        "title": "Severe pothole causing traffic block",
        "description": "Large deep pothole on MG Road near the metro pillar 45. Vehicles are swerving into oncoming traffic.",
        "category": "Roads",
        "department": "Municipal Roads & Infrastructure Department",
        "priority": "HIGH",
        "severity": 8,
        "status": "In Progress",
        "latitude": 12.9716,
        "longitude": 77.5946,
        "location": "MG Road, Metro Pillar 45",
        "landmark": "Near Metro Pillar 45",
        "ai_confidence": 92,
        "ai_reason": "High traffic corridor with safety hazard.",
        "assigned_officer": "Central Roads Team",
        "assigned_team": "Central Roads Team",
        "estimated_response": "24 hours",
        "zone": "Zone 1",
        "citizen_id": None,
        "is_anonymous": 1,
        "contact_preference": "email",
        "source": "Web",
        "created_at": "2026-08-20T10:00:00",
        "updated_at": "2026-08-20T11:30:00",
    },
    {
        "id": "CR-2026-004821",
        "complaint_number": "CR-2026-004821",
        "title": "Large pothole near college bus stop",
        "description": "There is a huge pothole near the college bus stop and vehicles are struggling to pass. Two-wheelers have already fallen.",
        "category": "Roads",
        "department": "Municipal Roads & Infrastructure Department",
        "priority": "HIGH",
        "severity": 7,
        "status": "Assigned",
        "latitude": 12.9716,
        "longitude": 77.5946,
        "location": "Main Road, Near College Bus Stop",
        "landmark": "Government Engineering College",
        "ai_confidence": 94,
        "ai_reason": "Large road damage combined with its location near a high-traffic area creates a potential safety risk.",
        "assigned_officer": "Central Roads Team",
        "assigned_team": "Central Roads Team",
        "estimated_response": "24-48 hours",
        "zone": "Zone 2",
        "citizen_id": None,
        "is_anonymous": 1,
        "contact_preference": "email",
        "source": "Web",
        "created_at": "2026-08-20T12:00:00",
        "updated_at": "2026-08-20T12:30:00",
    },
    {
        "id": "CR-2026-004820",
        "complaint_number": "CR-2026-004820",
        "title": "Garbage overflow at market area",
        "description": "Garbage has been accumulating for three days near the market. The bins are overflowing and the stench is unbearable.",
        "category": "Garbage",
        "department": "Sanitation & Waste Management Department",
        "priority": "MEDIUM",
        "severity": 6,
        "status": "Submitted",
        "latitude": 12.9352,
        "longitude": 77.6245,
        "location": "4th Block Market, 80ft Road",
        "landmark": "Opposite City Bakery",
        "ai_confidence": 91,
        "ai_reason": "Accumulated municipal solid waste in a commercial market zone.",
        "assigned_officer": "Zone 2 Sanitation Team",
        "assigned_team": "Zone 2 Sanitation Team",
        "estimated_response": "12-24 hours",
        "zone": "Zone 3",
        "citizen_id": None,
        "is_anonymous": 1,
        "contact_preference": "email",
        "source": "AI Call",
        "created_at": "2026-08-20T14:00:00",
        "updated_at": "2026-08-20T14:00:00",
    },
    {
        "id": "CR-2026-004819",
        "complaint_number": "CR-2026-004819",
        "title": "Open drain overflow onto pedestrian walkway",
        "description": "Stormwater drain is overflowing with black water onto the footpath. Pedestrians cannot walk.",
        "category": "Drainage",
        "department": "Drainage & Stormwater Management",
        "priority": "HIGH",
        "severity": 8,
        "status": "In Progress",
        "latitude": 12.9784,
        "longitude": 77.6408,
        "location": "100ft Road, Near Signal Junction",
        "landmark": "Near Metro Station Exit B",
        "ai_confidence": 96,
        "ai_reason": "Contaminated overflow blocking public pedestrian access.",
        "assigned_officer": "Emergency Pump Team",
        "assigned_team": "Emergency Pump Team",
        "estimated_response": "4-8 hours",
        "zone": "Zone 1",
        "citizen_id": None,
        "is_anonymous": 1,
        "contact_preference": "email",
        "source": "Web",
        "created_at": "2026-08-19T09:00:00",
        "updated_at": "2026-08-19T11:00:00",
    }
]


def _seed_initial_complaints(conn: sqlite3.Connection) -> None:
    cur = conn.execute("SELECT COUNT(*) as cnt FROM complaints;")
    if cur.fetchone()["cnt"] > 0:
        return
    with conn:
        for c in _INITIAL_COMPLAINTS_SEED:
            conn.execute(
                """
                INSERT OR IGNORE INTO complaints (
                    id, complaint_number, title, description, category, department,
                    priority, severity, status, latitude, longitude, location, landmark,
                    ai_confidence, ai_reason, assigned_officer, assigned_team,
                    estimated_response, zone, citizen_id, is_anonymous, contact_preference,
                    source, created_at, updated_at
                ) VALUES (
                    :id, :complaint_number, :title, :description, :category, :department,
                    :priority, :severity, :status, :latitude, :longitude, :location, :landmark,
                    :ai_confidence, :ai_reason, :assigned_officer, :assigned_team,
                    :estimated_response, :zone, :citizen_id, :is_anonymous, :contact_preference,
                    :source, :created_at, :updated_at
                );
                """,
                c,
            )
            # Insert initial updates
            conn.execute(
                """
                INSERT OR IGNORE INTO complaint_updates (complaint_id, status, message, updated_by, created_at)
                VALUES (?, 'Submitted', 'Complaint registered in CivicResolve system.', 'system', ?);
                """,
                (c["id"], c["created_at"]),
            )
            if c["status"] in ("Assigned", "In Progress", "Resolved"):
                conn.execute(
                    """
                    INSERT OR IGNORE INTO complaint_updates (complaint_id, status, message, updated_by, created_at)
                    VALUES (?, ?, ?, 'admin', ?);
                    """,
                    (c["id"], c["status"], f"Complaint status updated to {c['status']}", c["updated_at"]),
                )
    logger.info("Initial complaints seeded (%d rows)", len(_INITIAL_COMPLAINTS_SEED))

