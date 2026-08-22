"""
agent.py — CivicResolve AI Orchestration Layer.

Pipeline:
    complaint text
          ↓
    llm.py → Ollama (qwen2.5:3b or configured model)
          ↓ (on failure/unavailability)
    classifier.py + priority.py (rule-based fallback)
          ↓
    location.py → zone detection
          ↓
    validated structured result dict

The function run_analysis() is the single entry point.
Its return shape has NOT changed — main.py calls it exactly
as before. Only the intelligence source has been upgraded.
"""

from __future__ import annotations

import logging
import re
from typing import Optional

from classifier import classify, get_department_for_category, get_first_team
from priority import detect_priority, calculate_severity, get_estimated_response
from location import detect_zone

logger = logging.getLogger(__name__)

# ── Title generation (used as fallback AND by llm.py validation) ──────────────

_TITLE_TEMPLATES: dict[str, str] = {
    "Roads":          "Road Damage / Pothole",
    "Garbage":        "Garbage Accumulation",
    "Drainage":       "Drainage Blockage",
    "Water":          "Water Supply Issue",
    "Streetlights":   "Street Lighting Failure",
    "Infrastructure": "Infrastructure Damage",
    "Other":          "Civic Issue",
}

_PRIORITY_PREFIXES: dict[str, str] = {
    "HIGH":     "Urgent: ",
    "MEDIUM":   "",
    "LOW":      "",
    "CRITICAL": "CRITICAL: ",
}


def _generate_title(description: str, category: str, priority: str) -> str:
    sentences = re.split(r"[.!?]", description.strip())
    first = sentences[0].strip() if sentences else ""
    if 8 <= len(first) <= 70:
        title = first[0].upper() + first[1:] if first else ""
    else:
        title = _TITLE_TEMPLATES.get(category, "Civic Issue")
    prefix = _PRIORITY_PREFIXES.get(priority, "")
    return f"{prefix}{title}"


# ── Reasoning templates (used as fallback AND by llm.py validation) ───────────

_REASON_TEMPLATES: dict[str, dict[str, str]] = {
    "Roads": {
        "HIGH":   "Road damage poses an immediate safety risk to vehicles and pedestrians. Urgent repair is required.",
        "MEDIUM": "Road surface deterioration identified. Scheduled repair recommended within 48–72 hours.",
        "LOW":    "Minor road surface issue reported. Maintenance inspection recommended.",
    },
    "Garbage": {
        "HIGH":   "Uncollected waste is creating a health hazard. Immediate sanitation response required.",
        "MEDIUM": "Accumulated garbage in a public area requires prompt collection.",
        "LOW":    "Minor waste accumulation reported. Routine collection scheduling advised.",
    },
    "Drainage": {
        "HIGH":   "Severe drainage blockage causing flooding or waterlogging. Emergency intervention needed.",
        "MEDIUM": "Drainage obstruction reported. Inspection and clearance required within 48 hours.",
        "LOW":    "Minor drainage issue reported. Routine maintenance recommended.",
    },
    "Water": {
        "HIGH":   "Water supply disruption or contamination poses a public health risk. Immediate response required.",
        "MEDIUM": "Water supply issue affecting residents. Repair and restoration required promptly.",
        "LOW":    "Minor water supply complaint reported. Technical inspection recommended.",
    },
    "Streetlights": {
        "HIGH":   "Street lighting failure in a high-risk area creating safety concerns. Immediate repair needed.",
        "MEDIUM": "Street lamp outage reported. Scheduled repair within 48 hours recommended.",
        "LOW":    "Non-functioning street light reported. Included in next maintenance cycle.",
    },
    "Infrastructure": {
        "HIGH":   "Structural damage poses a risk to public safety. Immediate inspection and barricading required.",
        "MEDIUM": "Public infrastructure damage reported. Maintenance team dispatch recommended.",
        "LOW":    "Minor infrastructure issue reported. Scheduled inspection recommended.",
    },
    "Other": {
        "HIGH":   "Urgent civic issue requiring immediate authority attention.",
        "MEDIUM": "Civic issue requiring prompt investigation and response.",
        "LOW":    "Civic complaint registered for review and appropriate action.",
    },
}


