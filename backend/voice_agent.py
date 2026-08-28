"""
voice_agent.py — Intelligent Conversational Voice/Call Helpline Agent for CivicResolve AI.

Implements a full multi-turn conversational state machine for civic helpline calls:
1. Greets the citizen naturally without prematurely assuming every utterance is a complaint.
2. Supports greetings, general inquiries, status tracking, off-topic questions, and cancellations.
3. Detects civic intent and dynamically extracts slots (issue, category, subcategory, location, landmark, duration, urgency).
4. Asks intelligent, non-redundant follow-up questions only for missing information.
5. Provides a structured summary read-back of the complaint before asking for explicit confirmation.
6. Handles citizen corrections smoothly without restarting the conversation.
7. Submits the official complaint to the database ONLY upon explicit citizen confirmation in SUMMARY_CONFIRMATION.
8. Provides post-submission assistance with Complaint ID, department routing, and tracking instructions.

Uses:
- llm.py (Ollama Qwen 2.5 3B /api/chat or /api/generate)
- classifier.py & priority.py (authoritative classification & priority rules)
- agent.py (run_analysis)
- database.py (authoritative SQLite / PostgreSQL persistence)
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

# Semantic Machine States
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


# ── Utterance Intent & Pattern Matchers ─────────────────────────────────────────

GREETING_PATTERNS = [
    r"^(hi|hello|hey|helo|hai|howdy|namaste|vanakkam|pranam|good\s+morning|good\s+afternoon|good\s+evening)\b",
    r"^(how\s+are\s+you|how\'re\s+you|how\s+do\s+you\s+do|is\s+anyone\s+there|are\s+you\s+there)\b",
    r"^(can\s+you\s+help\s+me|i\s+need\s+help|help\s+me|i\s+have\s+a\s+question)\b",
]

INQUIRY_PATTERNS = [
    r"(what\s+can\s+you\s+do|how\s+does\s+this\s+work|what\s+is\s+this|who\s+are\s+you|what\s+is\s+your\s+name|what\s+is\s+civicresolve)",
    r"(tell\s+me\s+about\s+civicresolve|what\s+services\s+do\s+you\s+provide|how\s+to\s+report|what\s+do\s+you\s+do)",
]

OFF_TOPIC_PATTERNS = [
    r"(what\s+is\s+the\s+weather|weather\s+today|tell\s+me\s+a\s+joke|who\s+won|cricket\s+score|what\s+is\s+your\s+favorite)",
]

EMERGENCY_KEYWORDS = [
    "sparking wire", "live wire", "exposed wire", "electric shock", "gas leak",
    "building collapse", "collapsed building", "bridge collapse", "severe flood",
    "cylinder burst", "major explosion", "life threatening", "electrocution",
    "sparking", "fire", "spark", "explosion", "flame", "smoke", "shock",
]

VAGUE_REPORT_STARTERS = [
    r"^(i\s+want\s+to\s+report|i\s+want\s+to\s+complain|i\s+have\s+a\s+complaint|there\s+is\s+a\s+problem|i\s+have\s+a\s+problem|there\s+is\s+an\s+issue|i\s+noticed\s+an\s+issue)\b",
    r"^(i\s+want\s+to\s+file\s+a\s+complaint|something\s+is\s+wrong|something\s+is\s+broken|please\s+help\s+me\s+report|issue\s+near\s+my\s+house)\b",
    r"^(i\s+want\s+to\s+report\s+something|i\s+need\s+to\s+report\s+something)\b",
]

LOCATION_PREPOSITIONS = [
    "outside", "inside", "in front of", "next to", "adjacent to", "opposite", "across",
    "behind", "beside", "near", "around", "close to", "at", "on",
]

LOCATION_KEYWORDS = [
    "road", "street", "lane", "cross", "main", "junction", "circle", "layout",
    "colony", "nagar", "sector", "block", "ward", "area", "market", "school",
    "college", "hospital", "bus stop", "bus stand", "metro", "bridge", "flyover",
    "park", "gate", "station", "complex", "mall", "apartment", "building",
]

GENERIC_LOCATIONS = {
    "my house", "here", "there", "the area", "this area", "the street", "our street",
    "the road", "our road", "the locality", "our locality", "my street", "my road",
    "the place", "this place", "our colony", "the colony", "the neighborhood",
    "a street", "a road", "my area", "this road", "this street", "some place",
    "street", "road", "lane", "area", "place", "drain", "ground", "spot", "site",
    "footpath", "pavement", "sidewalk", "on street", "on road", "in street", "in road",
}


def _is_pure_greeting(text: str) -> bool:
    """Return True if text is just a polite greeting without any complaint details."""
    cleaned = text.strip().lower()
    cleaned_no_punct = re.sub(r"[^\w\s]", "", cleaned).strip()
    
    pure_greetings = {
        "hi", "hello", "hey", "namaste", "hai", "good morning", "good evening",
        "good afternoon", "how are you", "how are you doing", "can you help me",
        "i have a question", "what can you do", "who are you", "what is your name",
        "are you there", "is this civicresolve", "hello there", "hi there",
        "vanakkam", "pranam", "howdy", "i need some help", "what do you do",
    }
    if cleaned_no_punct in pure_greetings:
        return True

    for pat in GREETING_PATTERNS:
        if re.search(pat, cleaned):
            has_complaint_content = any(
                kw in cleaned for kws in CATEGORY_KEYWORDS.values() for kw in kws
            )
            if not has_complaint_content and len(cleaned_no_punct.split()) <= 6:
                return True
    return False


def _is_general_inquiry(text: str) -> bool:
    cleaned = text.strip().lower()
    for pat in INQUIRY_PATTERNS:
        if re.search(pat, cleaned):
            return True
    return False


def _is_off_topic(text: str) -> bool:
    cleaned = text.strip().lower()
    for pat in OFF_TOPIC_PATTERNS:
        if re.search(pat, cleaned):
            return True
    return False


def _is_vague_intake_starter(text: str) -> bool:
    cleaned = text.strip().lower()
    for pat in VAGUE_REPORT_STARTERS:
        if re.search(pat, cleaned):
            words = cleaned.split()
            has_specifics = any(kw in cleaned for kws in CATEGORY_KEYWORDS.values() for kw in kws)
            if not has_specifics or len(words) <= 7:
                return True
    return False


def _is_cancel_intent(text: str) -> bool:
    cleaned = re.sub(r"[^\w\s]", " ", text.lower()).strip()
    if "bus stop" in cleaned or "auto stop" in cleaned or "train stop" in cleaned:
        cleaned = cleaned.replace("bus stop", "bus_station").replace("auto stop", "auto_stand").replace("train stop", "railway_station")
    cancel_phrases = [
        "cancel", "nevermind", "never mind", "i changed my mind", "abort",
        "dont submit", "don't submit", "do not submit", "cancel it", "cancel this",
        "cancel the complaint", "cancel complaint", "stop this", "stop the report",
    ]
    if any(cp in cleaned for cp in cancel_phrases):
        return True
    words = cleaned.split()
    if words and (words[0] in ["cancel", "abort", "nevermind"] or (len(words) <= 2 and "stop" in words)):
        return True
    return False


def _is_affirmative(text: str) -> bool:
    cleaned = re.sub(r"[^\w\s]", " ", text.lower()).strip()
    words = set(cleaned.split())
    if "no" in words or "dont" in words or "don't" in words or "not" in words or "wait" in words or "hold" in words:
        return False
    affirmative_words = {
        "yes", "yeah", "yep", "yup", "sure", "submit", "confirm",
        "proceed", "correct", "right", "fine", "haan", "ha", "register",
    }
    affirmative_phrases = [
        "go ahead", "do it", "submit it", "yes please", "thats right",
        "that is right", "please submit", "submit this", "yes submit",
        "register it", "looks good", "confirm and submit", "yes that is correct",
        "yes thats correct", "yes correct",
    ]
    if any(phrase in cleaned for phrase in affirmative_phrases):
        return True
    return bool(words.intersection(affirmative_words))


STOP_VERBS_AND_CIVIC_WORDS = {
    "is", "was", "are", "were", "has", "have", "been", "lying", "uncollected", "dumped",
    "thrown", "overflowing", "leaking", "flooding", "spilled", "piled", "accumulating",
    "present", "sitting", "broken", "dark", "damage", "hole", "pothole", "water",
    "garbage", "trash", "waste", "drain", "drainage", "problem", "issue", "there",
    "noticed", "found", "saw", "seeing", "facing", "dealing", "complaint", "report",
    "gushing", "burst",
}


def _extract_location_from_text(text: str) -> Optional[str]:
    """Extract location string if mentioned specifically in speech."""
    lower = text.lower()
    
    # 1. Match phrases with prepositions: "near City Mall", "on MG Road", "at Gandhi Nagar", "outside City Mall"
    for prep in LOCATION_PREPOSITIONS:
        pattern = rf"\b{prep}\s+([A-Za-z0-9\s,\.\-]{{3,45}})"
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            extracted = match.group(1).strip()
            extracted = re.split(r"\b(and|since|for|because|which|is|it|please|from|causing|near|opposite|beside)\b", extracted, flags=re.IGNORECASE)[0].strip()
            clean_extracted_lower = extracted.lower().strip()
            
            # Check generic locations & single keywords
            if clean_extracted_lower in GENERIC_LOCATIONS or clean_extracted_lower in LOCATION_KEYWORDS:
                continue
            if any(clean_extracted_lower == g for g in ["the street", "our street", "the road", "our road", "the area", "my area", "the colony", "our colony"]):
                continue
            words = clean_extracted_lower.split()
            if words and words[0] in ["the", "our", "my", "a", "this"] and len(words) <= 2:
                continue
            # If extracted words contain common verbs or problem nouns, it's a clause, not a location
            if any(w in STOP_VERBS_AND_CIVIC_WORDS for w in words):
                continue
            if len(extracted) >= 3:
                return f"{prep.title()} {extracted}"

    # 2. Match landmark keywords directly with proper names: e.g. "MG Road", "Sector 7 Bus Stop", "Gandhi Nagar Market"
    for kw in LOCATION_KEYWORDS:
        pattern = rf"\b([A-Za-z0-9]+(?:\s+[A-Za-z0-9]+){{0,2}}\s+{kw}\b)"
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            candidate = match.group(1).strip()
            clean_candidate_lower = candidate.lower().strip()
            words = clean_candidate_lower.split()

            if clean_candidate_lower in GENERIC_LOCATIONS:
                continue
            if words and words[0] in ["the", "our", "my", "a", "this", "on", "in", "at"] and len(words) <= 2:
                continue
            if any(w in STOP_VERBS_AND_CIVIC_WORDS for w in words if w != kw.lower()):
                continue
            if len(candidate) >= 4:
                return candidate.title()

    return None


def _extract_duration(text: str) -> Optional[str]:
    """Extract duration of the problem if mentioned (e.g. 'for 3 days', 'since yesterday')."""
    match = re.search(r"\b((?:for|since)\s+\d+\s+(?:days?|weeks?|hours?|months?)|since\s+yesterday|for\s+a\s+(?:few\s+days|week|month))\b", text, re.IGNORECASE)
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


# ── Qwen 2.5 3B LLM Helper ───────────────────────────────────────────────────

_VOICE_OPERATOR_SYSTEM_PROMPT = """You are CivicResolve AI, an intelligent, empathetic civic helpline operator for Indian municipal corporations.
You converse naturally over voice calls to help citizens report and track public infrastructure issues (Roads, Garbage, Drainage, Water, Streetlights, Infrastructure).

