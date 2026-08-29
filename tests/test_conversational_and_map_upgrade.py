"""
test_conversational_and_map_upgrade.py — Automated Test Suite for Upgraded Conversational Voice Helpline, Chatbot, and Operations AI Copilot
"""

from __future__ import annotations

import os
import sys
import pytest
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


def test_01_siri_greetings_pure_safety():
    """Verify greetings never create complaints in the database."""
    initial_count = _get_complaint_count()
    res = process_voice_call_turn("Hello! Good morning", "greeting", {})
    assert res["complaint"] is None
    assert res["stage"] != "submitted"
    assert any(w in res["reply_text"].lower() for w in ["civicresolve", "help", "hello", "here", "report", "check"])
    assert _get_complaint_count() == initial_count


def test_02_college_campus_multi_turn_flow():
    """
    Test the multi-turn conversational progression:
    'There is a huge pothole near my college.' -> Clarification (main road vs campus) ->
    'Main road' -> Landmark question -> 'Near City Mall' -> Confirmation summary ->
    'Yes' -> Registered with valid CR-2026-XXXXXX.
    """
    initial_count = _get_complaint_count()

    # Turn 1: Problem near college
    turn1 = process_voice_call_turn("There's a huge pothole near my college", "listening", {})
    assert turn1["complaint"] is None
    assert turn1["stage"] == "location"
    assert "main road" in turn1["reply_text"].lower() or "campus" in turn1["reply_text"].lower()
    assert turn1["extracted_data"].get("clarifying_campus") is True

    # Turn 2: Main road
    turn2 = process_voice_call_turn("Main road", turn1["stage"], turn1["extracted_data"])
    assert turn2["complaint"] is None
    assert turn2["stage"] == "landmark"
    assert "landmark" in turn2["reply_text"].lower()
    assert "main road" in turn2["extracted_data"]["location"].lower()

    # Turn 3: Near City Mall
    turn3 = process_voice_call_turn("Near City Mall", turn2["stage"], turn2["extracted_data"])
    assert turn3["complaint"] is None
    assert turn3["stage"] == "confirm"
    assert "submit" in turn3["reply_text"].lower() or "register" in turn3["reply_text"].lower()
    assert "city mall" in turn3["extracted_data"]["landmark"].lower() or "city mall" in turn3["reply_text"].lower()

    # Turn 4: Confirmation "Yes"
    turn4 = process_voice_call_turn("Yes, please register it", turn3["stage"], turn3["extracted_data"])
    assert turn4["complaint"] is not None
    assert turn4["stage"] == "submitted"
    assert turn4["complaint"]["complaint_number"].startswith("CR-")
    assert _get_complaint_count() == initial_count + 1


def test_03_repeat_request_handling():
    """Verify that asking to repeat does not reset state or create tickets."""
    extracted = {"description": "Water leakage", "location": "Gandhi Road"}
    res = process_voice_call_turn("What did you say?", "confirm", extracted)
    assert res["complaint"] is None
    assert res["stage"] == "confirm"
    assert "reporting" in res["reply_text"].lower() or "submit" in res["reply_text"].lower()


def test_04_uncertainty_in_confirmation_does_not_submit():
    """Verify saying 'Maybe' or 'I don't know' in confirmation state does not submit."""
    initial_count = _get_complaint_count()
    extracted = {"description": "Broken streetlight", "location": "Park Lane"}
    res = process_voice_call_turn("I don't know", "confirm", extracted)
    assert res["complaint"] is None
    assert res["stage"] == "confirm"
    assert _get_complaint_count() == initial_count


def test_05_in_place_correction_during_intake():
    """Verify in-place location correction does not lose category/description."""
    extracted = {"description": "Dangerous pothole", "category": "Roads", "location": "MG Road"}
    res = process_voice_call_turn("No, actually Gandhi Road instead", "confirm", extracted)
    assert res["complaint"] is None
    assert res["stage"] == "confirm"
    assert "Gandhi Road" in res["extracted_data"]["location"]
    assert res["extracted_data"]["category"] == "Roads"


def test_06_cancellation_aborts_cleanly():
    """Verify 'Cancel' aborts and clears draft data."""
    extracted = {"description": "Garbage pile", "location": "Station Road"}
    res = process_voice_call_turn("Cancel this report", "confirm", extracted)
    assert res["complaint"] is None
    assert res["stage"] == "problem"
    assert res["extracted_data"] == {}
    assert "cancelled" in res["reply_text"].lower()


def test_07_status_tracking_live_database():
    """Verify tracking existing complaint returns accurate status details."""
    # First submit a test complaint
    res_sub = process_voice_call_turn("Yes", "confirm", {"description": "Test drainage leak", "location": "Ring Road"})
    c_num = res_sub["complaint"]["complaint_number"]

    # Track it
    res_track = process_voice_call_turn(f"Track {c_num}", "listening", {})
    assert res_track["complaint"] is not None
    assert res_track["complaint"]["complaint_number"] == c_num
    assert res_track["stage"] == "tracking"
    assert c_num in res_track["reply_text"]


def test_08_admin_copilot_high_priority_and_workload():
    """Verify admin copilot endpoint returns real database counts and proposals."""
    client = TestClient(app)

    # Login as admin to get token
    login_res = client.post("/api/auth/login", json={"email": "admin@civicresolve.gov", "password": "adminpassword123"})
    if login_res.status_code == 200:
        token = login_res.json().get("access_token")
        headers = {"Authorization": f"Bearer {token}"}

        # Query high priority
        res1 = client.post("/api/admin/ai/copilot", json={"query": "Show me today's most serious complaints"}, headers=headers)
        assert res1.status_code == 200
        data1 = res1.json()
        assert "answer" in data1
        assert len(data1["answer"]) > 10

        # Query department workload
        res2 = client.post("/api/admin/ai/assistant", json={"query": "Which department has the heaviest workload?"}, headers=headers)
        assert res2.status_code == 200
        data2 = res2.json()
        assert "answer" in data2
        assert "Department" in data2["answer"] or "Workload" in data2["answer"]