def _generate_reason(category: str, priority: str) -> str:
    cat_templates = _REASON_TEMPLATES.get(category, _REASON_TEMPLATES["Other"])
    p = "HIGH" if priority == "CRITICAL" else priority
    return cat_templates.get(p, cat_templates.get("LOW", "Civic issue requiring attention."))


def _calculate_confidence(description: str, category: str) -> int:
    from classifier import CATEGORY_KEYWORDS
    lower    = description.lower()
    keywords = CATEGORY_KEYWORDS.get(category, [])
    matches  = sum(1 for kw in keywords if kw in lower)
    words    = len(description.split())
    base     = 60
    base    += min(matches * 8, 30)
    base    += min(words // 10, 8)
    return min(base, 98)


# ── Rule-based analysis (always available, used as fallback) ──────────────────

def _rule_based_analysis(
    description: str,
    location_text: Optional[str],
    latitude:  Optional[float],
    longitude: Optional[float],
) -> dict:
    """
    Full rule-based analysis using classifier.py + priority.py + location.py.
    Used when LLM is unavailable or returns unusable output.
    """
    category            = classify(description)
    priority            = detect_priority(description)
    severity            = calculate_severity(priority, description)
    dept_id, dept_name  = get_department_for_category(category)
    assigned_team       = get_first_team(category)
    zone                = detect_zone(latitude, longitude, location_text)
    title               = _generate_title(description, category, priority)
    reason              = _generate_reason(category, priority)
    confidence          = _calculate_confidence(description, category)
    estimated_response  = get_estimated_response(priority)

    # 13-point civic intelligence rubric enhancements
    is_high_risk = priority in ("HIGH", "CRITICAL") or severity >= 7
    inspection_required = 1 if is_high_risk else (1 if category in ("Roads", "Infrastructure", "Drainage") else 0)

    safety_impacts = {
        "Roads": "Hazardous road condition posing vehicle collision risk, tire damage, and pedestrian stumble danger." if is_high_risk else "Minor vehicular disruption with low pedestrian hazard.",
        "Garbage": "Bio-sanitary hazard with potential vector breeding (rodents, flies) and toxic runoff." if is_high_risk else "Public aesthetic and neighborhood odor inconvenience.",
        "Drainage": "Stagnant contaminated blackwater overflow risking gastrointestinal pathogens and road submergence." if is_high_risk else "Minor stormwater flow obstruction.",
        "Water": "Clean drinking water wastage or pipeline contamination risk affecting neighborhood supply." if is_high_risk else "Low-pressure or localized pipeline drip.",
        "Streetlights": "Complete nocturnal darkness creating acute crime and pedestrian accident vulnerability." if is_high_risk else "Isolated illumination outage.",
        "Infrastructure": "Structural degradation risking collapse or public bodily injury." if is_high_risk else "Cosmetic public infrastructure wear.",
        "Other": "Civic disruption requiring municipal administrative review."
    }
    public_safety_impact = safety_impacts.get(category, "Civic issue under assessment.")
    location_risk = "High-density pedestrian/transit corridor" if is_high_risk else "Standard municipal zone"
    action_plan = f"1. Log issue in {dept_name} queue.\n2. Dispatch {assigned_team} within {estimated_response}.\n3. Perform site assessment and execute repairs.\n4. Close incident with photographic resolution proof."

    return {
        "category":             category,
        "subcategory":          None,
        "priority":             priority,
        "severity":             severity,
        "department_id":        dept_id,
        "department_name":      dept_name,
        "assigned_team":        assigned_team,
        "title":                title,
        "ai_reason":            reason,
        "ai_confidence":        confidence,
        "estimated_response":   estimated_response,
        "zone":                 zone,
        "public_safety_impact": public_safety_impact,
        "inspection_required":  inspection_required,
        "location_risk":        location_risk,
        "action_plan":          action_plan,
        "analysis_source":      "rule-based",
    }


# ── Main orchestration ────────────────────────────────────────────────────────

def run_analysis(
    description: str,
    location_text: Optional[str] = None,
    latitude:  Optional[float] = None,
    longitude: Optional[float] = None,
) -> dict:
    """
    Run the full CivicResolve AI analysis pipeline.

    1. Try local LLM (Ollama) for natural-language understanding.
    2. Fall back to rule-based engines if LLM is unavailable.
    3. Always use location.py for zone/coordinate handling.
    4. Always use CivicResolve's authoritative department routing.

    Returns a dict compatible with main.py's submit_complaint() handler.
    The return shape is IDENTICAL to the previous rule-based version —
    main.py requires no changes.
    """
    # ── Step 1: Attempt LLM analysis ─────────────────────────────────────────
    llm_result = None
    try:
        from llm import analyze_with_llm
        llm_result = analyze_with_llm(description)
    except ImportError:
        logger.warning("llm.py not found — using rule-based analysis.")
    except Exception as exc:
        logger.warning("LLM analysis error: %s — using rule-based fallback.", exc)

    # ── Step 2: Determine base analysis ──────────────────────────────────────
    if llm_result is not None:
        # LLM succeeded — use its output (already validated in llm.py)
        analysis          = llm_result
        analysis_source   = "llm"
    else:
        # LLM unavailable or failed — use rule engines
        logger.info("Using rule-based analysis (LLM unavailable or returned None).")
        analysis        = _rule_based_analysis(description, location_text, latitude, longitude)
        analysis_source = "rule-based"

    # ── Step 3: Always apply location.py (authoritative for GPS/zone) ─────────
    # Even when LLM runs, zone detection uses the deterministic location engine.
    if analysis.get("zone") is None:
        analysis["zone"] = detect_zone(latitude, longitude, location_text)

    # ── Step 4: Ensure estimated_response is always populated ─────────────────
    if not analysis.get("estimated_response"):
        analysis["estimated_response"] = get_estimated_response(analysis["priority"])

    # ── Step 5: Ensure department routing is always authoritative ─────────────
    # llm.py already sets dept from CATEGORY_TO_DEPT, but double-check here
    # in case someone edits llm.py incorrectly.
    category = analysis["category"]
    if not analysis.get("department_id") or not analysis.get("department_name"):
        dept_id, dept_name          = get_department_for_category(category)
        analysis["department_id"]   = dept_id
        analysis["department_name"] = dept_name

    if not analysis.get("assigned_team"):
        analysis["assigned_team"] = get_first_team(category)

    # ── Step 6: Log result summary ─────────────────────────────────────────────
    logger.info(
        "Analysis complete [%s] — category: %s | priority: %s | severity: %s | confidence: %s%%",
        analysis_source.upper(),
        analysis["category"],
        analysis["priority"],
        analysis.get("severity", "?"),
        analysis.get("ai_confidence", "?"),
    )

    # Return the standardised dict (main.py expects these keys)
    return {
        "category":             analysis["category"],
        "subcategory":          analysis.get("subcategory"),
        "priority":             analysis["priority"],
        "severity":             analysis.get("severity", 5),
        "department_id":        analysis["department_id"],
        "department_name":      analysis["department_name"],
        "assigned_team":        analysis["assigned_team"],
        "title":                analysis.get("title", _generate_title(description, analysis["category"], analysis["priority"])),
        "ai_reason":            analysis.get("ai_reason", _generate_reason(analysis["category"], analysis["priority"])),
        "ai_confidence":        analysis.get("ai_confidence", 70),
        "estimated_response":   analysis["estimated_response"],
        "zone":                 analysis["zone"],
        "public_safety_impact": analysis.get("public_safety_impact", "Civic issue under evaluation"),
        "inspection_required":  analysis.get("inspection_required", 0),
        "location_risk":        analysis.get("location_risk", "Standard municipal zone"),
        "action_plan":          analysis.get("action_plan", "Standard municipal dispatch"),
    }
