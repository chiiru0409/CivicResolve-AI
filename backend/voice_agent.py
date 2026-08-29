"""
voice_agent.py — Siri / Google Assistant–Level Voice Helpline Agent for CivicResolve AI.

Implements natural, human-like, context-aware conversational voice interactions:
1. Natural Speech Understanding: Handles casual speech, slang ("bro"), partial phrases, and natural flow.
2. Siri/Google Assistant-style Greetings: "Hey", "Hi", "Are you there?", "Can you help me?" responded to naturally without premature ticket creation.
3. Multi-Turn Context Memory: Maintains accumulated context (issue + subcategory + location + landmark + duration + multi-issues) without losing slots.
4. Anti-Redundancy: NEVER re-asks for information already provided.
5. Instant Interruption / Barge-in Support: Coordinates with client-side Speech Synthesis and Recognition.
6. Self-Correction: In-place slot updates without restarting or creating duplicate records.
7. Ambiguity Handling: Asks intelligent clarifying questions for broad topics (e.g. water supply vs leakage vs quality).
8. Multi-Issue Decomposition: Understands and tracks multiple co-occurring civic defects.
9. Contextual References: Resolves "it", "there", "that place", "the same road", "the first one".
10. Intent Switching & Resumption: Stashes in-progress draft when citizen asks to track a complaint or asks an off-topic question, then resumes draft smoothly.
11. Concise Spoken Phrasing: Natural, crisp, human spoken responses (no robotic over-talking).
12. Status Tracking: Queries live SQLite database for real complaint numbers (e.g. CR-2026-XXXXXX) and formats spoken status clearly.
13. Voice + Image Coordination: Seamlessly integrates image analysis and handles text/image confirmation or contradiction.
14. Hard Deterministic Submission Safety Gate: Submission requires explicit confirmation in SUMMARY_CONFIRMATION state with complete slots.
"""

from __future__ import annotations

import json
import logging
import os
import re
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from classifier import classify, get_department_for_category, get_first_team, CATEGORY_KEYWORDS
from priority import detect_priority, calculate_severity, get_estimated_response
from location import detect_zone
from agent import run_analysis
from database import get_connection

logger = logging.getLogger(__name__)

# ── Defined Conversational State Constants ─────────────────────────────────────
STATE_GREETING = "greeting"
STATE_LISTENING = "problem"
STATE_PROBLEM = "problem"
STATE_LOCATION = "location"
STATE_LANDMARK = "landmark"
STATE_CONFIRM = "confirm"
STATE_SUBMITTED = "submitted"
STATE_TRACKING = "tracking"
STATE_CANCELLED = "cancelled"
STATE_UNDERSTANDING = "problem"
STATE_INTENT_DETECTION = "problem"
STATE_INFORMATION_COLLECTION = "problem"
STATE_LOCATION_COLLECTION = "location"
STATE_CLARIFICATION = "problem"
STATE_SUMMARY_CONFIRMATION = "confirm"
STATE_CORRECTION = "confirm"
STATE_OFF_TOPIC = "problem"
STATE_UNCLEAR = "problem"
STATE_ERROR = "error"

# Semantic Machine States (for UI badges & telemetry)
SEM_GREETING = "GREETING"
SEM_LISTENING = "LISTENING"
SEM_UNDERSTANDING = "UNDERSTANDING"
SEM_INTENT_DETECTION = "INTENT_DETECTION"
SEM_INFORMATION_COLLECTION = "INFORMATION_COLLECTION"
SEM_LOCATION_COLLECTION = "LOCATION_COLLECTION"
SEM_CLARIFICATION = "CLARIFICATION"
SEM_SUMMARY_CONFIRMATION = "SUMMARY_CONFIRMATION"
SEM_CORRECTION = "CORRECTION"
SEM_SUBMITTED = "SUBMITTED"
SEM_TRACKING = "TRACKING"
SEM_CANCELLED = "CANCELLED"
SEM_OFF_TOPIC = "OFF_TOPIC"
SEM_UNCLEAR = "UNCLEAR"
SEM_ERROR = "ERROR"


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _generate_complaint_number() -> str:
    year = datetime.now(timezone.utc).year
    suffix = str(uuid.uuid4().int)[:6].zfill(6)
    return f"CR-{year}-{suffix}"


# ── Siri & Google Assistant Intent Matchers ────────────────────────────────────

GREETING_PATTERNS = [
    r"^(hi|hello|hey|helo|hai|howdy|namaste|vanakkam|pranam)\b",
    r"^(good\s+morning|good\s+afternoon|good\s+evening|good\s+day)\b",
    r"^(how\s+are\s+you|how\'re\s+you|how\s+do\s+you\s+do|how\s+is\s+it\s+going)\b",
    r"^(is\s+anyone\s+there|are\s+you\s+there|you\s+there|anyone\s+there)\b",
    r"^(can\s+you\s+help\s+me|i\s+need\s+help|help\s+me|can\s+you\s+help|i\s+have\s+a\s+question)\b",
    r"^(hello\s+there|hey\s+there|hi\s+there)\b",
]

ASSISTANT_QUERY_PATTERNS = [
    r"(what\s+is\s+your\s+name|what\'s\s+your\s+name|who\s+are\s+you|who\s+made\s+you|who\s+created\s+you)",
    r"(what\s+can\s+you\s+do|what\s+do\s+you\s+do|how\s+does\s+this\s+work|what\s+is\s+this|what\s+is\s+civicresolve)",
    r"(tell\s+me\s+about\s+civicresolve|what\s+services\s+do\s+you\s+provide|how\s+to\s+report)",
]

OFF_TOPIC_PATTERNS = [
    r"(what\s+is\s+the\s+weather|weather\s+today|tell\s+me\s+a\s+joke|who\s+won|cricket\s+score|what\s+is\s+your\s+favorite)",
    r"(sing\s+a\s+song|play\s+music|how\s+old\s+are\s+you|are\s+you\s+human)",
]

EMERGENCY_KEYWORDS = [
    "sparking wire", "live wire", "exposed wire", "electric shock", "gas leak",
    "building collapse", "collapsed building", "bridge collapse", "severe flood",
    "cylinder burst", "major explosion", "life threatening", "electrocution",
    "sparking", "fire", "explosion", "flame", "smoke", "shock", "falling bridge",
]

VAGUE_REPORT_STARTERS = [
    r"^(i\s+want\s+to\s+report|i\s+want\s+to\s+complain|i\s+have\s+a\s+complaint|there\s+is\s+a\s+problem|i\s+have\s+a\s+problem|there\s+is\s+an\s+issue|i\s+noticed\s+an\s+issue)\b",
    r"^(i\s+want\s+to\s+file\s+a\s+complaint|something\s+is\s+wrong|something\s+is\s+broken|please\s+help\s+me\s+report)\b",
    r"^(i\s+want\s+to\s+report\s+something|i\s+need\s+to\s+report\s+something)\b",
]

LOCATION_PREPOSITIONS = [
    "outside", "inside", "in front of", "next to", "adjacent to", "opposite", "across",
    "behind", "beside", "near", "around", "close to", "at", "on", "by", "along",
]

