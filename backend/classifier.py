"""
classifier.py — Keyword-based issue category classifier.

Logic mirrors src/services/aiService.ts detectCategory() exactly so that
backend and frontend always agree on category assignment.
"""

from __future__ import annotations

CATEGORY_KEYWORDS: dict[str, list[str]] = {
    "Roads": [
        "pothole", "road", "highway", "street", "tarmac", "pavement",
        "lane", "traffic", "marking", "footpath", "asphalt", "carriageway",
        "divider", "median", "speed breaker", "bump", "crater", "sinkhole",
        "bad road", "broken road", "hole on road", "manhole", "road damage",
        "road is very bad", "big hole", "road problem", "street problem",
    ],
    "Garbage": [
        "garbage", "trash", "waste", "litter", "rubbish", "dump", "bin",
        "stench", "smell", "filth", "sanitation", "overflowing", "debris",
        "plastic", "dumping", "refuse", "kachra", "dustbin", "dumpster",
        "uncollected", "garbage full", "garbage accumulation", "rotten",
        "garbage problem", "trash problem",
    ],
    "Drainage": [
        "drain", "drainage", "flood", "water logging", "waterlogging",
        "sewage", "sewer", "blockage", "clog", "clogged", "blocked",
        "overflow", "stagnant", "inundated", "canal", "nala", "gutter",
        "open drain", "drain blocked", "drainage is overflowing", "drain problem",
    ],
    "Water": [
        "water supply", "pipeline", "pipe", "supply", "tap", "leak", "leaking",
        "leakage", "burst", "contaminated", "murky", "dirty water", "no water",
        "water shortage", "water cut", "tanker", "drinking water", "gushing",
        "water pipeline", "water leakage", "water coming everywhere",
        "water issue", "water problem",
    ],
    "Streetlights": [
        "light", "streetlight", "lamp", "dark", "bulb", "electricity",
        "illumination", "flickering", "lamppost", "street lamp",
        "no light", "power outage", "wire", "cable", "live wire", "exposed cable",
        "exposed wire", "electric pole", "electrical", "sparking", "transformer",
        "light not working", "broken streetlight", "electrical hazard",
    ],
    "Infrastructure": [
        "bridge", "sidewalk", "bench", "park", "building", "wall",
        "structure", "crack", "collapse", "broken", "damaged", "facility",
        "public property", "fence", "compound", "footbridge", "bus stop",
        "bus shelter", "public toilet", "railing", "damaged public infrastructure",
    ],
}

# Non-civic queries (chat, general knowledge, jokes, programming, weather)
NON_CIVIC_KEYWORDS: list[str] = [
    "weather", "joke", "python", "code", "prime minister", "president",
    "who is", "what is the time", "how are you", "write a program",
    "tell me a story", "capital of", "recipe", "song", "movie",
]


def classify(text: str) -> str:
    """
    Return the best-matching category name for *text*.
    Falls back to 'Other' when no keyword matches or when input is non-civic.
    """
    lower = text.lower().strip()
    if not lower:
        return "Other"

    # Check for clearly non-civic input
    if any(nck in lower for nck in NON_CIVIC_KEYWORDS) and not any(
        kw in lower for kws in CATEGORY_KEYWORDS.values() for kw in kws
    ):
        return "Other"

    # Specific civic root-cause rules:
    # "There is water covering the road because the drain is blocked" -> Drainage root issue
    if "drain" in lower and ("blocked" in lower or "overflow" in lower or "water" in lower or "rain" in lower):
        return "Drainage"

    # Water leakage on street/road -> Water supply issue
    if ("leak" in lower or "pipeline" in lower or "pipe" in lower or "burst" in lower) and "water" in lower:
        return "Water"

    # Electrical hazard / exposed wire -> Streetlights / Electrical division
    if ("wire" in lower or "cable" in lower or "spark" in lower or "electric" in lower) and ("exposed" in lower or "live" in lower or "hanging" in lower or "pole" in lower):
        return "Streetlights"

    best_category = "Other"
    best_score = 0

    for category, keywords in CATEGORY_KEYWORDS.items():
        score = 0
        for kw in keywords:
            if kw in lower:
                # Give higher weight to multi-word specific phrases
                score += len(kw.split()) * 2
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
        "Infrastructure": ("dept-infra",      "Public Works & Infrastructure Department"),
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