Analyze the conversation turn and output strict JSON:
{
  "intent": "greeting | inquiry | track | report_problem | provide_location | provide_landmark | confirm | correct | cancel | off_topic",
  "problem_summary": "<concise description of the civic problem, or null>",
  "category": "<Roads | Garbage | Drainage | Water | Streetlights | Infrastructure | Other | null>",
  "subcategory": "<specific subcategory, or null>",
  "location": "<extracted location/street/area/landmark, or null>",
  "landmark": "<extracted specific landmark, or null>",
  "duration": "<extracted duration, or null>",
  "is_high_risk": <true if immediate accident, live wire, flooding or hazard, false otherwise>,
  "conversational_reply": "<warm, polite, human-like 1-2 sentence spoken reply to say over the phone>"
}

Rules:
1. Output ONLY valid JSON.
2. Keep conversational_reply natural, concise, and professional for text-to-speech.
3. NEVER assume a simple greeting like 'hello' or 'hi' is a complaint submission.
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
            # Timeline updates
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


# ── Main Conversational Turn Processor ─────────────────────────────────────────

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
    Implements genuine conversational state machine with zero premature submissions.
    """
    msg = message.strip()
    data = dict(extracted_data or {})
    lower = msg.lower()
    norm_stage = stage.lower() if stage else "greeting"

    logger.info("VOICE_TURN_INTAKE: message='%s', stage='%s', extracted_keys=%s", msg, norm_stage, list(data.keys()))

    # ── 1. Initial Call Connect / Greeting ─────────────────────────────────────
    if msg == "__START__" or (norm_stage in ("greeting", "idle") and not msg):
        logger.info("VOICE_STATE: %s -> %s", norm_stage, STATE_LISTENING)
        return {
            "reply_text": (
                "Hello! You're connected to CivicResolve AI. "
                "I can help you report a civic issue like potholes, garbage, water problems, or broken streetlights, "
                "or track an existing complaint. How can I help you today?"
            ),
            "stage": STATE_PROBLEM,
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

    # ── 2. Explicit Cancellation (Applies globally) ────────────────────────────
    if _is_cancel_intent(msg) and norm_stage not in ("submitted", STATE_SUBMITTED):
        logger.info("VOICE_STATE: %s -> %s (User Cancelled)", norm_stage, STATE_CANCELLED)
        return {
            "reply_text": "No problem at all. Your complaint report has been cancelled and your draft has been cleared. What else can I assist you with?",
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

    # ── 3. Pure Greeting & Small Talk (MUST NEVER CREATE A COMPLAINT) ──────────
    if _is_pure_greeting(msg) and norm_stage not in ("confirm", "submitted", STATE_SUMMARY_CONFIRMATION, STATE_SUBMITTED):
        logger.info("VOICE_STATE: %s -> %s (Greeting Acknowledged)", norm_stage, STATE_LISTENING)
        if any(h in lower for h in ["how are you", "how're you", "how do you do"]):
            reply = (
                "Hello! 👋 I'm doing well, thank you for asking. I'm CivicResolve AI, your 24/7 civic assistant. "
                "I can help you report issues like road damage, garbage, drainage, or water problems, or track existing reports. "
                "What can I help you with today?"
            )
        elif any(h in lower for h in ["what can you do", "help me", "can you help", "what do you do", "what is this"]):
            reply = (
                "Hello! 👋 I'm CivicResolve AI. I can help you report civic issues like potholes, garbage, water leaks, "
                "streetlights, or drainage directly to the responsible municipal department. You can also ask me to check an existing complaint. "
                "What would you like help with today?"
            )
        else:
            reply = (
                "Hello! 👋 I'm CivicResolve AI. I can help you report civic issues like potholes, garbage, water problems, "
                "streetlights, drainage, or other public-service issues. You can also ask me to track an existing complaint. "
                "What would you like help with today?"
            )

        return {
            "reply_text": reply,
            "stage": norm_stage if norm_stage in ("listening", "problem") else STATE_PROBLEM,
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

    # ── 4. General Information & Off-Topic Queries ────────────────────────────
    if _is_general_inquiry(msg) and norm_stage not in ("confirm", "submitted", STATE_SUMMARY_CONFIRMATION, STATE_SUBMITTED):
        return {
            "reply_text": (
                "CivicResolve AI is your city's 24/7 intelligent municipal operations helpline. "
                "When you describe a problem, I analyze the issue, identify the right municipal department, "
                "and generate an official Complaint ID for live tracking. "
                "What civic problem would you like to report today?"
            ),
            "stage": norm_stage if norm_stage in ("listening", "problem") else STATE_PROBLEM,
            "extracted_data": data,
            "action": "speak",
            "complaint": None,
            "ui_hints": {
                "state": SEM_LISTENING,
                "status_label": "LISTENING",
                "can_confirm": False,
                "can_cancel": False,
                "suggested_quick_replies": ["Report a problem", "Track a complaint", "List categories"],
            },
        }

    if _is_off_topic(msg) and norm_stage not in ("confirm", "submitted", STATE_SUMMARY_CONFIRMATION, STATE_SUBMITTED):
        if "weather" in lower:
            reply = "I can help with civic services and municipal complaints, but I don't currently have reliable weather information. If you'd like, I can help you report or track a civic issue."
        elif "name" in lower or "who are you" in lower:
            reply = "I'm CivicResolve AI, your intelligent civic operations assistant. What civic service or complaint can I assist you with?"
        else:
            reply = "I'm specialized in helping citizens report and track municipal civic issues. Would you like to report a problem or check an existing complaint?"

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

    # ── 5. Complaint Status Tracking Inquiries ─────────────────────────────────
    id_match = re.search(r"CR-\d{4}-\d{4,8}", msg, re.IGNORECASE)
    is_track_intent = bool(id_match) or any(w in lower for w in [
        "track", "where is my complaint", "status of my complaint",
        "status of complaint", "check my complaint", "check status", "track complaint",
        "has my complaint been resolved", "what's the status", "whats the status",
    ])

    if is_track_intent and norm_stage not in ("confirm", STATE_SUMMARY_CONFIRMATION):
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
                c_prio = target_complaint.get("priority", "Medium")

                # Human-readable status mapping
                status_desc = {
                    "Submitted": "received and logged in the municipal dispatch queue",
                    "Assigned": f"assigned to {target_complaint.get('assigned_team') or c_dept} for inspection",
                    "In Progress": "currently being actively worked on by the field operations team",
                    "Inspection": "under physical site inspection",
                    "Resolved": "marked as resolved by the municipal team",
                    "Closed": "officially closed",
                }.get(c_stat, f"in {c_stat} stage")

                reply = (
                    f"I found Complaint ID {c_num}. "
                    f"Your {c_cat} report at {c_loc} is currently {status_desc} under {c_dept} with {c_prio} priority. "
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
                        "suggested_quick_replies": ["Report another issue", "Track another ID", "End Call"],
                    },
                }
            elif id_match:
                return {
                    "reply_text": f"I searched our database but could not find Complaint ID {id_match.group(0).upper()}. Please double check the ID format, or let me know if you would like to report a new problem.",
                    "stage": STATE_LISTENING,
                    "extracted_data": data,
                    "action": "speak",
                    "complaint": None,
                    "ui_hints": {
                        "status_label": "LISTENING",
                        "can_confirm": False,
                        "can_cancel": False,
                        "suggested_quick_replies": ["Report an issue", "Check ID again"],
                    },
                }
            else:
                return {
                    "reply_text": "I can help you track your complaint. Please state your Complaint ID, for example, CR-2026-123456.",
                    "stage": STATE_TRACKING,
                    "extracted_data": data,
                    "action": "speak",
                    "complaint": None,
                    "ui_hints": {
                        "status_label": "TRACKING",
                        "can_confirm": False,
                        "can_cancel": False,
                        "suggested_quick_replies": ["Report a problem instead"],
                    },
                }
        finally:
            conn.close()

    # ── 6. Vague Intake Starter ("I want to report something") ──────────────────
    if _is_vague_intake_starter(msg) and norm_stage in ("greeting", "listening", "problem", STATE_LISTENING):
        return {
            "reply_text": "I can help with that. Please describe the problem — what happened and where? For example, a road issue, garbage, water, drainage, or streetlight.",
            "stage": STATE_PROBLEM,
            "extracted_data": data,
            "action": "speak",
            "complaint": None,
            "ui_hints": {
                "state": SEM_INFORMATION_COLLECTION,
                "status_label": "COLLECTING DETAILS",
                "can_confirm": False,
                "can_cancel": True,
                "suggested_quick_replies": ["Road pothole", "Garbage dump", "Water leakage", "Drainage overflow", "Broken streetlight"],
            },
        }

    # ── 7. Stage: Confirmation Check (Authoritative Safety Gate) ──────────────
    if norm_stage in ("confirm", STATE_SUMMARY_CONFIRMATION):
        # Case A: Explicit affirmative confirmation
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

            reply = (
                f"Your complaint has been successfully registered. Your official Complaint ID is {cid}. "
                f"It has been routed to the {dept} with {prio} priority. "
                f"You can track this anytime on our portal. Is there anything else I can help you with?"
            )

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

        # Case B: User Correction ("No, it's not drainage. It's a water leakage.")
        elif any(c in lower for c in ["change", "actually", "wrong", "different", "not ", "instead", "no it", "no, it"]):
            cleaned_for_classification = re.sub(r"\b(no\s+it\s+is\s+not|not|no\s+it\'s\s+not|no\s+its\s+not)\s+[a-z]+\b", "", msg, flags=re.IGNORECASE).strip()
            new_cat = classify(cleaned_for_classification or msg)
            new_loc = _extract_location_from_text(msg)
            new_lmk = _extract_landmark(msg)
            
            if new_cat != "Other":
                data["category"] = new_cat
                _, dept_name = get_department_for_category(new_cat)
                data["department"] = dept_name
            if new_loc:
                data["location"] = new_loc
            if new_lmk:
                data["landmark"] = new_lmk

            cat = data.get("category", "civic issue")
            loc = data.get("location", "the specified location")
            lmk = data.get("landmark")
            lmk_phrase = f", near {lmk}" if lmk else ""

            summary_reply = (
                f"Got it — I'll correct that to a {cat.lower()} issue at {loc}{lmk_phrase}. "
                f"Would you like me to submit and register this complaint?"
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

        # Case C: User said No / Not yet
        elif any(w in lower.split() for w in ["no", "nope", "dont", "don't", "not", "wait", "hold"]):
            return {
                "reply_text": (
                    "Understood. I will not submit this complaint yet. "
                    "Would you like to change any details, provide a different location, or cancel the report?"
                ),
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
            # Ambiguous ("Hmm", "Okay", etc.) - DO NOT SUBMIT, ask for explicit confirmation
            cat = data.get("category", "civic")
            loc = data.get("location", "the specified location")
            return {
                "reply_text": (
                    f"Just to be completely sure: Would you like me to submit this {cat.lower()} complaint at {loc}? "
                    "Say 'Yes, submit it' to confirm, or 'Change details' if you need to edit anything."
                ),
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

    # ── 8. Stage: Location Intake ─────────────────────────────────────────────
    if norm_stage in ("location", "location_collection", STATE_LOCATION_COLLECTION):
        if not msg:
            return {
                "reply_text": "I'm listening. Where is this issue located? You can tell me the street name, area, or nearby landmark.",
                "stage": STATE_LOCATION,
                "extracted_data": data,
                "action": "speak",
                "complaint": None,
                "ui_hints": {
                    "state": SEM_LOCATION_COLLECTION,
                    "status_label": "COLLECTING DETAILS",
                    "can_confirm": False,
                    "can_cancel": True,
                    "suggested_quick_replies": ["Near the bus stop", "On Main Road", "Near Market"],
                },
            }

        extracted_loc = _extract_location_from_text(msg) or msg.strip()
        data["location"] = extracted_loc

        # Check if landmark mentioned
        extracted_lmk = _extract_landmark(msg)
        if extracted_lmk:
            data["landmark"] = extracted_lmk
        elif "landmark" in data:
            pass
        else:
            # Ask for landmark
            return {
                "reply_text": f"Got it, {extracted_loc}. Is there a nearby landmark, like a shop, school, or metro pillar?",
                "stage": "landmark",
                "extracted_data": data,
                "action": "speak",
                "complaint": None,
                "ui_hints": {
                    "state": SEM_LOCATION_COLLECTION,
                    "status_label": "COLLECTING DETAILS",
                    "can_confirm": False,
                    "can_cancel": True,
                    "suggested_quick_replies": ["Near Apollo Pharmacy", "No landmark", "Near bus stop"],
                },
            }
            
        cat = data.get("category", "Roads")
        desc = data.get("description", "Reported issue")
        loc = data.get("location", extracted_loc)
        lmk = data.get("landmark")
        prio = data.get("priority", "HIGH")
        dept = data.get("department", "Municipal Operations")
        lmk_phrase = f", near {lmk}" if lmk else ""

        # Emergency hazard warning if applicable
        emerg_warning = ""
        if any(ek in (desc + " " + msg).lower() for ek in EMERGENCY_KEYWORDS):
            emerg_warning = " ⚠️ Note: If there is an immediate public safety risk, please also contact 112 emergency services."

        summary_text = (
            f"Thanks. So I've noted a {cat.lower()} issue: {desc} at {loc}{lmk_phrase}, evaluated at {prio} priority.{emerg_warning} "
            f"Would you like me to submit and register this complaint?"
        )

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

    # ── Stage: Landmark Intake ────────────────────────────────────────────────
    if norm_stage in ("landmark", "STATE_LANDMARK", STATE_LANDMARK):
        if msg and not any(w in lower for w in ["no", "none", "skip", "no landmark"]):
            data["landmark"] = _extract_landmark(msg) or msg.strip()

        cat = data.get("category", "Roads")
        desc = data.get("description", "Reported issue")
        loc = data.get("location", "Reported location")
        lmk = data.get("landmark")
        prio = data.get("priority", "HIGH")
        dept = data.get("department", "Municipal Operations")
        lmk_phrase = f", near {lmk}" if lmk else ""

        # Emergency hazard warning if applicable
        emerg_warning = ""
        if any(ek in (desc + " " + msg).lower() for ek in EMERGENCY_KEYWORDS):
            emerg_warning = " ⚠️ Note: If there is an immediate public safety risk, please also contact 112 emergency services."

        summary_text = (
            f"Thanks. So I've noted a {cat.lower()} issue: {desc} at {loc}{lmk_phrase}, evaluated at {prio} priority.{emerg_warning} "
            f"Would you like me to submit and register this complaint?"
        )

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

    # ── 9. Stage: Post-Submission ("Is there anything else?") ──────────────────
    if norm_stage in ("submitted", STATE_SUBMITTED):
        if _is_affirmative(msg) or any(w in lower for w in ["yes", "another", "new", "report", "more", "one more"]):
            return {
                "reply_text": "Sure! What is the next civic issue you would like to report?",
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
            "reply_text": "Thank you for using CivicResolve AI Helpline. Have a wonderful day!",
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

    # ── 10. Core Complaint Intake & Slot Extraction ───────────────────────────
    if any(p in lower for p in ["photo", "picture", "image", "proof", "camera", "snap"]):
        data["evidence_mentioned"] = True

    llm_out = _call_llm_voice_operator(msg, norm_stage, data)

    problem_text = msg
    category = classify(msg)
    priority = detect_priority(msg)
    location_in_msg = _extract_location_from_text(msg)
    landmark_in_msg = _extract_landmark(msg)
    duration_in_msg = _extract_duration(msg)

    if llm_out:
        if llm_out.get("problem_summary"):
            problem_text = str(llm_out["problem_summary"])
        if llm_out.get("category") and llm_out["category"] in ["Roads", "Garbage", "Drainage", "Water", "Streetlights", "Infrastructure"]:
            category = llm_out["category"]
        if llm_out.get("location"):
            candidate_loc = str(llm_out["location"])
            if candidate_loc.lower() not in GENERIC_LOCATIONS:
                location_in_msg = candidate_loc
        if llm_out.get("landmark"):
            landmark_in_msg = str(llm_out["landmark"])
        if llm_out.get("duration"):
            duration_in_msg = str(llm_out["duration"])

    dept_id, dept_name = get_department_for_category(category)

    data["description"] = problem_text
    data["category"] = category
    data["priority"] = priority
    data["department"] = dept_name
    if landmark_in_msg:
        data["landmark"] = landmark_in_msg
    if duration_in_msg:
        data["duration"] = duration_in_msg

    # Partial / broad complaints without specifics
    if lower in ["it's about water", "water", "water problem", "water issue", "there's something wrong with the water", "something is wrong with the water"]:
        return {
            "reply_text": "Sure. Is it a water supply outage, a leakage, dirty water, low pressure, or something else?",
            "stage": STATE_PROBLEM,
            "extracted_data": data,
            "action": "speak",
            "complaint": None,
            "ui_hints": {
                "state": SEM_INFORMATION_COLLECTION,
                "status_label": "COLLECTING DETAILS",
                "can_confirm": False,
                "can_cancel": True,
                "suggested_quick_replies": ["Water leakage", "Dirty water", "No water supply", "Low pressure"],
            },
        }

    if lower in ["it's about road", "road problem", "road", "roads", "pothole problem", "there's a problem with the road"]:
        return {
            "reply_text": "Sure. Is it a pothole, broken footpath, road surface damage, or missing divider?",
            "stage": STATE_PROBLEM,
            "extracted_data": data,
            "action": "speak",
            "complaint": None,
            "ui_hints": {
                "state": SEM_INFORMATION_COLLECTION,
                "status_label": "COLLECTING DETAILS",
                "can_confirm": False,
                "can_cancel": True,
                "suggested_quick_replies": ["Dangerous pothole", "Broken footpath", "Road surface damage"],
            },
        }

    # Case A: Location is ALREADY provided in the initial statement
    # Example: "There is a giant pothole outside City Mall near the bus stop."
    if location_in_msg and len(location_in_msg) >= 3 and location_in_msg.lower() not in GENERIC_LOCATIONS:
        data["location"] = location_in_msg
        
        landmark_phrase = f", near {data.get('landmark')}" if data.get("landmark") else ""
        duration_phrase = f" lasting for {data['duration']}" if data.get("duration") else ""

        # Emergency check
        emerg_text = ""
        if any(ek in (problem_text + " " + msg).lower() for ek in EMERGENCY_KEYWORDS):
            emerg_text = " ⚠️ Note: If there is an immediate public safety risk, please also contact 112 emergency services."

        summary_reply = (
            f"Thanks. So I've noted a {data['category'].lower()} issue: {data['description']}{duration_phrase} "
            f"at {data['location']}{landmark_phrase}, routed to {data['department']} with {data['priority']} priority.{emerg_text} "
            f"Would you like me to submit and register this complaint?"
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
    # Example: "There is a huge pothole."
    cat_label = category.lower() if category != "Other" else "civic"
    follow_up_reply = f"I'm sorry about that. Where is the {problem_text.lower()} located?"

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
