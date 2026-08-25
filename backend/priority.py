"""
priority.py — Keyword-based priority and severity scorer.

Logic mirrors src/services/aiService.ts detectPriority() exactly.
"""

from __future__ import annotations

# ── Keyword lists (mirrors aiService.ts) ──────────────────────────────────────
CRITICAL_KEYWORDS: list[str] = [
    "critical", "life threatening", "electrocution", "live wire", "exposed cable",
    "exposed wire", "building collapse", "collapsed bridge", "gas leak",
    "explosion", "severe fire", "massive sinkhole", "disaster", "poisonous",
    "electric shock", "sparking wire", "hanging live wire",
]

HIGH_KEYWORDS: list[str] = [
    "accident", "dangerous", "emergency", "urgent", "collapsed", "burst",
    "gushing", "flooding", "injured", "severe", "huge", "major",
    "serious", "unsafe", "blocked road", "no supply", "fire", "fallen tree",
    "structural failure", "deep crater", "open drain", "hazardous",
]

MEDIUM_KEYWORDS: list[str] = [
    "overflowing", "accumulating", "days", "week", "multiple", "continuous",
    "ongoing", "residents", "colony", "repeated", "several", "persistent",
    "months", "long time", "still not fixed", "traffic jam", "flickering",
    "water leakage", "broken", "dirty water", "smell", "stench",
]

# Severity score map: (priority) → (min_score, max_score) for 1-10 scale
_SEVERITY_RANGE: dict[str, tuple[int, int]] = {
    "CRITICAL": (9, 10),
    "HIGH":     (7, 9),
    "MEDIUM":   (4, 6),
    "LOW":      (1, 3),
}

# Estimated response times per priority
RESPONSE_TIMES: dict[str, str] = {
    "CRITICAL": "Immediate — within 6 hours",
    "HIGH":     "24-48 hours",
    "MEDIUM":   "48-72 hours",
    "LOW":      "72-96 hours",
}


def detect_priority(text: str) -> str:
    """
    Return 'CRITICAL', 'HIGH', 'MEDIUM', or 'LOW' based on keyword presence in *text*.
    Mirrors frontend detectPriority().
    """
    lower = text.lower()
    if any(kw in lower for kw in CRITICAL_KEYWORDS):
        return "CRITICAL"

    high_count   = sum(1 for kw in HIGH_KEYWORDS   if kw in lower)
    medium_count = sum(1 for kw in MEDIUM_KEYWORDS if kw in lower)

    # If near school or hospital with dangerous conditions
    if ("school" in lower or "hospital" in lower or "children" in lower) and ("wire" in lower or "cable" in lower or "electric" in lower):
        return "CRITICAL"

    if high_count >= 1:
        return "HIGH"
    if medium_count >= 1:
        return "MEDIUM"
    return "LOW"


def calculate_severity(priority: str, text: str) -> int:
    """
    Return a numeric severity score 1-10.
    Combines base range from priority with bonus for extra high-priority words.
    """
    lower = text.lower()
    low_s, high_s = _SEVERITY_RANGE.get(priority, (1, 3))
    # Extra keywords push toward the top of the range
    high_bonus = sum(1 for kw in HIGH_KEYWORDS if kw in lower) + sum(2 for kw in CRITICAL_KEYWORDS if kw in lower)
    base = (low_s + high_s) // 2 + min(high_bonus, 2)
    return max(low_s, min(high_s, base))


def get_estimated_response(priority: str) -> str:
    return RESPONSE_TIMES.get(priority, "72-96 hours")
