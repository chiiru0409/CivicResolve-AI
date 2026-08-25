"""
llm.py — Local LLM service for CivicResolve AI.

Communicates with Ollama running locally via a plain HTTP call.
No external API. No paid service. No new Python packages required
(uses only stdlib urllib + json).

Architecture:
    complaint text
         ↓
    build_prompt()
         ↓
    call_ollama()  ──(unavailable)──→  None
         ↓
    parse_llm_response()
         ↓
    validate_llm_result()
         ↓
    structured dict  OR  None (→ agent.py falls back to rule engines)

Design rules:
- NEVER raises an exception that would crash the complaint pipeline.
- ALWAYS returns None on any failure so agent.py can use the fallback.
- Validates every field against CivicResolve's authoritative lists.
- Department routing remains authoritative (LLM cannot invent departments).
"""

from __future__ import annotations

import json
import logging
import os
import urllib.error
import urllib.request
from typing import Optional

logger = logging.getLogger(__name__)

# ── Configuration (override via environment variables) ────────────────────────
OLLAMA_BASE_URL: str = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_MODEL:    str = os.getenv("OLLAMA_MODEL",    "qwen2.5:3b")
OLLAMA_TIMEOUT:  int = int(os.getenv("OLLAMA_TIMEOUT", "30"))   # seconds

# ── Authoritative CivicResolve domain values ──────────────────────────────────
# LLM output must be validated against these — it cannot invent new values.

VALID_CATEGORIES = {
    "Roads", "Garbage", "Drainage", "Water",
    "Streetlights", "Infrastructure", "Other",
}

VALID_PRIORITIES = {"LOW", "MEDIUM", "HIGH", "CRITICAL"}

CATEGORY_SUBCATEGORIES: dict[str, list[str]] = {
    "Roads":          ["Pothole", "Road Damage", "Traffic Marking", "Footpath", "Speed Breaker", "Other"],
    "Garbage":        ["Overflowing Bin", "Uncollected Waste", "Illegal Dumping", "Public Littering", "Other"],
    "Drainage":       ["Blocked Drain", "Flooding", "Sewage Overflow", "Waterlogging", "Canal Blockage", "Other"],
    "Water":          ["Pipeline Leak", "No Water Supply", "Contaminated Water", "Low Pressure", "Burst Pipe", "Other"],
    "Streetlights":   ["Light Not Working", "Flickering Light", "Damaged Lamppost", "Dark Area at Night", "Other"],
    "Infrastructure": ["Broken Bridge", "Damaged Footpath", "Cracked Wall", "Fallen Tree", "Public Facility", "Other"],
    "Other":          ["General Civic Issue"],
}

# Authoritative category → department mapping (mirrors classifier.py)
CATEGORY_TO_DEPT: dict[str, tuple[str, str]] = {
    "Roads":          ("dept-roads",      "Municipal Roads & Infrastructure Department"),
    "Infrastructure": ("dept-infra",      "Public Works & Infrastructure Department"),
    "Garbage":        ("dept-sanitation", "Sanitation & Waste Management Department"),
    "Drainage":       ("dept-drainage",   "Drainage & Stormwater Management"),
    "Water":          ("dept-water",      "Water Supply & Distribution Department"),
    "Streetlights":   ("dept-electrical", "Electrical & Street Lighting Division"),
    "Other":          ("dept-infra",      "Public Works & Infrastructure Department"),
}

# Authoritative first teams (mirrors classifier.py get_first_team)
CATEGORY_TO_TEAM: dict[str, str] = {
    "Roads":          "Central Roads Team",
    "Infrastructure": "Civil Works Team",
    "Garbage":        "Zone 1 Sanitation Team",
    "Drainage":       "Drainage Inspection Team",
    "Water":          "Pipeline Repair Team",
    "Streetlights":   "Lighting Maintenance Team",
    "Other":          "Civil Works Team",
}

# ── System prompt ─────────────────────────────────────────────────────────────

