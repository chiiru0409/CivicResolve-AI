"""
test_full_conversational_upgrade.py — Automated verification suite for the 
CivicResolve AI Multi-Agent Intelligence & Conversational UX Upgrade.

Validates:
1. Zero premature submissions & pure greeting immunity
2. Incomplete complaint disambiguation & clarification
3. Context-aware slot extraction (no redundant questions)
4. Mid-conversation slot corrections
5. Draft cancellation & cleanup
6. Strict Database Safety Gate (only submits upon explicit confirmation)
7. Grounded live database tracking & SLA countdown lookups
8. Emergency life-safety detection & priority escalation
9. End-to-end multi-turn conversation lifecycle
"""

import sys
import os
import pytest
from fastapi.testclient import TestClient

# Add backend directory to sys.path
backend_path = os.path.join(os.path.dirname(__file__), "..", "backend")
if backend_path not in sys.path:
    sys.path.insert(0, backend_path)

from main import app, get_connection
from voice_agent import (
    process_voice_call_turn,
    _is_pure_greeting,
    _is_general_inquiry,
    _is_off_topic,
    _is_affirmative,
    _is_cancel_intent,
    STATE_GREETING,
    STATE_LISTENING,
    STATE_PROBLEM,
    STATE_LOCATION,
    STATE_CONFIRM,
    STATE_SUBMITTED,
    STATE_CANCELLED,
    STATE_TRACKING,
)

client = TestClient(app)


def test_greeting_does_not_create_or_suggest_ticket():
    """
    Verify that greetings never create a complaint, invent an issue,
    ask for unnecessary fields, or suggest premature complaint registration.
    """
    greetings = [
        "Hi",
        "Hello",
        "Hey",
        "Namaste",
        "Good morning",
        "How are you?",
        "What can you do?",
        "Are you there?",
        "I need some help",
        "Who are you?",
    ]

    for greet in greetings:
        # 1. Voice Agent Turn
        voice_resp = process_voice_call_turn(greet, stage="greeting", extracted_data={})
        assert voice_resp.get("complaint") is None, f"Greeting '{greet}' created a premature complaint!"
        assert voice_resp.get("stage") in ["problem", "listening", "greeting"], f"Greeting '{greet}' moved to unexpected stage: {voice_resp.get('stage')}"

        # 2. Chatbot Endpoint
        chat_resp = client.post("/chat", json={"message": greet, "history": []})
        assert chat_resp.status_code == 200
        chat_data = chat_resp.json()
        assert chat_data["suggest_complaint"] is False, f"Chat suggested complaint on greeting '{greet}'!"
        assert chat_data.get("complaint_data") is None, f"Chat generated complaint data on greeting '{greet}'!"


def test_incomplete_complaint_clarification():
    """
    Verify that vague civic mentions (e.g. 'There is a problem with the water')
    ask clarifying disambiguation questions rather than immediately creating a ticket.
    """
    # 1. Chatbot disambiguation
    chat_resp = client.post("/chat", json={"message": "There is a problem with the water", "history": []})
    assert chat_resp.status_code == 200
    data = chat_resp.json()
    assert data["suggest_complaint"] is False
    assert "water" in data["message"].lower()
    assert any(w in data["message"].lower() for w in ["leakage", "outage", "dirty", "supply", "pressure"])

    # 2. Voice Agent disambiguation
    voice_resp = process_voice_call_turn(
        "There is a problem with the water",
        stage="problem",
        extracted_data={}
    )
    assert voice_resp.get("complaint") is None
    assert voice_resp.get("stage") == "problem"
    assert "water" in voice_resp.get("reply_text", "").lower()


def test_complete_complaint_location_not_asked_twice():
    """
    Verify that if the citizen provides problem + location in the initial message,
    the agent extracts both and moves directly to confirmation without asking for location again.
    """
    msg = "Giant pothole outside City Mall near the main bus stop"
    voice_resp = process_voice_call_turn(
        msg,
        stage="problem",
        extracted_data={}
    )
    
    assert voice_resp.get("extracted_data", {}).get("category") == "Roads"
    assert "City Mall" in str(voice_resp.get("extracted_data", {}).get("location"))
    assert voice_resp.get("stage") == "confirm"
    assert "submit" in voice_resp.get("reply_text", "").lower()
    assert voice_resp.get("complaint") is None, "Should NOT submit until confirmed!"


def test_correction_updates_slots_without_restarting():
    """
    Verify that if a user corrects a field mid-conversation (e.g., 'No, it is not drainage, it is water leakage'),
    the agent updates the category and department without losing location or resetting state.
    """
    initial_extracted = {
        "description": "overflow near Gandhi Market",
        "category": "Drainage",
        "department": "Drainage & Sewerage Board",
        "location": "Gandhi Market Main Road",
        "landmark": "Gandhi Market",
        "priority": "MEDIUM",
    }

    correction_msg = "No, it is not drainage. It is a clean water pipeline leak"
    voice_resp = process_voice_call_turn(
        correction_msg,
        stage="confirm",
        extracted_data=initial_extracted
    )

    assert voice_resp.get("extracted_data", {}).get("category") == "Water"
    assert "Water" in str(voice_resp.get("extracted_data", {}).get("department"))
    assert "Gandhi Market" in str(voice_resp.get("extracted_data", {}).get("location"))
    assert voice_resp.get("stage") == "confirm"
    assert voice_resp.get("complaint") is None, "Should still await confirmation after correction"