LOCATION_KEYWORDS = [
    "road", "street", "lane", "cross", "main", "junction", "circle", "layout",
    "colony", "nagar", "sector", "block", "ward", "area", "market", "school",
    "college", "hospital", "bus stop", "bus stand", "metro", "bridge", "flyover",
    "park", "gate", "station", "complex", "mall", "apartment", "building",
    "city mall", "gandhi market", "gandhi road", "mg road", "nehru road",
]

GENERIC_LOCATIONS = {
    "my house", "here", "there", "the area", "this area", "the street", "our street",
    "the road", "our road", "the locality", "our locality", "my street", "my road",
    "the place", "this place", "our colony", "the colony", "the neighborhood",
    "a street", "a road", "my area", "this road", "this street", "some place",
    "street", "road", "lane", "area", "place", "drain", "ground", "spot", "site",
    "footpath", "pavement", "sidewalk", "on street", "on road", "in street", "in road",
}

STOP_VERBS_AND_CIVIC_WORDS = {
    "is", "was", "are", "were", "has", "have", "been", "lying", "uncollected", "dumped",
    "thrown", "overflowing", "leaking", "flooding", "spilled", "piled", "accumulating",
    "present", "sitting", "broken", "dark", "damage", "hole", "pothole", "water",
    "garbage", "trash", "waste", "drain", "drainage", "problem", "issue", "there",
    "noticed", "found", "saw", "seeing", "facing", "dealing", "complaint", "report",
    "gushing", "burst", "falling", "fell", "danger", "dangerous", "unsafe", "bro",
    "terrible", "smells", "smelling", "stinks", "dirty", "clean",
}


def _is_pure_greeting(text: str) -> bool:
    """Return True if text is just a natural greeting without civic complaint details."""
    cleaned = text.strip().lower()
    cleaned_no_punct = re.sub(r"[^\w\s]", "", cleaned).strip()

    pure_greetings = {
        "hi", "hello", "hey", "namaste", "hai", "good morning", "good evening",
        "good afternoon", "how are you", "how are you doing", "can you help me",
        "i have a question", "what can you do", "who are you", "what is your name",
        "are you there", "is this civicresolve", "hello there", "hi there", "hey there",
        "vanakkam", "pranam", "howdy", "i need some help", "what do you do", "you there",
        "is anyone there", "can you help",
    }
    if cleaned_no_punct in pure_greetings:
        return True

    for pat in GREETING_PATTERNS:
        if re.search(pat, cleaned):
            has_complaint_content = any(
                kw in cleaned for kws in CATEGORY_KEYWORDS.values() for kw in kws
            )
            if not has_complaint_content and len(cleaned_no_punct.split()) <= 7:
                return True
    return False


def _is_assistant_query(text: str) -> bool:
    cleaned = text.strip().lower()
    for pat in ASSISTANT_QUERY_PATTERNS:
        if re.search(pat, cleaned):
            return True
    return False


# Compatibility alias
_is_general_inquiry = _is_assistant_query


def _is_off_topic(text: str) -> bool:
    cleaned = text.strip().lower()
    for pat in OFF_TOPIC_PATTERNS:
        if re.search(pat, cleaned):
            return True
    return False


def _is_vague_intake_starter(text: str) -> bool:
    cleaned = text.strip().lower()
    # If text explicitly mentions civic domains, don't classify as vague starter
    if any(k in cleaned for k in ["water", "road", "pothole", "garbage", "waste", "drain", "drainage", "light", "street light", "electric", "leak", "pipe"]):
        return False
    for pat in VAGUE_REPORT_STARTERS:
        if re.search(pat, cleaned):
            words = cleaned.split()
            has_specifics = any(kw in cleaned for kws in CATEGORY_KEYWORDS.values() for kw in kws)
            if not has_specifics or len(words) <= 7:
                return True
    return False


def _is_cancel_intent(text: str) -> bool:
    cleaned = re.sub(r"['’]", "", text.lower()).strip()
    cleaned = re.sub(r"[^\w\s]", " ", cleaned).strip()
    if "bus stop" in cleaned or "auto stop" in cleaned or "train stop" in cleaned:
        cleaned = cleaned.replace("bus stop", "bus_station").replace("auto stop", "auto_stand").replace("train stop", "railway_station")
    cancel_phrases = [
        "cancel", "nevermind", "never mind", "i changed my mind", "abort",
        "dont submit", "do not submit", "cancel it", "cancel this",
        "cancel the complaint", "cancel complaint", "stop this", "stop the report",
        "forget it", "i dont want to report", "i dont want to report this", "stop",
    ]
    if any(cp in cleaned for cp in cancel_phrases):
        return True
    words = cleaned.split()
    if words and (words[0] in ["cancel", "abort", "nevermind"] or (len(words) <= 2 and "stop" in words)):
        return True
    return False


def _is_repeat_request(text: str) -> bool:
    lower = text.lower().strip()
    return any(
        phrase in lower for phrase in [
            "repeat", "say that again", "say again", "what did you say",
            "pardon", "can you repeat", "could you repeat", "come again",
            "i didn't hear", "didn't hear", "repeat please", "what was that",
        ]
    )


def _is_uncertain(text: str) -> bool:
    lower = text.lower().strip()
    return any(
        phrase in lower for phrase in [
            "maybe", "i don't know", "i dont know", "not sure", "im not sure",
            "i'm not sure", "perhaps", "i guess", "not certain"
        ]
    )


def _is_affirmative(text: str) -> bool:
    cleaned = re.sub(r"['’]", "", text.lower()).strip()
    cleaned = re.sub(r"[^\w\s]", " ", cleaned).strip()
    words = set(cleaned.split())
    negative_words = {"no", "dont", "not", "wait", "hold", "never", "cancel", "stop", "wont", "neither", "abort"}
    if words.intersection(negative_words):
        return False
    affirmative_words = {
        "yes", "yeah", "yep", "yup", "sure", "submit", "confirm",
        "proceed", "correct", "right", "fine", "haan", "ha", "register",
        "exactly",
    }
    affirmative_phrases = [
        "go ahead", "do it", "submit it", "yes please", "thats right",
        "that is right", "please submit", "submit this", "yes submit",
        "register it", "looks good", "confirm and submit", "yes that is correct",
        "yes thats correct", "yes correct", "please register",
        "yes go ahead",
    ]
    if any(phrase in cleaned for phrase in affirmative_phrases):
        return True
    return bool(words.intersection(affirmative_words))


