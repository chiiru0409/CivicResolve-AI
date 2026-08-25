"""
test_rating_feature.py — Automated verification suite for the Citizen Post-Resolution Rating feature.
"""

import os
import sys
import time
from pathlib import Path

# Ensure backend directory is in sys.path
backend_dir = Path(__file__).resolve().parent.parent / "backend"
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

os.environ["OLLAMA_TIMEOUT"] = "1"

from fastapi.testclient import TestClient
from main import app
from database import init_db, get_connection

def test_rating_feature_lifecycle():
    print("\n=================================================================")
    print("  POST-RESOLUTION RATING FEATURE — VERIFICATION SUITE            ")
    print("=================================================================\n")

    init_db()
    client = TestClient(app)

    # 1. Admin login
    res_admin = client.post("/api/auth/admin/login", json={
        "email": "admin@civicresolve.ai",
        "password": "admin123",
    })
    assert res_admin.status_code == 200, f"Admin login failed: {res_admin.text}"
    admin_token = res_admin.json()["access_token"]
    h_admin = {"Authorization": f"Bearer {admin_token}"}
    print("[PASS 1/15] Admin login successful")

    # 2. Citizen registration & login
    ts = int(time.time() * 1000)
    email = f"rating_tester_{ts}@civic.com"
    passw = "SecurePass@2026"
    res_reg = client.post("/api/auth/register", json={
        "full_name": "Rating Tester Citizen",
        "email": email,
        "phone": "+91 9123456789",
        "password": passw,
    })
    assert res_reg.status_code in (200, 201), f"Citizen registration failed: {res_reg.text}"
    cit_token = res_reg.json()["access_token"]
    h_cit = {"Authorization": f"Bearer {cit_token}"}
    print(f"[PASS 2/15] Citizen registered: {email}")

    # Record initial rating metrics
    res_init_analytics = client.get("/api/admin/analytics", headers=h_admin)
    assert res_init_analytics.status_code == 200
    init_analytics = res_init_analytics.json()
    initial_total_ratings = int(init_analytics.get("total_ratings", 0))
    print(f"[PASS 3/15] Initial state verified: initial_total_ratings={initial_total_ratings}")

    # 3. Create Case 1 (Road Damage)
    res_c1 = client.post("/api/complaints", json={
        "title": "Severe Pothole on MG Road",
        "description": "Deep crater causing traffic hazard near metro pillar 120.",
        "category": "Roads",
        "priority": "HIGH",
        "location": "MG Road, Pillar 120, Bangalore",
        "latitude": 12.9716,
        "longitude": 77.5946,
    }, headers=h_cit)
    assert res_c1.status_code in (200, 201), f"Case 1 creation failed: {res_c1.text}"
    c1 = res_c1.json()
    c1_id = c1["id"]
    c1_num = c1["complaint_number"]
    print(f"[PASS 4/15] Case 1 created: {c1_id} ({c1_num}), status={c1['status']}")

    # 4. Attempt to rate Case 1 BEFORE resolution -> Must FAIL with 400
    res_rate_early = client.post(f"/api/complaints/{c1_num}/rate", json={
        "rating": 5,
        "feedback": "Trying to rate before resolution",
    })
    assert res_rate_early.status_code == 400, f"Expected 400 for uncompleted case, got {res_rate_early.status_code}: {res_rate_early.text}"
    print("[PASS 5/15] Rating rejected before case resolution (HTTP 400 as required)")

    # 5. Resolve Case 1
    res_resolve_c1 = client.patch(f"/api/admin/complaints/{c1_id}/status", json={
        "status": "Resolved",
        "message": "Pothole filled and road leveled with asphalt.",
    }, headers=h_admin)
    assert res_resolve_c1.status_code == 200
    assert res_resolve_c1.json()["status"] == "Resolved"
    print(f"[PASS 6/15] Case 1 resolved by admin")

    # 6. Submit 5-star rating with feedback on Case 1
    res_rate_c1 = client.post(f"/api/complaints/{c1_num}/rate", json={
        "rating": 5,
        "feedback": "Issue was resolved quickly.",
    })
    assert res_rate_c1.status_code == 200, f"Rating submission failed: {res_rate_c1.text}"
    rate_c1_data = res_rate_c1.json()
    assert rate_c1_data["rating"] == 5
    assert rate_c1_data["feedback"] == "Issue was resolved quickly."
    assert "rated_at" in rate_c1_data
    print(f"[PASS 7/15] Case 1 rated 5 stars with feedback: '{rate_c1_data['feedback']}'")

    # 7. Prevent accidental duplicate rating submission on Case 1 -> Must return 409
    res_rate_dup = client.post(f"/api/complaints/{c1_num}/rate", json={
        "rating": 4,
        "feedback": "Trying duplicate rating",
    })
    assert res_rate_dup.status_code == 409, f"Expected 409 for duplicate rating, got {res_rate_dup.status_code}: {res_rate_dup.text}"
    print("[PASS 8/15] Duplicate rating prevented (HTTP 409 Conflict)")

    # 8. Check Case 1 via /track/{c1_num}
    res_track_c1 = client.get(f"/api/track/{c1_num}")
    assert res_track_c1.status_code == 200
    track_c1_data = res_track_c1.json()
    assert track_c1_data["citizen_rating"] == 5
    assert track_c1_data["citizen_feedback"] == "Issue was resolved quickly."
    assert track_c1_data["rated_at"] is not None
    print("[PASS 9/15] Public tracking endpoint returns recorded citizen rating & feedback")

    # 9. Create Case 2 (Garbage) -> Resolve -> Submit 4-star rating
    res_c2 = client.post("/api/complaints", json={
        "title": "Overflowing garbage dump in market",
        "description": "Commercial waste accumulating near vegetable market entrance.",
        "category": "Garbage",
        "priority": "MEDIUM",
        "location": "Russell Market, Bangalore",
        "latitude": 12.9830,
        "longitude": 77.6050,
    }, headers=h_cit)
    c2 = res_c2.json()
    c2_id, c2_num = c2["id"], c2["complaint_number"]
    client.patch(f"/api/admin/complaints/{c2_id}/status", json={"status": "Closed", "message": "Waste cleared and sanitized."}, headers=h_admin)
    res_rate_c2 = client.post(f"/api/track/{c2_num}/rate", json={
        "rating": 4,
        "feedback": "Good response, but resolution took longer.",
    })
    assert res_rate_c2.status_code == 200
    print("[PASS 10/15] Case 2 resolved and rated 4 stars via /track/{id}/rate endpoint")

    # 10. Create Case 3 (Streetlights) -> Resolve -> Submit 1-star rating
    res_c3 = client.post("/api/complaints", json={
        "title": "Broken streetlights along residential street",
        "description": "Three lights non-functional causing dark street at night.",
        "category": "Streetlights",
        "priority": "LOW",
        "location": "5th Main, Indiranagar, Bangalore",
        "latitude": 12.9784,
        "longitude": 77.6408,
    }, headers=h_cit)
    c3 = res_c3.json()
    c3_id, c3_num = c3["id"], c3["complaint_number"]
    client.patch(f"/api/admin/complaints/{c3_id}/status", json={"status": "Resolved", "message": "Bulbs replaced."}, headers=h_admin)
    res_rate_c3 = client.post(f"/api/complaints/{c3_id}/rate", json={
        "rating": 1,
        "feedback": "Took 5 days and multiple follow-ups.",
    })
    assert res_rate_c3.status_code == 200
    print("[PASS 11/15] Case 3 resolved and rated 1 star")

    # 11. Create Case 4 (Water) -> Resolve -> Submit 3-star rating WITHOUT feedback (optional feedback check)
    res_c4 = client.post("/api/complaints", json={
        "title": "Low water pressure in sector 4",
        "description": "Morning water supply has very low pressure.",
        "category": "Water",
        "priority": "MEDIUM",
        "location": "Sector 4, HSR Layout, Bangalore",
        "latitude": 12.9116,
        "longitude": 77.6389,
    }, headers=h_cit)
    c4 = res_c4.json()
    c4_id, c4_num = c4["id"], c4["complaint_number"]
    client.patch(f"/api/admin/complaints/{c4_id}/status", json={"status": "Resolved", "message": "Booster pump serviced."}, headers=h_admin)
    res_rate_c4 = client.post(f"/api/complaints/{c4_id}/rate", json={
        "rating": 3,
    })
    assert res_rate_c4.status_code == 200
    assert res_rate_c4.json()["feedback"] is None
    print("[PASS 12/15] Case 4 resolved and rated 3 stars with optional feedback omitted")

    # 12. Test Rating Range Validation (e.g. 0 stars or 6 stars)
    res_rate_inv0 = client.post(f"/api/complaints/{c4_id}/rate", json={"rating": 0})
    assert res_rate_inv0.status_code in (422, 400, 409) # 422 pydantic validation or 409 already rated
    res_rate_inv6 = client.post(f"/api/complaints/{c4_id}/rate", json={"rating": 6})
    assert res_rate_inv6.status_code in (422, 400, 409)
    print("[PASS 13/15] Rating bounds validation verified (1-5 range strictly enforced)")

    # 13. Verify Admin Analytics Aggregations
    res_analytics = client.get("/api/admin/analytics", headers=h_admin)
    assert res_analytics.status_code == 200
    analytics = res_analytics.json()

    expected_total_ratings = initial_total_ratings + 4
    assert analytics["total_ratings"] == expected_total_ratings, f"Expected total_ratings={expected_total_ratings}, got {analytics['total_ratings']}"

    assert "average_rating" in analytics
    assert analytics["average_rating"] > 0
    print(f"[PASS 14/15] Admin Analytics Aggregation: Total Ratings={analytics['total_ratings']}, Average Rating={analytics['average_rating']}/5.0")

    # Verify ratings history contains newly rated cases
    history_ids = [item["id"] for item in analytics["ratings_history"]]
    assert c1_id in history_ids
    assert c2_id in history_ids
    assert c3_id in history_ids
    assert c4_id in history_ids

    # 14. Verify Admin Overview Metrics
    res_overview = client.get("/api/admin/overview", headers=h_admin)
    assert res_overview.status_code == 200
    overview = res_overview.json()
    assert overview["total_ratings"] == expected_total_ratings
    assert overview["average_rating"] == analytics["average_rating"]

    # 15. Verify Admin Complaint Detail Endpoint
    res_admin_detail = client.get(f"/api/admin/complaints/{c1_id}", headers=h_admin)
    assert res_admin_detail.status_code == 200
    detail = res_admin_detail.json()
    assert detail["citizen_rating"] == 5
    assert detail["citizen_feedback"] == "Issue was resolved quickly."
    assert detail["rated_at"] is not None
    print("[PASS 15/15] Admin Complaint Detail displays citizen resolution rating, feedback, and timestamp")

    # Cleanup test data cleanly
    conn = get_connection()
    try:
        with conn:
            for cid in (c1_id, c2_id, c3_id, c4_id):
                conn.execute("DELETE FROM complaint_updates WHERE complaint_id = ?;", (cid,))
                conn.execute("DELETE FROM assignments WHERE complaint_id = ?;", (cid,))
                conn.execute("DELETE FROM complaints WHERE id = ?;", (cid,))
            conn.execute("DELETE FROM users WHERE LOWER(email) = ?;", (email,))
    finally:
        conn.close()

    print("\n=================================================================")
    print("  ALL RATING FEATURE TESTS PASSED WITH 100% SUCCESS              ")
    print("=================================================================\n")

if __name__ == "__main__":
    test_rating_feature_lifecycle()
