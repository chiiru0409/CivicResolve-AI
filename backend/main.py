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

from fastapi import FastAPI, APIRouter, Depends, HTTPException, status, UploadFile, File, Query, Header, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import time

import auth as auth_module
from auth import (
    create_token, create_user, get_user_by_email, get_user_by_id,
    get_current_user, require_citizen, require_admin, verify_password, hash_password,
    get_admin_credentials, update_user_profile, seed_admin,
    CREATE_USERS_TABLE, CREATE_USERS_INDEX,
    ADD_CITIZEN_ID_COLUMN, ADD_CITIZEN_ID_INDEX,
)
from database import get_connection, init_db, UPLOADS_COMPLAINTS_DIR, get_database_diagnostics, log_db_operation
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
    ImageAnalysisRequest, ImageAnalysisResponse,
    DuplicateCheckRequest, DuplicateCheckResult, MapIncident,
    ComplaintRatingRequest, ComplaintRatingResponse,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="CivicResolve AI",
    description="AI-powered civic complaint management API",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

router = APIRouter()

# ── Server-Side High Performance Micro-Cache ──────────────────────────────────
_SERVER_CACHE: dict[str, tuple[float, Any]] = {}
_SERVER_CACHE_TTL = 5.0  # 5 seconds default TTL

def get_server_cached(key: str) -> Optional[Any]:
    entry = _SERVER_CACHE.get(key)
    if entry:
        ts, data = entry
        if time.time() - ts < _SERVER_CACHE_TTL:
            return data
    return None

def set_server_cached(key: str, data: Any):
    _SERVER_CACHE[key] = (time.time(), data)

def invalidate_server_cache(prefix: Optional[str] = None):
    if not prefix:
        _SERVER_CACHE.clear()
    else:
        for k in list(_SERVER_CACHE.keys()):
            if prefix in k:
                _SERVER_CACHE.pop(k, None)

@app.middleware("http")
async def add_process_time_header(request: Request, call_next):
    start_time = time.perf_counter()
    response = await call_next(request)
    process_time = (time.perf_counter() - start_time) * 1000
    response.headers["X-Process-Time"] = f"{process_time:.2f}ms"
    return response

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


@app.exception_handler(Exception)
async def generic_exception_handler(request, exc: Exception):
    if isinstance(exc, HTTPException):
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})
    msg = str(exc)
    logger.error("Unhandled API Exception on %s %s: %s", request.method, request.url.path, msg)
    if "DATABASE_URL" in msg or "PostgreSQL" in msg or "database" in msg.lower() or "psycopg2" in msg.lower() or "connection" in msg.lower():
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={
                "error": "database_unavailable",
                "detail": msg,
                "message": "Authoritative PostgreSQL database is not connected. Please verify DATABASE_URL in Vercel environment variables.",
            },
        )
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": msg},
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


def _batch_fetch_complaint_relations(conn, rows: list) -> tuple[dict[str, list], dict[str, list], dict[int, dict]]:
    """
    High-performance batch fetcher for complaint updates, assignments, and citizen info.
    Eliminates N+1 query storms by resolving all relations in 3 single SQL queries with IN (...).
    """
    if not rows:
        return {}, {}, {}

    complaint_ids = set()
    citizen_ids = set()
    for r in rows:
        r_dict = dict(r)
        if r_dict.get("id"):
            complaint_ids.add(str(r_dict["id"]))
        if r_dict.get("complaint_number"):
            complaint_ids.add(str(r_dict["complaint_number"]))
        if r_dict.get("citizen_id"):
            citizen_ids.add(int(r_dict["citizen_id"]))

    updates_map: dict[str, list] = {}
    assignments_map: dict[str, list] = {}
    citizens_map: dict[int, dict] = {}

    if complaint_ids:
        c_list = list(complaint_ids)
        placeholders = ",".join(["?"] * len(c_list))
        
        # 1. Batch fetch all updates for all complaints in 1 query
        u_rows = conn.execute(
            f"SELECT * FROM complaint_updates WHERE complaint_id IN ({placeholders}) ORDER BY created_at ASC;",
            c_list,
        ).fetchall()
        for u in u_rows:
            u_d = dict(u)
            cid = str(u_d["complaint_id"])
            updates_map.setdefault(cid, []).append(u_d)

        # 2. Batch fetch all assignments for all complaints in 1 query
        a_rows = conn.execute(
            f"SELECT * FROM assignments WHERE complaint_id IN ({placeholders}) ORDER BY assigned_at ASC;",
            c_list,
        ).fetchall()
        for a in a_rows:
            a_d = dict(a)
            cid = str(a_d["complaint_id"])
            assignments_map.setdefault(cid, []).append(a_d)

    if citizen_ids:
        cit_list = list(citizen_ids)
        placeholders = ",".join(["?"] * len(cit_list))
        # 3. Batch fetch all citizens in 1 query
        user_rows = conn.execute(
            f"SELECT id, full_name, email, phone FROM users WHERE id IN ({placeholders});",
            cit_list,
        ).fetchall()
        for u in user_rows:
            u_d = dict(u)
            citizens_map[int(u_d["id"])] = u_d

    return updates_map, assignments_map, citizens_map


def _row_to_complaint_out(row: dict, updates: list, assignments: list, citizen: Optional[dict] = None) -> dict:
    d = dict(row)
    # Parse ai_analysis JSON string
    if d.get("ai_analysis") and isinstance(d["ai_analysis"], str):
        try:
            d["ai_analysis"] = json.loads(d["ai_analysis"])
        except Exception:
            d["ai_analysis"] = None
    d["is_anonymous"] = bool(d.get("is_anonymous", 0))
    d["evidence_quality"] = d.get("evidence_quality") or (
        "HIGH / VERIFIED BY PHOTO" if d.get("image_path") else "LOW — No photo proof provided"
    )
    d["updates"] = updates
    d["assignments"] = assignments
    if citizen:
        d["citizen_name"] = citizen.get("full_name")
        d["citizen_email"] = citizen.get("email")
        d["citizen_phone"] = citizen.get("phone")
    return d


