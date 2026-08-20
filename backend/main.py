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
    require_citizen, require_admin, verify_password,
    update_user_profile, seed_admin,
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
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ── App ────────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="CivicResolve AI",
    description="AI-powered civic complaint management API",
    version="1.0.0",
)

router = APIRouter()

# ── CORS ──────────────────────────────────────────────────────────────────────
cors_origins_env = os.getenv("CORS_ORIGINS")
allowed_origins = (
    [orig.strip() for orig in cors_origins_env.split(",") if orig.strip()]
    if cors_origins_env
    else ["http://localhost:5173", "http://localhost:5174", "http://localhost:3000"]
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=r"https?://.*" if not cors_origins_env else None,
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
    if not user or not verify_password(body.password, user["password_hash"]):
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
    email = body.email.strip().lower()
    admin_env_email = os.getenv("ADMIN_EMAIL", "admin@civicresolve.ai").strip().lower()
    admin_env_pass  = os.getenv("ADMIN_PASSWORD", "admin123")

    user = get_user_by_email(email)
    
    # If the user is authenticating as the default/configured admin
    is_default_admin = (email == admin_env_email or email == "admin@civicresolve.ai")
    
    if is_default_admin:
        # Check against configured password OR db password hash
        if body.password == admin_env_pass or (user and verify_password(body.password, user.get("password_hash", ""))):
            # Ensure DB has this admin user properly seeded
            if not user or user.get("role") != "admin":
                seed_admin()
                user = get_user_by_email(email)
            
            if not user:
                # If SQLite disk is read-only in serverless, provide in-memory identity
                user = {
                    "id": 1,
                    "full_name": os.getenv("ADMIN_NAME", "CivicResolve Admin"),
                    "email": email,
                    "role": "admin",
                }
            token = create_token(user)
            return TokenResponse(
                access_token=token, role="admin",
                user_id=user["id"], full_name=user.get("full_name", "CivicResolve Admin"), email=email,
            )
        else:
            raise HTTPException(status_code=401, detail="Incorrect credentials.")

    # General database admin validation
    if not user:
        seed_admin()
        user = get_user_by_email(email)

    if not user or not verify_password(body.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Incorrect credentials.")
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Not an authority account.")

    token = create_token(user)
    return TokenResponse(
        access_token=token, role=user["role"],
        user_id=user["id"], full_name=user.get("full_name", "CivicResolve Admin"), email=user["email"],
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



