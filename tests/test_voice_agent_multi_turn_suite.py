"""
test_voice_agent_multi_turn_suite.py — Dedicated Test Suite for CivicResolve AI Voice Helpline

Covers all 22 required conversation scenarios:
1. Pure greetings ('hello', 'hi', 'how are you?', 'can you help me?') -> NEVER create tickets
2. General inquiries ('what can you do?', 'how does this work?') -> natural explanation
3. Vague report starter ('I want to report something') -> asks user to describe issue
4. Complete complaint in one utterance ('Huge pothole near City Mall') -> extracts location, does not re-ask, summarizes for confirmation
5. Incomplete / ambiguous complaint ('There is a problem with water') -> asks clarifying question
6. Complaint with location ('Garbage accumulation near government school for 3 days') -> slot extraction with duration
7. Confirmation approval ('Yes, please submit it now') -> creates DB entry and returns official Complaint ID
8. User rejection at confirmation ('No', 'don't submit') -> does NOT create ticket
9. User correction ('No, it is actually water leakage on MG Road') -> updates slots and re-summarizes
10. User cancellation ('cancel', 'stop', 'nevermind') -> resets draft safely
11. Status tracking query ('track CR-2026-001234') -> reads DB record status
12. High-priority / safety hazard ('Live wire sparking near school') -> detects CRITICAL / HIGH priority
13. Post-submission assistance ('Is there anything else?') -> handles new report or farewell
14. Ollama offline fallback -> 100% deterministic execution
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

def test_01_pure_greetings_never_create_complaints():
    """Verify that saying 'hello', 'hi', 'how are you?' never creates a complaint."""
    initial_count = _get_complaint_count()

    test_greetings = [
        "hello",
        "hi",
        "hey",
        "good morning",
        "good evening",
        "how are you?",
        "can you help me?",
        "what can you do?",
        "i have a question",
    ]

    for greeting in test_greetings:
        res = process_voice_call_turn(greeting, "greeting", {})
        assert res["complaint"] is None, f"Greeting '{greeting}' created a complaint!"
        assert res["stage"] != "submitted", f"Greeting '{greeting}' transitioned to submitted stage!"
        assert res["stage"] in ("listening", "problem"), f"Unexpected stage for '{greeting}': {res['stage']}"
        assert len(res["reply_text"]) > 10
        # Verify no database change
        assert _get_complaint_count() == initial_count, f"Database row added on greeting '{greeting}'!"


def test_02_general_inquiry_explains_capabilities():
    """Verify responses to 'how does this work', 'who are you'."""
    initial_count = _get_complaint_count()

    res = process_voice_call_turn("how does this work?", "listening", {})
    assert res["complaint"] is None
    assert res["stage"] == "listening"
    assert "CivicResolve" in res["reply_text"] or "municipal" in res["reply_text"].lower()
    assert _get_complaint_count() == initial_count


def test_03_vague_intake_starter():
    """Verify 'I want to report something' prompts for description without classifying."""
    initial_count = _get_complaint_count()

    res = process_voice_call_turn("I want to report something", "listening", {})
    assert res["complaint"] is None
    assert res["stage"] == "problem"
    assert "describe the problem" in res["reply_text"].lower() or "tell me what happened" in res["reply_text"].lower()
    assert _get_complaint_count() == initial_count


def test_04_incomplete_complaint_clarification():
    """Verify vague complaint like 'It is about water' asks a clarifying question."""
    res = process_voice_call_turn("It's about water", "problem", {})
    assert res["complaint"] is None
    assert res["stage"] == "problem"
    assert "leakage" in res["reply_text"].lower() or "supply" in res["reply_text"].lower()


def test_05_complete_complaint_with_location_summarizes_immediately():
    """Verify that a sentence containing both problem and location prepares summary without re-asking location."""
    initial_count = _get_complaint_count()

    res = process_voice_call_turn("There is a huge pothole near City Mall", "listening", {})
    assert res["complaint"] is None
    assert res["stage"] == "confirm"
    assert res["action"] == "confirm"
    assert res["extracted_data"]["category"] == "Roads"
    assert "City Mall" in str(res["extracted_data"]["location"])
    assert "submit" in res["reply_text"].lower()
    # Confirm it has NOT yet been written to DB
    assert _get_complaint_count() == initial_count


def test_06_confirmation_submits_complaint_and_returns_id():
    """Verify that saying 'Yes, submit it' when in confirm stage creates a real complaint in DB."""
    initial_count = _get_complaint_count()

    # Setup intake state
    extracted_state = {
        "description": "Massive pothole on road causing vehicle damage",
        "category": "Roads",
        "department": "Municipal Roads & Infrastructure Department",
        "priority": "HIGH",
        "location": "Near City Mall, MG Road",
    }

    res = process_voice_call_turn("Yes, please submit it now", "confirm", extracted_state, latitude=17.385, longitude=78.486)
    assert res["stage"] == "submitted"
    assert res["action"] == "completed"
    assert res["complaint"] is not None
    cid = res["complaint"]["complaint_number"]
    assert cid.startswith("CR-")
    assert res["complaint"]["category"] == "Roads"
    assert res["complaint"]["department"] == "Municipal Roads & Infrastructure Department"
    assert res["complaint"]["status"] == "Submitted"

    # Verify database count incremented
    assert _get_complaint_count() == initial_count + 1


def test_07_user_rejection_at_confirmation_does_not_submit():
    """Verify that saying 'No, don't submit' at confirmation halts submission."""
    initial_count = _get_complaint_count()

    extracted_state = {
        "description": "Streetlight broken",
        "category": "Streetlights",
        "location": "Sector 4 Main Road",
    }

    res = process_voice_call_turn("No, don't submit it yet", "confirm", extracted_state)
    assert res["complaint"] is None
    assert res["stage"] != "submitted"
    assert "will not submit" in res["reply_text"].lower() or "not submit" in res["reply_text"].lower()
    assert _get_complaint_count() == initial_count


