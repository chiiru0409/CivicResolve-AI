"""
test_civic_intelligence_upgrade.py — Automated test suite for the CivicResolve AI Intelligence Upgrade.
Tests the citizen AI chatbot, voice tracking, duplicate detection, and admin operations copilot.
"""

import sys
import os
from fastapi.testclient import TestClient

# Add backend directory to sys.path
backend_path = os.path.join(os.path.dirname(__file__), "..", "backend")
if backend_path not in sys.path:
    sys.path.insert(0, backend_path)

from main import app, get_connection

client = TestClient(app)


def test_chat_complaint_intake_and_tracking():
    """Test citizen chatbot with both new issue intake and contextual tracking."""
    # 1. Ask about an issue
    res = client.post("/chat", json={
        "message": "There is a massive water pipe burst flooding the road near Indiranagar 100ft road",
        "history": []
    })
    assert res.status_code == 200
    data = res.json()
    assert "message" in data
    assert data["suggest_complaint"] is True
    assert data["analysis_card"] is not None
    assert data["analysis_card"]["category"] == "Water"

    # 2. Tracking inquiry with nonexistent ID
    res_track = client.post("/chat", json={
        "message": "What is the status of CR-2026-999999?",
        "history": []
    })
    assert res_track.status_code == 200
    assert "could not find" in res_track.json()["message"].lower() or "CR-2026-999999" in res_track.json()["message"]


def test_voice_turn_tracking_and_intake():
    """Test voice call helpline turn processing and status inquiry."""
    # Greeting turn
    res_greet = client.post("/voice/turn", json={
        "message": "__START__",
        "stage": "greeting",
        "extracted_data": {}
    })
    assert res_greet.status_code == 200
    assert res_greet.json()["stage"] == "problem"

    # Problem description
    res_prob = client.post("/voice/turn", json={
        "message": "A deep pothole has appeared near the central bus terminal",
        "stage": "problem",
        "extracted_data": {}
    })
    assert res_prob.status_code == 200
    assert res_prob.json()["extracted_data"]["category"] == "Roads"


def test_duplicate_complaint_check():
    """Test geospatial and semantic duplicate detection endpoint."""
    res = client.post("/complaints/check-duplicate", json={
        "description": "Large dangerous pothole causing bike accidents on main arterial road",
        "category": "Roads",
        "location": "MG Road, Ward 12",
        "latitude": 12.9716,
        "longitude": 77.5946
    })
    assert res.status_code == 200
    data = res.json()
    assert "is_potential_duplicate" in data
    assert "explanation" in data


def test_admin_copilot_queries():
    """Test operations copilot for high-priority and workload questions with admin auth."""
    from auth import create_token
    token = create_token({"id": 1, "role": "admin", "email": "admin@civicresolve.gov", "full_name": "Admin Officer"})
    headers = {"Authorization": f"Bearer {token}"}

    # High priority query
    res_urgent = client.post("/admin/ai/assistant", json={
        "query": "Show highest priority and urgent complaints"
    }, headers=headers)
    assert res_urgent.status_code == 200
    data_urgent = res_urgent.json()
    assert "answer" in data_urgent

    # Department workload query
    res_workload = client.post("/admin/ai/assistant", json={
        "query": "Which department has the most unresolved complaints?"
    }, headers=headers)
    assert res_workload.status_code == 200
    data_workload = res_workload.json()
    assert "answer" in data_workload
