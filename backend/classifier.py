"""
classifier.py — Keyword-based issue category classifier.

Logic mirrors src/services/aiService.ts detectCategory() exactly so that
backend and frontend always agree on category assignment.
"""

from __future__ import annotations

# ── Keyword map (mirrors aiService.ts categoryKeywords) ───────────────────────
CATEGORY_KEYWORDS: dict[str, list[str]] = {
    "Roads": [
        "pothole", "road", "highway", "street", "tarmac", "pavement",
        "lane", "traffic", "marking", "footpath", "asphalt", "carriageway",
        "divider", "median", "speed breaker", "bump",
    ],
    "Garbage": [
        "garbage", "trash", "waste", "litter", "rubbish", "dump", "bin",
        "stench", "smell", "filth", "sanitation", "overflowing", "debris",
        "plastic", "dumping", "refuse",
    ],
    "Drainage": [
        "drain", "drainage", "flood", "water logging", "waterlogging",
        "sewage", "sewer", "blockage", "clog", "overflow", "stagnant",
        "inundated", "canal", "nala",
    ],
    "Water": [
        "water supply", "pipeline", "pipe", "supply", "tap", "leak",
        "burst", "contaminated", "murky", "dirty water", "no water",
        "water shortage", "water cut", "tanker",
    ],
    "Streetlights": [
        "light", "streetlight", "lamp", "dark", "bulb", "electricity",
        "illumination", "flickering", "lamppost", "street lamp",
        "no light", "power outage",
    ],
    "Infrastructure": [
        "bridge", "sidewalk", "bench", "park", "building", "wall",
        "structure", "crack", "collapse", "broken", "damaged", "facility",
        "public property", "fence", "compound",
    ],
}


def classify(text: str) -> str:
    """
    Return the best-matching category name for *text*.
    Falls back to "Other" when no keyword matches.
    """
    lower = text.lower()
    best_category = "Other"
    best_score = 0

    for category, keywords in CATEGORY_KEYWORDS.items():
        score = sum(1 for kw in keywords if kw in lower)
        if score > best_score:
            best_score = score
            best_category = category

    return best_category


def get_department_for_category(category: str) -> tuple[str, str]:
    """
    Return (department_id, department_name) for a given category.
    Mirrors getDepartmentByCategory() in mockDepartments.ts.
    """
    mapping: dict[str, tuple[str, str]] = {
        "Roads":          ("dept-roads",      "Municipal Roads & Infrastructure Department"),
        "Infrastructure": ("dept-roads",      "Municipal Roads & Infrastructure Department"),
        "Garbage":        ("dept-sanitation", "Sanitation & Waste Management Department"),
        "Drainage":       ("dept-drainage",   "Drainage & Stormwater Management"),
        "Water":          ("dept-water",      "Water Supply & Distribution Department"),
        "Streetlights":   ("dept-electrical", "Electrical & Street Lighting Division"),
        "Other":          ("dept-infra",      "Public Works & Infrastructure Department"),
    }
    return mapping.get(category, ("dept-infra", "Public Works & Infrastructure Department"))


def get_first_team(category: str) -> str:
    """Return the default first team for the department that handles *category*."""
    teams: dict[str, str] = {
        "Roads":          "Central Roads Team",
        "Infrastructure": "Civil Works Team",
        "Garbage":        "Zone 1 Sanitation Team",
        "Drainage":       "Drainage Inspection Team",
        "Water":          "Pipeline Repair Team",
        "Streetlights":   "Lighting Maintenance Team",
        "Other":          "Civil Works Team",
    }
    return teams.get(category, "Field Team")