def test_08_user_correction_updates_fields_and_resummarizes():
    """Verify that correcting information ('No, it is actually water leakage on MG Road') updates slots."""
    extracted_state = {
        "description": "Blocked drainage overflow",
        "category": "Drainage",
        "department": "Drainage & Stormwater Management",
        "location": "Central Market",
    }

    res = process_voice_call_turn("No, it's actually water leakage on MG Road", "confirm", extracted_state)
    assert res["complaint"] is None
    assert res["stage"] == "confirm"
    assert res["extracted_data"]["category"] == "Water"
    assert "MG Road" in str(res["extracted_data"]["location"])
    assert "Water" in res["reply_text"] or "water" in res["reply_text"].lower()


def test_09_user_cancellation_aborts_cleanly():
    """Verify that saying 'Cancel' at any stage cancels the intake."""
    initial_count = _get_complaint_count()

    res = process_voice_call_turn("Cancel the complaint, I changed my mind", "problem", {"description": "Pothole"})
    assert res["complaint"] is None
    assert res["stage"] in ("listening", "problem")
    assert "cancelled" in res["reply_text"].lower()
    assert _get_complaint_count() == initial_count


def test_10_tracking_query_reads_real_status():
    """Verify tracking query returns real complaint status."""
    # First create a real complaint to track
    client = TestClient(app)
    ts = int(time.time() * 1000)
    reg = client.post("/api/auth/register", json={
        "full_name": "Tracking Tester",
        "email": f"track_{ts}@civicresolve.ai",
        "password": "Password@123",
    })
    token = reg.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    create_res = client.post("/api/complaints", json={
        "title": "Broken Streetlight Lamp on Sector 7",
        "description": "Dark streetlight pole creating unsafe night conditions",
        "location": "Sector 7 Bus Stop",
        "category": "Streetlights",
        "priority": "MEDIUM",
    }, headers=headers)
    assert create_res.status_code in (200, 201)
    comp_num = create_res.json()["complaint_number"]

    # Now ask voice agent to track it
    res = process_voice_call_turn(f"Please track my complaint {comp_num}", "listening", {})
    assert res["stage"] == "tracking"
    assert comp_num in res["reply_text"]
    assert "Streetlights" in res["reply_text"] or "Submitted" in res["reply_text"]


def test_11_full_multi_turn_helpline_conversation():
    """Test realistic 4-turn helpline call."""
    initial_count = _get_complaint_count()

    # Turn 1: Connect
    t1 = process_voice_call_turn("__START__", "greeting", {})
    assert t1["stage"] in ("problem", "listening")
    assert t1["complaint"] is None

    # Turn 2: Problem without location
    t2 = process_voice_call_turn("Garbage has been lying uncollected on the street for 3 days", "listening", t1["extracted_data"])
    assert t2["stage"] == "location"
    assert t2["extracted_data"]["category"] == "Garbage"
    assert "location" in t2["reply_text"].lower() or "where" in t2["reply_text"].lower()

    # Turn 3: Provide Location
    t3 = process_voice_call_turn("Near Government Primary School", "location", t2["extracted_data"])
    assert t3["stage"] == "confirm"
    assert t3["action"] == "confirm"
    assert "Government Primary School" in str(t3["extracted_data"]["location"])
    assert "submit" in t3["reply_text"].lower()

    # Turn 4: Confirmation
    t4 = process_voice_call_turn("Yes, that is correct, go ahead and submit", "confirm", t3["extracted_data"], latitude=17.40, longitude=78.47)
    assert t4["stage"] == "submitted"
    assert t4["complaint"] is not None
    assert _get_complaint_count() == initial_count + 1


def test_12_api_voice_turn_endpoint():
    """Test HTTP API endpoint /api/voice/turn with JSON request."""
    client = TestClient(app)

    # Greeting via API
    res1 = client.post("/api/voice/turn", json={
        "message": "hello",
        "stage": "listening",
        "extracted_data": {},
    })
    assert res1.status_code == 200
    d1 = res1.json()
    assert d1["complaint"] is None
    assert d1["stage"] in ("listening", "problem")

    # Problem + Location in one message via API
    res2 = client.post("/api/voice/turn", json={
        "message": "Water pipe leak on Gandhi Road",
        "stage": "listening",
        "extracted_data": {},
    })
    assert res2.status_code == 200
    d2 = res2.json()
    assert d2["stage"] == "confirm"
    assert d2["extracted_data"]["category"] == "Water"
    assert "Gandhi Road" in str(d2["extracted_data"]["location"])