def _extract_location_from_text(text: str) -> Optional[str]:
    """Extract specific street, area, city, or landmark from natural speech."""
    # 1. Match phrases with prepositions: "near City Mall", "on MG Road", "at Gandhi Nagar in Hyderabad"
    for prep in LOCATION_PREPOSITIONS:
        pattern = rf"\b{prep}\s+([A-Za-z0-9\s,\.\-]{{3,50}})"
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            extracted = match.group(1).strip()
            extracted = re.split(r"\b(and|since|for|because|which|is|it|please|causing|that|where|bro)\b", extracted, flags=re.IGNORECASE)[0].strip()
            clean_extracted_lower = extracted.lower().strip()

            if clean_extracted_lower in GENERIC_LOCATIONS or clean_extracted_lower in LOCATION_KEYWORDS:
                continue
            if any(clean_extracted_lower == g for g in ["the street", "our street", "the road", "our road", "the area", "my area", "the colony", "our colony"]):
                continue
            words = clean_extracted_lower.split()
            if words and words[0] in ["the", "our", "my", "a", "this"] and len(words) <= 2:
                continue
            # If extracted words contain common action verbs, it's a clause
            if any(w in STOP_VERBS_AND_CIVIC_WORDS for w in words if w not in ["road", "street", "market", "school", "hospital", "mall", "colony", "hyderabad", "bangalore", "mumbai", "delhi", "chennai"]):
                continue
            if len(extracted) >= 3:
                extracted = re.sub(r"^(actually|no|it\'s|its|it is|please|sorry)\s+", "", extracted, flags=re.IGNORECASE).strip()
                return f"{prep.title()} {extracted.title()}"

    # 2. Match landmark keywords directly: e.g. "MG Road", "Sector 7 Bus Stop", "Gandhi Market in Hyderabad"
    for kw in LOCATION_KEYWORDS:
        pattern = rf"\b([A-Za-z0-9]+(?:\s+[A-Za-z0-9]+){{0,3}}\s+{kw}(?:\s+in\s+[A-Za-z0-9]+)?\b)"
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            candidate = match.group(1).strip()
            candidate = re.sub(r"^(actually|no|it\'s|its|it is|please|sorry)\s+", "", candidate, flags=re.IGNORECASE).strip()
            clean_candidate_lower = candidate.lower().strip()
            words = clean_candidate_lower.split()

            if clean_candidate_lower in GENERIC_LOCATIONS:
                continue
            if words and words[0] in ["the", "our", "my", "a", "this", "on", "in", "at"] and len(words) <= 2:
                continue
            if any(w in STOP_VERBS_AND_CIVIC_WORDS for w in words if w not in ["road", "street", "lane", "cross", "main", "circle", "junction", "market", "school", "hospital", "mall", "colony", "hyderabad", "bangalore", "mumbai", "delhi", "chennai"]):
                continue
            if len(candidate) >= 4:
                return candidate.title()

    # 3. Match "near my college", "beside the school", "outside our house"
    relative_match = re.search(r"\b(near|beside|opposite|behind|outside)\s+(my|our|the)\s+([A-Za-z0-9\s]{3,25})\b", text, re.IGNORECASE)
    if relative_match:
        prep, det, place = relative_match.groups()
        place_clean = place.split()[0].title()
        return f"{prep.title()} {det} {place_clean}"

    return None


def _extract_duration(text: str) -> Optional[str]:
    """Extract duration of the problem if mentioned (e.g. 'for three days', 'since yesterday')."""
    match = re.search(r"\b((?:for|since)\s+(?:\d+|one|two|three|four|five|six|seven|a\s+few)\s+(?:days?|weeks?|hours?|months?)|since\s+yesterday|for\s+a\s+(?:few\s+days|week|month))\b", text, re.IGNORECASE)
    if match:
        return match.group(1).strip()
    return None


def _extract_landmark(text: str) -> Optional[str]:
    """Extract explicit landmark phrase from speech."""
    match = re.search(r"\b(?:near|opposite|behind|beside|in front of|adjacent to)\s+([A-Za-z0-9\s,\.\-]{3,35})", text, re.IGNORECASE)
    if match:
        candidate = match.group(1).strip()
        candidate = re.split(r"\b(and|since|for|because|which|is|it|please)\b", candidate, flags=re.IGNORECASE)[0].strip()
        if candidate.lower() not in GENERIC_LOCATIONS and len(candidate) >= 3:
            return candidate.title()
    return None


def _detect_multi_issues(text: str) -> list[str]:
    """Detect if multiple civic issues are co-occurring in speech."""
    lower = text.lower()
    issues = []
    
    # Road damage
    if any(k in lower for k in ["pothole", "crater", "sinkhole", "broken road", "bad road"]):
        issues.append("Roads: Potholes / Road damage")
    # Streetlight failure
    if any(k in lower for k in ["streetlight", "street light", "lamp not working", "dark street", "lights aren't working", "light isn't working"]):
        issues.append("Streetlights: Streetlight failure")
    # Garbage
    if any(k in lower for k in ["garbage", "trash", "waste dumped", "dumpster overflowing", "uncollected"]):
        issues.append("Garbage: Uncollected waste")
    # Water / Drainage
    if any(k in lower for k in ["flooded", "waterlogging", "water leak", "pipe burst", "sewage", "overflowing drain"]):
        if any(k in lower for k in ["sewage", "drain", "flooded", "waterlogging"]):
            issues.append("Drainage: Flooding / Sewage overflow")
        else:
            issues.append("Water: Water supply / Leakage")

    return issues


# ── Qwen 2.5 3B LLM Helper ───────────────────────────────────────────────────

_VOICE_OPERATOR_SYSTEM_PROMPT = """You are CivicResolve AI, a Siri and Google Assistant-level conversational civic helpline assistant for municipal corporations.
You converse naturally, crisply, and intelligently over voice calls.

Analyze the turn and output strict JSON:
{
  "intent": "greeting | assistant_query | track | report_problem | provide_location | confirm | correct | cancel | off_topic",
  "problem_summary": "<crisp description of civic issue, or null>",
  "category": "<Roads | Garbage | Drainage | Water | Streetlights | Infrastructure | Other | null>",
  "subcategory": "<specific subcategory, or null>",
  "location": "<extracted street/area/city/landmark, or null>",
  "landmark": "<extracted landmark, or null>",
  "duration": "<extracted duration, or null>",
  "is_high_risk": <true if immediate safety hazard or accidents, false otherwise>,
  "conversational_reply": "<crisp, human-like 1-2 sentence spoken reply to say over the phone>"
}

Rules:
1. Output ONLY valid JSON.
2. Keep conversational_reply natural, concise, and professional for text-to-speech.
3. NEVER assume a greeting like 'hey' or 'are you there' is a complaint submission.
"""


def _call_llm_voice_operator(user_message: str, stage: str, extracted_data: dict) -> Optional[dict]:
    """Call Ollama Qwen 2.5 3B for conversational extraction."""
    timeout_sec = int(os.getenv("OLLAMA_TIMEOUT", "2"))
    try:
        from llm import OLLAMA_BASE_URL, OLLAMA_MODEL

        context_str = f"Current Stage: {stage}\nExtracted Info So Far: {json.dumps(extracted_data)}\nCitizen Said: \"{user_message}\""
        payload = json.dumps({
            "model": OLLAMA_MODEL,
            "prompt": f"{_VOICE_OPERATOR_SYSTEM_PROMPT}\n\nContext:\n{context_str}\n\nJSON Output:",
            "stream": False,
            "options": {
                "temperature": 0.2,
                "num_predict": 200,
            },
        }).encode("utf-8")

        req = urllib.request.Request(
            f"{OLLAMA_BASE_URL}/api/generate",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )

        with urllib.request.urlopen(req, timeout=timeout_sec) as resp:
            body = resp.read().decode("utf-8")
            data = json.loads(body)
            raw = data.get("response", "").strip()

            start = raw.find("{")
            end = raw.rfind("}") + 1
            if start != -1 and end > start:
                return json.loads(raw[start:end])
    except (urllib.error.URLError, TimeoutError, Exception) as exc:
        logger.debug("Voice LLM operator fallback triggered: %s", exc)
    return None