_SYSTEM_PROMPT = """You are the CivicResolve AI Analysis Engine. You analyze citizen complaints about civic infrastructure problems in Indian cities.

Your ONLY job is to read the complaint and return a single JSON object. No other text. No markdown. No explanation. No preamble. No code blocks.

You must classify the complaint into EXACTLY ONE of these categories:
Roads, Garbage, Drainage, Water, Streetlights, Infrastructure, Other

You must assign EXACTLY ONE priority:
HIGH  — immediate safety risk, emergency, accident-prone, flooding, no supply
MEDIUM — ongoing issue affecting residents, 3+ days unresolved, multiple households
LOW   — minor inconvenience, cosmetic issue, routine maintenance needed

Severity must be an integer 1-10:
7-10 = HIGH priority issues
4-6  = MEDIUM priority issues
1-3  = LOW priority issues

Required JSON format (return ONLY this, nothing else):
{
  "category": "Roads",
  "subcategory": "Pothole",
  "priority": "HIGH",
  "severity": 8,
  "title": "Large pothole causing safety hazard near college road",
  "reason": "A large pothole on a heavily trafficked road poses immediate risk to two-wheelers and vehicles.",
  "confidence": 94
}

Rules:
- category must be one of: Roads, Garbage, Drainage, Water, Streetlights, Infrastructure, Other
- priority must be one of: LOW, MEDIUM, HIGH, CRITICAL
- severity must be 1-10 (integer)
- confidence must be 60-98 (integer)
- title must be under 80 characters
- reason must be 1-2 sentences maximum
- NEVER return markdown, code blocks, or any text outside the JSON object
- If the complaint is unclear or ambiguous, use category "Other" with LOW priority

Examples:

Complaint: "There is a huge pothole near the college road and several bikes are almost falling."
Response: {"category":"Roads","subcategory":"Pothole","priority":"HIGH","severity":8,"title":"Large pothole causing safety hazard near college road","reason":"A large pothole on a busy road poses immediate risk to vehicles, especially two-wheelers.","confidence":94}

Complaint: "Garbage has not been collected for five days near the market area. Flies and bad smell everywhere."
Response: {"category":"Garbage","subcategory":"Uncollected Waste","priority":"MEDIUM","severity":5,"title":"Garbage accumulation near market area for 5 days","reason":"Uncollected waste for 5 days near a market creates health hazards and requires immediate sanitation response.","confidence":91}

Complaint: "The drainage near our colony is completely blocked and dirty water is flooding the street."
Response: {"category":"Drainage","subcategory":"Blocked Drain","priority":"HIGH","severity":8,"title":"Blocked drainage causing street flooding in colony","reason":"Complete drainage blockage causing active flooding poses risk to residents and vehicles.","confidence":93}

Complaint: "The streetlight near the school entrance has not been working for two weeks."
Response: {"category":"Streetlights","subcategory":"Light Not Working","priority":"MEDIUM","severity":4,"title":"Streetlight failure near school entrance for two weeks","reason":"Non-functional streetlight near a school creates safety risk, especially during early morning and evening hours.","confidence":89}

Complaint: "Water is leaking continuously from a broken pipeline at the main junction."
Response: {"category":"Water","subcategory":"Pipeline Leak","priority":"HIGH","severity":7,"title":"Continuous water pipeline leak at main junction","reason":"Active pipeline leak causes water wastage, road damage, and supply disruption requiring emergency repair.","confidence":90}

Complaint: "There is a large crack in the footbridge near the bus stop. It looks dangerous."
Response: {"category":"Infrastructure","subcategory":"Broken Bridge","priority":"HIGH","severity":8,"title":"Dangerous crack in footbridge near bus stop","reason":"Structural crack in a public bridge poses immediate safety risk and requires emergency inspection.","confidence":87}

Complaint: "Something is wrong here."
Response: {"category":"Other","subcategory":"General Civic Issue","priority":"LOW","severity":2,"title":"Civic issue reported — details unclear","reason":"Complaint lacks specific details. Requires follow-up investigation to identify the exact nature of the issue.","confidence":62}

Complaint: "A large tree fell on the road last night and is blocking traffic completely."
Response: {"category":"Infrastructure","subcategory":"Fallen Tree","priority":"HIGH","severity":9,"title":"Fallen tree blocking road — emergency clearance required","reason":"Fallen tree completely blocking a road creates immediate traffic hazard and requires urgent clearance.","confidence":96}
"""

# ── Core LLM call ─────────────────────────────────────────────────────────────

def call_ollama(complaint_text: str) -> Optional[str]:
    """
    Send complaint to Ollama and return the raw response string.
    Returns None on any network/timeout/server error.
    """
    url     = f"{OLLAMA_BASE_URL}/api/generate"
    payload = json.dumps({
        "model":  OLLAMA_MODEL,
        "prompt": f"{_SYSTEM_PROMPT}\n\nComplaint: {complaint_text.strip()}\nResponse:",
        "stream": False,
        "options": {
            "temperature": 0.1,   # low temperature = deterministic, factual
            "num_predict": 250,   # enough for a JSON object, not too much
        },
    }).encode("utf-8")

    req = urllib.request.Request(
        url,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=OLLAMA_TIMEOUT) as resp:
            body = resp.read().decode("utf-8")
            data = json.loads(body)
            return data.get("response", "").strip()
    except urllib.error.URLError as e:
        logger.warning("Ollama unavailable (%s). Using rule-based fallback.", e.reason)
        return None
    except TimeoutError:
        logger.warning("Ollama request timed out after %ds. Using rule-based fallback.", OLLAMA_TIMEOUT)
        return None
    except Exception as e:
        logger.warning("Unexpected error calling Ollama: %s. Using rule-based fallback.", e)
        return None


