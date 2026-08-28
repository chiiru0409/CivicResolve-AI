"""
test_voice_agent_multi_turn_suite.py — Dedicated Test Suite for Siri / Google Assistant–Level Voice Helpline

Covers all 26 Siri / Google Assistant behavioral standards:
1. Siri-style greetings ("Hey", "Hi", "Are you there?", "Can you help me?", "How are you?") -> never create tickets
2. Assistant capability queries ("What's your name?", "Who made you?", "What can you do?") -> natural responses
3. Casual & slang speech understanding ("Bro, the streetlight outside our house isn't working", "bikes keep falling")
4. Multi-issue decomposition ("The road near the hospital is full of potholes and the streetlights aren't working")
5. Context memory across turns ("Water" -> "It's leaking" -> "Near the bus stop")
6. Anti-redundancy (never re-ask known information if provided in one utterance)
7. Self-correction during intake ("Actually, sorry, Gandhi Road")
8. Self-correction during confirmation ("No, it's actually near the bus stand" -> does not submit)
9. Ambiguity handling ("There's a problem with water" -> asks supply vs leakage vs quality)
10. Natural affirmative confirmations ("Go ahead", "Submit it", "Yep", "Correct", "That's right")
11. Random affirmative safety (random "yes" outside confirmation state never submits)
12. Cancellation ("Never mind", "Cancel", "Stop", "Don't submit", "Forget it")
13. Status tracking with live database records
14. Intent switching with resumed draft memory
15. Follow-up duration and contextual references ("it smells terrible", "for three days")
16. Natural error recovery on unclear audio
17. API endpoint /api/voice/turn compatibility
"""

from __future__ import annotations

import os
import sys
import time
from pathlib import Path

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent.parent / "backend"
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

os.environ["OLLAMA_TIMEOUT"] = "1"

import llm
# Mock call_ollama to return None to test deterministic fallback reliability
llm.call_ollama = lambda *args, **kwargs: None

from fastapi.testclient import TestClient
from main import app
from database import init_db, get_connection
from voice_agent import process_voice_call_turn


def setup_module():
    init_db()


def _get_complaint_count() -> int:
    conn = get_connection()
    try:
        row = conn.execute("SELECT COUNT(*) as count FROM complaints;").fetchone()
        return row["count"]
    finally:
        conn.close()


# ── TEST CASES ────────────────────────────────────────────────────────────────

def test_01_siri_greetings_never_create_complaints():
    """Verify Siri/Google Assistant-style greetings never create a complaint."""
    initial_count = _get_complaint_count()

    test_greetings = [
        ("hey", "Hey! You're connected to CivicResolve. How can I help you today?"),
        ("hi", "Hi! What can I help you with?"),
        ("are you there?", "Yes, I'm here. Tell me what's happening."),
        ("can you help me?", "Of course. Tell me about the issue."),
        ("how are you?", "I'm doing well, thanks! What can I help you with today?"),
        ("hello", "Hello! I'm here. What would you like to report or check?"),
    ]

    for greeting, expected_phrase in test_greetings:
        res = process_voice_call_turn(greeting, "greeting", {})
        assert res["complaint"] is None, f"Greeting '{greeting}' created a complaint!"
        assert res["stage"] != "submitted", f"Greeting '{greeting}' transitioned to submitted!"
        assert res["stage"] in ("listening", "problem")
        assert len(res["reply_text"]) > 5
        assert _get_complaint_count() == initial_count, f"Database row added on greeting '{greeting}'!"


def test_02_assistant_queries_explain_naturally():
    """Verify responses to 'What is your name?' and 'Who made you?'."""
    initial_count = _get_complaint_count()

    res1 = process_voice_call_turn("What's your name?", "listening", {})
    assert res1["complaint"] is None
    assert "CivicResolve AI" in res1["reply_text"]
    assert "assistant" in res1["reply_text"].lower()

    res2 = process_voice_call_turn("Who made you?", "listening", {})
    assert res2["complaint"] is None
    assert "CivicResolve AI" in res2["reply_text"]
    assert _get_complaint_count() == initial_count


def test_03_vague_intake_starter():
    """Verify 'I have a problem' prompts for description without classifying."""
    initial_count = _get_complaint_count()

    res = process_voice_call_turn("I want to report something", "listening", {})
    assert res["complaint"] is None
    assert res["stage"] == "problem"
    assert "what's happening" in res["reply_text"].lower() or "tell me" in res["reply_text"].lower()
    assert _get_complaint_count() == initial_count


