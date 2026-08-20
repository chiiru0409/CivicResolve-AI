"""
models.py — Pure Python dataclasses that mirror the SQLite schema.

No ORM. These are used internally by the backend for typed data passing
between database.py, agent.py, and main.py.
"""

from __future__ import annotations
from dataclasses import dataclass, field
from typing import Optional
import json


# ── Valid values (mirrors frontend TypeScript types) ──────────────────────────

VALID_STATUSES = [
    "NEW",
    "Submitted",
    "AI_Analysis",
    "Assigned",
    "In Progress",
    "Inspection",
    "Resolved",
    "Closed",
    "Escalated",
]

VALID_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"]

VALID_CATEGORIES = [
    "Roads",
    "Garbage",
    "Drainage",
    "Water",
    "Streetlights",
    "Infrastructure",
    "Other",
]

# Maps frontend status labels → display label for timeline events
STATUS_LABELS: dict[str, str] = {
    "NEW":         "Complaint Received",
    "Submitted":   "Complaint Submitted",
    "AI_Analysis": "AI Analysis Completed",
    "Assigned":    "Assigned to Field Officer",
    "In Progress": "Work In Progress",
    "Inspection":  "Site Inspection Conducted",
    "Resolved":    "Issue Resolved",
    "Closed":      "Complaint Closed",
    "Escalated":   "Complaint Escalated",
}

# Department name → dept id
DEPT_CATEGORY_MAP: dict[str, str] = {
    "Roads":          "dept-roads",
    "Infrastructure": "dept-roads",
    "Garbage":        "dept-sanitation",
    "Drainage":       "dept-drainage",
    "Water":          "dept-water",
    "Streetlights":   "dept-electrical",
    "Other":          "dept-infra",
}

DEPT_NAMES: dict[str, str] = {
    "dept-roads":      "Municipal Roads & Infrastructure Department",
    "dept-sanitation": "Sanitation & Waste Management Department",
    "dept-drainage":   "Drainage & Stormwater Management",
    "dept-water":      "Water Supply & Distribution Department",
    "dept-electrical": "Electrical & Street Lighting Division",
    "dept-infra":      "Public Works & Infrastructure Department",
}

DEPT_TEAMS: dict[str, list[str]] = {
    "dept-roads":      ["North Roads Team", "South Roads Team", "Central Roads Team", "Emergency Response Team"],
    "dept-sanitation": ["Zone 1 Sanitation Team", "Zone 2 Sanitation Team", "Zone 3 Sanitation Team", "Market Sanitation Team"],
    "dept-drainage":   ["Drainage Inspection Team", "Emergency Pump Team", "Maintenance Team"],
    "dept-water":      ["Pipeline Repair Team", "Supply Management Team", "Emergency Water Team"],
    "dept-electrical": ["Lighting Maintenance Team", "Emergency Electrical Team", "North Lighting Team", "South Lighting Team"],
    "dept-infra":      ["Civil Works Team", "Bridge Maintenance Team", "Public Facility Team"],
}


# ── Dataclasses ────────────────────────────────────────────────────────────────

@dataclass
class Complaint:
    id: str
    complaint_number: str
    title: str
    description: str
    category: str
    priority: str
    status: str
    department: Optional[str]
    location: Optional[str]
    created_at: str
    updated_at: str
    # optional fields
    subcategory: Optional[str] = None
    severity: int = 5
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    location_accuracy: Optional[float] = None
    address: Optional[str] = None
    landmark: Optional[str] = None
    image_path: Optional[str] = None
    ai_analysis: Optional[str] = None   # raw JSON string
    ai_confidence: Optional[int] = None
    ai_reason: Optional[str] = None
    assigned_officer: Optional[str] = None
    assigned_team: Optional[str] = None
    estimated_response: Optional[str] = None
    zone: Optional[str] = None
    is_anonymous: int = 0
    contact_preference: str = "email"
    escalation_level: int = 0
    resolved_at: Optional[str] = None

    @classmethod
    def from_row(cls, row) -> "Complaint":
        """Build from a sqlite3.Row."""
        d = dict(row)
        return cls(**{k: d.get(k) for k in cls.__dataclass_fields__})

    def ai_analysis_dict(self) -> Optional[dict]:
        if self.ai_analysis:
            try:
                return json.loads(self.ai_analysis)
            except (json.JSONDecodeError, TypeError):
                return None
        return None


@dataclass
class ComplaintUpdate:
    id: int
    complaint_id: str
    status: str
    created_at: str
    message: Optional[str] = None
    updated_by: str = "system"

    @classmethod
    def from_row(cls, row) -> "ComplaintUpdate":
        d = dict(row)
        return cls(
            id=d["id"],
            complaint_id=d["complaint_id"],
            status=d["status"],
            created_at=d["created_at"],
            message=d.get("message"),
            updated_by=d.get("updated_by", "system"),
        )


@dataclass
class Assignment:
    id: int
    complaint_id: str
    department: str
    assigned_at: str
    officer: Optional[str] = None
    team: Optional[str] = None
    notes: Optional[str] = None
    assigned_by: str = "admin"

    @classmethod
    def from_row(cls, row) -> "Assignment":
        d = dict(row)
        return cls(
            id=d["id"],
            complaint_id=d["complaint_id"],
            department=d["department"],
            assigned_at=d["assigned_at"],
            officer=d.get("officer"),
            team=d.get("team"),
            notes=d.get("notes"),
            assigned_by=d.get("assigned_by", "admin"),
        )


@dataclass
class Department:
    id: str
    name: str
    short_name: Optional[str]
    categories: list[str]
    head: Optional[str]
    contact: Optional[str]
    zones: list[str]
    teams: list[str]
    color: Optional[str]

    @classmethod
    def from_row(cls, row) -> "Department":
        d = dict(row)
        return cls(
            id=d["id"],
            name=d["name"],
            short_name=d.get("short_name"),
            categories=[c.strip() for c in (d.get("categories") or "").split(",") if c.strip()],
            head=d.get("head"),
            contact=d.get("contact"),
            zones=[z.strip() for z in (d.get("zones") or "").split(",") if z.strip()],
            teams=json.loads(d.get("teams") or "[]"),
            color=d.get("color"),
        )