# ── JSON extraction ───────────────────────────────────────────────────────────

def _extract_json(raw: str) -> Optional[dict]:
    """
    Extract a JSON object from raw LLM output.
    Handles common LLM formatting quirks:
    - Markdown code blocks (```json ... ```)
    - Extra text before/after the JSON
    - Trailing commas
    """
    if not raw:
        return None

    # Strip markdown code fences
    text = raw.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        text = "\n".join(
            line for line in lines
            if not line.strip().startswith("```")
        ).strip()

    # Find the JSON object boundaries
    start = text.find("{")
    end   = text.rfind("}") + 1
    if start == -1 or end == 0:
        logger.warning("No JSON object found in LLM response: %r", raw[:200])
        return None

    json_str = text[start:end]

    # Remove trailing commas before } or ] (common LLM mistake)
    import re
    json_str = re.sub(r",\s*([}\]])", r"\1", json_str)

    try:
        return json.loads(json_str)
    except json.JSONDecodeError as e:
        logger.warning("Failed to parse LLM JSON: %s — raw: %r", e, json_str[:300])
        return None


# ── Validation layer ──────────────────────────────────────────────────────────

def validate_llm_result(raw_data: dict, description: str) -> Optional[dict]:
    """
    Validate and normalise the LLM output against CivicResolve domain rules.

    Returns a validated dict matching agent.py's expected return shape,
    or None if the result is too malformed to use.

    CivicResolve deterministic rules ALWAYS override LLM suggestions for:
    - category (must be in VALID_CATEGORIES)
    - department (always derived from category — LLM cannot invent departments)
    - team (always derived from category)
    """
    if not isinstance(raw_data, dict):
        return None

    # ── Category ──────────────────────────────────────────────────────────────
    category = str(raw_data.get("category", "")).strip()
    # Try case-insensitive match
    matched_category = next(
        (c for c in VALID_CATEGORIES if c.lower() == category.lower()), None
    )
    if not matched_category:
        logger.warning("LLM returned invalid category %r — using Other", category)
        matched_category = "Other"
    category = matched_category

    # ── Priority ──────────────────────────────────────────────────────────────
    priority = str(raw_data.get("priority", "")).strip().upper()
    if priority not in VALID_PRIORITIES:
        logger.warning("LLM returned invalid priority %r — using MEDIUM", priority)
        priority = "MEDIUM"

    # ── Severity ──────────────────────────────────────────────────────────────
    try:
        severity = int(raw_data.get("severity", 5))
        severity = max(1, min(10, severity))
    except (ValueError, TypeError):
        severity = 5

    # ── Safety check: HIGH priority issues should not have low severity ────────
    if priority == "HIGH"   and severity < 6: severity = 7
    if priority == "MEDIUM" and severity < 3: severity = 4
    if priority == "LOW"    and severity > 4: severity = 3

    # ── Title ──────────────────────────────────────────────────────────────────
    title = str(raw_data.get("title", "")).strip()
    if not title or len(title) < 5:
        from agent import _generate_title  # fallback to rule-based title
        title = _generate_title(description, category, priority)
    title = title[:120]  # hard cap

    # ── Reason ────────────────────────────────────────────────────────────────
    reason = str(raw_data.get("reason", "")).strip()
    if not reason or len(reason) < 10:
        from agent import _generate_reason
        reason = _generate_reason(category, priority)

    # ── Confidence ────────────────────────────────────────────────────────────
    try:
        confidence = int(raw_data.get("confidence", 75))
        confidence = max(60, min(98, confidence))
    except (ValueError, TypeError):
        confidence = 75

    # ── Subcategory ──────────────────────────────────────────────────────────
    subcategory = str(raw_data.get("subcategory", "")).strip()
    valid_subs  = CATEGORY_SUBCATEGORIES.get(category, [])
    if subcategory not in valid_subs:
        subcategory = valid_subs[0] if valid_subs else "Other"

    # ── Department routing — DETERMINISTIC, not LLM ──────────────────────────
    dept_id, dept_name = CATEGORY_TO_DEPT.get(
        category, ("dept-infra", "Public Works & Infrastructure Department")
    )
    assigned_team = CATEGORY_TO_TEAM.get(category, "Field Team")

    return {
        "category":     category,
        "subcategory":  subcategory,
        "priority":     priority,
        "severity":     severity,
        "title":        title,
        "ai_reason":    reason,
        "ai_confidence": confidence,
        "department_id":   dept_id,
        "department_name": dept_name,
        "assigned_team":   assigned_team,
        # These are filled in by agent.py using location.py
        "estimated_response": None,
        "zone":              None,
    }


