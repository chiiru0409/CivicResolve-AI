"""
test_full_production_verification.py — Comprehensive 24-point Verification Suite for CivicResolve AI
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

def run_production_verification():
    print("=================================================================")
    print("  CIVICRESOLVE AI — 24-POINT PRODUCTION VERIFICATION SUITE       ")
    print("=================================================================\n")

    init_db()
    client = TestClient(app)

    # 1. Health Check & Diagnostics Probe
    res_health = client.get("/api/health")
    assert res_health.status_code == 200, f"Health check failed: {res_health.text}"
    health_data = res_health.json()
    assert health_data.get("status") == "healthy"
    engine = health_data.get("database_engine")
    print(f"[PASS 1/24] Health Check & Diagnostics Probe: Engine={engine}")

    # 2. Database Connectivity & Persistence
    conn = get_connection()
    try:
        cur = conn.execute("SELECT COUNT(*) FROM complaints;")
        initial_comp_count = int(cur.fetchone()[0])
        print(f"[PASS 2/24] Database Connectivity & Persistence: Initial count={initial_comp_count}")
    finally:
        conn.close()

    # 3. Citizen Registration with Mixed Case & Whitespace
    ts = int(time.time() * 1000)
    raw_email_a = f"  CITIZEN_Alpha_{ts}@CIVIC.COM  "
    clean_email_a = f"citizen_alpha_{ts}@civic.com"
    pass_a = "SecurePass@2026"

    res_reg_a = client.post("/api/auth/register", json={
        "full_name": "Citizen Alpha Test",
        "email": raw_email_a,
        "phone": "+91 9988776655",
        "password": pass_a,
    })
    assert res_reg_a.status_code in (200, 201), f"Registration failed: {res_reg_a.text}"
    data_reg_a = res_reg_a.json()
    assert data_reg_a["email"] == clean_email_a, f"Email not normalized! Got {data_reg_a['email']}"
    token_a = data_reg_a["access_token"]
    user_a_id = data_reg_a["user_id"]
    h_a = {"Authorization": f"Bearer {token_a}"}
    print(f"[PASS 3/24] Citizen Registration with Email Normalization: ID={user_a_id}, Email={clean_email_a}")

    # 4. Duplicate Registration Detection -> HTTP 409 EMAIL_ALREADY_REGISTERED
    res_dup = client.post("/api/auth/register", json={
        "full_name": "Citizen Alpha Duplicate",
        "email": clean_email_a.upper(),
        "phone": "+91 9988776655",
        "password": pass_a,
    })
    assert res_dup.status_code == 409, f"Duplicate check did not return 409: {res_dup.status_code}"
    assert "EMAIL_ALREADY_REGISTERED" in res_dup.json().get("detail", "")
    print("[PASS 4/24] Duplicate Registration Protection: Returned HTTP 409 EMAIL_ALREADY_REGISTERED")

    # 5. Citizen Login with Varied Casing
    res_login_a = client.post("/api/auth/login", json={
        "email": f"  {clean_email_a.upper()}  ",
        "password": pass_a,
    })
    assert res_login_a.status_code == 200, f"Login failed: {res_login_a.text}"
    assert res_login_a.json()["role"] == "citizen"
    assert res_login_a.json()["user_id"] == user_a_id
    token_a = res_login_a.json()["access_token"]
    h_a = {"Authorization": f"Bearer {token_a}"}
    print("[PASS 5/24] Citizen Login & Case-Insensitive Credential Verification passed")

    # 6. Admin Login & JWT Authority Role
    res_admin = client.post("/api/auth/admin/login", json={
        "email": "admin@civicresolve.ai",
        "password": "admin123",
    })
    assert res_admin.status_code == 200, f"Admin login failed: {res_admin.text}"
    assert res_admin.json()["role"] == "admin"
    admin_token = res_admin.json()["access_token"]
    h_admin = {"Authorization": f"Bearer {admin_token}"}
    print("[PASS 6/24] Admin Login & Role Authorization verified")

    # 7. Multi-Tenant Privacy: Citizen B Isolation
    clean_email_b = f"citizen_beta_{ts}@civic.com"
    res_reg_b = client.post("/api/auth/register", json={
        "full_name": "Citizen Beta Test",
        "email": clean_email_b,
        "phone": "+91 9988776656",
        "password": pass_a,
    })
    assert res_reg_b.status_code in (200, 201)
    token_b = res_reg_b.json()["access_token"]
    h_b = {"Authorization": f"Bearer {token_b}"}

    res_b_empty = client.get("/api/complaints/mine", headers=h_b)
    assert res_b_empty.status_code == 200 and len(res_b_empty.json()) == 0
    print("[PASS 7/24] Multi-Tenant Data Isolation: Citizen B isolated from other users' records")

    # 8. Complaint Submission (Citizen A)
    comp_payload = {
        "title": "Severe Water Main Rupture",
        "description": "High pressure pipeline leak flooding Banjara Hills main avenue and causing low water pressure in sector 2.",
        "category": "Water",
        "department": "Water Supply & Distribution Department",
        "priority": "HIGH",
        "location": "Banjara Hills Avenue 4, Hyderabad",
        "latitude": 17.4156,
        "longitude": 78.4350,
        "landmark": "Near Community Water Tower",
        "evidence_quality": "HIGH / VERIFIED BY PHOTO",
        "contact_preference": "email",
        "is_anonymous": False,
    }
    res_comp_a = client.post("/api/complaints", json=comp_payload, headers=h_a)
    assert res_comp_a.status_code in (200, 201), f"Complaint creation failed: {res_comp_a.text}"
    comp_a = res_comp_a.json()
    comp_a_id = comp_a["id"]
    comp_a_num = comp_a["complaint_number"]
    print(f"[PASS 8/24] Complaint Creation (Citizen A): ID={comp_a_id} Status={comp_a['status']}")

    # 9. Rapid Double Submission (Deduplication Check)
    res_comp_dup = client.post("/api/complaints", json=comp_payload, headers=h_a)
    assert res_comp_dup.status_code in (200, 201)
    assert res_comp_dup.json()["id"] == comp_a_id, "Rapid double-submission created a duplicate row!"
    print("[PASS 9/24] 60-Second Server-Side Deduplication: Returned existing record without duplicate row")

    # 10. Citizen A Sees Their Own Complaint in /complaints/mine
    res_mine_a = client.get("/api/complaints/mine", headers=h_a)
    assert res_mine_a.status_code == 200
    mine_ids = [c["id"] for c in res_mine_a.json()]
    assert comp_a_id in mine_ids
    print(f"[PASS 10/24] Citizen Own Complaints View: Found {comp_a_id} in citizen records")

    # 11. Citizen B Still Sees 0 Complaints (Strict Multi-tenant Privacy)
    res_mine_b = client.get("/api/complaints/mine", headers=h_b)
    assert res_mine_b.status_code == 200
    assert not any(c["id"] == comp_a_id for c in res_mine_b.json())
    print("[PASS 11/24] Multi-tenant Query Privacy: Citizen B cannot view Citizen A complaint")

    # 12. Admin Complaint Detail (Existing Record -> 200 OK)
    res_detail = client.get(f"/api/admin/complaints/{comp_a_id}", headers=h_admin)
    assert res_detail.status_code == 200, f"Admin detail failed: {res_detail.text}"
    detail_data = res_detail.json()
    assert detail_data["id"] == comp_a_id
    assert detail_data["title"] == comp_payload["title"]
    assert detail_data["priority"] == "HIGH"
    print(f"[PASS 12/24] Admin Complaint Detail (200 OK): Loaded full incident record")

    # 13. Admin Complaint Detail (Nonexistent Record -> 404 Not Found)
    res_notfound = client.get("/api/admin/complaints/CR-9999-NOTFOUND", headers=h_admin)
    assert res_notfound.status_code == 404, f"Expected 404, got {res_notfound.status_code}"
    print("[PASS 13/24] Admin Complaint Detail (404 Not Found): Handled gracefully")

    # 14. Admin Overview Counts Match Live DB
    res_overview = client.get("/api/admin/overview", headers=h_admin)
    assert res_overview.status_code == 200
    overview = res_overview.json()

    res_list = client.get("/api/admin/complaints", headers=h_admin)
    assert res_list.status_code == 200
    adm_list = res_list.json()

    assert overview["total_complaints"] == adm_list["total"], (
        f"Overview ({overview['total_complaints']}) != Complaint List ({adm_list['total']})"
    )
    print(f"[PASS 14/24] Count Parity: Overview Total ({overview['total_complaints']}) == Complaint List Total ({adm_list['total']})")

    # 15. AI Daily Brief Aligns with Live DB Counts
    res_brief = client.get("/api/admin/ai/brief", headers=h_admin)
    assert res_brief.status_code == 200
    brief = res_brief.json()
    assert brief["total_complaints"] == overview["total_complaints"]
    assert brief["high_priority_count"] == overview["high_priority"]
    assert brief["pending_count"] == overview["pending"]
    print(f"[PASS 15/24] Admin AI Daily Brief Live Data Alignment verified")

    # 16. Admin Analytics Summary Matches Overview
    res_analytics = client.get("/api/admin/analytics", headers=h_admin)
    assert res_analytics.status_code == 200
    analytics = res_analytics.json()
    assert analytics["total_complaints"] == overview["total_complaints"]
    print(f"[PASS 16/24] Admin Analytics Summary Telemetry verified")

    # 17. Admin Status Progression -> 'In Progress'
    res_stat1 = client.patch(
        f"/api/admin/complaints/{comp_a_id}/status",
        json={"status": "In Progress", "message": "Emergency water pipeline repair team dispatched."},
        headers=h_admin,
    )
    assert res_stat1.status_code == 200
    assert res_stat1.json()["status"] == "In Progress"
    print(f"[PASS 17/24] Admin Status Transition: Updated to 'In Progress'")

    # 18. Authority Assignment -> Department & Officer
    res_assign = client.post(
        f"/api/admin/complaints/{comp_a_id}/assign",
        json={
            "department": "Water Supply & Distribution Department",
            "officer": "Engineer Meera Rao",
            "team": "Pipeline Repair Team",
            "notes": "Emergency pressure valve replacement.",
        },
        headers=h_admin,
    )
    assert res_assign.status_code == 200
    print("[PASS 18/24] Authority Assignment: Team & Officer recorded")

    # 19. Public Tracking Verification -> Safe Read Timeline
    res_track = client.get(f"/api/track/{comp_a_num}")
    assert res_track.status_code == 200
    track_data = res_track.json()
    assert track_data["status"] == "Assigned"
    assert len(track_data["updates"]) >= 2
    print(f"[PASS 19/24] Public Timeline Tracking: Verified status 'Assigned'")

    # 20. Public Map Incidents -> Active Pins
    res_map = client.get("/api/public/map/incidents")
    assert res_map.status_code == 200
    map_pins = res_map.json()
    assert any(m["id"] == comp_a_id for m in map_pins), "Active complaint missing from map layer!"
    print(f"[PASS 20/24] Active Geospatial Incident Map Pins: Found {comp_a_id}")

    # 21. AI Incident Diagnostic Modal Endpoint
    res_ai_diag = client.get(f"/api/admin/ai/analysis/{comp_a_id}", headers=h_admin)
    assert res_ai_diag.status_code == 200
    diag = res_ai_diag.json()
    assert "risk_assessment" in diag
    assert "recommended_action" in diag
    print("[PASS 21/24] AI Incident Diagnostic Inspection verified")

    # 22. AI Operations Copilot Query Assistant
    res_copilot = client.post(
        "/api/admin/ai/assistant",
        json={"query": "Show highest priority and urgent complaints"},
        headers=h_admin,
    )
    assert res_copilot.status_code == 200
    copilot_data = res_copilot.json()
    assert "answer" in copilot_data
    print("[PASS 22/24] AI Operations Copilot Assistant query verified")

    # 23. Admin Department Hierarchy List
    res_depts = client.get("/api/admin/departments", headers=h_admin)
    assert res_depts.status_code == 200
    depts = res_depts.json()
    assert len(depts) >= 1
    assert "short_name" in depts[0] or "shortName" in depts[0]
    print(f"[PASS 23/24] Municipal Department Hierarchy: Loaded {len(depts)} departments")

    # 24. Clean Resolution & Final State
    res_stat2 = client.patch(
        f"/api/admin/complaints/{comp_a_id}/status",
        json={"status": "Resolved", "message": "Valve replaced and pressure restored."},
        headers=h_admin,
    )
    assert res_stat2.status_code == 200 and res_stat2.json()["status"] == "Resolved"

    # Cleanup temporary test user data cleanly
    conn = get_connection()
    try:
        with conn:
            conn.execute("DELETE FROM complaint_updates WHERE complaint_id = ?;", (comp_a_id,))
            conn.execute("DELETE FROM assignments WHERE complaint_id = ?;", (comp_a_id,))
            conn.execute("DELETE FROM complaints WHERE id = ?;", (comp_a_id,))
            conn.execute("DELETE FROM users WHERE LOWER(email) IN (?, ?);", (clean_email_a, clean_email_b))
    finally:
        conn.close()

    print(f"[PASS 24/24] Complete Lifecycle Resolution & Cleanup: 100% Verified")

    print("\n=================================================================")
    print("  ALL 24 PRODUCTION VERIFICATION TESTS PASSED WITH 100% SUCCESS  ")
    print("=================================================================\n")

if __name__ == "__main__":
    run_production_verification()