def _build_initial_updates(complaint_id: str, category: str, priority: str, department: str, evidence_quality: str = "LOW — No photo proof provided") -> list[dict]:
    """Insert the first two update records for a new complaint."""
    now = _now_iso()
    updates = [
        {"complaint_id": complaint_id, "status": "Submitted",    "message": "Complaint received and logged in municipal database.",                       "updated_by": "system"},
        {"complaint_id": complaint_id, "status": "AI_Analysis",  "message": f"AI classified: {category} | Priority: {priority} | Department: {department} | Evidence: {evidence_quality}", "updated_by": "ai-agent"},
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
@router.post("/admin/login", response_model=TokenResponse)
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
def get_me(current_user: dict = Depends(get_current_user)):
    user = get_user_by_id(int(current_user["sub"]))
    if not user:
        # Construct authoritative profile from cryptographically signed JWT claims
        return {
            "id": int(current_user.get("sub", 1)),
            "full_name": current_user.get("full_name", ""),
            "email": current_user.get("email", ""),
            "phone": "",
            "role": current_user.get("role", "citizen"),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
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

    # Determine photo evidence and quality
    has_photo = bool(body.image_path and body.image_path.strip())
    image_path = body.image_path.strip() if has_photo else None
    evidence_quality = "HIGH / VERIFIED BY PHOTO" if has_photo else "LOW — No photo proof provided"

    # Use frontend hints if provided and valid, else use backend result
    category   = body.category   or ai["category"]
    priority   = body.priority   or ai["priority"]
    department = body.department or ai["department_name"]
    title      = body.title      or ai["title"]
    base_conf  = body.ai_confidence if body.ai_confidence is not None else ai["ai_confidence"]
    # Reduce confidence if no photo proof was provided
    confidence = base_conf if has_photo else max(50, base_conf - 15)
    
    reason     = body.ai_reason  or ai["ai_reason"]
    if not has_photo and "photo proof" not in reason.lower():
        reason = f"{reason} (Notice: Submitted without photo proof; verification confidence reduced.)"

    response_t = body.estimated_response or ai["estimated_response"]
    zone       = body.zone       or ai["zone"]
    team       = body.assigned_team or ai["assigned_team"]

    complaint_number = _generate_complaint_number()
    complaint_id     = complaint_number   # use same value as primary key
    now              = _now_iso()

    # Build full structured AI analysis payload
    ai_payload = {
        "category": category,
        "priority": priority,
        "severity": ai.get("severity", 5),
        "department": department,
        "assigned_team": team,
        "confidence": confidence,
        "reason": reason,
        "public_safety_impact": ai.get("public_safety_impact", "Civic issue under evaluation"),
        "inspection_required": bool(ai.get("inspection_required", 0)),
        "location_risk": ai.get("location_risk", "Standard municipal zone"),
        "action_plan": ai.get("action_plan", "Standard municipal dispatch"),
        "estimated_response": response_t,
        "zone": zone,
        "evidence_quality": evidence_quality,
        "has_photo": has_photo,
    }
    ai_json = json.dumps(ai_payload)

    conn = get_connection()
    try:
        # Server-side 60-second duplicate protection
        if citizen_id is not None:
            recent = conn.execute(
                """
                SELECT * FROM complaints 
                WHERE citizen_id = ? AND description = ?
                ORDER BY created_at DESC LIMIT 1;
                """,
                (citizen_id, body.description.strip()),
            ).fetchone()
        else:
            recent = conn.execute(
                """
                SELECT * FROM complaints 
                WHERE is_anonymous = 1 AND description = ? AND location = ?
                ORDER BY created_at DESC LIMIT 1;
                """,
                (body.description.strip(), (body.location or '').strip()),
            ).fetchone()

        if recent:
            recent_dict = dict(recent)
            created_val = str(recent_dict.get("created_at") or "").strip()
            is_recent_duplicate = False
            try:
                if created_val:
                    clean_ts = created_val.replace("Z", "+00:00")
                    if " " in clean_ts and "T" not in clean_ts:
                        clean_ts = clean_ts.replace(" ", "T")
                    c_time = datetime.fromisoformat(clean_ts)
                    if c_time.tzinfo is None:
                        c_time = c_time.replace(tzinfo=timezone.utc)
                    diff = (datetime.now(timezone.utc) - c_time).total_seconds()
                    if 0 <= diff < 60:
                        is_recent_duplicate = True
            except Exception as ex:
                logger.warning("Timestamp parsing fallback in deduplication: %s", ex)
                is_recent_duplicate = True

            if is_recent_duplicate:
                updates = _fetch_updates(conn, recent_dict["id"])
                assignments = _fetch_assignments(conn, recent_dict["id"])
                return _row_to_complaint_out(recent_dict, updates, assignments)

        with conn:
            conn.execute(
                """
                INSERT INTO complaints (
                    id, complaint_number, citizen_id, title, description,
                    category, department, priority, severity, status,
                    latitude, longitude, location_accuracy,
                    location, address, landmark,
                    image_path, evidence_quality,
                    ai_analysis, ai_confidence, ai_reason,
                    public_safety_impact, inspection_required, location_risk, action_plan,
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
                    ?, ?, ?, ?,
                    ?, ?, ?,
                    ?, ?, ?,
                    ?, ?
                );
                """,
                (
                    complaint_id, complaint_number, citizen_id, title, body.description,
                    category, department, priority, ai.get("severity", 5),
                    body.latitude, body.longitude, body.location_accuracy,
                    body.location, body.address, body.landmark,
                    image_path, evidence_quality,
                    ai_json, confidence, reason,
                    ai.get("public_safety_impact", "Civic issue under evaluation"),
                    ai.get("inspection_required", 0),
                    ai.get("location_risk", "Standard municipal zone"),
                    ai.get("action_plan", "Standard municipal dispatch"),
                    team, response_t, zone,
                    1 if body.is_anonymous else 0, body.contact_preference, body.source or "Web",
                    now, now,
                ),
            )
            # Insert initial update records
            for upd in _build_initial_updates(complaint_id, category, priority, department, evidence_quality):
                conn.execute(
                    "INSERT INTO complaint_updates (complaint_id, status, message, updated_by) VALUES (?, ?, ?, ?);",
                    (upd["complaint_id"], upd["status"], upd["message"], upd["updated_by"]),
                )

        row = conn.execute("SELECT * FROM complaints WHERE id = ?;", (complaint_id,)).fetchone()
        if not row:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Critical: Complaint persistence verification failed. Record could not be read back from database.",
            )
        updates     = _fetch_updates(conn, complaint_id)
        assignments = _fetch_assignments(conn, complaint_id)
        result = _row_to_complaint_out(dict(row), updates, assignments)
        invalidate_server_cache()
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
        invalidate_server_cache()
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
            SELECT * FROM complaints WHERE citizen_id = ?
            ORDER BY created_at DESC;
            """,
            (citizen_id,),
        ).fetchall()
        row_dicts = [dict(r) for r in rows]
        updates_map, assignments_map, _ = _batch_fetch_complaint_relations(conn, row_dicts)

        result = []
        for r in row_dicts:
            real_id = str(r["id"])
            comp_num = str(r.get("complaint_number") or real_id)
            updates = updates_map.get(real_id) or updates_map.get(comp_num) or []
            assignments = assignments_map.get(real_id) or assignments_map.get(comp_num) or []
            result.append(_row_to_complaint_out(r, updates, assignments))
        return result
    finally:
        conn.close()


@router.get("/complaints/{complaint_id}")
def get_my_complaint_detail(complaint_id: str, current_user: dict = Depends(require_citizen)):
    citizen_id = int(current_user["sub"])
    conn = get_connection()
    try:
        row = conn.execute("SELECT * FROM complaints WHERE id = ? OR complaint_number = ?;", (complaint_id, complaint_id)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Complaint not found.")
        d = dict(row)
        real_id = d["id"]
        # Security: citizen can only view their own complaint
        if d.get("citizen_id") != citizen_id and current_user.get("role") != "admin":
            raise HTTPException(status_code=403, detail="Access denied.")
        updates     = _fetch_updates(conn, real_id)
        assignments = _fetch_assignments(conn, real_id)
        return _row_to_complaint_out(d, updates, assignments)
    finally:
        conn.close()


# ══════════════════════════════════════════════════════════════════════════════
# DUPLICATE DETECTION & PUBLIC MAP INCIDENTS
# ══════════════════════════════════════════════════════════════════════════════

def _tokenize(text: str) -> set[str]:
    """Tokenize text into lowercase alphanumeric words of length >= 3."""
    import re
    return set(re.findall(r"[a-z0-9]{3,}", (text or "").lower()))


def _compute_similarity(desc1: str, loc1: str, cat1: str, lat1: Optional[float], lng1: Optional[float],
                        desc2: str, loc2: str, cat2: str, lat2: Optional[float], lng2: Optional[float]) -> tuple[int, str]:
    tokens1 = _tokenize(desc1) | _tokenize(loc1)
    tokens2 = _tokenize(desc2) | _tokenize(loc2)
    if not tokens1 or not tokens2:
        desc_sim = 0.0
    else:
        intersection = len(tokens1 & tokens2)
        union = len(tokens1 | tokens2)
        desc_sim = (intersection / union) if union > 0 else 0.0

    score = desc_sim * 50.0  # max 50 points from description and location text

    # Category match
    if cat1 and cat2 and cat1.lower() == cat2.lower():
        score += 15.0

    # Location / Coordinate match
    loc_matched = False
    if lat1 is not None and lng1 is not None and lat2 is not None and lng2 is not None:
        import math
        # Approx distance in km
        dlat = (lat1 - lat2) * 111.0
        dlng = (lng1 - lng2) * 111.0 * math.cos(math.radians(lat1))
        dist_km = math.sqrt(dlat * dlat + dlng * dlng)
        if dist_km <= 0.3:
            score += 35.0
            loc_matched = True
        elif dist_km <= 1.0:
            score += 20.0
            loc_matched = True
    elif loc1 and loc2:
        loc_tokens1 = _tokenize(loc1)
        loc_tokens2 = _tokenize(loc2)
        if loc_tokens1 & loc_tokens2:
            score += 20.0
            loc_matched = True

    final_score = min(int(round(score)), 98)
    reasons = []
    if desc_sim > 0.25:
        reasons.append("high textual overlap in issue description")
    if cat1 and cat2 and cat1.lower() == cat2.lower():
        reasons.append(f"matching category ({cat1})")
    if loc_matched:
        reasons.append("matching geographical proximity")

    reason_str = ", ".join(reasons) if reasons else "geospatial and lexical analysis"
    return final_score, reason_str


@router.post("/complaints/check-duplicate", response_model=DuplicateCheckResult)
def check_duplicate_complaint(body: DuplicateCheckRequest):
    """
    Analyzes incoming complaint against database for potential duplicates
    based on NLP keyword similarity, geographical proximity, and category.
    """
    conn = get_connection()
    try:
        # Check active complaints first
        rows = conn.execute(
            """
            SELECT id, complaint_number, title, description, category, status,
                   location, latitude, longitude, created_at
            FROM complaints
            WHERE status NOT IN ('Resolved', 'Closed')
            ORDER BY created_at DESC LIMIT 50;
            """
        ).fetchall()

        best_score = 0
        best_match = None
        best_reason = ""

        for r in rows:
            c = dict(r)
            score, reason = _compute_similarity(
                body.description, body.location or "", body.category or "", body.latitude, body.longitude,
                c.get("description", ""), c.get("location", ""), c.get("category", ""), c.get("latitude"), c.get("longitude"),
            )
            if score > best_score:
                best_score = score
                best_match = c
                best_reason = reason

        if best_score >= 40 and best_match:
            return DuplicateCheckResult(
                is_potential_duplicate=True,
                similarity_percentage=best_score,
                existing_complaint_id=best_match["complaint_number"] or best_match["id"],
                existing_title=best_match["title"],
                existing_status=best_match["status"],
                existing_created_at=best_match["created_at"],
                existing_location=best_match.get("location"),
                explanation=f"A similar active issue ({best_match['complaint_number']}) was identified with {best_score}% confidence due to {best_reason}.",
            )

        return DuplicateCheckResult(
            is_potential_duplicate=False,
            similarity_percentage=best_score,
            explanation="No duplicate complaint detected. This appears to be a unique municipal report.",
        )
    finally:
        conn.close()


@router.get("/public/map/incidents")
@router.get("/admin/map/incidents")
def get_map_incidents(
    include_resolved: bool = Query(False),
    category: Optional[str] = Query(None),
    priority: Optional[str] = Query(None),
):
    """
    Authoritative query for active map incidents.
    Returns unresolved complaints (status != Resolved AND status != Closed AND status != Archived)
    with valid latitude and longitude coordinates.
    """
    cache_key = f"map_incidents_{include_resolved}_{category}_{priority}"
    cached = get_server_cached(cache_key)
    if cached is not None:
        return cached

    conn = get_connection()
    try:
        where_clauses = [
            "latitude IS NOT NULL",
            "longitude IS NOT NULL",
            "(latitude != 0 OR longitude != 0)",
        ]
        params = []
        if not include_resolved:
            where_clauses.append("LOWER(status) NOT IN ('resolved', 'closed', 'archived')")
        if category and category.strip().lower() != "all":
            where_clauses.append("LOWER(category) = LOWER(?)")
            params.append(category.strip())
        if priority and priority.strip().lower() != "all":
            where_clauses.append("UPPER(priority) = UPPER(?)")
            params.append(priority.strip())

        where_sql = "WHERE " + " AND ".join(where_clauses)
        rows = conn.execute(
            f"""
            SELECT id, complaint_number, title, description, category, priority, status,
                   latitude, longitude, location, landmark, department, evidence_quality, created_at
            FROM complaints {where_sql}
            ORDER BY created_at DESC LIMIT 300;
            """,
            params,
        ).fetchall()
        result = []
        for r in rows:
            d = dict(r)
            result.append({
                "id": d["id"],
                "complaint_number": d.get("complaint_number") or d["id"],
                "title": d.get("title") or d.get("description") or "Civic Incident",
                "description": d.get("description") or "",
                "category": d.get("category") or "Other",
                "priority": d.get("priority") or "LOW",
                "status": d.get("status") or "Submitted",
                "latitude": float(d["latitude"]),
                "longitude": float(d["longitude"]),
                "location": d.get("location") or d.get("landmark") or "",
                "department": d.get("department") or "",
                "evidence_quality": d.get("evidence_quality") or "LOW",
                "created_at": d.get("created_at") or "",
            })
        set_server_cached(cache_key, result)
        return result
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
            "SELECT * FROM complaints WHERE complaint_number = ? OR id = ?;", (complaint_number, complaint_number)
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail=f"Complaint {complaint_number} not found.")
        d = dict(row)
        real_id = d["id"]

        # Fetch public update history (status + message only)
        update_rows = conn.execute(
            "SELECT id, complaint_id, status, message, updated_by, created_at FROM complaint_updates WHERE complaint_id = ? ORDER BY created_at ASC;",
            (real_id,),
        ).fetchall()
        updates = [dict(r) for r in update_rows]

        # Return ONLY safe fields — no PII, no coordinates, no internal data
        return {
            "id":                d["id"],
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
            "citizen_rating":    d.get("citizen_rating"),
            "citizen_feedback":  d.get("citizen_feedback"),
            "rated_at":          d.get("rated_at"),
            "updates":           updates,
        }
    finally:
        conn.close()


@router.post("/complaints/{complaint_id}/rate", response_model=ComplaintRatingResponse)
@router.post("/track/{complaint_id}/rate", response_model=ComplaintRatingResponse)
def rate_complaint(complaint_id: str, body: ComplaintRatingRequest):
    """
    Allow citizens to submit a 1-5 star rating and optional feedback once a complaint is Resolved/Closed.
    Prevents duplicate rating submissions.
    """
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT * FROM complaints WHERE id = ? OR complaint_number = ?;",
            (complaint_id, complaint_id),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail=f"Complaint '{complaint_id}' not found.")

        d = dict(row)
        real_id = d["id"]
        comp_num = d["complaint_number"]
        status_clean = str(d.get("status") or "").strip().lower()

        # Rule 1: Rating is available ONLY after the case is Resolved/Closed.
        if status_clean not in ("resolved", "closed"):
            raise HTTPException(
                status_code=400,
                detail="Ratings can only be submitted after a case has been marked Resolved or Closed.",
            )

        # Rule 2 & 3: Prevent accidental duplicate submissions.
        if d.get("citizen_rating") is not None:
            raise HTTPException(
                status_code=409,
                detail=f"This complaint has already been rated with {d.get('citizen_rating')} stars.",
            )

        now = _now_iso()
        with conn:
            conn.execute(
                """
                UPDATE complaints SET
                    citizen_rating = ?,
                    citizen_feedback = ?,
                    rated_at = ?,
                    updated_at = ?
                WHERE id = ?;
                """,
                (body.rating, body.feedback.strip() if body.feedback else None, now, now, real_id),
            )
            stars_str = "★" * body.rating + "☆" * (5 - body.rating)
            fb_text = f': "{body.feedback.strip()}"' if body.feedback and body.feedback.strip() else ""
            msg = f"Citizen submitted {body.rating}-star rating ({stars_str}){fb_text}"
            conn.execute(
                "INSERT INTO complaint_updates (complaint_id, status, message, updated_by) VALUES (?, 'Rated', ?, 'citizen');",
                (real_id, msg),
            )

        invalidate_server_cache()
        return ComplaintRatingResponse(
            complaint_id=real_id,
            complaint_number=comp_num,
            rating=body.rating,
            feedback=body.feedback.strip() if body.feedback else None,
            rated_at=now,
            message="Thank you! Your resolution rating has been recorded.",
        )
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

        if search and search.strip():
            s = f"%{search.strip().lower()}%"
            where_clauses.append("(LOWER(title) LIKE ? OR LOWER(complaint_number) LIKE ? OR LOWER(location) LIKE ? OR LOWER(description) LIKE ?)")
            params.extend([s, s, s, s])
        if category and category.strip() and category.strip().lower() != "all":
            where_clauses.append("LOWER(category) = LOWER(?)")
            params.append(category.strip())
        if priority and priority.strip() and priority.strip().lower() != "all":
            where_clauses.append("UPPER(priority) = UPPER(?)")
            params.append(priority.strip())
        if status_filter and status_filter.strip() and status_filter.strip().lower() != "all":
            where_clauses.append("LOWER(status) = LOWER(?)")
            params.append(status_filter.strip())
        if department and department.strip() and department.strip().lower() != "all":
            where_clauses.append("LOWER(department) LIKE LOWER(?)")
            params.append(f"%{department.strip()}%")

        where_sql = ("WHERE " + " AND ".join(where_clauses)) if where_clauses else ""
        rows = conn.execute(
            f"""
            SELECT * FROM complaints {where_sql}
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?;
            """,
            params + [limit, offset],
        ).fetchall()

        total = conn.execute(f"SELECT COUNT(*) FROM complaints {where_sql};", params).fetchone()[0]
        row_dicts = [dict(r) for r in rows]
        updates_map, assignments_map, citizens_map = _batch_fetch_complaint_relations(conn, row_dicts)

        items = []
        for r in row_dicts:
            real_id = str(r["id"])
            comp_num = str(r.get("complaint_number") or real_id)
            updates = updates_map.get(real_id) or updates_map.get(comp_num) or []
            assignments = assignments_map.get(real_id) or assignments_map.get(comp_num) or []
            citizen = citizens_map.get(r.get("citizen_id"))
            items.append(_row_to_complaint_out(r, updates, assignments, citizen))

        return {"total": total, "items": items}
    finally:
        conn.close()


@router.get("/admin/complaints/{complaint_id}")
def admin_get_complaint(complaint_id: str, current_user: dict = Depends(require_admin)):
    clean_id = (complaint_id or "").strip()
    if not clean_id:
        raise HTTPException(status_code=400, detail="Invalid complaint identifier.")
    conn = get_connection()
    try:
        row = conn.execute("SELECT * FROM complaints WHERE id = ? OR complaint_number = ?;", (clean_id, clean_id)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail=f"Incident record '{clean_id}' not found in municipal database.")
        d = dict(row)
        real_id = d["id"]
        updates     = _fetch_updates(conn, real_id)
        assignments = _fetch_assignments(conn, real_id)
        citizen = None
        if d.get("citizen_id"):
            try:
                u_row = conn.execute("SELECT id, full_name, email, phone FROM users WHERE id = ?;", (d["citizen_id"],)).fetchone()
                if u_row:
                    citizen = dict(u_row)
            except Exception as e:
                logger.warning("Citizen lookup failed for complaint %s: %s", real_id, e)
        return _row_to_complaint_out(d, updates, assignments, citizen)
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
        row = conn.execute("SELECT id FROM complaints WHERE id = ? OR complaint_number = ?;", (complaint_id, complaint_id)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Complaint not found.")
        real_id = row["id"]
        with conn:
            resolved_at_sql = ", resolved_at = ?" if body.status in ("Resolved", "Closed") else ""
            params = [body.status, now]
            if body.status in ("Resolved", "Closed"):
                params.append(now)
            params.append(real_id)
            conn.execute(
                f"UPDATE complaints SET status = ?, updated_at = ?{resolved_at_sql} WHERE id = ?;",
                params,
            )
            conn.execute(
                "INSERT INTO complaint_updates (complaint_id, status, message, updated_by) VALUES (?, ?, ?, ?);",
                (real_id, body.status, body.message, body.updated_by),
            )
        updated_row = conn.execute("SELECT * FROM complaints WHERE id = ?;", (real_id,)).fetchone()
        updates     = _fetch_updates(conn, real_id)
        assignments = _fetch_assignments(conn, real_id)
        invalidate_server_cache()
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
        row = conn.execute("SELECT id FROM complaints WHERE id = ? OR complaint_number = ?;", (complaint_id, complaint_id)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Complaint not found.")
        real_id = row["id"]
        with conn:
            conn.execute(
                """
                INSERT INTO assignments (complaint_id, department, officer, team, notes, assigned_by, assigned_at)
                VALUES (?, ?, ?, ?, ?, ?, ?);
                """,
                (real_id, body.department, body.officer, body.team, body.notes, body.assigned_by, now),
            )
            conn.execute(
                """
                UPDATE complaints SET
                    department = ?, assigned_officer = ?, assigned_team = ?,
                    status = 'Assigned', updated_at = ?
                WHERE id = ?;
                """,
                (body.department, body.officer, body.team, now, real_id),
            )
            conn.execute(
                "INSERT INTO complaint_updates (complaint_id, status, message, updated_by) VALUES (?, 'Assigned', ?, ?);",
                (real_id, f"Assigned to {body.department}" + (f" — {body.officer}" if body.officer else ""), body.assigned_by),
            )
        invalidate_server_cache()
        return {"success": True, "message": "Assignment saved."}
    finally:
        conn.close()


@router.get("/admin/analytics")
def admin_analytics(current_user: dict = Depends(require_admin)):
    cached = get_server_cached("admin_analytics")
    if cached is not None:
        return cached

    conn = get_connection()
    try:
        row = conn.execute(
            """
            SELECT
                COUNT(*) AS total,
                COUNT(CASE WHEN UPPER(priority) IN ('HIGH', 'CRITICAL') THEN 1 END) AS high,
                COUNT(CASE WHEN LOWER(status) NOT IN ('resolved', 'closed', 'archived') THEN 1 END) AS pending,
                COUNT(CASE WHEN LOWER(status) IN ('resolved', 'closed') THEN 1 END) AS resolved,
                COUNT(CASE WHEN citizen_rating IS NOT NULL THEN 1 END) AS total_ratings,
                AVG(citizen_rating) AS avg_rating_val
            FROM complaints;
            """
        ).fetchone()

        d = dict(row) if row else {}
        total = int(d.get("total") or 0)
        high = int(d.get("high") or 0)
        pending = int(d.get("pending") or 0)
        resolved = int(d.get("resolved") or 0)
        total_ratings = int(d.get("total_ratings") or 0)
        avg_rating_val = d.get("avg_rating_val")
        avg_rating = round(float(avg_rating_val), 1) if avg_rating_val is not None else 0.0

        # Star breakdown (5..1)
        rating_dist_rows = conn.execute(
            "SELECT citizen_rating, COUNT(*) as cnt FROM complaints WHERE citizen_rating IS NOT NULL GROUP BY citizen_rating;"
        ).fetchall()
        rating_map = {int(r[0]): int(r[1]) for r in rating_dist_rows if r[0] is not None}
        rating_breakdown = [
            {"stars": s, "count": rating_map.get(s, 0)}
            for s in [5, 4, 3, 2, 1]
        ]

        # Ratings history
        recent_ratings_rows = conn.execute(
            """
            SELECT id, complaint_number, title, category, department, citizen_rating, citizen_feedback, rated_at, status
            FROM complaints
            WHERE citizen_rating IS NOT NULL
            ORDER BY rated_at DESC, updated_at DESC
            LIMIT 50;
            """
        ).fetchall()
        ratings_history = [
            {
                "id": r["id"],
                "complaint_number": r["complaint_number"],
                "title": r["title"],
                "category": r["category"],
                "department": r["department"],
                "rating": r["citizen_rating"],
                "feedback": r["citizen_feedback"],
                "rated_at": r["rated_at"],
                "status": r["status"],
            }
            for r in recent_ratings_rows
        ]

        by_cat = conn.execute(
            "SELECT category, COUNT(*) as count FROM complaints GROUP BY category ORDER BY count DESC;"
        ).fetchall()
        by_pri = conn.execute(
            "SELECT priority, COUNT(*) as count FROM complaints GROUP BY priority;"
        ).fetchall()
        by_sta = conn.execute(
            "SELECT status, COUNT(*) as count FROM complaints GROUP BY status;"
        ).fetchall()
        by_dep = conn.execute(
            "SELECT department, COUNT(*) as count FROM complaints WHERE department IS NOT NULL GROUP BY department ORDER BY count DESC;"
        ).fetchall()

        res = {
            "total_complaints": total,
            "high_priority": high,
            "pending": pending,
            "resolved": resolved,
            "resolution_rate": round((resolved / total * 100), 1) if total > 0 else 0,
            "total_ratings": total_ratings,
            "average_rating": avg_rating,
            "rating_breakdown": rating_breakdown,
            "ratings_history": ratings_history,
            "by_category":   [{"category":   r[0], "count": r[1]} for r in by_cat],
            "by_priority":   [{"priority":   r[0], "count": r[1]} for r in by_pri],
            "by_status":     [{"status":     r[0], "count": r[1]} for r in by_sta],
            "by_department": [{"department": r[0], "count": r[1]} for r in by_dep],
        }
        set_server_cached("admin_analytics", res)
        return res
    finally:
        conn.close()


@router.get("/admin/overview")
def admin_overview(current_user: dict = Depends(require_admin)):
    cached = get_server_cached("admin_overview")
    if cached is not None:
        return cached

    conn = get_connection()
    try:
        row = conn.execute(
            """
            SELECT
                COUNT(*) AS total,
                COUNT(CASE WHEN LOWER(status) = 'submitted' THEN 1 END) AS submitted,
                COUNT(CASE WHEN LOWER(status) = 'assigned' THEN 1 END) AS assigned,
                COUNT(CASE WHEN LOWER(status) = 'in progress' THEN 1 END) AS in_progress,
                COUNT(CASE WHEN LOWER(status) = 'inspection' THEN 1 END) AS inspection,
                COUNT(CASE WHEN LOWER(status) IN ('resolved', 'closed') THEN 1 END) AS resolved,
                COUNT(CASE WHEN LOWER(status) NOT IN ('resolved', 'closed', 'archived') THEN 1 END) AS pending,
                COUNT(CASE WHEN UPPER(priority) IN ('HIGH', 'CRITICAL') THEN 1 END) AS high_prio,
                COUNT(CASE WHEN UPPER(priority) = 'CRITICAL' THEN 1 END) AS critical,
                COUNT(CASE WHEN LOWER(status) NOT IN ('resolved', 'closed', 'archived') AND latitude IS NOT NULL AND longitude IS NOT NULL AND (latitude != 0 OR longitude != 0) THEN 1 END) AS active_incidents,
                COUNT(CASE WHEN citizen_rating IS NOT NULL THEN 1 END) AS total_ratings,
                AVG(citizen_rating) AS avg_rating_val
            FROM complaints;
            """
        ).fetchone()

        d = dict(row) if row else {}
        total = int(d.get("total") or 0)
        submitted = int(d.get("submitted") or 0)
        assigned = int(d.get("assigned") or 0)
        in_progress = int(d.get("in_progress") or 0)
        inspection = int(d.get("inspection") or 0)
        resolved = int(d.get("resolved") or 0)
        pending = int(d.get("pending") or 0)
        high_prio = int(d.get("high_prio") or 0)
        critical = int(d.get("critical") or 0)
        active_incidents = int(d.get("active_incidents") or 0)
        total_ratings = int(d.get("total_ratings") or 0)
        avg_rating_val = d.get("avg_rating_val")
        avg_rating = round(float(avg_rating_val), 1) if avg_rating_val is not None else 0.0

        log_db_operation("admin_overview", total)
        res = {
            "total_complaints": total,
            "submitted": submitted,
            "assigned": assigned,
            "in_progress": in_progress,
            "inspection": inspection,
            "resolved": resolved,
            "pending": pending,
            "active_complaints": pending,
            "high_priority": high_prio,
            "critical": critical,
            "active_incidents": active_incidents,
            "total_ratings": total_ratings,
            "average_rating": avg_rating,
        }
        set_server_cached("admin_overview", res)
        return res
    finally:
        conn.close()




@router.get("/departments")
@router.get("/admin/departments")
def list_departments(current_user: Optional[dict] = None):
    cached = get_server_cached("departments")
    if cached is not None:
        return cached

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
        set_server_cached("departments", result)
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
    cached = get_server_cached("admin_ai_brief")
    if cached is not None:
        return cached

    conn = get_connection()
    try:
        now_dt = datetime.now(timezone.utc)
        today_iso = now_dt.strftime("%Y-%m-%d")
        hours24_iso = datetime.fromtimestamp(now_dt.timestamp() - 86400, timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
        hours48_iso = datetime.fromtimestamp(now_dt.timestamp() - 172800, timezone.utc).strftime("%Y-%m-%d %H:%M:%S")

        agg_row = conn.execute(
            """
            SELECT
                COUNT(*) AS total,
                COUNT(CASE WHEN UPPER(priority) IN ('HIGH', 'CRITICAL') THEN 1 END) AS high_prio,
                COUNT(CASE WHEN LOWER(status) NOT IN ('resolved', 'closed', 'archived') THEN 1 END) AS pending,
                COUNT(CASE WHEN LOWER(status) IN ('resolved', 'closed') THEN 1 END) AS resolved,
                COUNT(CASE WHEN created_at >= ? OR created_at >= ? THEN 1 END) AS today_cnt,
                COUNT(CASE WHEN LOWER(status) NOT IN ('resolved', 'closed', 'archived') AND created_at <= ? THEN 1 END) AS overdue_cnt
            FROM complaints;
            """,
            (today_iso, hours24_iso, hours48_iso),
        ).fetchone()

        agg = dict(agg_row) if agg_row else {}
        total = int(agg.get("total") or 0)
        high_prio = int(agg.get("high_prio") or 0)
        pending = int(agg.get("pending") or 0)
        resolved = int(agg.get("resolved") or 0)
        today_cnt = int(agg.get("today_cnt") or 0)
        overdue_cnt = int(agg.get("overdue_cnt") or 0)

        by_cat_rows = conn.execute("SELECT category, COUNT(*) as cnt FROM complaints GROUP BY category ORDER BY cnt DESC;").fetchall()
        cat_counts = {r[0]: r[1] for r in by_cat_rows}

        by_pri_rows = conn.execute("SELECT priority, COUNT(*) as cnt FROM complaints GROUP BY priority;").fetchall()
        pri_counts = {r[0]: r[1] for r in by_pri_rows}

        by_dep_rows = conn.execute(
            "SELECT department, COUNT(*) as cnt FROM complaints WHERE LOWER(status) NOT IN ('resolved', 'closed', 'archived') AND department IS NOT NULL GROUP BY department ORDER BY cnt DESC;"
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

        res = AdminAIBriefResponse(
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
        set_server_cached("admin_ai_brief", res)
        return res
    finally:
        conn.close()


@router.post("/admin/ai/assistant", response_model=AdminAIQueryResponse)
@router.post("/admin/ai/copilot", response_model=AdminAIQueryResponse)
def handle_admin_ai_query(body: AdminAIQueryRequest, current_user: dict = Depends(require_admin)):
    """
    Dedicated AI Intelligence Copilot for administrators.
    Answers administrative decision support queries grounded in actual database records.
    """
    conn = get_connection()
    try:
        q = body.query.strip().lower()

        # 1. High priority / urgent queries / recommendations ("What should I handle first?")
        if any(w in q for w in ["high priority", "urgent", "critical", "immediate", "highest priority", "attention", "handle first", "what first", "serious", "severe", "recommend", "priorit"]):
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
            invalidate_server_cache()
            return {"success": True, "message": f"Successfully assigned {c['complaint_number']} to {dept}."}

        elif body.action_type == "escalate":
            with conn:
                conn.execute(
                    "UPDATE complaints SET escalation_level = escalation_level + 1, priority = 'CRITICAL', updated_at = ? WHERE id = ?;",
                    (now, cid),
                )
                conn.execute(
                    "INSERT INTO complaint_updates (complaint_id, status, message, updated_by) VALUES (?, 'Escalated', 'Priority escalated to CRITICAL via AI Operations SLA rule.', 'admin-ai');",
                    (cid,),
                )
            invalidate_server_cache()
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
def handle_chat(
    body: ChatRequest,
    authorization: Optional[str] = Header(None),
):
    """
    Intelligent chatbot endpoint for civic complaints.
    Provides natural language understanding, multi-turn conversational intake,
    contextual complaint tracking, and grounded SLA analysis.
    NEVER interprets greetings as complaints or suggests premature complaint registration.
    """
    import re
    from classifier import classify, get_department_for_category, CATEGORY_KEYWORDS
    from priority import detect_priority, calculate_severity, get_estimated_response
    from voice_agent import _is_pure_greeting, _is_general_inquiry, _is_off_topic, EMERGENCY_KEYWORDS

    user_msg = body.message.strip()
    lower = user_msg.lower()

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
            pass

    # 1. Pure Greeting & Small Talk Guard (ZERO premature complaints)
    if _is_pure_greeting(user_msg):
        if any(h in lower for h in ["how are you", "how're you", "how do you do"]):
            msg = (
                "Hello! 👋 I'm doing well, thank you. I'm **CivicResolve AI**, your municipal operations assistant.\n\n"
                "I can help you report civic issues like road potholes, overflowing garbage, drainage problems, "
                "water pipe leaks, or broken streetlights, or track an existing complaint.\n\n"
                "What can I help you with today?"
            )
        elif any(h in lower for h in ["what can you do", "help me", "can you help", "what do you do"]):
            msg = (
                "Hello! 👋 I'm **CivicResolve AI**. I can help you with:\n\n"
                "• **Reporting issues**: Potholes, garbage, water leaks, streetlights, drainage\n"
                "• **Real-time Tracking**: Check status and SLA countdown for any ticket ID (e.g. `CR-2026-XXXXXX`)\n"
                "• **Department Routing**: Direct routing to Public Works, Sanitation, Water Board, etc.\n\n"
                "What would you like help with today?"
            )
        else:
            msg = (
                "Hello! 👋 I'm **CivicResolve AI**. I can help you report civic issues like potholes, garbage, "
                "water problems, streetlights, drainage, or other public-service issues. You can also ask me to track an existing complaint.\n\n"
                "What would you like help with today?"
            )
        return ChatResponse(
            message=msg,
            suggest_complaint=False,
            quick_replies=["Report a pothole", "Garbage not collected", "Water leakage", "Track my complaint"],
        )

    # 2. General Inquiry & Off-Topic Guard
    if _is_general_inquiry(user_msg):
        return ChatResponse(
            message=(
                "**CivicResolve AI** is your city's 24/7 intelligent municipal operations platform.\n\n"
                "**How it works:**\n"
                "1. **Describe the issue** — Tell me what happened and where (e.g., *'Pothole on MG Road near City Mall'*).\n"
                "2. **AI Analysis** — I classify the category, evaluate priority, and route to the correct municipal team.\n"
                "3. **Track & Resolve** — Receive an official ID like `CR-2026-XXXXXX` to follow live progress.\n\n"
                "What civic problem would you like to report today?"
            ),
            suggest_complaint=False,
            quick_replies=["Report a problem", "Track a complaint", "List departments"],
        )

    if _is_off_topic(user_msg):
        if "weather" in lower:
            msg = "I can help with civic services and municipal complaints, but I don't currently have live weather telemetry. If you'd like, I can help you report or track a civic issue in your area."
        elif "name" in lower or "who are you" in lower:
            msg = "I'm **CivicResolve AI**, your intelligent civic assistant. What civic service or complaint can I help you with?"
        else:
            msg = "I'm specialized in helping citizens report and track municipal civic issues. Would you like to report a problem or check an existing complaint?"
        return ChatResponse(
            message=msg,
            suggest_complaint=False,
            quick_replies=["Report an issue", "Track a complaint"],
        )

    # 3. Contextual Complaint Tracking & Status Lookups
    id_match = re.search(r"CR-\d{4}-\d{4,8}", user_msg, re.IGNORECASE)
    is_track_intent = (
        bool(id_match)
        or any(w in lower for w in [
            "where is my complaint", "status of", "check my complaint", "track complaint",
            "track my complaint", "why is my complaint", "why hasn't it been resolved",
            "why hasnt it been resolved", "when was it assigned", "which department is handling",
            "what should i do if the issue is still there", "issue is still there", "remind",
            "has my complaint been resolved", "whats the status", "what's the status"
        ])
    )

    if is_track_intent:
        conn = get_connection()
        try:
            target_complaint = None
            if id_match:
                cid = id_match.group(0).upper()
                row = conn.execute("SELECT * FROM complaints WHERE complaint_number = ? OR id = ?;", (cid, cid)).fetchone()
                if row:
                    target_complaint = dict(row)
            elif citizen_id is not None:
                row = conn.execute("SELECT * FROM complaints WHERE citizen_id = ? ORDER BY created_at DESC LIMIT 1;", (citizen_id,)).fetchone()
                if row:
                    target_complaint = dict(row)

            if target_complaint:
                c_num = target_complaint["complaint_number"]
                c_cat = target_complaint.get("category", "Civic Issue")
                c_stat = target_complaint.get("status", "Submitted")
                c_dept = target_complaint.get("department", "Municipal Operations")
                c_prio = target_complaint.get("priority", "MEDIUM")
                c_team = target_complaint.get("assigned_team") or target_complaint.get("assigned_officer") or "Municipal Dispatch Squad"
                c_sla = target_complaint.get("estimated_response") or ("24 hours" if c_prio in ("HIGH", "CRITICAL") else "48-72 hours")
                c_loc = target_complaint.get("location", "the reported site")

                updates = _fetch_updates(conn, target_complaint["id"])
                assigned_upd = next((u for u in updates if u.get("status") == "Assigned"), None)
                assigned_time = assigned_upd.get("created_at") if assigned_upd else target_complaint.get("created_at")

                if "why" in lower and "resolved" in lower:
                    explanation = (
                        f"Complaint **{c_num}** ({c_cat}) is currently in **{c_stat}** stage with {c_dept}.\n\n"
                        f"Field operations are scheduled within the **{c_sla}** SLA window. "
                        f"Assigned team **{c_team}** was deployed following on-site safety priority guidelines."
                    )
                elif "when" in lower or "assigned" in lower or "which department" in lower:
                    explanation = (
                        f"Complaint **{c_num}** was routed to **{c_dept}**.\n\n"
                        f"• **Assigned Unit**: {c_team}\n"
                        f"• **Assigned Timestamp**: {assigned_time[:16] if assigned_time else 'Active queue'}\n"
                        f"• **SLA Target**: {c_sla}\n"
                        f"• **Current Status**: `{c_stat}`"
                    )
                elif "still there" in lower or "persist" in lower or "what should i do" in lower:
                    explanation = (
                        f"If the issue at **{c_loc}** is worsening or still unresolved, "
                        f"you can send a priority reminder from the **Track Complaint** page or contact the AI Helpline at 1800-CIVIC-AI for emergency escalation."
                    )
                else:
                    explanation = (
                        f"Here is the live status for **{c_num}**:\n\n"
                        f"• **Status**: `{c_stat}`\n"
                        f"• **Category**: {c_cat} ({c_prio} Priority)\n"
                        f"• **Handling Department**: {c_dept}\n"
                        f"• **Assigned Unit**: {c_team}\n"
                        f"• **SLA Target**: {c_sla}\n"
                        f"• **Location**: {c_loc}"
                    )

                return ChatResponse(
                    message=explanation,
                    quick_replies=[f"Track {c_num} Details", "Why is it taking time?", "Report a new issue"],
                    suggest_complaint=False,
                )
            elif id_match:
                return ChatResponse(
                    message=f"I checked the municipal database, but could not find Complaint ID **{id_match.group(0).upper()}**. Please verify the ID format (e.g. `CR-2026-004821`).",
                    quick_replies=["Track a complaint", "Report a problem"],
                    suggest_complaint=False,
                )
        finally:
            conn.close()

    # 4. Extract classification keywords and domain info
    has_civic_keywords = any(kw in lower for kws in CATEGORY_KEYWORDS.values() for kw in kws)
    category = classify(user_msg)
    priority = detect_priority(user_msg)
    severity = calculate_severity(priority, user_msg)
    _, dept_name = get_department_for_category(category)
    est_sla = get_estimated_response(priority)

    # Partial / broad complaints without specifics (disambiguate before filing)
    if any(phrase in lower for phrase in ["problem with the water", "issue with the water", "something with the water", "wrong with the water", "water problem", "water issue", "about water"]) or lower in ["water", "it's about water"]:
        if not any(k in lower for k in ["leak", "burst", "dirty", "contaminat", "outage", "supply", "pressure", "tap"]):
            return ChatResponse(
                message="Sure, I can help with water issues. Is it a **water supply outage**, **pipeline leakage**, **contaminated / dirty water**, or **low pressure**?",
                quick_replies=["Water leakage", "Dirty water", "No water supply", "Low pressure"],
                suggest_complaint=False,
            )

    if any(phrase in lower for phrase in ["problem with the road", "issue with the road", "road problem", "road issue", "wrong with the road", "about road", "about roads"]) or lower in ["road", "roads", "it's about road"]:
        if not any(k in lower for k in ["pothole", "broken", "footpath", "divider", "crater", "speed breaker", "damage", "crack"]):
            return ChatResponse(
                message="Sure, I can help with road issues. Is it a **dangerous pothole**, **broken footpath**, **road surface damage**, or **missing divider**?",
                quick_replies=["Dangerous pothole", "Broken footpath", "Road surface damage"],
                suggest_complaint=False,
            )

    # 5. Call local LLM (Ollama) if available
    llm_resp = None
    try:
        from llm import chat_with_llm
        llm_resp = chat_with_llm(user_msg, [h.model_dump() for h in body.history])
    except Exception as e:
        logger.warning("LLM chat error: %s", e)

    if llm_resp and len(llm_resp.strip()) > 5:
        analysis_card = None
        complaint_data = None
        suggest_complaint = False
        if has_civic_keywords and category != "Other":
            suggest_complaint = True
            analysis_card = {
                "category": category,
                "priority": priority,
                "department": dept_name,
                "confidence": 92,
                "severity": severity,
                "estimatedResponse": est_sla,
            }
            complaint_data = {
                "description": user_msg,
                "category": category,
                "priority": priority,
                "department": dept_name,
                "title": f"{priority.title()} Priority {category} Report",
                "location": "Reported via Civic AI Chat",
            }

        quick_replies = ["File Complaint", "Track a complaint", "How does this work?"] if suggest_complaint else ["Report a problem", "Track my complaint", "Common issues"]

        return ChatResponse(
            message=llm_resp,
            suggest_complaint=suggest_complaint,
            quick_replies=quick_replies,
            analysis_card=analysis_card,
            complaint_data=complaint_data,
        )

    # 6. Fallback Rule-Based Civic Engine
    if "which department" in lower or "who handles" in lower:
        hist_text = " ".join(h.content for h in body.history) + " " + user_msg
        cat = classify(hist_text)
        _, dept = get_department_for_category(cat)
        return ChatResponse(
            message=f"This complaint will be routed directly to the **{dept}**.",
            quick_replies=["File Complaint", "Track my complaint", "Report another issue"],
            suggest_complaint=True,
        )

    if has_civic_keywords and category != "Other":
        # Check if location was mentioned in the user message or conversation history
        combined_text = " ".join(h.content for h in body.history) + " " + user_msg
        loc_words = ["road", "street", "near", "opposite", "beside", "behind", "layout", "colony", "nagar", "ward", "cross", "main", "junction", "sector", "mall", "market", "station"]
        has_location = any(w in combined_text.lower() for w in loc_words)

        if not has_location and len(body.history) < 2:
            return ChatResponse(
                message=f"I understand this is a **{category}** issue. Where exactly is this occurring? (e.g. street name, landmark, or area).",
                quick_replies=["Near Gandhi Market", "On Main Road", "Near the bus stop"],
                suggest_complaint=False,
            )

        emerg_note = ""
        if any(ek in user_msg.lower() for ek in EMERGENCY_KEYWORDS):
            emerg_note = "\n\n⚠️ **Urgent Safety Warning**: For immediate life-safety hazards, please also notify emergency services at 112."

        card = {
            "category": category,
            "priority": priority,
            "department": dept_name,
            "confidence": 94,
            "severity": severity,
            "estimatedResponse": est_sla,
        }
        c_data = {
            "description": user_msg,
            "category": category,
            "priority": priority,
            "department": dept_name,
            "title": f"{priority.title()} Priority {category} Report",
            "location": "Reported via Civic AI Chat",
        }

        return ChatResponse(
            message=f"✅ **AI Classification Prepared**\n\nIdentified **{category}** issue routed to **{dept_name}** with **{priority}** priority (SLA target: {est_sla}).{emerg_note}\n\nClick **File Complaint** below to review and confirm submission.",
            suggest_complaint=True,
            quick_replies=["File Complaint", "Track my complaint", "Report another issue"],
            analysis_card=card,
            complaint_data=c_data,
        )

    return ChatResponse(
        message="I'm here to help with civic infrastructure issues! You can describe a problem (e.g. pothole, garbage accumulation, water leak, broken streetlight) or provide a Complaint ID to check its status.",
        quick_replies=["Report a problem", "Track my complaint", "Common issues"],
    )


@router.post("/ai/analyze-image", response_model=ImageAnalysisResponse)
def analyze_image_endpoint(body: ImageAnalysisRequest):
    """
    Intelligent civic visual intelligence underwriter.
    Correlates visual proof with incident context to identify hazard, objects, severity, and civic category.
    Prioritizes actual visual image cues to detect mismatches with written citizen descriptions.
    """
    from vision import analyze_civic_image

    img_input = body.image_data or body.filename
    res = analyze_civic_image(
        image_input=img_input,
        filename=body.filename,
        description=body.description,
    )
    return ImageAnalysisResponse(**res)


@router.post("/voice/turn", response_model=VoiceTurnResponse)
@router.post("/ai/voice-turn", response_model=VoiceTurnResponse)
def handle_voice_turn(
    body: VoiceTurnRequest,
    authorization: Optional[str] = Header(None),
):
    """
    Dedicated AI Voice/Call Helpline turn processor.
    Takes citizen voice transcript, tracks multi-turn conversation state,
    uses Qwen2.5:3B / Ollama with deterministic fallback, saves the real complaint to DB on confirmation,
    and returns text-to-speech spoken response + real Complaint ID + ui_hints.
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

    user_text = body.get_user_text()
    history_list = [h.model_dump() for h in body.history] if body.history else []

    result = process_voice_call_turn(
        message=user_text,
        stage=body.stage,
        extracted_data=body.extracted_data,
        citizen_id=citizen_id,
        latitude=body.latitude,
        longitude=body.longitude,
        history=history_list,
    )
    return VoiceTurnResponse(**result)


from fastapi.openapi.docs import get_swagger_ui_html

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
@router.get("/health")
@router.get("/api/health")
def root_health():
    diag = get_database_diagnostics()
    log_db_operation("health_check", diag.get("complaints_count"))
    return diag

# ── Mount all routes at BOTH root AND /api ─────────────────────────────────────
app.include_router(router)
app.include_router(router, prefix="/api")


if __name__ == "__main__":
    import uvicorn
    print("==================================================")
    print("🚀 Starting CivicResolve AI Backend on http://127.0.0.1:8000")
    print("==================================================")
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)



