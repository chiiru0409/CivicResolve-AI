"""
schemas.py — Pydantic v2 request / response models for the FastAPI layer.

Keep these thin: validation only, no business logic.
"""

from __future__ import annotations
import re
from typing import Any, Optional
from pydantic import BaseModel, Field, field_validator
from models import VALID_STATUSES, VALID_PRIORITIES, VALID_CATEGORIES

# ── Safe EmailStr Fallback ──────────────────────────────────────────────────
# Prevents crash if 'email-validator' / 'pydantic[email]' is not installed.
try:
    from pydantic import EmailStr
except (ImportError, ModuleNotFoundError):
    EmailStr = str  # type: ignore


# ══════════════════════════════════════════════════════════════
# AUTH SCHEMAS
# ══════════════════════════════════════════════════════════════

class UserRegister(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=100)
    email: EmailStr
    phone: str = Field("", max_length=20)
    password: str = Field(..., min_length=6, max_length=128)

    @field_validator("full_name")
    @classmethod
    def name_no_numbers(cls, v: str) -> str:
        if any(c.isdigit() for c in v):
            raise ValueError("Name must not contain numbers.")
        return v.strip()

    @field_validator("email")
    @classmethod
    def validate_email_format(cls, v: str) -> str:
        if not re.match(r"^[^@]+@[^@]+\.[^@]+$", str(v).strip()):
            raise ValueError("Invalid email address format.")
        return str(v).strip().lower()


class UserLogin(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=1)

    @field_validator("email")
    @classmethod
    def validate_email_format(cls, v: str) -> str:
        return str(v).strip().lower()


class AdminLogin(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=1)

    @field_validator("email")
    @classmethod
    def validate_email_format(cls, v: str) -> str:
        return str(v).strip().lower()


class ProfileUpdate(BaseModel):
    full_name: Optional[str] = Field(None, min_length=2, max_length=100)
    phone: Optional[str] = Field(None, max_length=20)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    user_id: int
    full_name: str
    email: str


class UserOut(BaseModel):
    id: int
    full_name: str
    email: str
    phone: Optional[str]
    role: str
    created_at: str


# ══════════════════════════════════════════════════════════════
# COMPLAINT SCHEMAS — REQUEST
# ══════════════════════════════════════════════════════════════

class ComplaintCreate(BaseModel):
    """Posted by the citizen-facing report form."""
    description: str = Field(..., min_length=10, max_length=4000)
    location: Optional[str] = Field(None, max_length=500)
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    location_accuracy: Optional[float] = None
    landmark: Optional[str] = Field(None, max_length=300)
    address: Optional[str] = Field(None, max_length=500)
    contact_preference: str = Field("email", max_length=20)
    is_anonymous: bool = False

    # Optional pre-classified values from the frontend AI
    category: Optional[str] = None
    priority: Optional[str] = None
    department: Optional[str] = None
    title: Optional[str] = Field(None, max_length=300)
    ai_confidence: Optional[int] = Field(None, ge=0, le=100)
    ai_reason: Optional[str] = Field(None, max_length=1000)
    estimated_response: Optional[str] = Field(None, max_length=50)
    zone: Optional[str] = Field(None, max_length=50)
    assigned_team: Optional[str] = Field(None, max_length=200)
    source: Optional[str] = Field("Web", max_length=50)
    image_path: Optional[str] = None
    evidence_quality: Optional[str] = None

    @field_validator("category")
    @classmethod
    def validate_category(cls, v):
        if v is not None and v not in VALID_CATEGORIES:
            raise ValueError(f"category must be one of {VALID_CATEGORIES}")
        return v

    @field_validator("priority")
    @classmethod
    def validate_priority(cls, v):
        if v is not None and v not in VALID_PRIORITIES:
            raise ValueError(f"priority must be one of {VALID_PRIORITIES}")
        return v

    @field_validator("latitude")
    @classmethod
    def validate_latitude(cls, v):
        if v is not None and not (-90.0 <= v <= 90.0):
            raise ValueError("Latitude must be between -90 and 90 degrees.")
        return v

    @field_validator("longitude")
    @classmethod
    def validate_longitude(cls, v):
        if v is not None and not (-180.0 <= v <= 180.0):
            raise ValueError("Longitude must be between -180 and 180 degrees.")
        return v


class StatusUpdate(BaseModel):
    """PATCH /admin/complaints/{id}/status"""
    status: str
    message: Optional[str] = Field(None, max_length=1000)
    updated_by: str = Field("admin", max_length=100)

    @field_validator("status")
    @classmethod
    def validate_status(cls, v):
        if v not in VALID_STATUSES:
            raise ValueError(f"status must be one of {VALID_STATUSES}")
        return v