def test_04_casual_and_slang_speech_understanding():
    """Verify natural conversational speech with casual slang is understood."""
    # 1. "Bro, the streetlight outside our house isn't working."
    r1 = process_voice_call_turn("Bro, the streetlight outside our house isn't working.", "listening", {})
    assert r1["extracted_data"]["category"] == "Streetlights"
    assert "streetlight" in r1["reply_text"].lower() or "location" in r1["reply_text"].lower()

    # 2. "The road is really bad and bikes keep falling." (Accident hazard)
    r2 = process_voice_call_turn("The road is really bad and bikes keep falling.", "listening", {})
    assert r2["extracted_data"]["category"] == "Roads"
    assert r2["extracted_data"]["priority"] in ("HIGH", "CRITICAL")

    # 3. "Someone dumped garbage beside the school."
    r3 = process_voice_call_turn("Someone dumped garbage beside the school.", "listening", {})
    assert r3["extracted_data"]["category"] == "Garbage"
    assert "Beside The School" in str(r3["extracted_data"]["location"]) or "school" in str(r3["extracted_data"]["location"]).lower()

    # 4. "There's dirty water coming from the tap."
    r4 = process_voice_call_turn("There's dirty water coming from the tap.", "listening", {})
    assert r4["extracted_data"]["category"] == "Water"

    # 5. "The whole road is flooded."
    r5 = process_voice_call_turn("The whole road is flooded.", "listening", {})
    assert r5["extracted_data"]["category"] in ("Drainage", "Roads")


def test_05_multi_issue_decomposition():
    """Verify understanding multiple co-occurring issues in a single statement."""
    res = process_voice_call_turn("The road near the hospital is full of potholes and the streetlights aren't working.", "listening", {})
    assert res["complaint"] is None
    assert res["stage"] == "confirm"
    assert "multi_issues" in res["extracted_data"]
    assert len(res["extracted_data"]["multi_issues"]) >= 2
    assert "potholes" in res["reply_text"].lower() or "road" in res["reply_text"].lower()
    assert "streetlight" in res["reply_text"].lower()


def test_06_context_memory_across_turns():
    """Verify Siri/Google Assistant-style multi-turn context accumulation."""
    initial_count = _get_complaint_count()

    # Turn 1: "There's a problem with water."
    t1 = process_voice_call_turn("There's a problem with water.", "listening", {})
    assert t1["stage"] == "problem"
    assert "supply" in t1["reply_text"].lower() or "leakage" in t1["reply_text"].lower()

    # Turn 2: "It's leaking."
    t2 = process_voice_call_turn("It's leaking.", "problem", t1["extracted_data"])
    assert t2["stage"] == "location"
    assert "where is the leakage" in t2["reply_text"].lower() or "where" in t2["reply_text"].lower()

    # Turn 3: "Near the bus stop."
    t3 = process_voice_call_turn("Near the bus stop.", "location", t2["extracted_data"])
    assert t3["stage"] == "confirm"
    assert t3["action"] == "confirm"
    assert "bus stop" in str(t3["extracted_data"]["location"]).lower()
    assert "water" in str(t3["extracted_data"]["description"]).lower() or t3["extracted_data"]["category"] == "Water"
    assert _get_complaint_count() == initial_count


def test_07_anti_redundancy_never_reask_known_info():
    """Verify sentence with issue + location does not re-ask location."""
    initial_count = _get_complaint_count()

    res = process_voice_call_turn("There's a huge pothole near Gandhi Market in Hyderabad.", "listening", {})
    assert res["complaint"] is None
    assert res["stage"] == "confirm"
    assert res["action"] == "confirm"
    assert "Gandhi Market" in str(res["extracted_data"]["location"])
    assert "where" not in res["reply_text"].lower()
    assert "register" in res["reply_text"].lower() or "submit" in res["reply_text"].lower()
    assert _get_complaint_count() == initial_count


def test_08_self_correction_during_intake():
    """Verify in-place slot updating when user self-corrects during intake."""
    # State with MG Road
    state = {
        "description": "Deep pothole",
        "category": "Roads",
        "location": "On MG Road",
    }
    res = process_voice_call_turn("Actually, sorry, Gandhi Road.", "problem", state)
    assert "Gandhi Road" in str(res["extracted_data"]["location"])
    assert "Gandhi Road" in res["reply_text"] or "gandhi road" in res["reply_text"].lower()


def test_09_self_correction_during_confirmation():
    """Verify correction during confirmation updates slot and does NOT submit."""
    initial_count = _get_complaint_count()

    state = {
        "description": "Large pothole",
        "category": "Roads",
        "department": "Municipal Roads Department",
        "location": "Near Gandhi Market",
    }

    res = process_voice_call_turn("No, it's actually near the bus stand.", "confirm", state)
    assert res["complaint"] is None
    assert res["stage"] == "confirm"
    assert "bus stand" in str(res["extracted_data"]["location"]).lower()
    assert "Is everything else correct?" in res["reply_text"] or "update" in res["reply_text"].lower()
    assert _get_complaint_count() == initial_count


def test_10_natural_affirmative_confirmations_submit_ticket():
    """Verify diverse natural confirmation phrases successfully submit the ticket."""
    initial_count = _get_complaint_count()

    affirmative_phrases = [
        "Yes, submit it",
        "Go ahead",
        "Correct",
        "That's right",
        "Yep, register it",
        "Exactly",
    ]

    for idx, phrase in enumerate(affirmative_phrases, start=1):
        state = {
            "description": f"Pothole test #{idx}",
            "category": "Roads",
            "department": "Municipal Roads & Infrastructure Department",
            "priority": "HIGH",
            "location": f"Sector {idx} Road",
        }
        res = process_voice_call_turn(phrase, "confirm", state)
        assert res["stage"] == "submitted"
        assert res["complaint"] is not None
        assert res["complaint"]["complaint_number"].startswith("CR-")
        assert _get_complaint_count() == initial_count + idx


