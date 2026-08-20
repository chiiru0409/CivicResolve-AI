"""
priority.py — Keyword-based priority and severity scorer.

Logic mirrors src/services/aiService.ts detectPriority() exactly.
"""

from __future__ import annotations

# ── Keyword lists (mirrors aiService.ts) ──────────────────────────────────────
HIGH_KEYWORDS: list[str] = [
    "accident", "dangerous", "emergency", "urgent", "collapsed", "burst",
    "gushing", "flooding", "injured", "severe", "critical", "huge", "major",
    "serious", "unsafe", "blocked road", "no supply", "fire", "explosion",
    "electrocution", "fallen tree", "structural failure",
]

MEDIUM_KEYWORDS: list[str] = [
    "overflowing", "accumulating", "days", "week", "multiple", "continuous",
    "ongoing", "residents", "colony", "repeated", "several", "persistent",
    "months", "long time", "still not fixed",
]

# Severity score map: (priority) → (min_score, max_score) for 1-10 scale
_SEVERITY_RANGE: dict[str, tuple[int, int]] = {
    "HIGH":     (7, 10),
    "MEDIUM":   (4, 6),
    "LOW":      (1, 3),
    "CRITICAL": (9, 10),
}

# Estimated response times per priority
RESPONSE_TIMES: dict[str, str] = {
    "HIGH":     "24-48 hours",
    "MEDIUM":   "48-72 hours",
    "LOW":      "72-96 hours",
    "CRITICAL": "Immediate — within 6 hours",
}


def detect_priority(text: str) -> str:
    """
    Return 'HIGH', 'MEDIUM', or 'LOW' based on keyword presence in *text*.
    Mirrors frontend detectPriority().
    """
    lower = text.lower()
    high_count   = sum(1 for kw in HIGH_KEYWORDS   if kw in lower)
    medium_count = sum(1 for kw in MEDIUM_KEYWORDS if kw in lower)

    if high_count >= 1:
        return "HIGH"
    if medium_count >= 2:
        return "MEDIUM"
    if medium_count >= 1:
        return "MEDIUM"
    return "LOW"


def calculate_severity(priority: str, text: str) -> int:
    """
    Return a numeric severity score 1-10.
    Combines base range from priority with bonus for extra high-priority words.
    """
    import random
    lower = text.lower()
    low_s, high_s = _SEVERITY_RANGE.get(priority, (1, 5))
    # Extra keywords push toward the top of the range
    high_bonus = sum(1 for kw in HIGH_KEYWORDS if kw in lower)
    base = (low_s + high_s) // 2 + min(high_bonus, 2)
    return max(low_s, min(high_s, base))


def get_estimated_response(priority: str) -> str:
    return RESPONSE_TIMES.get(priority, "72-96 hours")
