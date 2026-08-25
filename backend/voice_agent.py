"""
voice_agent.py — Voice/Call Agent for CivicResolve AI.

Handles multi-turn conversational voice calls:
1. Greets the citizen and asks for the civic problem.
2. Extracts problem description, runs LLM / classifier for category & priority.
3. Asks for location (street, road, area).
4. Asks for nearby landmarks / extra details.
5. Summarizes and asks for confirmation.
6. On confirmation, runs run_analysis(), saves complaint to SQLite DB,
   and provides spoken resolution with real Complaint ID.

Uses:
- llm.py (Ollama Qwen2.5:3B via /api/chat or /api/generate)
- agent.py (run_analysis)
- database.py (SQLite persistence)
- classifier.py & priority.py (deterministic fallback)
"""

from __future__ import annotations

import json
import logging
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from classifier import classify, get_department_for_category, get_first_team
from priority import detect_priority, calculate_severity, get_estimated_response
from location import detect_zone
from agent import run_analysis
from database import get_connection

logger = logging.getLogger(__name__)


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _generate_complaint_number() -> str:
    year = datetime.now(timezone.utc).year
    suffix = str(uuid.uuid4().int)[:6].zfill(6)
    return f"CR-{year}-{suffix}"


# ── Extraction Prompt for Spoken Utterances ───────────────────────────────────

_VOICE_EXTRACT_SYSTEM_PROMPT = """You are the Voice Intelligence Assistant for CivicResolve AI.
Your job is to analyze a spoken conversational turn from a citizen during a municipal helpline phone call.

Extract the following information from the user's message and context in strict JSON format:
{
  "problem": "<extracted problem description, or null if not mentioned>",
  "location": "<extracted street/area/road, or null if not mentioned>",
  "landmark": "<extracted landmark/building, or null if not mentioned>",
  "is_confirmation": <true if user says yes/confirm/submit/go ahead/okay/sure, false if user says no/cancel/stop, null if neither>,
  "conversational_reply": "<a short, warm, polite 1-2 sentence spoken reply to say over the phone>"
}

Rules:
1. Return ONLY valid JSON. No markdown, no commentary.
2. Keep conversational_reply concise, polite, and suitable for Text-to-Speech over the phone.
3. Do not invent details not stated by the citizen.
"""