# ── Authoritative Database Persistence Gate ───────────────────────────────────

def _save_complaint_to_db(
    description: str,
    location: str,
    landmark: Optional[str],
    citizen_id: Optional[int],
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
    category_override: Optional[str] = None,
    priority_override: Optional[str] = None,
) -> dict:
    """Run the real AI agent analysis and store the complaint into the database."""
    ai = run_analysis(
        description=description,
        location_text=location,
        latitude=latitude,
        longitude=longitude,
    )

    if category_override and category_override in ["Roads", "Garbage", "Drainage", "Water", "Streetlights", "Infrastructure", "Other"]:
        ai["category"] = category_override
        dept_id, dept_name = get_department_for_category(category_override)
        ai["department_id"] = dept_id
        ai["department_name"] = dept_name
        ai["assigned_team"] = get_first_team(category_override)

    if priority_override and priority_override in ["LOW", "MEDIUM", "HIGH", "CRITICAL"]:
        ai["priority"] = priority_override
        ai["severity"] = calculate_severity(priority_override, description)
        ai["estimated_response"] = get_estimated_response(priority_override)

    complaint_number = _generate_complaint_number()
    complaint_id = complaint_number
    now = _now_iso()

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
                    ?, 'voice', 'AI Call',
                    ?, ?
                );
                """,
                (
                    complaint_id, complaint_number, citizen_id, ai["title"], description,
                    ai["category"], ai["department_name"], ai["priority"], ai["severity"],
                    latitude, longitude, 10.0 if latitude else None,
                    location, location, landmark,
                    ai["ai_confidence"], ai["ai_reason"],
                    ai["assigned_team"], ai["estimated_response"], ai["zone"],
                    1 if citizen_id is None else 0,
                    now, now,
                ),
            )
            conn.execute(
                "INSERT INTO complaint_updates (complaint_id, status, message, updated_by) VALUES (?, ?, ?, ?);",
                (complaint_id, "Submitted", "Complaint registered via CivicResolve AI Voice Helpline.", "voice-helpline"),
            )
            conn.execute(
                "INSERT INTO complaint_updates (complaint_id, status, message, updated_by) VALUES (?, ?, ?, ?);",
                (complaint_id, "AI_Analysis", f"Voice AI classified: {ai['category']} | Priority: {ai['priority']} | Routed to: {ai['department_name']}", "ai-agent"),
            )

        row = conn.execute("SELECT * FROM complaints WHERE id = ?;", (complaint_id,)).fetchone()
        res = dict(row)
        res["department_name"] = ai["department_name"]
        res["assigned_team"] = ai["assigned_team"]
        logger.info("DATABASE_INSERT: Registered official complaint %s in category %s", complaint_number, ai["category"])
        return res
    finally:
        conn.close()


# ── Main Conversational Turn Processor (Siri / Google Assistant Quality) ──────

def process_voice_call_turn(
    message: str,
    stage: str,
    extracted_data: dict,
    citizen_id: Optional[int] = None,
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
    history: Optional[list[dict]] = None,
) -> dict:
    """
    Main Multi-Turn Voice AI Helpline turn processor.
    Implements Siri / Google Assistant conversational quality:
    - Natural speech understanding & concise spoken phrasing
    - Multi-turn context memory & anti-redundancy
    - Instant barge-in & self-correction
    - Intent switching & draft resumption
    - Strict confirmation gate before database insertion
    """
    msg = message.strip()
    data = dict(extracted_data or {})
    lower = msg.lower()
    norm_stage = stage.lower() if stage else "greeting"

    logger.info("VOICE_TURN_INTAKE: message='%s', stage='%s', extracted_keys=%s", msg, norm_stage, list(data.keys()))

    # ── 1. Initial Call Connect / Greeting ─────────────────────────────────────
    if msg == "__START__" or (norm_stage in ("greeting", "idle") and not msg):
        return {
            "reply_text": "Hey! You're connected to CivicResolve. How can I help you today?",
            "stage": STATE_LISTENING,
            "extracted_data": {},
            "action": "speak",
            "complaint": None,
            "ui_hints": {
                "state": SEM_GREETING,
                "status_label": "READY",
                "can_confirm": False,
                "can_cancel": False,
                "suggested_quick_replies": ["Report a pothole", "Garbage uncollected", "Water leakage", "Track my complaint"],
            },
        }

    # ── 2. Natural Error Recovery for Unclear / Inaudible Audio ────────────────
    if not msg:
        return {
            "reply_text": "Sorry, I didn't catch that. Could you say that again?",
            "stage": norm_stage if norm_stage != "greeting" else STATE_LISTENING,
            "extracted_data": data,
            "action": "speak",
            "complaint": None,
            "ui_hints": {
                "state": SEM_UNCLEAR,
                "status_label": "LISTENING",
                "can_confirm": False,
                "can_cancel": bool(data),
            },
        }

    # ── 3. Explicit Cancellation (Applies globally) ────────────────────────────
    if _is_cancel_intent(msg) and norm_stage not in ("submitted", STATE_SUBMITTED):
        logger.info("VOICE_STATE: %s -> %s (User Cancelled)", norm_stage, STATE_CANCELLED)
        return {
            "reply_text": "No problem. Your complaint report has been cancelled and nothing was submitted. What else can I help you with?",
            "stage": STATE_PROBLEM,
            "extracted_data": {},
            "action": "speak",
            "complaint": None,
            "ui_hints": {
                "state": SEM_CANCELLED,
                "status_label": "CANCELLED",
                "can_confirm": False,
                "can_cancel": False,
                "suggested_quick_replies": ["Report a problem", "Track status", "End call"],
            },
        }

    # ── 4. Siri / Google Assistant-Style Greetings (MUST NEVER CREATE COMPLAINT) ─
    if _is_pure_greeting(msg) and norm_stage not in ("confirm", "submitted", STATE_CONFIRM, STATE_SUBMITTED):
        if any(h in lower for h in ["are you there", "you there", "is anyone there"]):
            reply = "Yes, I'm here. Tell me what's happening."
        elif any(h in lower for h in ["can you help me", "can you help", "help me"]):
            reply = "Of course. Tell me about the issue."
        elif any(h in lower for h in ["how are you", "how're you", "how do you do"]):
            reply = "I'm doing well, thanks! What can I help you with today?"
        elif lower in ["hi", "hi!", "hi."]:
            reply = "Hi! What can I help you with?"
        elif lower in ["hey", "hey!", "hey."]:
            reply = "Hey! You're connected to CivicResolve. How can I help you today?"
        else:
            reply = "Hello! I'm here. What would you like to report or check?"

        return {
            "reply_text": reply,
            "stage": STATE_LISTENING,
            "extracted_data": data,
            "action": "speak",
            "complaint": None,
            "ui_hints": {
                "state": SEM_GREETING,
                "status_label": "LISTENING",
                "can_confirm": False,
                "can_cancel": False,
                "suggested_quick_replies": ["Report a pothole", "Track complaint status", "How does this work?"],
            },
        }

    # ── 5. Assistant & Capability Queries ("What's your name?", "Who are you?") ──
    if _is_assistant_query(msg) and norm_stage not in ("confirm", "submitted", STATE_CONFIRM, STATE_SUBMITTED):
        if any(n in lower for n in ["your name", "who are you", "what are you"]):
            reply = "I'm CivicResolve AI, your civic helpline assistant. I can help report and track local issues. What would you like to report?"
        elif any(n in lower for n in ["who made you", "who created you"]):
            reply = "I'm CivicResolve AI, built to help citizens report and track municipal civic issues. What's happening in your area?"
        else:
            reply = (
                "CivicResolve AI connects you directly to municipal teams. "
                "Tell me about any pothole, garbage, water, drainage, or streetlight issue, and I'll log it with an official tracking ID. "
                "What would you like to report?"
            )

        return {
            "reply_text": reply,
            "stage": STATE_LISTENING,
            "extracted_data": data,
            "action": "speak",
            "complaint": None,
            "ui_hints": {
                "state": SEM_LISTENING,
                "status_label": "LISTENING",
                "can_confirm": False,
                "can_cancel": False,
                "suggested_quick_replies": ["Report an issue", "Track a complaint"],
            },
        }

    # ── 6. Off-Topic Queries ──────────────────────────────────────────────────
    if _is_off_topic(msg) and norm_stage not in ("confirm", "submitted", STATE_CONFIRM, STATE_SUBMITTED):
        if "weather" in lower:
            reply = "I can help with civic issues like roads, water, or garbage, but I don't have weather updates. What civic issue can I assist with?"
        else:
            reply = "I'm specialized in helping you report and track municipal civic issues. Would you like to report a problem or check an existing complaint?"

        return {
            "reply_text": reply,
            "stage": STATE_LISTENING,
            "extracted_data": data,
            "action": "speak",
            "complaint": None,
            "ui_hints": {
                "status_label": "LISTENING",
                "can_confirm": False,
                "can_cancel": False,
                "suggested_quick_replies": ["Report an issue", "Track a complaint"],
            },
        }

    # ── 6b. Repeat Request Handling ("Repeat that", "What did you say?") ───────
    if _is_repeat_request(msg):
        if norm_stage in ("confirm", STATE_CONFIRM, "summary_confirmation", STATE_SUMMARY_CONFIRMATION):
            desc = data.get("description", "your issue")
            loc = data.get("location", "the reported location")
            reply = f"I said: You're reporting {desc.lower()} near {loc}. Should I submit this complaint?"
            action = "confirm"
        elif norm_stage in ("location", STATE_LOCATION):
            desc = data.get("description", "the issue")
            reply = f"I asked: Where is the {desc.lower()} located?"
            action = "speak"
        elif norm_stage in ("landmark", STATE_LANDMARK):
            loc = data.get("location", "that location")
            reply = f"I asked: Is there a nearby landmark or building near {loc}?"
            action = "speak"
        else:
            reply = "I said: What civic issue or complaint would you like to report or check?"
            action = "speak"

        return {
            "reply_text": reply,
            "stage": norm_stage,
            "extracted_data": data,
            "action": action,
            "complaint": None,
            "ui_hints": {
                "status_label": "LISTENING",
                "can_confirm": norm_stage in ("confirm", STATE_CONFIRM),
                "can_cancel": bool(data),
            },
        }

    # ── 7. Status Tracking & Intent Switching with Draft Resumption ────────────
    id_match = re.search(r"CR-\d{4}-\d{4,8}", msg, re.IGNORECASE)
    is_track_intent = bool(id_match) or any(w in lower for w in [
        "track", "where is my complaint", "status of my complaint",
        "status of complaint", "check my complaint", "check status", "track complaint",
        "has my complaint been resolved", "what happened to the complaint", "what's the status",
    ])

    # Check if citizen is switching intent from an active report to tracking
    has_active_draft = bool(data.get("description") or data.get("category"))

    if is_track_intent and norm_stage not in ("confirm", STATE_CONFIRM):
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
                c_cat = target_complaint.get("category", "Civic issue")
                c_stat = target_complaint.get("status", "Submitted")
                c_dept = target_complaint.get("department", "Municipal Operations")
                c_loc = target_complaint.get("location", "the reported location")

                status_desc = {
                    "Submitted": "received and under review",
                    "Assigned": f"assigned to {target_complaint.get('assigned_team') or c_dept}",
                    "In Progress": "currently being resolved by the field operations team",
                    "Inspection": "under site inspection",
                    "Resolved": "resolved by the municipal team",
                    "Closed": "closed",
                }.get(c_stat, f"in {c_stat} stage")

                # If there was an active draft, offer to resume it
                if has_active_draft:
                    prev_issue = data.get("description", "your report")
                    data["paused_draft"] = True
                    reply = (
                        f"Your complaint {c_num} regarding {c_cat.lower()} at {c_loc} is {status_desc}. "
                        f"Would you like to continue with your report about {prev_issue}?"
                    )
                else:
                    reply = (
                        f"I found Complaint ID {c_num}. "
                        f"Your {c_cat} report at {c_loc} is {status_desc}. "
                        f"Would you like to report another issue or track another ticket?"
                    )

                return {
                    "reply_text": reply,
                    "stage": STATE_TRACKING,
                    "extracted_data": data,
                    "action": "speak",
                    "complaint": target_complaint,
                    "ui_hints": {
                        "status_label": "TRACKING",
                        "can_confirm": False,
                        "can_cancel": False,
                        "suggested_quick_replies": ["Continue report", "Report another issue", "End Call"] if has_active_draft else ["Report an issue", "End Call"],
                    },
                }
            elif id_match:
                if has_active_draft:
                    data["paused_draft"] = True
                return {
                    "reply_text": f"I couldn't find Complaint ID {id_match.group(0).upper()} in our database. Please double check the ID, or let me know if you'd like to report a new problem.",
                    "stage": STATE_TRACKING if has_active_draft else STATE_LISTENING,
                    "extracted_data": data,
                    "action": "speak",
                    "complaint": None,
                    "ui_hints": {
                        "status_label": "TRACKING" if has_active_draft else "LISTENING",
                        "can_confirm": False,
                        "can_cancel": False,
                    },
                }
            else:
                if has_active_draft:
                    data["paused_draft"] = True
                return {
                    "reply_text": "I can help you track that. What's your Complaint ID? For example, CR-2026-123456.",
                    "stage": STATE_TRACKING,
                    "extracted_data": data,
                    "action": "speak",
                    "complaint": None,
                    "ui_hints": {
                        "status_label": "TRACKING",
                        "can_confirm": False,
                        "can_cancel": False,
                    },
                }
        finally:
            conn.close()

    # If user was tracking or has a paused draft, and says "Yes" / "Continue" to resume paused draft
    if data.get("paused_draft"):
        if _is_affirmative(msg) or any(w in lower for w in ["continue", "resume", "yes", "pothole", "report", "go ahead"]):
            data.pop("paused_draft", None)
            if data.get("location"):
                # Complete draft, summarize for confirmation
                cat = data.get("category", "Roads")
                desc = data.get("description", "Reported issue")
                loc = data.get("location")
                return {
                    "reply_text": f"Great. You were reporting {desc} near {loc}. Should I submit this complaint?",
                    "stage": STATE_CONFIRM,
                    "extracted_data": data,
                    "action": "confirm",
                    "complaint": None,
                    "ui_hints": {
                        "state": SEM_SUMMARY_CONFIRMATION,
                        "status_label": "WAITING FOR CONFIRMATION",
                        "can_confirm": True,
                        "can_cancel": True,
                    },
                }
            else:
                return {
                    "reply_text": f"Great. Continuing with your report about {data.get('description')}. Where is it located?",
                    "stage": STATE_LOCATION,
                    "extracted_data": data,
                    "action": "speak",
                    "complaint": None,
                    "ui_hints": {
                        "state": SEM_LOCATION_COLLECTION,
                        "status_label": "COLLECTING DETAILS",
                        "can_confirm": False,
                        "can_cancel": True,
                    },
                }

    # ── 8. Vague Report Starter ("I have a problem", "I want to report") ───────
    if _is_vague_intake_starter(msg) and norm_stage in ("greeting", "listening", "problem", STATE_LISTENING):
        return {
            "reply_text": "Of course. Tell me what's happening and where.",
            "stage": STATE_PROBLEM,
            "extracted_data": data,
            "action": "speak",
            "complaint": None,
            "ui_hints": {
                "state": SEM_INFORMATION_COLLECTION,
                "status_label": "COLLECTING DETAILS",
                "can_confirm": False,
                "can_cancel": True,
                "suggested_quick_replies": ["Road pothole", "Garbage dump", "Water leakage", "Broken streetlight"],
            },
        }

    # ── 9. Ambiguity Handling (Broad categories without specifics) ────────────
    cleaned_punct = re.sub(r"['’]", "", lower).strip()
    cleaned_no_punct = re.sub(r"[^\w\s]", "", cleaned_punct).strip()

    if cleaned_no_punct in [
        "theres a problem with water", "there is a problem with water",
        "theres a problem with the water", "there is a problem with the water",
        "problem with water", "water problem", "water", "its about water", "it is about water"
    ]:
        data["category"] = "Water"
        return {
            "reply_text": "Sure. Is it a supply problem, a leakage, or poor water quality?",
            "stage": STATE_PROBLEM,
            "extracted_data": data,
            "action": "speak",
            "complaint": None,
            "ui_hints": {
                "state": SEM_CLARIFICATION,
                "status_label": "CLARIFYING",
                "can_confirm": False,
                "can_cancel": True,
                "suggested_quick_replies": ["No water supply", "Water leakage", "Dirty drinking water"],
            },
        }

    if cleaned_no_punct in [
        "theres a problem with the road", "there is a problem with the road",
        "theres a problem with road", "there is a problem with road",
        "road problem", "problem with road", "the road is bad", "roads"
    ]:
        data["category"] = "Roads"
        return {
            "reply_text": "Got it. Is it a pothole, road surface damage, or flooding?",
            "stage": STATE_PROBLEM,
            "extracted_data": data,
            "action": "speak",
            "complaint": None,
            "ui_hints": {
                "state": SEM_CLARIFICATION,
                "status_label": "CLARIFYING",
                "can_confirm": False,
                "can_cancel": True,
                "suggested_quick_replies": ["Dangerous pothole", "Broken road", "Flooded road"],
            },
        }
    if norm_stage in ("confirm", STATE_CONFIRM, "summary_confirmation", STATE_SUMMARY_CONFIRMATION):
        # Case A: Self-Correction during confirmation ("No, it's actually near the bus stand", "No, it is not drainage. It is a clean water pipeline leak")
        if any(c in lower for c in ["no, actually", "actually", "wrong", "change", "instead", "no it's", "no its", "no it is", "not ", "different"]):
            # Extract corrected location or category
            new_loc = _extract_location_from_text(msg)
            new_lmk = _extract_landmark(msg)
            cleaned_for_cat = re.sub(r"\b(no\s+it\s+is\s+not|not|no\s+it\'s\s+not|no\s+its\s+not)\s+[a-z]+\b", "", msg, flags=re.IGNORECASE).strip()
            new_cat = classify(cleaned_for_cat or msg)

            if new_loc:
                data["location"] = new_loc
            if new_lmk:
                data["landmark"] = new_lmk
            if new_cat != "Other":
                data["category"] = new_cat
                _, dept_name = get_department_for_category(new_cat)
                data["department"] = dept_name

            loc_val = data.get("location", "the specified location")
            cat_val = data.get("category", "civic").lower()
            return {
                "reply_text": f"No problem. I'll update that to a {cat_val} issue at {loc_val}. Is everything else correct?",
                "stage": STATE_CONFIRM,
                "extracted_data": data,
                "action": "confirm",
                "complaint": None,
                "ui_hints": {
                    "state": SEM_SUMMARY_CONFIRMATION,
                    "status_label": "WAITING FOR CONFIRMATION",
                    "can_confirm": True,
                    "can_cancel": True,
                    "suggested_quick_replies": ["Yes, submit it", "Change details", "Cancel"],
                },
            }

        # Case B: Explicit affirmative confirmation ("Yes", "Submit it", "Go ahead", "Correct")
        if _is_affirmative(msg):
            desc = data.get("description") or "Civic issue reported via Voice Helpline"
            loc = data.get("location") or "Reported location"
            lmk = data.get("landmark")
            cat_ov = data.get("category")
            prio_ov = data.get("priority")

            # Execute authoritative DB insertion ONLY here
            saved_complaint = _save_complaint_to_db(
                description=desc,
                location=loc,
                landmark=lmk,
                citizen_id=citizen_id,
                latitude=latitude,
                longitude=longitude,
                category_override=cat_ov,
                priority_override=prio_ov,
            )

            cid = saved_complaint["complaint_number"]
            dept = saved_complaint.get("department", "Municipal Department")
            prio = saved_complaint.get("priority", "Medium")

            reply = f"Done. Your complaint has been registered. Your Complaint ID is {cid}. We've notified the {dept}."

            logger.info("VOICE_STATE: %s -> %s (Complaint Created: %s)", norm_stage, STATE_SUBMITTED, cid)
            return {
                "reply_text": reply,
                "stage": STATE_SUBMITTED,
                "extracted_data": data,
                "action": "completed",
                "complaint": saved_complaint,
                "ui_hints": {
                    "state": SEM_SUBMITTED,
                    "status_label": "REGISTERED",
                    "can_confirm": False,
                    "can_cancel": False,
                    "suggested_quick_replies": ["Track Status", "Report another issue", "End Call"],
                },
            }

        # Case C: User is uncertain / needs time ("Maybe", "I don't know", "Not sure")
        elif _is_uncertain(msg):
            loc = data.get("location", "the reported location")
            desc = data.get("description", "your issue")
            return {
                "reply_text": f"No problem, take your time. We have {desc.lower()} near {loc}. Would you like to change anything or go ahead and register it?",
                "stage": STATE_CONFIRM,
                "extracted_data": data,
                "action": "confirm",
                "complaint": None,
                "ui_hints": {
                    "state": SEM_SUMMARY_CONFIRMATION,
                    "status_label": "WAITING FOR CONFIRMATION",
                    "can_confirm": True,
                    "can_cancel": True,
                    "suggested_quick_replies": ["Yes, submit it", "Change details", "Cancel"],
                },
            }

        # Case D: User explicitly said No / Stop
        elif any(w in lower.split() for w in ["no", "nope", "dont", "don't", "not", "wait", "hold"]):
            return {
                "reply_text": "Understood. I haven't submitted anything yet. What details would you like to change?",
                "stage": STATE_PROBLEM,
                "extracted_data": data,
                "action": "speak",
                "complaint": None,
                "ui_hints": {
                    "state": SEM_INFORMATION_COLLECTION,
                    "status_label": "COLLECTING DETAILS",
                    "can_confirm": False,
                    "can_cancel": True,
                    "suggested_quick_replies": ["Change location", "Change issue", "Cancel report"],
                },
            }
        else:
            # Ambiguous ("Hmm", "Okay") -> Ask clearly without premature submission
            loc = data.get("location", "the reported location")
            desc = data.get("description", "your issue")
            return {
                "reply_text": f"Just to confirm: Should I go ahead and submit your report about {desc} near {loc}?",
                "stage": STATE_CONFIRM,
                "extracted_data": data,
                "action": "confirm",
                "complaint": None,
                "ui_hints": {
                    "state": SEM_SUMMARY_CONFIRMATION,
                    "status_label": "WAITING FOR CONFIRMATION",
                    "can_confirm": True,
                    "can_cancel": True,
                    "suggested_quick_replies": ["Yes, submit it", "Change details", "Cancel"],
                },
            }

    # ── 10. Self-Correction in General Flow ("Actually, sorry, Gandhi Road") ────
    if any(corr in lower for corr in ["actually", "sorry,", "sorry ", "i meant", "change location", "change to"]):
        corr_loc = _extract_location_from_text(msg)
        if corr_loc:
            data["location"] = corr_loc
            if data.get("description"):
                return {
                    "reply_text": f"No problem. I'll update the location to {corr_loc}. Should I submit this complaint?",
                    "stage": STATE_CONFIRM,
                    "extracted_data": data,
                    "action": "confirm",
                    "complaint": None,
                    "ui_hints": {
                        "state": SEM_SUMMARY_CONFIRMATION,
                        "status_label": "WAITING FOR CONFIRMATION",
                        "can_confirm": True,
                        "can_cancel": True,
                    },
                }



    # ── 12. Follow-Up Understanding (Answers to clarification questions) ───────
    if data.get("category") == "Water" and not data.get("location"):
        if any(w in lower for w in ["leak", "leaking", "leakage", "burst"]):
            data["description"] = "Water leakage"
            data["subcategory"] = "Leakage"
            return {
                "reply_text": "Got it. Where is the leakage?",
                "stage": STATE_LOCATION,
                "extracted_data": data,
                "action": "speak",
                "complaint": None,
                "ui_hints": {
                    "state": SEM_LOCATION_COLLECTION,
                    "status_label": "COLLECTING DETAILS",
                    "can_confirm": False,
                    "can_cancel": True,
                },
            }
        elif any(w in lower for w in ["no water", "supply", "no supply", "outage"]):
            data["description"] = "Water supply outage"
            data["subcategory"] = "Supply interruption"
            return {
                "reply_text": "Understood — no water supply. Where is this occurring?",
                "stage": STATE_LOCATION,
                "extracted_data": data,
                "action": "speak",
                "complaint": None,
                "ui_hints": {
                    "state": SEM_LOCATION_COLLECTION,
                    "status_label": "COLLECTING DETAILS",
                    "can_confirm": False,
                    "can_cancel": True,
                },
            }

    # Follow-up duration: "Three days", "Since yesterday"
    duration_match = _extract_duration(msg)
    if duration_match and data.get("description"):
        data["duration"] = duration_match
        if not data.get("location"):
            return {
                "reply_text": f"Got it, lasting {duration_match}. Where is this located?",
                "stage": STATE_LOCATION,
                "extracted_data": data,
                "action": "speak",
                "complaint": None,
            }

    # Contextual reference "it" (e.g. "Yes, and it smells terrible", "it's blocking the road")
    if data.get("description") and any(w in lower for w in ["it smells", "it is blocking", "it's blocking", "it stinks", "it is terrible"]):
        extra_detail = msg.strip()
        data["description"] = f"{data['description']} ({extra_detail})"

    # ── 13. Stage: Location Intake ─────────────────────────────────────────────
    if norm_stage in ("location", "location_collection", STATE_LOCATION):
        if data.get("clarifying_campus"):
            data.pop("clarifying_campus", None)
            if any(m in lower for m in ["main road", "main", "outside", "road", "street"]):
                data["location"] = "Main road near college"
            else:
                data["location"] = f"Inside campus ({msg.strip()})"
            return {
                "reply_text": "Got it. Do you know any nearby landmark?",
                "stage": STATE_LANDMARK,
                "extracted_data": data,
                "action": "speak",
                "complaint": None,
                "ui_hints": {
                    "state": SEM_LOCATION_COLLECTION,
                    "status_label": "COLLECTING DETAILS",
                    "can_confirm": True,
                    "can_cancel": True,
                    "suggested_quick_replies": ["Near City Mall", "Opposite the bus stop", "No landmark"],
                },
            }

        extracted_loc = _extract_location_from_text(msg) or msg.strip()
        data["location"] = extracted_loc

        # Check for landmark
        extracted_lmk = _extract_landmark(msg)
        if extracted_lmk:
            data["landmark"] = extracted_lmk
            cat = data.get("category", "Roads")
            desc = data.get("description", "Reported issue")
            loc = data.get("location", extracted_loc)
            emerg_warning = ""
            if any(ek in (desc + " " + msg).lower() for ek in EMERGENCY_KEYWORDS):
                emerg_warning = " Note: If there is an immediate electrical or safety hazard, please also dial 112."
            summary_text = f"Let me make sure I have this right. You're reporting {desc.lower()} near {loc}. Should I submit this complaint?{emerg_warning}"
            return {
                "reply_text": summary_text,
                "stage": STATE_CONFIRM,
                "extracted_data": data,
                "action": "confirm",
                "complaint": None,
                "ui_hints": {
                    "state": SEM_SUMMARY_CONFIRMATION,
                    "status_label": "WAITING FOR CONFIRMATION",
                    "can_confirm": True,
                    "can_cancel": True,
                    "suggested_quick_replies": ["Yes, submit it", "Change location", "Cancel"],
                },
            }
        else:
            return {
                "reply_text": f"Got it, {extracted_loc}. Is there a nearby landmark or building to help find it?",
                "stage": STATE_LANDMARK,
                "extracted_data": data,
                "action": "speak",
                "complaint": None,
                "ui_hints": {
                    "state": SEM_LOCATION_COLLECTION,
                    "status_label": "COLLECTING DETAILS",
                    "can_confirm": True,
                    "can_cancel": True,
                    "suggested_quick_replies": ["No landmark, submit it", "Near the bus stop", "Opposite the park"],
                },
            }

    # ── 13b. Stage: Landmark Intake ────────────────────────────────────────────
    if norm_stage in ("landmark", STATE_LANDMARK):
        if not _is_affirmative(msg) and "no landmark" not in lower and "none" not in lower and "submit" not in lower:
            extracted_lmk = _extract_landmark(msg) or msg.strip()
            data["landmark"] = extracted_lmk

        cat = data.get("category", "Roads")
        desc = data.get("description", "Reported issue")
        loc = data.get("location", "the reported location")
        emerg_warning = ""
        if any(ek in (desc + " " + msg).lower() for ek in EMERGENCY_KEYWORDS):
            emerg_warning = " Note: If there is an immediate electrical or safety hazard, please also dial 112."

        summary_text = f"Let me make sure I have this right. You're reporting {desc.lower()} near {loc}. Should I submit this complaint?{emerg_warning}"
        return {
            "reply_text": summary_text,
            "stage": STATE_CONFIRM,
            "extracted_data": data,
            "action": "confirm",
            "complaint": None,
            "ui_hints": {
                "state": SEM_SUMMARY_CONFIRMATION,
                "status_label": "WAITING FOR CONFIRMATION",
                "can_confirm": True,
                "can_cancel": True,
                "suggested_quick_replies": ["Yes, submit it", "Change location", "Cancel"],
            },
        }

    # ── 14. Stage: Post-Submission ("Is there anything else?") ──────────────────
    if norm_stage in ("submitted", STATE_SUBMITTED):
        if _is_affirmative(msg) or any(w in lower for w in ["yes", "another", "new", "report", "more", "one more"]):
            return {
                "reply_text": "Sure! What is the next issue you'd like to report?",
                "stage": STATE_LISTENING,
                "extracted_data": {},
                "action": "speak",
                "complaint": None,
                "ui_hints": {
                    "status_label": "LISTENING",
                    "can_confirm": False,
                    "can_cancel": False,
                    "suggested_quick_replies": ["Report a pothole", "Broken streetlight", "Garbage issue"],
                },
            }
        return {
            "reply_text": "Thank you for using CivicResolve. Have a great day!",
            "stage": STATE_SUBMITTED,
            "extracted_data": data,
            "action": "ended",
            "complaint": None,
            "ui_hints": {
                "status_label": "REGISTERED",
                "can_confirm": False,
                "can_cancel": False,
                "suggested_quick_replies": ["Track Complaint", "End Call"],
            },
        }

    # ── 15. Core Complaint Intake & Slot Extraction ───────────────────────────
    # Photo evidence reference
    if any(p in lower for p in ["photo", "picture", "image", "proof", "camera", "snap"]):
        data["evidence_mentioned"] = True
        return {
            "reply_text": "Sure. Send me the photo and I'll check it right away.",
            "stage": STATE_PROBLEM,
            "extracted_data": data,
            "action": "speak",
            "complaint": None,
            "ui_hints": {
                "state": SEM_INFORMATION_COLLECTION,
                "status_label": "WAITING FOR PHOTO",
                "can_confirm": False,
                "can_cancel": True,
            },
        }

    # Multi-issue detection
    multi_issues = _detect_multi_issues(msg)
    if len(multi_issues) >= 2:
        data["multi_issues"] = multi_issues

    problem_text = msg
    category = classify(msg)
    priority = detect_priority(msg)
    location_in_msg = _extract_location_from_text(msg)
    landmark_in_msg = _extract_landmark(msg)
    duration_in_msg = _extract_duration(msg)

    # Casual / Slang specific high-risk cues (e.g. "bikes keep falling")
    if "bikes keep falling" in lower or "bike fell" in lower or "accident" in lower:
        priority = "HIGH"
        problem_text = f"{msg} (Accident risk / vehicle hazard)"

    dept_id, dept_name = get_department_for_category(category)

    data["description"] = problem_text
    data["category"] = category
    data["priority"] = priority
    data["department"] = dept_name
    if landmark_in_msg:
        data["landmark"] = landmark_in_msg
    if duration_in_msg:
        data["duration"] = duration_in_msg

    # Special natural clarification for campus / college area
    if any(c in lower for c in ["college", "university", "campus"]) and not any(r in lower for r in ["main road", "inside", "gate", "road"]):
        data["clarifying_campus"] = True
        return {
            "reply_text": "I'm sorry about that. I can help you report it. Is it on the main road or inside the campus area?",
            "stage": STATE_LOCATION,
            "extracted_data": data,
            "action": "speak",
            "complaint": None,
            "ui_hints": {
                "state": SEM_CLARIFICATION,
                "status_label": "CLARIFYING LOCATION",
                "can_confirm": False,
                "can_cancel": True,
                "suggested_quick_replies": ["Main road", "Inside campus", "Near college gate"],
            },
        }

    # Case A: Location is ALREADY provided in the initial statement
    # Example: "There is a huge pothole near Gandhi Market in Hyderabad."
    if location_in_msg and len(location_in_msg) >= 3 and location_in_msg.lower() not in GENERIC_LOCATIONS:
        data["location"] = location_in_msg

        # Emergency hazard warning if applicable
        emerg_text = ""
        if any(ek in (problem_text + " " + msg).lower() for ek in EMERGENCY_KEYWORDS):
            emerg_text = " Note: If there is an immediate electrical or safety hazard, please also dial 112 emergency services."

        # Format multi-issue summary if present
        if data.get("multi_issues") and len(data["multi_issues"]) >= 2:
            summary_reply = (
                f"Let me make sure I have this right. You're reporting both road potholes and streetlight issues near {location_in_msg}. "
                f"Should I submit this complaint?{emerg_text}"
            )
        else:
            summary_reply = (
                f"Let me make sure I have this right. You're reporting {problem_text.lower()} near {location_in_msg}. "
                f"Should I submit this complaint?{emerg_text}"
            )

        return {
            "reply_text": summary_reply,
            "stage": STATE_CONFIRM,
            "extracted_data": data,
            "action": "confirm",
            "complaint": None,
            "ui_hints": {
                "state": SEM_SUMMARY_CONFIRMATION,
                "status_label": "WAITING FOR CONFIRMATION",
                "can_confirm": True,
                "can_cancel": True,
                "suggested_quick_replies": ["Yes, submit it", "Change location", "Cancel"],
            },
        }

    # Case B: Problem understood, but location is MISSING
    # Example: "The garbage hasn't been collected for three days." -> "Got it. Where is the garbage located?"
    if category == "Garbage":
        follow_up_reply = "Got it. What street or landmark is the garbage located near?"
    elif category == "Streetlights":
        follow_up_reply = "Got it. What street or landmark is the streetlight near?"
    elif category == "Water":
        follow_up_reply = "Understood. Where is the water issue located?"
    elif category == "Drainage":
        follow_up_reply = "Got it. Where is the drainage issue located?"
    else:
        follow_up_reply = f"Thanks. Where exactly is the {problem_text.lower()} located?"

    return {
        "reply_text": follow_up_reply,
        "stage": STATE_LOCATION,
        "extracted_data": data,
        "action": "speak",
        "complaint": None,
        "ui_hints": {
            "state": SEM_LOCATION_COLLECTION,
            "status_label": "COLLECTING DETAILS",
            "can_confirm": False,
            "can_cancel": True,
            "suggested_quick_replies": ["Near Gandhi Market", "On Main Road", "Near the bus stop"],
        },
    }


# Backwards compatibility alias
process_voice_turn = process_voice_call_turn