class AssignmentCreate(BaseModel):
    """POST /admin/complaints/{id}/assign"""
    department: str = Field(..., min_length=1, max_length=200)
    officer: Optional[str] = Field(None, max_length=200)
    team: Optional[str] = Field(None, max_length=200)
    notes: Optional[str] = Field(None, max_length=1000)
    assigned_by: str = Field("admin", max_length=100)


# ══════════════════════════════════════════════════════════════
# COMPLAINT SCHEMAS — RESPONSE
# ══════════════════════════════════════════════════════════════

class ComplaintUpdateOut(BaseModel):
    id: int
    complaint_id: str
    status: str
    message: Optional[str]
    updated_by: str
    created_at: str


class AssignmentOut(BaseModel):
    id: int
    complaint_id: str
    department: str
    officer: Optional[str]
    team: Optional[str]
    notes: Optional[str]
    assigned_by: str
    assigned_at: str


class ComplaintOut(BaseModel):
    """
    Full complaint — returned for:
      GET /complaints/{id}       (authenticated citizen, own complaint)
      GET /admin/complaints/{id} (admin, full detail)
    """
    id: str
    complaint_number: str
    citizen_id: Optional[int]
    title: str
    description: str
    category: str
    subcategory: Optional[str]
    department: Optional[str]
    priority: str
    severity: int
    status: str
    latitude: Optional[float]
    longitude: Optional[float]
    location_accuracy: Optional[float]
    location: Optional[str]
    address: Optional[str]
    landmark: Optional[str]
    image_path: Optional[str]
    evidence_quality: Optional[str] = None
    ai_analysis: Optional[Any]
    ai_confidence: Optional[int]
    ai_reason: Optional[str]
    public_safety_impact: Optional[str] = None
    inspection_required: Optional[int] = 0
    location_risk: Optional[str] = None
    action_plan: Optional[str] = None
    assigned_officer: Optional[str]
    assigned_team: Optional[str]
    estimated_response: Optional[str]
    zone: Optional[str]
    is_anonymous: bool
    contact_preference: str
    escalation_level: int
    source: Optional[str] = "Web"
    created_at: str
    updated_at: str
    resolved_at: Optional[str]
    citizen_rating: Optional[int] = None
    citizen_feedback: Optional[str] = None
    rated_at: Optional[str] = None
    updates: list[ComplaintUpdateOut] = []
    assignments: list[AssignmentOut] = []


class ComplaintListItem(BaseModel):
    """Lighter shape for list endpoints."""
    id: str
    complaint_number: str
    title: str
    category: str
    priority: str
    status: str
    department: Optional[str] = None
    location: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    location_accuracy: Optional[float] = None
    landmark: Optional[str] = None
    ai_confidence: Optional[int] = None
    source: Optional[str] = "Web"
    citizen_rating: Optional[int] = None
    created_at: str
    updated_at: str



class TrackResponse(BaseModel):
    """
    Public tracking response — GET /track/{complaint_number}
    Contains ONLY safe, non-PII information.
    """
    complaint_number: str
    title: str
    category: str
    priority: str
    status: str
    department: Optional[str]
    estimated_response: Optional[str]
    escalation_level: int
    created_at: str
    updated_at: str
    resolved_at: Optional[str]
    # Public update history — status + public message only, no internal notes
    updates: list[ComplaintUpdateOut] = []


class AnalyticsSummary(BaseModel):
    total_complaints: int
    high_priority: int
    pending: int
    resolved: int
    resolution_rate: float
    by_category: list[dict]
    by_priority: list[dict]
    by_status: list[dict]
    by_department: list[dict]


class DepartmentOut(BaseModel):
    id: str
    name: str
    short_name: Optional[str]
    categories: list[str]
    head: Optional[str]
    contact: Optional[str]
    zones: list[str]
    teams: list[str]
    color: Optional[str]


# ══════════════════════════════════════════════════════════════
# CHAT SCHEMAS
# ══════════════════════════════════════════════════════════════

class ChatMessageItem(BaseModel):
    role: str = Field(..., description="'user' or 'assistant'")
    content: str = Field(...)


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)
    history: list[ChatMessageItem] = Field(default_factory=list)


class ChatResponse(BaseModel):
    message: str
    suggest_complaint: bool = False
    quick_replies: list[str] = Field(default_factory=list)
    analysis_card: Optional[dict] = None
    complaint_data: Optional[dict] = None


# ══════════════════════════════════════════════════════════════
# ADMIN AI & INTELLIGENCE SCHEMAS
# ══════════════════════════════════════════════════════════════