# ── Public API ────────────────────────────────────────────────────────────────

def analyze_with_llm(description: str) -> Optional[dict]:
    """
    Main entry point called by agent.py.

    Returns a validated analysis dict on success, or None if:
    - Ollama is not running
    - Model is not installed
    - LLM response is malformed
    - Any other error

    agent.py must fall back to rule engines when this returns None.
    """
    logger.info("Local LLM analysis started — model: %s", OLLAMA_MODEL)

    # 1. Call Ollama
    raw_text = call_ollama(description)
    if raw_text is None:
        return None  # Ollama unavailable — logged in call_ollama()

    logger.debug("Raw LLM response: %r", raw_text[:400])

    # 2. Extract JSON
    raw_data = _extract_json(raw_text)
    if raw_data is None:
        logger.warning("Invalid LLM JSON — using rule-based fallback.")
        return None

    # 3. Validate and normalise
    result = validate_llm_result(raw_data, description)
    if result is None:
        logger.warning("LLM result failed validation — using rule-based fallback.")
        return None

    logger.info(
        "Local LLM analysis completed — category: %s | priority: %s | confidence: %s%%",
        result["category"], result["priority"], result["ai_confidence"],
    )
    return result


def check_ollama_status() -> dict:
    """
    Health check for Ollama. Returns status info.
    Called at startup to log whether LLM is available.
    """
    try:
        req = urllib.request.Request(
            f"{OLLAMA_BASE_URL}/api/tags",
            method="GET",
        )
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            models = [m.get("name", "") for m in data.get("models", [])]
            model_installed = any(OLLAMA_MODEL in m for m in models)
            return {
                "available": True,
                "model_installed": model_installed,
                "installed_models": models,
                "configured_model": OLLAMA_MODEL,
            }
    except Exception as e:
        return {
            "available": False,
            "model_installed": False,
            "installed_models": [],
            "configured_model": OLLAMA_MODEL,
            "error": str(e),
        }


# ── Chat Support ─────────────────────────────────────────────────────────────

_CHAT_SYSTEM_PROMPT = """You are Civic AI, the intelligent, polite assistant for CivicResolve AI. You help citizens report and track municipal complaints.

Authoritative Departments in CivicResolve:
- Roads, potholes, footpaths -> Municipal Roads & Infrastructure Department
- Garbage, uncollected waste, littering -> Sanitation & Waste Management Department
- Drainage, sewer blockage, street flooding -> Drainage & Stormwater Management
- Water leaks, broken pipes, supply cuts -> Water Supply & Distribution Department
- Streetlights, dark spots, broken lamps -> Electrical & Street Lighting Division
- Bridges, walls, public buildings -> Public Works & Infrastructure Department

Rules:
1. Always be concise, helpful, and professional (2-4 sentences max).
2. If the user describes a problem, identify the civic category, state the handling department, and guide them to file a complaint.
3. NEVER invent departments or unsupported information.
4. If the user asks how to track, tell them to use their Complaint ID (format: CR-YYYY-XXXXXX) on the Track page.
5. Do not output JSON or code blocks unless asked. Speak directly in natural, friendly markdown.
"""

def chat_with_llm(user_message: str, history: list[dict]) -> Optional[str]:
    """
    Send conversation turn to Ollama.
    Returns generated text response or None on failure/timeout.
    """
    url = f"{OLLAMA_BASE_URL}/api/chat"
    
    # Format messages for Ollama /api/chat
    messages = [{"role": "system", "content": _CHAT_SYSTEM_PROMPT}]
    for h in history[-8:]:  # keep last 8 turns for context
        role = h.get("role", "user")
        content = h.get("content", "")
        if role in ("user", "assistant") and content:
            messages.append({"role": role, "content": content})
    messages.append({"role": "user", "content": user_message})

    payload = json.dumps({
        "model": OLLAMA_MODEL,
        "messages": messages,
        "stream": False,
        "options": {
            "temperature": 0.3,
            "num_predict": 300,
        },
    }).encode("utf-8")

    req = urllib.request.Request(
        url,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=12) as resp:
            body = resp.read().decode("utf-8")
            data = json.loads(body)
            return data.get("message", {}).get("content", "").strip()
    except Exception as e:
        logger.warning("Ollama chat call failed: %s. Using fallback.", e)
        return None