def _call_llm_voice_extract(user_message: str, current_stage: str, extracted_so_far: dict) -> Optional[dict]:
    """Call Ollama Qwen2.5:3B to extract conversational intent and entities."""
    try:
        from llm import OLLAMA_BASE_URL, OLLAMA_MODEL
        import urllib.request

        context_info = f"Current Stage: {current_stage}\nKnown Data: {json.dumps(extracted_so_far)}\nCitizen Spoke: \"{user_message}\""
        payload = json.dumps({
            "model": OLLAMA_MODEL,
            "prompt": f"{_VOICE_EXTRACT_SYSTEM_PROMPT}\n\nContext:\n{context_info}\n\nResponse JSON:",
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

        with urllib.request.urlopen(req, timeout=6) as resp:
            body = resp.read().decode("utf-8")
            data = json.loads(body)
            raw = data.get("response", "").strip()

            # Extract JSON
            start = raw.find("{")
            end = raw.rfind("}") + 1
            if start != -1 and end > start:
                return json.loads(raw[start:end])
    except Exception as exc:
        logger.warning("Voice LLM extraction fallback triggered: %s", exc)
    return None


def _is_negative(text: str) -> bool:
    cleaned = re.sub(r"[^\w\s]", " ", text.lower()).strip()
    words = cleaned.split()
    negative_words = {"no", "nope", "cancel", "stop", "dont", "don't", "wait", "not", "wrong", "change", "nahi", "never"}
    if any(w in words for w in negative_words):
        return True
    return False


def _is_affirmative(text: str) -> bool:
    if _is_negative(text):
        return False
    cleaned = re.sub(r"[^\w\s]", " ", text.lower()).strip()
    words = cleaned.split()
    affirmative_words = {
        "yes", "yeah", "yep", "yup", "sure", "ok", "okay", "submit", "please",
        "confirm", "go ahead", "do it", "proceed", "correct", "right", "fine",
        "ha", "haan"
    }
    return any(w in words for w in affirmative_words) or ("submit" in words and "don't" not in text and "dont" not in text)


def _save_complaint_to_db(
    description: str,
    location: str,
    landmark: Optional[str],
    citizen_id: Optional[int],
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
) -> dict:
    """Run the real AI agent analysis and store the complaint into SQLite."""
    # 1. Run authoritative AI Agent
    ai = run_analysis(
        description=description,
        location_text=location,
        latitude=latitude,
        longitude=longitude,
    )

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
            # Initial timeline updates
            conn.execute(
                "INSERT INTO complaint_updates (complaint_id, status, message, updated_by) VALUES (?, ?, ?, ?);",
                (complaint_id, "Submitted", "Complaint registered via AI Voice Helpline.", "voice-bot"),
            )
            conn.execute(
                "INSERT INTO complaint_updates (complaint_id, status, message, updated_by) VALUES (?, ?, ?, ?);",
                (complaint_id, "AI_Analysis", f"Voice AI classified: {ai['category']} | Priority: {ai['priority']} | Routed to: {ai['department_name']}", "ai-agent"),
            )

        row = conn.execute("SELECT * FROM complaints WHERE id = ?;", (complaint_id,)).fetchone()
        res = dict(row)
        res["department_name"] = ai["department_name"]
        res["assigned_team"] = ai["assigned_team"]
        return res
    finally:
        conn.close()


def process_voice_call_turn(
    message: str,
    stage: str,
    extracted_data: dict,
    citizen_id: Optional[int] = None,
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
) -> dict:
    """
    Main Voice Bot turn processor.
    Returns:
    {
      "reply_text": str,
      "stage": str,
      "extracted_data": dict,
      "action": "speak" | "listen" | "confirm" | "completed" | "ended",
      "complaint": Optional[dict]
    }
    """
    msg = message.strip()
    data = dict(extracted_data)

    # ── Initial Call Greeting ──────────────────────────────────────────────────
    if stage == "greeting" or msg == "__START__":
        return {
            "reply_text": "Hello! You have reached CivicResolve AI Municipal Helpline. Please describe the civic issue you would like to report.",
            "stage": "problem",
            "extracted_data": data,
            "action": "speak",
            "complaint": None,
        }

    # ── Tracking / Status Query via Voice ──────────────────────────────────────
    id_match = re.search(r"CR-\d{4}-\d{4,8}", msg, re.IGNORECASE)
    is_track_query = bool(id_match) or any(w in msg.lower() for w in ["track", "where is my complaint", "status of my complaint", "status of complaint", "check my complaint", "check status"])
    if is_track_query and stage != "confirm":
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
                c_loc = target_complaint.get("location", "the reported sector")
                
                reply = (
                    f"I located Complaint ID {c_num}. "
                    f"This {c_cat} report at {c_loc} is currently in {c_stat} status, "
                    f"assigned to {c_dept}. "
                    f"Would you like to report another issue or track another ticket?"
                )
                return {
                    "reply_text": reply,
                    "stage": "tracking",
                    "extracted_data": data,
                    "action": "speak",
                    "complaint": target_complaint,
                }
            elif id_match:
                return {
                    "reply_text": f"I searched the municipal database, but could not find Complaint ID {id_match.group(0).upper()}. Please state your complaint number again or describe a problem you wish to report.",
                    "stage": "problem",
                    "extracted_data": data,
                    "action": "speak",
                    "complaint": None,
                }
        finally:
            conn.close()

    # ── Stage 1: Problem Description ──────────────────────────────────────────
    if stage in ("problem", "tracking"):
        if not msg:
            return {
                "reply_text": "I'm listening. Please describe what problem you are observing in your area.",
                "stage": "problem",
                "extracted_data": data,
                "action": "speak",
                "complaint": None,
            }

        # Try LLM extraction
        llm_out = _call_llm_voice_extract(msg, stage, data)
        problem_text = msg
        location_in_msg = None
        landmark_in_msg = None

        if llm_out:
            if llm_out.get("problem"):
                problem_text = str(llm_out["problem"])
            location_in_msg = llm_out.get("location")
            landmark_in_msg = llm_out.get("landmark")

        # Classify category and priority using real engines
        category = classify(problem_text)
        priority = detect_priority(problem_text)
        dept_id, dept_name = get_department_for_category(category)

        data["description"] = problem_text
        data["category"] = category
        data["priority"] = priority
        data["department"] = dept_name

        # If location was already stated in the same sentence
        if location_in_msg and len(str(location_in_msg)) > 2:
            data["location"] = str(location_in_msg)
            if landmark_in_msg:
                data["landmark"] = str(landmark_in_msg)
                # Skip straight to confirmation
                cat_label = category if category != "Other" else "civic"
                return {
                    "reply_text": f"I have noted a {cat_label} report for {data['description']} at {data['location']}, near {data['landmark']}. Would you like me to submit this official complaint now?",
                    "stage": "confirm",
                    "extracted_data": data,
                    "action": "confirm",
                    "complaint": None,
                }
            else:
                return {
                    "reply_text": f"I have noted a {category} report for {problem_text} at {data['location']}. Are there any nearby landmarks or extra details to help our team locate it?",
                    "stage": "landmark",
                    "extracted_data": data,
                    "action": "speak",
                    "complaint": None,
                }

        # Location not yet provided -> Ask for location
        cat_desc = f"{category} problem" if category != "Other" else "issue"
        return {
            "reply_text": f"I understand. I have noted this {cat_desc}. Where is this problem located? Please tell me the street, road, or area name.",
            "stage": "location",
            "extracted_data": data,
            "action": "speak",
            "complaint": None,
        }

    # ── Stage 2: Location ─────────────────────────────────────────────────────
    if stage == "location":
        if not msg:
            return {
                "reply_text": "Please tell me the location or address where this issue is located.",
                "stage": "location",
                "extracted_data": data,
                "action": "speak",
                "complaint": None,
            }

        # Clean location
        clean_loc = msg
        llm_out = _call_llm_voice_extract(msg, stage, data)
        if llm_out and llm_out.get("location"):
            clean_loc = str(llm_out["location"])

        data["location"] = clean_loc

        return {
            "reply_text": f"Got it, {clean_loc}. Are there any nearby landmarks or additional details to help our field team?",
            "stage": "landmark",
            "extracted_data": data,
            "action": "speak",
            "complaint": None,
        }

    # ── Stage 3: Landmark / Details ───────────────────────────────────────────
    if stage == "landmark":
        if msg and not _is_negative(msg) and msg.lower() not in ["none", "no", "nothing", "no landmark", "na"]:
            data["landmark"] = msg
        else:
            data["landmark"] = None

        # Build summary for confirmation
        category = data.get("category", "Civic")
        desc = data.get("description", "Reported issue")
        loc = data.get("location", "Specified location")
        lmk = data.get("landmark")

        landmark_phrase = f", near {lmk}" if lmk else ""
        return {
            "reply_text": f"Thank you. I have summarized your {category} report for {desc} at {loc}{landmark_phrase}. Would you like me to submit this official complaint now?",
            "stage": "confirm",
            "extracted_data": data,
            "action": "confirm",
            "complaint": None,
        }

    # ── Stage 4: Confirmation & Registration ──────────────────────────────────
    if stage == "confirm":
        # Check if citizen confirmed
        if _is_affirmative(msg):
            # Save the complaint via the real backend AI pipeline
            desc = data.get("description", "Civic issue reported via Voice Bot.")
            loc = data.get("location", "Reported location")
            lmk = data.get("landmark")

            saved_complaint = _save_complaint_to_db(
                description=desc,
                location=loc,
                landmark=lmk,
                citizen_id=citizen_id,
                latitude=latitude,
                longitude=longitude,
            )

            cid = saved_complaint["complaint_number"]
            # Spaced out complaint ID for clear speech synthesis (e.g. "C-R-2026-1-2-3-4-5-6")
            cid_spaced = " ".join(cid.replace("-", " dash "))
            dept = saved_complaint.get("department", "Municipal Department")
            prio = saved_complaint.get("priority", "Medium")

            reply = (
                f"Your complaint has been successfully registered! Your official Complaint ID is {cid}. "
                f"It has been routed to the {dept} with {prio} priority. "
                f"You can track this anytime on our portal. Thank you for calling CivicResolve AI!"
            )

            return {
                "reply_text": reply,
                "stage": "submitted",
                "extracted_data": data,
                "action": "completed",
                "complaint": saved_complaint,
            }

        elif _is_negative(msg):
            return {
                "reply_text": "Understood. The complaint has been cancelled and was not submitted. Is there anything else I can help you with?",
                "stage": "problem",
                "extracted_data": {},
                "action": "speak",
                "complaint": None,
            }
        else:
            return {
                "reply_text": "Please say yes to confirm and register this complaint, or say no to cancel.",
                "stage": "confirm",
                "extracted_data": data,
                "action": "confirm",
                "complaint": None,
            }

    # ── Already Submitted Stage ───────────────────────────────────────────────
    if stage == "submitted":
        if _is_affirmative(msg) or "new" in msg.lower() or "another" in msg.lower() or "report" in msg.lower():
            return {
                "reply_text": "Sure! Please describe the next civic issue you would like to report.",
                "stage": "problem",
                "extracted_data": {},
                "action": "speak",
                "complaint": None,
            }
        return {
            "reply_text": "Your complaint has already been submitted. You can view it on the Track page using your Complaint ID. Have a great day!",
            "stage": "submitted",
            "extracted_data": data,
            "action": "ended",
            "complaint": None,
        }

    return {
        "reply_text": "I'm here to help. Please describe the problem you are facing.",
        "stage": "problem",
        "extracted_data": data,
        "action": "speak",
        "complaint": None,
    }