class AdminAIBriefResponse(BaseModel):
    total_complaints: int
    today_complaints: int
    high_priority_count: int
    pending_count: int
    resolved_count: int
    overdue_count: int
    top_department: str
    top_category: str
    urgency_level: str
    ai_summary: str
    key_bullet_points: list[str] = []
    category_counts: dict[str, int] = {}
    priority_counts: dict[str, int] = {}


class AdminAIQueryRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=2000)
    context: Optional[dict[str, Any]] = None


class ActionProposal(BaseModel):
    action_type: str = Field(..., description="e.g. 'assign_department', 'update_status', 'escalate'")
    complaint_id: str
    target_value: str
    officer_or_team: Optional[str] = None
    reason: str
    requires_confirmation: bool = True


class DuplicateCluster(BaseModel):
    cluster_id: str
    category: str
    location: str
    similarity_score: int
    complaint_ids: list[str]
    complaints: list[dict[str, Any]]
    suggested_action: str


class AdminAIQueryResponse(BaseModel):
    query: str
    answer: str
    suggested_actions: list[str] = []
    action_proposals: list[ActionProposal] = []
    related_complaints: list[dict[str, Any]] = []
    category_insights: Optional[dict[str, Any]] = None
    duplicate_clusters: list[DuplicateCluster] = []


class ComplaintAIAnalysisResponse(BaseModel):
    complaint_id: str
    title: str
    category: str
    subcategory: Optional[str]
    priority: str
    severity: int
    department: str
    assigned_team: Optional[str]
    location: Optional[str]
    risk_assessment: str
    urgency_reasoning: str
    recommended_action: str
    estimated_response: str
    similar_reports_count: int
    similar_reports: list[dict[str, Any]] = []
    ai_confidence: int
    action_proposals: list[ActionProposal] = []


class ExecuteActionRequest(BaseModel):
    action_type: str = Field(..., description="'assign_department', 'update_status', 'escalate'")
    complaint_id: str
    target_value: Optional[str] = None
    officer_or_team: Optional[str] = None
    note: Optional[str] = None


# ══════════════════════════════════════════════════════════════
# CITIZEN POST-RESOLUTION RATING SCHEMAS
# ══════════════════════════════════════════════════════════════

class ComplaintRatingRequest(BaseModel):
    rating: int = Field(..., ge=1, le=5, description="Citizen rating from 1 to 5 stars")
    feedback: Optional[str] = Field(None, max_length=1000, description="Optional feedback or comment")


class ComplaintRatingResponse(BaseModel):
    complaint_id: str
    complaint_number: str
    rating: int
    feedback: Optional[str] = None
    rated_at: str
    message: str


# ══════════════════════════════════════════════════════════════
# VOICE / CALL BOT SCHEMAS
# ══════════════════════════════════════════════════════════════

class VoiceTurnRequest(BaseModel):
    message: Optional[str] = Field(None, max_length=2000)
    user_speech: Optional[str] = Field(None, max_length=2000)
    history: list[ChatMessageItem] = Field(default_factory=list)
    stage: str = Field("greeting", description="Current stage: greeting, listening, problem, location, landmark, confirm, submitted, tracking")
    extracted_data: dict[str, Any] = Field(default_factory=dict)
    latitude: Optional[float] = None
    longitude: Optional[float] = None

    def get_user_text(self) -> str:
        return (self.message or self.user_speech or "").strip()


class VoiceTurnResponse(BaseModel):
    reply_text: str
    stage: str
    extracted_data: dict[str, Any]
    action: str = Field("speak", description="'speak', 'listen', 'confirm', 'completed', 'ended'")
    complaint: Optional[dict] = None
    ui_hints: Optional[dict[str, Any]] = None


class ImageAnalysisRequest(BaseModel):
    description: Optional[str] = None
    filename: Optional[str] = None
    image_data: Optional[str] = None


class ImageAnalysisResponse(BaseModel):
    detected_objects: list[str]
    severity: str
    suggested_category: str
    confidence: int
    summary: str


# ══════════════════════════════════════════════════════════════
# DUPLICATE DETECTION & MAP INCIDENTS SCHEMAS
# ══════════════════════════════════════════════════════════════

class DuplicateCheckRequest(BaseModel):
    description: str = Field(..., min_length=5, max_length=4000)
    category: Optional[str] = None
    location: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None


class DuplicateCheckResult(BaseModel):
    is_potential_duplicate: bool
    similarity_percentage: int
    existing_complaint_id: Optional[str] = None
    existing_title: Optional[str] = None
    existing_status: Optional[str] = None
    existing_created_at: Optional[str] = None
    existing_location: Optional[str] = None
    explanation: str


class MapIncident(BaseModel):
    id: str
    complaint_number: str
    title: str
    category: str
    priority: str
    status: str
    latitude: float
    longitude: float
    location: Optional[str] = None
    department: Optional[str] = None
    created_at: str