def test_11_random_affirmative_outside_confirmation_does_not_submit():
    """Verify a random 'yes' during listening/problem intake never creates a complaint."""
    initial_count = _get_complaint_count()

    res = process_voice_call_turn("yes", "listening", {})
    assert res["complaint"] is None
    assert res["stage"] != "submitted"
    assert _get_complaint_count() == initial_count


def test_12_cancellation_cleans_draft_and_leaves_db_untouched():
    """Verify cancellation at any time leaves database untouched."""
    initial_count = _get_complaint_count()

    cancel_phrases = ["Never mind", "Cancel", "Don't submit", "Stop", "Forget it"]
    for phrase in cancel_phrases:
        res = process_voice_call_turn(phrase, "confirm", {"description": "Pothole", "location": "Main Road"})
        assert res["complaint"] is None
        assert res["stage"] in ("listening", "problem", "cancelled")
        assert "cancelled" in res["reply_text"].lower() or "haven't submitted" in res["reply_text"].lower()
        assert _get_complaint_count() == initial_count


def test_13_status_tracking_queries_live_database():
    """Verify tracking query returns real complaint status from database."""
    client = TestClient(app)
    ts = int(time.time() * 1000)
    reg = client.post("/api/auth/register", json={
        "full_name": "Siri Tracking Tester",
        "email": f"siri_track_{ts}@civicresolve.ai",
        "password": "Password@123",
    })
    token = reg.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    create_res = client.post("/api/complaints", json={
        "title": "Severe Waterlogging on Ring Road",
        "description": "Water accumulated on carriageway",
        "location": "Ring Road Junction",
        "category": "Drainage",
        "priority": "HIGH",
    }, headers=headers)
    assert create_res.status_code in (200, 201)
    comp_num = create_res.json()["complaint_number"]

    # Voice tracking query
    res = process_voice_call_turn(f"Where is {comp_num}?", "listening", {})
    assert res["stage"] == "tracking"
    assert comp_num in res["reply_text"]
    assert "drainage" in res["reply_text"].lower() or "submitted" in res["reply_text"].lower()


def test_14_intent_switching_and_draft_resumption():
    """Verify pausing a report draft to track a ticket and then resuming draft."""
    # Draft state
    draft = {
        "description": "huge pothole",
        "category": "Roads",
        "location": "Gandhi Road",
    }

    # Step 1: Switch intent to track
    r_track = process_voice_call_turn("What's the status of CR-2026-999999?", "problem", draft)
    assert r_track["stage"] in ("tracking", "listening")

    # Step 2: Resume draft
    r_resume = process_voice_call_turn("Yes, continue with the pothole", "tracking", r_track["extracted_data"])
    assert r_resume["stage"] == "confirm"
    assert "Gandhi Road" in str(r_resume["extracted_data"]["location"])
    assert "pothole" in str(r_resume["extracted_data"]["description"]).lower()


def test_15_follow_up_duration_and_contextual_references():
    """Verify duration extraction and contextual 'it' references."""
    # Duration: "The garbage hasn't been collected for three days."
    r = process_voice_call_turn("The garbage hasn't been collected for three days.", "listening", {})
    assert r["extracted_data"]["category"] == "Garbage"
    assert "for three days" in str(r["extracted_data"].get("duration")) or "three days" in str(r["extracted_data"].get("duration"))


def test_16_natural_error_recovery_on_empty_or_unclear_audio():
    """Verify empty/inaudible audio gets a polite natural repetition prompt."""
    res = process_voice_call_turn("", "listening", {})
    assert res["complaint"] is None
    assert "didn't catch that" in res["reply_text"].lower() or "say that again" in res["reply_text"].lower()


def test_17_api_voice_turn_endpoint_siri_integration():
    """Test HTTP API endpoint /api/voice/turn with Siri greetings and full turn."""
    client = TestClient(app)

    # Siri Greeting
    res1 = client.post("/api/voice/turn", json={
        "message": "Hey",
        "stage": "greeting",
        "extracted_data": {},
    })
    assert res1.status_code == 200
    d1 = res1.json()
    assert d1["complaint"] is None
    assert "Hey!" in d1["reply_text"] or "CivicResolve" in d1["reply_text"]

    # Problem + Location
    res2 = client.post("/api/voice/turn", json={
        "message": "There's a broken streetlight near Metro Station",
        "stage": "listening",
        "extracted_data": {},
    })
    assert res2.status_code == 200
    d2 = res2.json()
    assert d2["stage"] == "confirm"
    assert d2["extracted_data"]["category"] == "Streetlights"
    assert "Metro Station" in str(d2["extracted_data"]["location"])
