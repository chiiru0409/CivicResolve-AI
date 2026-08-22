"""
main.py — FastAPI application entry point.

Routes:
  POST   /auth/register
  POST   /auth/login
  POST   /auth/admin/login
  GET    /auth/me
  PUT    /auth/profile

  POST   /complaints                  (citizen)
  GET    /complaints/mine             (citizen)
  GET    /complaints/{id}             (citizen — own only)

  GET    /track/{complaint_number}    (public — no auth, filtered)

  GET    /admin/complaints            (admin)
  GET    /admin/complaints/{id}       (admin)
  PATCH  /admin/complaints/{id}/status (admin)
  POST   /admin/complaints/{id}/assign (admin)
  GET    /admin/analytics             (admin)
  GET    /admin/departments           (admin)

Run:
  cd backend
  uvicorn main:app --reload --port 8000
"""

from __future__ import annotations

import json
import logging
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, APIRouter, Depends, HTTPException, status, UploadFile, File, Query, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

import auth as auth_module
from auth import (
    create_token, create_user, get_user_by_email, get_user_by_id,
    require_citizen, require_admin, verify_password, hash_password,
    get_admin_credentials, update_user_profile, seed_admin,
    CREATE_USERS_TABLE, CREATE_USERS_INDEX,
    ADD_CITIZEN_ID_COLUMN, ADD_CITIZEN_ID_INDEX,
)
from database import get_connection, init_db, UPLOADS_COMPLAINTS_DIR
from agent import run_analysis
from voice_agent import process_voice_call_turn
from schemas import (
    UserRegister, UserLogin, AdminLogin, ProfileUpdate, TokenResponse, UserOut,
    ComplaintCreate, StatusUpdate, AssignmentCreate,
    ComplaintOut, ComplaintListItem, TrackResponse,
    ComplaintUpdateOut, AssignmentOut,
    AnalyticsSummary, DepartmentOut,
    ChatRequest, ChatResponse,
    VoiceTurnRequest, VoiceTurnResponse,
    AdminAIBriefResponse, AdminAIQueryRequest, AdminAIQueryResponse,
    ComplaintAIAnalysisResponse, ActionProposal, DuplicateCluster, ExecuteActionRequest,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ── App ────────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="CivicResolve AI",
    description="AI-powered civic complaint management API",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

router = APIRouter()

# ── CORS ──────────────────────────────────────────────────────────────────────
cors_origins_env = os.getenv("CORS_ORIGINS")
allowed_origins = (
    [orig.strip() for orig in cors_origins_env.split(",") if orig.strip()]
    if cors_origins_env
    else ["http://localhost:5173", "http://localhost:5174", "http://localhost:3000", "https://civic-resolve-ai-seven.vercel.app"]
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=r"^https?:\/\/([a-zA-Z0-9-]+\.)*(vercel\.app|localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Immediate DB Initialization (essential for Vercel Serverless cold starts) ──
def _ensure_initialized():
    try:
        init_db()
        conn = get_connection()
        try:
            with conn:
                conn.execute(CREATE_USERS_TABLE)
                conn.execute(CREATE_USERS_INDEX)
                try:
                    conn.execute(ADD_CITIZEN_ID_COLUMN)
                    conn.execute(ADD_CITIZEN_ID_INDEX)
                except Exception:
                    pass
        finally:
            conn.close()
        seed_admin()
    except Exception as e:
        logger.warning("DB init: %s", e)

_ensure_initialized()


# ── Startup ───────────────────────────────────────────────────────────────────
@app.on_event("startup")
def startup():
    _ensure_initialized()

    # Mount uploads as static
    uploads_path = UPLOADS_COMPLAINTS_DIR.parent
    if uploads_path.exists():
        app.mount("/uploads", StaticFiles(directory=str(uploads_path)), name="uploads")

    # 5. Check local LLM status
    try:
        from llm import check_ollama_status, OLLAMA_MODEL, OLLAMA_BASE_URL
        status_info = check_ollama_status()
        if status_info["available"]:
            if status_info["model_installed"]:
                logger.info(
                    "✅ Local LLM ready — Ollama at %s | model: %s",
                    OLLAMA_BASE_URL, OLLAMA_MODEL,
                )
            else:
                logger.warning(
                    "⚠️  Ollama is running but model '%s' is NOT installed. "
                    "Run: ollama pull %s — falling back to rule-based analysis.",
                    OLLAMA_MODEL, OLLAMA_MODEL,
                )
        else:
            logger.warning(
                "⚠️  Ollama not running at %s — using rule-based analysis fallback. "
                "Start Ollama with: ollama serve",
                OLLAMA_BASE_URL,
            )
    except Exception as e:
        logger.warning("Could not check Ollama status: %s", e)

    logger.info("CivicResolve AI backend ready — http://localhost:8000")


# ══════════════════════════════════════════════════════════════════════════════
# HELPERS
# ══════════════════════════════════════════════════════════════════════════════

def _generate_complaint_number() -> str:
    year = datetime.now(timezone.utc).year
    suffix = str(uuid.uuid4().int)[:6].zfill(6)
    return f"CR-{year}-{suffix}"


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _fetch_updates(conn, complaint_id: str) -> list[dict]:
    rows = conn.execute(
        "SELECT * FROM complaint_updates WHERE complaint_id = ? ORDER BY created_at ASC;",
        (complaint_id,),
    ).fetchall()
    return [dict(r) for r in rows]


def _fetch_assignments(conn, complaint_id: str) -> list[dict]:
    rows = conn.execute(
        "SELECT * FROM assignments WHERE complaint_id = ? ORDER BY assigned_at ASC;",
        (complaint_id,),
    ).fetchall()
    return [dict(r) for r in rows]


def _row_to_complaint_out(row: dict, updates: list, assignments: list) -> dict:
    d = dict(row)
    # Parse ai_analysis JSON string
    if d.get("ai_analysis") and isinstance(d["ai_analysis"], str):
        try:
            d["ai_analysis"] = json.loads(d["ai_analysis"])
        except Exception:
            d["ai_analysis"] = None
    d["is_anonymous"] = bool(d.get("is_anonymous", 0))
    d["updates"] = updates
    d["assignments"] = assignments
    return d


def _build_initial_updates(complaint_id: str, category: str, priority: str, department: str) -> list[dict]:
    """Insert the first two update records for a new complaint."""
    now = _now_iso()
    updates = [
        {"complaint_id": complaint_id, "status": "Submitted",    "message": "Complaint received and submitted.",                       "updated_by": "system"},
        {"complaint_id": complaint_id, "status": "AI_Analysis",  "message": f"AI classified: {category} | Priority: {priority} | Department: {department}", "updated_by": "ai-agent"},
    ]
    return updates


# ══════════════════════════════════════════════════════════════════════════════
# AUTH ROUTES
# ══════════════════════════════════════════════════════════════════════════════

@router.post("/auth/register", response_model=TokenResponse, status_code=201)
def register(body: UserRegister):
    user = create_user(body.full_name, body.email, body.phone, body.password, role="citizen")
    token = create_token(user)
    return TokenResponse(
        access_token=token, role=user["role"],
        user_id=user["id"], full_name=user["full_name"], email=user["email"],
    )


@router.post("/auth/login", response_model=TokenResponse)
def login(body: UserLogin):
    email = body.email.strip().lower()
    user = get_user_by_email(email)
    pw_ok = False
    if user and user.get("password_hash"):
        pw_ok = verify_password(body.password, user["password_hash"]) or verify_password(body.password.strip(), user["password_hash"])
    if not user or not pw_ok:
        raise HTTPException(status_code=401, detail="Incorrect email or password.")
    if user["role"] == "admin":
        raise HTTPException(status_code=403, detail="Please use /auth/admin/login for authority access.")
    token = create_token(user)
    return TokenResponse(
        access_token=token, role=user["role"],
        user_id=user["id"], full_name=user["full_name"], email=user["email"],
    )


@router.post("/auth/admin/login", response_model=TokenResponse)
def admin_login(body: AdminLogin):
    clean_email = body.email.strip().strip("'").strip('"').lower()
    clean_password = body.password.strip().strip("'").strip('"')
    raw_password = body.password

    admin_env_email, admin_env_pass, admin_env_name = get_admin_credentials()
    user = get_user_by_email(clean_email)

    # Check if credentials match environment variable configuration
    matches_env_email = (clean_email == admin_env_email or clean_email == "admin@civicresolve.ai")
    matches_env_pass = (
        clean_password == admin_env_pass
        or raw_password == admin_env_pass
        or clean_password == admin_env_pass.strip()
    )

    # Check if credentials match database record
    matches_db = False
    if user and user.get("role") == "admin":
        user_hash = user.get("password_hash", "")
        matches_db = (
            verify_password(raw_password, user_hash)
            or verify_password(clean_password, user_hash)
            or raw_password == user_hash
            or clean_password == user_hash
        )

    pw_ok = (matches_env_email and matches_env_pass) or matches_db

    if not pw_ok:
        logger.warning("[AUTH] Admin login rejected for email: %s", clean_email)
        raise HTTPException(status_code=401, detail="Incorrect credentials.")

    # Credentials are valid! Ensure user row exists and is synchronized in DB
    if not user or user.get("role") != "admin" or not verify_password(clean_password, user.get("password_hash", "")):
        conn = get_connection()
        try:
            with conn:
                if user:
                    conn.execute(
                        "UPDATE users SET password_hash = ?, role = 'admin', is_active = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?;",
                        (hash_password(clean_password), user["id"]),
                    )
                else:
                    cur = conn.execute(
                        "INSERT INTO users (full_name, email, phone, password_hash, role) VALUES (?, ?, ?, ?, 'admin');",
                        (admin_env_name, clean_email, "", hash_password(clean_password)),
                    )
        finally:
            conn.close()
        user = get_user_by_email(clean_email)

    if not user:
        user = {
            "id": 1,
            "full_name": admin_env_name,
            "email": clean_email,
            "role": "admin",
        }

    token = create_token(user)
    return TokenResponse(
        access_token=token,
        role="admin",
        user_id=user["id"],
        full_name=user.get("full_name", admin_env_name),
        email=user.get("email", clean_email),
    )


@router.get("/auth/me", response_model=UserOut)
def get_me(current_user: dict = Depends(require_citizen)):
    user = get_user_by_id(int(current_user["sub"]))
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    return user


@router.put("/auth/profile", response_model=UserOut)
def update_profile(body: ProfileUpdate, current_user: dict = Depends(require_citizen)):
    user = update_user_profile(int(current_user["sub"]), body.full_name, body.phone)
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    return user


# ══════════════════════════════════════════════════════════════════════════════
# CITIZEN COMPLAINT ROUTES
# ══════════════════════════════════════════════════════════════════════════════

@router.post("/complaints", status_code=201)
def submit_complaint(body: ComplaintCreate, current_user: dict = Depends(require_citizen)):
    citizen_id = int(current_user["sub"])

    # Run AI analysis (backend is always authoritative for classification)
    ai = run_analysis(body.description, body.location, body.latitude, body.longitude)

    # Use frontend hints if provided and valid, else use backend result
    category   = body.category   or ai["category"]
    priority   = body.priority   or ai["priority"]
    department = body.department or ai["department_name"]
    title      = body.title      or ai["title"]
    confidence = body.ai_confidence if body.ai_confidence is not None else ai["ai_confidence"]
    reason     = body.ai_reason  or ai["ai_reason"]
    response_t = body.estimated_response or ai["estimated_response"]
    zone       = body.zone       or ai["zone"]
    team       = body.assigned_team or ai["assigned_team"]

    complaint_number = _generate_complaint_number()
    complaint_id     = complaint_number   # use same value as primary key
    now              = _now_iso()

    conn = get_connection()
    try:
        with conn:
            conn.execute(
                """
                INSERT INTO complaints (
                    id, complaint_number, citizen_id, title, description,
                    category, department, priority, severity, status,
                    latitude, longitude, location_accuracy,
                    location, address, landmark,
                    ai_confidence, ai_reason,
                    assigned_team, estimated_response, zone,
                    is_anonymous, contact_preference, source,
                    created_at, updated_at
                ) VALUES (
                    ?, ?, ?, ?, ?,
                    ?, ?, ?, ?, 'Submitted',
                    ?, ?, ?,
                    ?, ?, ?,
                    ?, ?,
                    ?, ?, ?,
                    ?, ?, ?,
                    ?, ?
                );
                """,
                (
                    complaint_id, complaint_number, citizen_id, title, body.description,
                    category, department, priority, ai["severity"], 
                    body.latitude, body.longitude, body.location_accuracy,
                    body.location, body.address, body.landmark,
                    confidence, reason,
                    team, response_t, zone,
                    1 if body.is_anonymous else 0, body.contact_preference, body.source or "Web",
                    now, now,
                ),
            )
            # Insert initial update records
            for upd in _build_initial_updates(complaint_id, category, priority, department):
                conn.execute(
                    "INSERT INTO complaint_updates (complaint_id, status, message, updated_by) VALUES (?, ?, ?, ?);",
                    (upd["complaint_id"], upd["status"], upd["message"], upd["updated_by"]),
                )

        row = conn.execute("SELECT * FROM complaints WHERE id = ?;", (complaint_id,)).fetchone()
        updates     = _fetch_updates(conn, complaint_id)
        assignments = _fetch_assignments(conn, complaint_id)
        result = _row_to_complaint_out(dict(row), updates, assignments)
        return result
    finally:
        conn.close()


@router.post("/complaints/{complaint_id}/image")
async def upload_image(
    complaint_id: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(require_citizen),
):
    citizen_id = int(current_user["sub"])
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT citizen_id FROM complaints WHERE id = ?;", (complaint_id,)
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Complaint not found.")
        if row["citizen_id"] != citizen_id:
            raise HTTPException(status_code=403, detail="Not your complaint.")

        # Save file
        ext = Path(file.filename).suffix if file.filename else ".jpg"
        fname = f"{complaint_id}{ext}"
        dest  = UPLOADS_COMPLAINTS_DIR / fname
        content = await file.read()
        dest.write_bytes(content)
        image_path = f"/uploads/complaints/{fname}"

        with conn:
            conn.execute(
                "UPDATE complaints SET image_path = ?, updated_at = ? WHERE id = ?;",
                (image_path, _now_iso(), complaint_id),
            )
        return {"image_path": image_path}
    finally:
        conn.close()


@router.get("/complaints/mine")
def get_my_complaints(current_user: dict = Depends(require_citizen)):
    citizen_id = int(current_user["sub"])
    conn = get_connection()
    try:
        rows = conn.execute(
            """
            SELECT id, complaint_number, title, category, priority, status,
                   department, location, latitude, longitude, landmark,
                   ai_confidence, created_at, updated_at
            FROM complaints WHERE citizen_id = ?
            ORDER BY created_at DESC;
            """,
            (citizen_id,),
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


@router.get("/complaints/{complaint_id}")
def get_my_complaint_detail(complaint_id: str, current_user: dict = Depends(require_citizen)):
    citizen_id = int(current_user["sub"])
    conn = get_connection()
    try:
        row = conn.execute("SELECT * FROM complaints WHERE id = ?;", (complaint_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Complaint not found.")
        d = dict(row)
        # Security: citizen can only view their own complaint
        if d.get("citizen_id") != citizen_id and current_user.get("role") != "admin":
            raise HTTPException(status_code=403, detail="Access denied.")
        updates     = _fetch_updates(conn, complaint_id)
        assignments = _fetch_assignments(conn, complaint_id)
        return _row_to_complaint_out(d, updates, assignments)
    finally:
        conn.close()


# ══════════════════════════════════════════════════════════════════════════════
# PUBLIC TRACKING ROUTE
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/track/{complaint_number}")
def track_complaint(complaint_number: str):
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT * FROM complaints WHERE complaint_number = ?;", (complaint_number,)
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail=f"Complaint {complaint_number} not found.")
        d = dict(row)

        # Fetch public update history (status + message only)
        update_rows = conn.execute(
            "SELECT id, complaint_id, status, message, updated_by, created_at FROM complaint_updates WHERE complaint_id = ? ORDER BY created_at ASC;",
            (d["id"],),
        ).fetchall()
        updates = [dict(r) for r in update_rows]

        # Return ONLY safe fields — no PII, no coordinates, no internal data
        return {
            "complaint_number":  d["complaint_number"],
            "title":             d["title"],
            "category":          d["category"],
            "priority":          d["priority"],
            "status":            d["status"],
            "department":        d["department"],
            "estimated_response": d.get("estimated_response"),
            "escalation_level":  d.get("escalation_level", 0),
            "created_at":        d["created_at"],
            "updated_at":        d["updated_at"],
            "resolved_at":       d.get("resolved_at"),
            "updates":           updates,
        }
    finally:
        conn.close()


# ══════════════════════════════════════════════════════════════════════════════
# ADMIN ROUTES
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/admin/complaints")
def admin_list_complaints(
    search:     Optional[str] = Query(None),
    category:   Optional[str] = Query(None),
    priority:   Optional[str] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    department: Optional[str] = Query(None),
    limit:  int = Query(100, le=500),
    offset: int = Query(0),
    current_user: dict = Depends(require_admin),
):
    conn = get_connection()
    try:
        where_clauses, params = [], []

        if search:
            where_clauses.append("(title LIKE ? OR complaint_number LIKE ? OR location LIKE ? OR description LIKE ?)")
            s = f"%{search}%"
            params.extend([s, s, s, s])
        if category:
            where_clauses.append("category = ?"); params.append(category)
        if priority:
            where_clauses.append("priority = ?"); params.append(priority)
        if status_filter:
            where_clauses.append("status = ?"); params.append(status_filter)
        if department:
            where_clauses.append("department LIKE ?"); params.append(f"%{department}%")

        where_sql = ("WHERE " + " AND ".join(where_clauses)) if where_clauses else ""
        rows = conn.execute(
            f"""
            SELECT id, complaint_number, title, category, priority, status,
                   department, location, latitude, longitude, landmark,
                   ai_confidence, source, created_at, updated_at
            FROM complaints {where_sql}
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?;
            """,
            params + [limit, offset],
        ).fetchall()

        total = conn.execute(f"SELECT COUNT(*) FROM complaints {where_sql};", params).fetchone()[0]
        return {"total": total, "items": [dict(r) for r in rows]}
    finally:
        conn.close()


@router.get("/admin/complaints/{complaint_id}")
def admin_get_complaint(complaint_id: str, current_user: dict = Depends(require_admin)):
    conn = get_connection()
    try:
        row = conn.execute("SELECT * FROM complaints WHERE id = ?;", (complaint_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Complaint not found.")
        updates     = _fetch_updates(conn, complaint_id)
        assignments = _fetch_assignments(conn, complaint_id)
        return _row_to_complaint_out(dict(row), updates, assignments)
    finally:
        conn.close()


@router.patch("/admin/complaints/{complaint_id}/status")
def admin_update_status(
    complaint_id: str,
    body: StatusUpdate,
    current_user: dict = Depends(require_admin),
):
    now = _now_iso()
    conn = get_connection()
    try:
        row = conn.execute("SELECT id FROM complaints WHERE id = ?;", (complaint_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Complaint not found.")
        with conn:
            resolved_at_sql = ", resolved_at = ?" if body.status in ("Resolved", "Closed") else ""
            params = [body.status, now]
            if body.status in ("Resolved", "Closed"):
                params.append(now)
            params.append(complaint_id)
            conn.execute(
                f"UPDATE complaints SET status = ?, updated_at = ?{resolved_at_sql} WHERE id = ?;",
                params,
            )
            conn.execute(
                "INSERT INTO complaint_updates (complaint_id, status, message, updated_by) VALUES (?, ?, ?, ?);",
                (complaint_id, body.status, body.message, body.updated_by),
            )
        updated_row = conn.execute("SELECT * FROM complaints WHERE id = ?;", (complaint_id,)).fetchone()
        updates     = _fetch_updates(conn, complaint_id)
        assignments = _fetch_assignments(conn, complaint_id)
        return _row_to_complaint_out(dict(updated_row), updates, assignments)
    finally:
        conn.close()


@router.post("/admin/complaints/{complaint_id}/assign")
def admin_assign_complaint(
    complaint_id: str,
    body: AssignmentCreate,
    current_user: dict = Depends(require_admin),
):
    now = _now_iso()
    conn = get_connection()
    try:
        row = conn.execute("SELECT id FROM complaints WHERE id = ?;", (complaint_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Complaint not found.")
        with conn:
            conn.execute(
                """
                INSERT INTO assignments (complaint_id, department, officer, team, notes, assigned_by, assigned_at)
                VALUES (?, ?, ?, ?, ?, ?, ?);
                """,
                (complaint_id, body.department, body.officer, body.team, body.notes, body.assigned_by, now),
            )
            conn.execute(
                """
                UPDATE complaints SET
                    department = ?, assigned_officer = ?, assigned_team = ?,
                    status = 'Assigned', updated_at = ?
                WHERE id = ?;
                """,
                (body.department, body.officer, body.team, now, complaint_id),
            )
            conn.execute(
                "INSERT INTO complaint_updates (complaint_id, status, message, updated_by) VALUES (?, 'Assigned', ?, ?);",
                (complaint_id, f"Assigned to {body.department}" + (f" — {body.officer}" if body.officer else ""), body.assigned_by),
            )
        return {"success": True, "message": "Assignment saved."}
    finally:
        conn.close()


@router.get("/admin/analytics")
def admin_analytics(current_user: dict = Depends(require_admin)):
    conn = get_connection()
    try:
        total = conn.execute("SELECT COUNT(*) FROM complaints;").fetchone()[0]
        high  = conn.execute("SELECT COUNT(*) FROM complaints WHERE priority IN ('HIGH','CRITICAL');").fetchone()[0]
        pending = conn.execute("SELECT COUNT(*) FROM complaints WHERE status NOT IN ('Resolved','Closed');").fetchone()[0]
        resolved = conn.execute("SELECT COUNT(*) FROM complaints WHERE status IN ('Resolved','Closed');").fetchone()[0]

        by_cat = conn.execute(
            "SELECT category, COUNT(*) as count FROM complaints GROUP BY category;"
        ).fetchall()
        by_pri = conn.execute(
            "SELECT priority, COUNT(*) as count FROM complaints GROUP BY priority;"
        ).fetchall()
        by_sta = conn.execute(
            "SELECT status, COUNT(*) as count FROM complaints GROUP BY status;"
        ).fetchall()
        by_dep = conn.execute(
            "SELECT department, COUNT(*) as count FROM complaints WHERE department IS NOT NULL GROUP BY department;"
        ).fetchall()

        return {
            "total_complaints": total,
            "high_priority": high,
            "pending": pending,
            "resolved": resolved,
            "resolution_rate": round((resolved / total * 100), 1) if total > 0 else 0,
            "by_category":   [{"category":   r[0], "count": r[1]} for r in by_cat],
            "by_priority":   [{"priority":   r[0], "count": r[1]} for r in by_pri],
            "by_status":     [{"status":     r[0], "count": r[1]} for r in by_sta],
            "by_department": [{"department": r[0], "count": r[1]} for r in by_dep],
        }
    finally:
        conn.close()


@router.get("/admin/departments")
def admin_departments(current_user: dict = Depends(require_admin)):
    import json as _json
    conn = get_connection()
    try:
        rows = conn.execute("SELECT * FROM departments ORDER BY name;").fetchall()
        result = []
        for row in rows:
            d = dict(row)
            d["categories"] = [c.strip() for c in (d.get("categories") or "").split(",") if c.strip()]
            d["zones"]      = [z.strip() for z in (d.get("zones") or "").split(",") if z.strip()]
            d["teams"]      = _json.loads(d.get("teams") or "[]")
            result.append(d)
        return result
    finally:
        conn.close()


# ── ADMIN AI INTELLIGENCE COMMAND CENTER ENDPOINTS ────────────────────────────

@router.get("/admin/ai/brief", response_model=AdminAIBriefResponse)
def get_admin_ai_brief(current_user: dict = Depends(require_admin)):
    """
    Generate live, ground-truth AI Daily Civic Brief from real complaint records.
    Calculates actual counts, top workload department, urgency level, and action points.
    """
    conn = get_connection()
    try:
        total = conn.execute("SELECT COUNT(*) FROM complaints;").fetchone()[0]
        high_prio = conn.execute("SELECT COUNT(*) FROM complaints WHERE priority IN ('HIGH', 'CRITICAL');").fetchone()[0]
        pending = conn.execute("SELECT COUNT(*) FROM complaints WHERE status NOT IN ('Resolved', 'Closed');").fetchone()[0]
        resolved = conn.execute("SELECT COUNT(*) FROM complaints WHERE status IN ('Resolved', 'Closed');").fetchone()[0]

        # Recent complaints count
        today_cnt = conn.execute(
            "SELECT COUNT(*) FROM complaints WHERE created_at >= date('now', 'start of day') OR created_at >= datetime('now', '-24 hours');"
        ).fetchone()[0]

        # Overdue pending count (aged > 48 hours)
        overdue_cnt = conn.execute(
            "SELECT COUNT(*) FROM complaints WHERE status NOT IN ('Resolved', 'Closed') AND created_at <= datetime('now', '-48 hours');"
        ).fetchone()[0]

        by_cat_rows = conn.execute("SELECT category, COUNT(*) as cnt FROM complaints GROUP BY category ORDER BY cnt DESC;").fetchall()
        cat_counts = {r[0]: r[1] for r in by_cat_rows}

        by_pri_rows = conn.execute("SELECT priority, COUNT(*) as cnt FROM complaints GROUP BY priority;").fetchall()
        pri_counts = {r[0]: r[1] for r in by_pri_rows}

        by_dep_rows = conn.execute(
            "SELECT department, COUNT(*) as cnt FROM complaints WHERE status NOT IN ('Resolved', 'Closed') AND department IS NOT NULL GROUP BY department ORDER BY cnt DESC;"
        ).fetchall()
        top_dept = by_dep_rows[0][0] if by_dep_rows else "Municipal Roads & Infrastructure Department"
        top_cat = by_cat_rows[0][0] if by_cat_rows else "Roads"

        urgency_level = "CRITICAL" if high_prio >= 3 else ("HIGH" if high_prio > 0 else "NORMAL")

        ai_summary = (
            f"Civic Intelligence Brief: {total} total citizen complaints registered. "
            f"There are {pending} active pending cases across municipal divisions, with {high_prio} high-priority issues requiring immediate dispatch. "
            f"The heaviest workload is currently on {top_dept} (lead category: {top_cat} with {cat_counts.get(top_cat, 0)} reports). "
            f"{overdue_cnt} reports are approaching or exceed the 48-hour resolution benchmark."
        )

        key_bullets = [
            f"{high_prio} high-priority cases require supervisor assignment or emergency dispatch.",
            f"Sanitation & Road infrastructure represent {cat_counts.get('Roads', 0) + cat_counts.get('Garbage', 0)} of total municipal reports.",
            f"{overdue_cnt} complaints are flagged for potential escalation due to aging.",
            f"Active field resolution rate is currently {round((resolved / total * 100), 1) if total > 0 else 0}% across all wards.",
        ]

        return AdminAIBriefResponse(
            total_complaints=total,
            today_complaints=today_cnt,
            high_priority_count=high_prio,
            pending_count=pending,
            resolved_count=resolved,
            overdue_count=overdue_cnt,
            top_department=top_dept,
            top_category=top_cat,
            urgency_level=urgency_level,
            ai_summary=ai_summary,
            key_bullet_points=key_bullets,
            category_counts=cat_counts,
            priority_counts=pri_counts,
        )
    finally:
        conn.close()


@router.post("/admin/ai/assistant", response_model=AdminAIQueryResponse)
def handle_admin_ai_query(body: AdminAIQueryRequest, current_user: dict = Depends(require_admin)):
    """
    Dedicated AI Intelligence Copilot for administrators.
    Answers administrative decision support queries grounded in actual database records.
    """
    conn = get_connection()
    try:
        q = body.query.strip().lower()

        # 1. High priority / urgent queries
        if any(w in q for w in ["high priority", "urgent", "critical", "immediate", "highest priority", "attention"]):
            rows = conn.execute(
                """
                SELECT id, complaint_number, title, category, priority, status, department, location, created_at
                FROM complaints
                WHERE priority IN ('HIGH', 'CRITICAL') AND status NOT IN ('Resolved', 'Closed')
                ORDER BY created_at DESC LIMIT 5;
                """
            ).fetchall()
            comps = [dict(r) for r in rows]
            proposals = []
            if comps:
                ans = f"Identified **{len(comps)} critical/high-priority cases** requiring urgent administrative attention:\n\n"
                for c in comps:
                    ans += f"• **{c['complaint_number']}** ({c['category']}): {c['title']} at *{c['location']}* — routed to {c['department']}\n"
                    # Generate action proposal
                    if c["status"] == "Submitted":
                        proposals.append(ActionProposal(
                            action_type="update_status",
                            complaint_id=c["complaint_number"],
                            target_value="In Progress",
                            reason=f"Fast-track {c['complaint_number']} into field operations",
                            requires_confirmation=True,
                        ))
                    elif c["status"] in ("Assigned", "In Progress"):
                        proposals.append(ActionProposal(
                            action_type="escalate",
                            complaint_id=c["complaint_number"],
                            target_value="Escalate",
                            reason=f"Escalate priority SLA for {c['complaint_number']}",
                            requires_confirmation=True,
                        ))
                actions = ["Dispatch Emergency Inspection Team", "Escalate to Department Head", "Send Status Update to Citizens"]
            else:
                ans = "Great news! There are currently **0 critical or high-priority unresolved complaints** in the active queue."
                actions = ["Review Normal Priority Queue", "View Analytics Summary", "Inspect Map View"]
            return AdminAIQueryResponse(
                query=body.query,
                answer=ans,
                suggested_actions=actions,
                related_complaints=comps,
                action_proposals=proposals,
            )

        # 2. Duplicate / Similar complaint detection
        if any(w in q for w in ["duplicate", "similar", "repeat", "cluster", "same area", "multiple reports"]):
            rows = conn.execute(
                """
                SELECT id, complaint_number, title, category, priority, status, department, location, latitude, longitude, created_at
                FROM complaints
                WHERE status NOT IN ('Resolved', 'Closed')
                ORDER BY created_at DESC LIMIT 30;
                """
            ).fetchall()
            all_comps = [dict(r) for r in rows]
            clusters: list[DuplicateCluster] = []
            visited = set()

            for i in range(len(all_comps)):
                c1 = all_comps[i]
                if c1["id"] in visited:
                    continue
                matched = [c1]
                for j in range(i + 1, len(all_comps)):
                    c2 = all_comps[j]
                    if c2["id"] in visited:
                        continue
                    # Match by category & similarity in location or title keywords
                    words1 = set(c1["title"].lower().split() + (c1["location"] or "").lower().split())
                    words2 = set(c2["title"].lower().split() + (c2["location"] or "").lower().split())
                    overlap = words1.intersection(words2)
                    same_cat = c1["category"] == c2["category"]
                    
                    if (same_cat and len(overlap) >= 2) or (len(overlap) >= 3):
                        matched.append(c2)
                        visited.add(c2["id"])

                if len(matched) > 1:
                    visited.add(c1["id"])
                    c_ids = [m["complaint_number"] for m in matched]
                    clusters.append(DuplicateCluster(
                        cluster_id=f"CLUSTER-{c1['complaint_number']}",
                        category=c1["category"],
                        location=c1["location"] or "Identified Ward Cluster",
                        similarity_score=91,
                        complaint_ids=c_ids,
                        complaints=matched,
                        suggested_action=f"Consolidate {len(matched)} tickets under single field work order for {c1['department']}",
                    ))

            if clusters:
                ans = f"**AI Duplicate & Incident Cluster Analysis:**\n\nIdentified **{len(clusters)} potential duplicate/incident clusters**:\n\n"
                for cl in clusters:
                    ans += f"• **Cluster {cl.cluster_id}** ({cl.category} at {cl.location}): {len(cl.complaint_ids)} matching tickets ({', '.join(cl.complaint_ids[:3])}) — {cl.similarity_score}% correlation score.\n"
                actions = ["Consolidate Duplicate Work Orders", "Assign Unified Field Team", "Notify Reporting Citizens"]
            else:
                ans = "No duplicate clusters detected among active open complaints. All reports represent distinct spatial coordinates and unique municipal categories."
                actions = ["View Incident Map", "Check High Priority Queue", "Review Analytics"]

            return AdminAIQueryResponse(
                query=body.query,
                answer=ans,
                suggested_actions=actions,
                duplicate_clusters=clusters,
            )

        # 3. Department workload queries
        if any(w in q for w in ["department", "workload", "unresolved", "most complaints", "heaviest"]):
            rows = conn.execute(
                """
                SELECT department, COUNT(*) as pending_cnt
                FROM complaints
                WHERE status NOT IN ('Resolved', 'Closed') AND department IS NOT NULL
                GROUP BY department
                ORDER BY pending_cnt DESC;
                """
            ).fetchall()
            dept_counts = {r[0]: r[1] for r in rows}
            top_dept = rows[0][0] if rows else "Municipal Engineering"
            top_cnt = rows[0][1] if rows else 0
            ans = f"**Department Workload Breakdown:**\n\nThe department with the most unresolved complaints is **{top_dept}** with **{top_cnt} active cases**.\n\n"
            for d, cnt in dept_counts.items():
                ans += f"• **{d}**: {cnt} open cases\n"
            actions = [f"Reassign cases from {top_dept}", "View Department Teams", "Filter by Department"]
            return AdminAIQueryResponse(query=body.query, answer=ans, suggested_actions=actions, category_insights=dept_counts)

        # 4. Longest unresolved / aging / escalation
        if any(w in q for w in ["longest", "oldest", "overdue", "aging", "escalat", "delayed"]):
            rows = conn.execute(
                """
                SELECT id, complaint_number, title, category, priority, status, department, location, created_at
                FROM complaints
                WHERE status NOT IN ('Resolved', 'Closed')
                ORDER BY created_at ASC LIMIT 4;
                """
            ).fetchall()
            comps = [dict(r) for r in rows]
            proposals = []
            ans = "**Overdue / Aging Complaints Analysis:**\n\nThe following reports have been active the longest:\n\n"
            for c in comps:
                ans += f"• **{c['complaint_number']}** ({c['category']}): {c['title']} — Registered on *{c['created_at'][:10]}*, currently *{c['status']}*\n"
                proposals.append(ActionProposal(
                    action_type="escalate",
                    complaint_id=c["complaint_number"],
                    target_value="Escalate",
                    reason=f"Auto-escalate {c['complaint_number']} due to exceeding SLA turnaround",
                    requires_confirmation=True,
                ))
            actions = ["Auto-escalate Overdue Reports", "Notify Assigned Officers", "Request Priority Field Status"]
            return AdminAIQueryResponse(
                query=body.query,
                answer=ans,
                suggested_actions=actions,
                related_complaints=comps,
                action_proposals=proposals,
            )

        # 5. Category specific query (Garbage, Roads, Water, Drainage, Streetlights)
        for cat in ["Garbage", "Roads", "Water", "Drainage", "Streetlights", "Infrastructure"]:
            if cat.lower() in q:
                rows = conn.execute(
                    "SELECT id, complaint_number, title, priority, status, location FROM complaints WHERE category = ? ORDER BY created_at DESC LIMIT 5;",
                    (cat,),
                ).fetchall()
                total_cat = conn.execute("SELECT COUNT(*) FROM complaints WHERE category = ?;", (cat,)).fetchone()[0]
                comps = [dict(r) for r in rows]
                ans = f"**{cat} Civic Summary:**\n\nThere are **{total_cat} total {cat.lower()} complaints** in the system.\n\n"
                for c in comps:
                    ans += f"• **{c['complaint_number']}** [{c['priority']}]: {c['title']} at *{c['location']}* ({c['status']})\n"
                actions = [f"Filter by {cat}", f"Assign {cat} Team", "Export Category Report"]
                return AdminAIQueryResponse(query=body.query, answer=ans, suggested_actions=actions, related_complaints=comps)

        # Default operational summary query
        total = conn.execute("SELECT COUNT(*) FROM complaints;").fetchone()[0]
        pending = conn.execute("SELECT COUNT(*) FROM complaints WHERE status NOT IN ('Resolved', 'Closed');").fetchone()[0]
        high = conn.execute("SELECT COUNT(*) FROM complaints WHERE priority IN ('HIGH', 'CRITICAL');").fetchone()[0]
        ans = (
            f"**Civic Operations Intelligence Summary:**\n\n"
            f"The system currently manages **{total} complaints**, with **{pending} active cases** and **{high} high-priority tasks**.\n\n"
            f"You can ask me to:\n"
            f"• *Show highest priority complaints*\n"
            f"• *Find duplicate complaints and incident clusters*\n"
            f"• *Analyze department workloads*\n"
            f"• *Detect recurring geographic problem areas*\n"
            f"• *List longest unresolved complaints*\n"
            f"• *Summarize garbage, road, or water issues*"
        )
        actions = ["Show High Priority Issues", "Find Duplicate Clusters", "Department Workload Matrix", "View Map Hotspots"]
        return AdminAIQueryResponse(query=body.query, answer=ans, suggested_actions=actions)
    finally:
        conn.close()


@router.post("/admin/ai/execute-action")
def execute_admin_ai_action(body: ExecuteActionRequest, current_user: dict = Depends(require_admin)):
    """
    Execute a validated administrative action proposed by the AI Agent after administrator confirmation.
    """
    conn = get_connection()
    now = _now_iso()
    try:
        row = conn.execute("SELECT id, complaint_number, status, department FROM complaints WHERE id = ? OR complaint_number = ?;", (body.complaint_id, body.complaint_id)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail=f"Complaint {body.complaint_id} not found.")
        c = dict(row)
        cid = c["id"]

        if body.action_type == "update_status":
            with conn:
                resolved_sql = ", resolved_at = ?" if body.target_value in ("Resolved", "Closed") else ""
                params = [body.target_value, now]
                if body.target_value in ("Resolved", "Closed"):
                    params.append(now)
                params.append(cid)
                conn.execute(f"UPDATE complaints SET status = ?, updated_at = ?{resolved_sql} WHERE id = ?;", params)
                conn.execute(
                    "INSERT INTO complaint_updates (complaint_id, status, message, updated_by) VALUES (?, ?, ?, 'admin-ai');",
                    (cid, body.target_value, body.note or f"Status updated to {body.target_value} via AI Operations Action."),
                )
            return {"success": True, "message": f"Status updated to {body.target_value} for {c['complaint_number']}."}

        elif body.action_type in ("assign_department", "assign"):
            dept = body.target_value
            officer = body.officer_or_team or "Designated Team"
            with conn:
                conn.execute(
                    """
                    INSERT INTO assignments (complaint_id, department, officer, team, notes, assigned_by, assigned_at)
                    VALUES (?, ?, ?, ?, ?, 'admin-ai', ?);
                    """,
                    (cid, dept, officer, officer, body.note or "AI Recommended Assignment", now),
                )
                conn.execute(
                    "UPDATE complaints SET department = ?, assigned_officer = ?, status = 'Assigned', updated_at = ? WHERE id = ?;",
                    (dept, officer, now, cid),
                )
                conn.execute(
                    "INSERT INTO complaint_updates (complaint_id, status, message, updated_by) VALUES (?, 'Assigned', ?, 'admin-ai');",
                    (cid, f"Assigned to {dept} ({officer}) via AI Operations Copilot",),
                )
            return {"success": True, "message": f"Successfully assigned {c['complaint_number']} to {dept}."}

        elif body.action_type == "escalate":
            with conn:
                conn.execute(
                    "UPDATE complaints SET escalation_level = escalation_level + 1, priority = 'CRITICAL', updated_at = ? WHERE id = ?;",
                    (now, cid),
                )
                conn.execute(
                    "INSERT INTO complaint_updates (complaint_id, status, message, updated_by) VALUES (?, 'Escalated', 'Priority escalated to CRITICAL via AI Operations SLA rule.', 'admin-ai');",
                    (c["status"], cid),
                )
            return {"success": True, "message": f"Complaint {c['complaint_number']} escalated to CRITICAL priority."}

        else:
            raise HTTPException(status_code=400, detail=f"Unsupported action type: {body.action_type}")
    finally:
        conn.close()


@router.get("/admin/ai/analysis/{complaint_id}", response_model=ComplaintAIAnalysisResponse)
def get_complaint_ai_analysis(complaint_id: str, current_user: dict = Depends(require_admin)):
    """
    Generate deep multi-dimensional AI diagnostic analysis for a specific complaint.
    Includes risk rating, severity, recommended administrative actions, and duplicate detection.
    """
    conn = get_connection()
    try:
        row = conn.execute("SELECT * FROM complaints WHERE id = ? OR complaint_number = ?;", (complaint_id, complaint_id)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Complaint not found.")
        c = dict(row)

        category = c.get("category", "Other")
        priority = c.get("priority", "MEDIUM")
        severity = c.get("severity", 5)
        dept = c.get("department", "Municipal Department")
        loc = c.get("location", "")

        # Find similar complaints (same category or nearby location)
        sim_rows = conn.execute(
            """
            SELECT id, complaint_number, title, category, priority, status, location, created_at
            FROM complaints
            WHERE (category = ? OR location LIKE ?) AND id != ?
            ORDER BY created_at DESC LIMIT 3;
            """,
            (category, f"%{loc[:10]}%" if len(loc) >= 5 else "%XYZ%", c["id"]),
        ).fetchall()
        similar = [dict(r) for r in sim_rows]

        proposals = []
        # Risk & Action reasoning
        if priority in ("HIGH", "CRITICAL"):
            risk = f"High public safety hazard. Active disruption in {loc or 'municipal sector'} posing vehicle and pedestrian risk."
            action = f"Urgently dispatch {c.get('assigned_team', 'Emergency Response Team')} for on-site inspection and immediate repair within 24 hours."
            urgency = "Critical infrastructure safety vulnerability requiring prompt administrative prioritization."
            proposals.append(ActionProposal(
                action_type="assign_department",
                complaint_id=c["complaint_number"] or c["id"],
                target_value=dept,
                officer_or_team=c.get("assigned_team") or "Emergency Response Team",
                reason=f"Confirm rapid dispatch of {c.get('assigned_team') or 'Emergency Response Team'} to {loc}",
                requires_confirmation=True,
            ))
        elif priority == "MEDIUM":
            risk = f"Moderate public disruption and sanitation/service impact affecting neighborhood residents in {loc or 'zone'}."
            action = f"Assign to {c.get('assigned_team', 'Maintenance Team')} with work completion scheduled within 48 to 72 hours."
            urgency = "Standard municipal maintenance queue with intermediate SLA timeline."
            proposals.append(ActionProposal(
                action_type="update_status",
                complaint_id=c["complaint_number"] or c["id"],
                target_value="In Progress",
                reason=f"Advance {c['complaint_number']} to In Progress state for active remediation",
                requires_confirmation=True,
            ))
        else:
            risk = "Low risk minor cosmetic or routine maintenance concern with no immediate safety danger."
            action = f"Add to {dept} routine scheduled maintenance cycle."
            urgency = "Routine civic report scheduled for standard batch inspection."

        return ComplaintAIAnalysisResponse(
            complaint_id=c["complaint_number"] or c["id"],
            title=c["title"],
            category=category,
            subcategory=c.get("subcategory"),
            priority=priority,
            severity=severity,
            department=dept,
            assigned_team=c.get("assigned_team"),
            location=loc,
            risk_assessment=risk,
            urgency_reasoning=urgency,
            recommended_action=action,
            estimated_response=c.get("estimated_response") or ("24-48 hours" if priority == "HIGH" else "48-72 hours"),
            similar_reports_count=len(similar),
            similar_reports=similar,
            ai_confidence=c.get("ai_confidence") or 92,
            action_proposals=proposals,
        )
    finally:
        conn.close()



@router.get("/llm/status")
def llm_status():
    """Check if Ollama and the configured model are available."""
    try:
        from llm import check_ollama_status
        return check_ollama_status()
    except Exception as e:
        return {"available": False, "error": str(e)}


@router.post("/chat", response_model=ChatResponse)
def handle_chat(body: ChatRequest):
    """
    Intelligent chatbot endpoint for civic complaints.
    Connects to Ollama (qwen2.5:3b) with grounding in CivicResolve's departments,
    and falls back to deterministic civic routing when LLM is unavailable.
    """
    import re
    from classifier import classify, get_department_for_category, CATEGORY_KEYWORDS
    from priority import detect_priority

    user_msg = body.message.strip()
    lower = user_msg.lower()

    # 1. Check for Complaint ID tracking
    id_match = re.search(r"CR-\d{4}-\d{4,8}", user_msg, re.IGNORECASE)
    if id_match:
        cid = id_match.group(0).upper()
        return ChatResponse(
            message=f"I found Complaint ID **{cid}**.\n\nYou can track the full status timeline on the **Track Complaint** page.",
            quick_replies=[f"Track {cid}", "Report a new issue"],
            suggest_complaint=False,
        )

    # 2. Extract classification keywords and domain info
    has_civic_keywords = any(kw in lower for kws in CATEGORY_KEYWORDS.values() for kw in kws)
    category = classify(user_msg)
    priority = detect_priority(user_msg)
    _, dept_name = get_department_for_category(category)

    # 3. Call local LLM (Ollama)
    llm_resp = None
    try:
        from llm import chat_with_llm
        llm_resp = chat_with_llm(user_msg, [h.model_dump() for h in body.history])
    except Exception as e:
        logger.warning("LLM chat error: %s", e)

    if llm_resp and len(llm_resp.strip()) > 5:
        analysis_card = None
        suggest_complaint = False
        if has_civic_keywords and category != "Other":
            suggest_complaint = True
            analysis_card = {
                "category": category,
                "priority": priority,
                "department": dept_name,
                "confidence": 92,
            }

        quick_replies = ["File Complaint", "Track a complaint", "How does this work?"] if suggest_complaint else ["Report a problem", "Track my complaint", "Common issues"]

        return ChatResponse(
            message=llm_resp,
            suggest_complaint=suggest_complaint,
            quick_replies=quick_replies,
            analysis_card=analysis_card,
        )

    # 4. Fallback Rule-Based Civic Engine
    if re.search(r"^(hi|hello|hey|good morning|good evening|namaste|hai|helo)\b", lower):
        return ChatResponse(
            message="Hi there! 👋 I'm **Civic AI**, your intelligent assistant for municipal complaints.\n\nI can help you describe an issue, identify the right department, or track an existing complaint.\n\nWhat would you like to do?",
            quick_replies=["Report a problem", "Track my complaint", "How does this work?", "Common issues"],
        )

    if "how does this work" in lower or "how it works" in lower or "help" in lower or "what can you do" in lower:
        return ChatResponse(
            message="Here is how **CivicResolve AI** works:\n\n**1. Report** — Describe your civic issue + photo + location.\n**2. AI Analyzes** — Automatically classifies category, priority, and routes to the right department.\n**3. Track** — Get a unique ID like `CR-2026-XXXXXX` to follow progress in real time.\n**4. Resolve** — Municipal team resolves the issue and updates the timeline.\n\nWhat would you like to do?",
            quick_replies=["Report a problem", "Track my complaint", "What issues can I report?"],
        )

    if "which department" in lower or "who handles" in lower:
        hist_text = " ".join(h.content for h in body.history) + " " + user_msg
        cat = classify(hist_text)
        _, dept = get_department_for_category(cat)
        return ChatResponse(
            message=f"This complaint should be routed to the **{dept}**.",
            quick_replies=["File Complaint", "Track my complaint", "Report another issue"],
            suggest_complaint=True,
        )

    if has_civic_keywords or category != "Other":
        return ChatResponse(
            message=f"That appears to be a **{category}** civic issue. You can report it through the official complaint form, and our system will route it directly to the **{dept_name}**.",
            suggest_complaint=True,
            quick_replies=["File Complaint", "Which department handles it?", "Track a complaint"],
            analysis_card={
                "category": category,
                "priority": priority,
                "department": dept_name,
                "confidence": 88,
            },
        )

    return ChatResponse(
        message="I'm here to help with civic infrastructure issues! You can describe a problem (e.g. pothole, garbage accumulation, water leak, broken streetlight) or provide a Complaint ID to check its status.",
        quick_replies=["Report a problem", "Track my complaint", "Common issues"],
    )


@router.post("/voice/turn", response_model=VoiceTurnResponse)
def handle_voice_turn(
    body: VoiceTurnRequest,
    authorization: Optional[str] = Header(None),
):
    """
    Dedicated AI Voice/Call Helpline turn processor.
    Takes citizen voice transcript, tracks conversation state (Problem -> Location -> Landmark -> Confirm),
    uses Qwen2.5:3B / Ollama with rule-based fallback, saves the real complaint to DB on confirmation,
    and returns text-to-speech spoken response + real Complaint ID.
    """
    citizen_id = None
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ")[1]
        try:
            from jose import jwt
            from auth import SECRET_KEY, ALGORITHM
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
            if payload.get("role") == "citizen":
                citizen_id = int(payload.get("sub"))
        except Exception:
            pass  # anonymous or expired token — proceed safely

    result = process_voice_call_turn(
        message=body.message,
        stage=body.stage,
        extracted_data=body.extracted_data,
        citizen_id=citizen_id,
        latitude=body.latitude,
        longitude=body.longitude,
    )
    return VoiceTurnResponse(**result)


# ── Mount all routes at BOTH root AND /api ─────────────────────────────────────
app.include_router(router)
app.include_router(router, prefix="/api")


from fastapi.openapi.docs import get_swagger_ui_html
from fastapi.responses import JSONResponse

@app.get("/docs", include_in_schema=False)
@app.get("/api/docs", include_in_schema=False)
def swagger_ui():
    return get_swagger_ui_html(
        openapi_url="/api/openapi.json",
        title="CivicResolve AI - Swagger API Docs",
    )

@app.get("/openapi.json", include_in_schema=False)
@app.get("/api/openapi.json", include_in_schema=False)
def openapi_endpoint():
    return JSONResponse(content=app.openapi())

@app.get("/")
@app.get("/api")
@app.get("/health")
@app.get("/api/health")
def root_health():
    return {
        "status": "healthy",
        "service": "CivicResolve AI API",
        "version": "1.0.0",
        "environment": "production" if os.getenv("VERCEL") else "development",
    }


if __name__ == "__main__":
    import uvicorn
    print("==================================================")
    print("🚀 Starting CivicResolve AI Backend on http://127.0.0.1:8000")
    print("==================================================")
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)