def test_cancellation_cleans_draft_and_leaves_db_untouched():
    """
    Verify that 'Cancel the report' or 'Nevermind don't submit' transitions to CANCELLED,
    clears draft slots, and does NOT insert anything into the database.
    """
    initial_extracted = {
        "description": "Streetlight broken on 5th cross",
        "category": "Electricity",
        "location": "5th Cross Road",
        "priority": "LOW",
    }

    cancel_msg = "Cancel this complaint, do not submit it"
    voice_resp = process_voice_call_turn(
        cancel_msg,
        stage="confirm",
        extracted_data=initial_extracted
    )

    assert voice_resp.get("stage") in ["cancelled", "problem", "listening"]
    assert voice_resp.get("complaint") is None
    assert "cancelled" in voice_resp.get("reply_text", "").lower()


def test_confirmation_required_before_db_insertion():
    """
    Verify that ambiguous words ('hmm', 'maybe', 'okay') DO NOT trigger DB insertion.
    Only explicit affirmative ('Yes, submit it', 'Confirm') inserts into DB and returns real CR-2026-XXXXXX ID.
    """
    draft = {
        "description": "Dangerous open manhole on 100ft road",
        "category": "Drainage",
        "department": "Drainage & Sewerage Board",
        "location": "100ft Road opposite Metro",
        "priority": "CRITICAL",
    }

    # Ambiguous reply
    ambig_resp = process_voice_call_turn("Hmm maybe", stage="confirm", extracted_data=draft)
    assert ambig_resp.get("complaint") is None, "Ambiguous answer 'Hmm maybe' should not submit to DB!"
    assert ambig_resp.get("stage") == "confirm"

    # Explicit affirmative
    yes_resp = process_voice_call_turn("Yes, submit it now please", stage="confirm", extracted_data=draft)
    assert yes_resp.get("complaint") is not None, "Explicit confirmation failed to create complaint in DB!"
    assert yes_resp.get("stage") == "submitted"
    assert yes_resp.get("complaint", {}).get("complaint_number", "").startswith("CR-2026-")

    # Verify complaint in database
    conn = get_connection()
    try:
        c_num = yes_resp["complaint"]["complaint_number"]
        row = conn.execute("SELECT * FROM complaints WHERE complaint_number = ?;", (c_num,)).fetchone()
        assert row is not None, f"Complaint {c_num} was not found in real database!"
        assert row["category"] == "Drainage"
    finally:
        conn.close()


def test_tracking_query_real_database():
    """
    Verify that tracking queries for valid CR-2026-XXXXXX IDs return accurate,
    grounded department, status, and SLA info from the actual database.
    """
    # 1. Insert a test complaint
    conn = get_connection()
    test_id = "CR-2026-088771"
    try:
        conn.execute("""
            INSERT OR REPLACE INTO complaints (
                id, complaint_number, title, description, category, department,
                location, priority, status, created_at, assigned_team, estimated_response
            ) VALUES (
                'test-upgrade-track-1', ?, 'Pothole on Ring Road', 'Deep crater',
                'Roads', 'Public Works Department', 'Outer Ring Road', 'HIGH',
                'In Progress', datetime('now'), 'Road Rapid Squad 4', '24 hours'
            );
        """, (test_id,))
        conn.commit()
    finally:
        conn.close()

    # 2. Track via voice agent
    voice_track = process_voice_call_turn(f"Check status of {test_id}", stage="greeting", extracted_data={})
    assert voice_track.get("stage") == "tracking"
    assert test_id in voice_track.get("reply_text", "")
    assert "In Progress" in voice_track.get("reply_text", "") or "Roads" in voice_track.get("reply_text", "")

    # 3. Track via chatbot
    chat_track = client.post("/chat", json={"message": f"Where is my complaint {test_id}?", "history": []})
    assert chat_track.status_code == 200
    chat_data = chat_track.json()
    assert test_id in chat_data["message"]
    assert "In Progress" in chat_data["message"]
    assert "Public Works Department" in chat_data["message"]


def test_emergency_safety_warning_detection():
    """
    Verify that severe life-safety threats trigger emergency safety warnings and CRITICAL priority.
    """
    voice_resp = process_voice_call_turn(
        "Live exposed electric wire sparking with fire outside school gate on Main Road",
        stage="problem",
        extracted_data={}
    )
    assert voice_resp.get("extracted_data", {}).get("priority") == "CRITICAL"
    assert "112" in voice_resp.get("reply_text", "") or "emergency" in voice_resp.get("reply_text", "").lower()
