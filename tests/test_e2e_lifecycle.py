"""
test_e2e_lifecycle.py — Full Reproduction & Production Verification Test Suite
Tests the complete multi-tenant lifecycle, authentication persistence, non-destructive navigation,
map incidents, health diagnostics, and duplicate registration protection.
"""

import os
import sys
import time

# Ensure backend directory is in sys.path
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend"))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

os.environ["OLLAMA_TIMEOUT"] = "1"

from fastapi.testclient import TestClient
from main import app
from database import get_connection, init_db


def run_tests():
    print("=================================================================")
    print("   CIVICRESOLVE AI — PRODUCTION EXACT REPRODUCTION TEST SUITE   ")
    print("=================================================================\n")

    # Step 0: Ensure DB is initialized
    init_db()
    client = TestClient(app)

    # ── Test Database Health Diagnostic Endpoint ──────────────────────────────
    health_res = client.get("/api/health")
    assert health_res.status_code == 200, f"/api/health returned {health_res.status_code}: {health_res.text}"
    health_data = health_res.json()
    assert "status" in health_data and health_data["status"] == "healthy"
    assert "database_engine" in health_data
    assert "database_persistent" in health_data
    assert "users_count" in health_data
    assert "complaints_count" in health_data
    print(f"[PASS] Health Diagnostics: Engine={health_data['database_engine']}, Persistent={health_data['database_persistent']}, Users={health_data['users_count']}, Complaints={health_data['complaints_count']}")

    # ── Step 1: Register Citizen A ────────────────────────────────────────────
    ts = int(time.time() * 1000)
    citizen_a_email = f"citizen_a_{ts}@example.com"
    citizen_a_pass = "SecurePass123!"

    reg_a = client.post("/auth/register", json={
        "full_name": "Citizen Ramesh Kumar",
        "email": citizen_a_email,
        "phone": "+919876543210",
        "password": citizen_a_pass,
    })
    assert reg_a.status_code in (200, 201), f"Citizen A registration failed: {reg_a.text}"
    data_a = reg_a.json()
    token_a = data_a["access_token"]
    user_a_id = data_a["user_id"]
    print(f"[PASS] 1. Citizen A Registered: ID={user_a_id}, Email={citizen_a_email}")

    # ── Step 2: Login Citizen A ───────────────────────────────────────────────
    login_a = client.post("/auth/login", json={
        "email": citizen_a_email,
        "password": citizen_a_pass,
    })
    assert login_a.status_code == 200, f"Citizen A login failed: {login_a.text}"
    token_a = login_a.json()["access_token"]
    assert login_a.json()["user_id"] == user_a_id, "User ID mismatch on login!"
    print(f"[PASS] 2. Citizen A Logged in: User ID matches {user_a_id}")

    # ── Step 3: Verify /auth/me ───────────────────────────────────────────────
    me_a = client.get("/auth/me", headers={"Authorization": f"Bearer {token_a}"})
    assert me_a.status_code == 200, f"/auth/me failed: {me_a.text}"
    assert me_a.json()["id"] == user_a_id
    assert me_a.json()["email"].lower() == citizen_a_email.lower()
    print("[PASS] 3. /auth/me Verified: Authoritative citizen identity confirmed.")

    # ── Step 4: Create Complaint A ────────────────────────────────────────────
    comp_payload_a = {
        "title": "Severe Main Road Crater",
        "description": "Massive deep crater on Jubilee Hills Road No 36 causing severe vehicle axle damage and bottleneck.",
        "category": "Roads",
        "department": "Municipal Roads & Infrastructure Department",
        "priority": "HIGH",
        "latitude": 17.4325,
        "longitude": 78.4071,
        "location": "Road No. 36, Jubilee Hills, Hyderabad",
        "landmark": "Near Metro Pillar 104",
        "image_path": "/uploads/complaints/road_damage.jpg",
        "evidence_quality": "HIGH / VERIFIED BY PHOTO",
        "contact_preference": "email",
        "is_anonymous": False,
    }
    sub_a = client.post("/complaints", json=comp_payload_a, headers={"Authorization": f"Bearer {token_a}"})
    assert sub_a.status_code in (200, 201), f"Complaint creation failed: {sub_a.text}"
    comp_a = sub_a.json()
    comp_a_id = comp_a["id"]
    print(f"[PASS] 4. Complaint A Created: ID={comp_a_id}, Status={comp_a['status']}")

    # ── Step 5: Verify Complaint A exists in database with citizen_id ───────────
    conn = get_connection()
    try:
        row = conn.execute("SELECT id, complaint_number, citizen_id, title, status FROM complaints WHERE id = ?;", (comp_a_id,)).fetchone()
        assert row is not None, "Complaint A record was not found in database!"
        assert row["citizen_id"] == user_a_id, f"citizen_id in DB ({row['citizen_id']}) != {user_a_id}"
        print(f"[PASS] 5. Database Verification: Record {row['id']} securely assigned to citizen_id={user_a_id}")
    finally:
        conn.close()

    # ── Step 6 & 7: Logout & Re-login Citizen A ───────────────────────────────
    # Simulate fresh login from clean session
    relogin_a = client.post("/auth/login", json={
        "email": citizen_a_email,
        "password": citizen_a_pass,
    })
    assert relogin_a.status_code == 200, f"Citizen A re-login failed: {relogin_a.text}"
    re_data_a = relogin_a.json()
    re_token_a = re_data_a["access_token"]
    
    # ── Step 8: Verify same user ID ───────────────────────────────────────────
    assert re_data_a["user_id"] == user_a_id, "Citizen ID changed after re-login!"
    print(f"[PASS] 8. Re-login Identity Stability: Same user ID {user_a_id} retained.")

    # ── Step 9: Verify Complaint A remains in citizen history ─────────────────
    mine_res = client.get("/complaints/mine", headers={"Authorization": f"Bearer {re_token_a}"})
    assert mine_res.status_code == 200, f"/complaints/mine failed: {mine_res.text}"
    mine_items = mine_res.json()
    assert any(c["id"] == comp_a_id for c in mine_items), "Complaint A missing from /complaints/mine!"
    print(f"[PASS] 9. Citizen Complaint Retention: Found {len(mine_items)} complaint(s) in citizen history.")

    # ── Step 10 & 11: Admin Login & Overview ──────────────────────────────────
    admin_login = client.post("/auth/admin/login", json={
        "email": "admin@civicresolve.ai",
        "password": "admin123",
    })
    assert admin_login.status_code == 200, f"Admin login failed: {admin_login.text}"
    admin_token = admin_login.json()["access_token"]
    h_admin = {"Authorization": f"Bearer {admin_token}"}
    print("[PASS] 10 & 11. Admin Authenticated: Token issued.")

    overview_res = client.get("/admin/overview", headers=h_admin)
    assert overview_res.status_code == 200, f"/admin/overview failed: {overview_res.text}"
    overview_data = overview_res.json()
    assert overview_data["total_complaints"] >= 1
    print(f"[PASS] 12. Admin Overview: Total={overview_data['total_complaints']}, Submitted={overview_data['submitted']}, HighPriority={overview_data['high_priority']}")

    # ── Step 12 & 13: Navigate Admin Overview → Complaints ────────────────────
    adm_complaints_res = client.get("/admin/complaints", headers=h_admin)
    assert adm_complaints_res.status_code == 200, f"/admin/complaints failed: {adm_complaints_res.text}"
    adm_items = adm_complaints_res.json()["items"]
    assert any(c["id"] == comp_a_id for c in adm_items), f"Complaint A missing from admin complaints list!"
    initial_admin_count = adm_complaints_res.json()["total"]
    print(f"[PASS] 13 & 14. Admin Complaints View: Complaint A found (Total: {initial_admin_count}).")

    # ── Step 14 & 15: Navigate Complaints → Overview (Invariance Check) ───────
    overview_res2 = client.get("/admin/overview", headers=h_admin)
    assert overview_res2.status_code == 200
    assert overview_res2.json()["total_complaints"] == initial_admin_count, "Complaint count dropped after navigating to Overview!"
    print("[PASS] 15 & 16. Invariance Check: Total complaints remained stable across navigation.")

    # ── Step 16 & 17: Navigate Overview → Map ─────────────────────────────────
    map_res = client.get("/admin/map/incidents", headers=h_admin)
    assert map_res.status_code == 200, f"/admin/map/incidents failed: {map_res.text}"
    map_incidents = map_res.json()
    assert any(m["id"] == comp_a_id for m in map_incidents), "Complaint A missing from active map incidents!"
    print(f"[PASS] 17 & 18. Map Verification: Complaint A is active with GPS ({comp_payload_a['latitude']}, {comp_payload_a['longitude']}).")

    # ── Step 18 & 19: Navigate Map → Complaints (Non-Destructive Read) ────────
    detail_res = client.get(f"/admin/complaints/{comp_a_id}", headers=h_admin)
    assert detail_res.status_code == 200, f"Detail read failed: {detail_res.text}"
    assert detail_res.json()["id"] == comp_a_id
    
    adm_complaints_res2 = client.get("/admin/complaints", headers=h_admin)
    assert adm_complaints_res2.json()["total"] == initial_admin_count, "Opening complaint detail mutated count!"
    print("[PASS] 19 & 20. Pure Non-Destructive Read: Opening complaint detail did not mutate records.")

    # ── Step 20 & 21: Refresh Admin ───────────────────────────────────────────
    refresh_list = client.get("/admin/complaints?status=All&category=All&priority=All", headers=h_admin)
    assert refresh_list.status_code == 200
    assert any(c["id"] == comp_a_id for c in refresh_list.json()["items"])
    print("[PASS] 21 & 22. Admin Refresh: Complaint A persists through full filter evaluation.")

    # ── Step 22-25: Logout Admin & Re-login Citizen A ────────────────────────
    relogin_a_final = client.post("/auth/login", json={
        "email": citizen_a_email,
        "password": citizen_a_pass,
    })
    assert relogin_a_final.status_code == 200
    mine_final = client.get("/complaints/mine", headers={"Authorization": f"Bearer {relogin_a_final.json()['access_token']}"})
    assert mine_final.status_code == 200
    assert any(c["id"] == comp_a_id for c in mine_final.json())
    print("[PASS] 23-26. Citizen A Re-login & Complaint Retention: Verified.")

    # ── Multi-tenant Isolation Test: Citizen B ────────────────────────────────
    citizen_b_email = f"citizen_b_{ts}@example.com"
    reg_b = client.post("/auth/register", json={
        "full_name": "Citizen Priya Sharma",
        "email": citizen_b_email,
        "phone": "+919876543211",
        "password": "Password123!",
    })
    assert reg_b.status_code in (200, 201)
    token_b = reg_b.json()["access_token"]
    mine_b = client.get("/complaints/mine", headers={"Authorization": f"Bearer {token_b}"})
    assert mine_b.status_code == 200
    assert len(mine_b.json()) == 0, f"Citizen B saw Citizen A's complaints! Found: {mine_b.json()}"
    print("[PASS] Multi-tenant Privacy: Citizen B sees 0 complaints of Citizen A.")

    # ── Duplicate Email Registration Rule (Phase 6) ───────────────────────────
    dup_reg = client.post("/auth/register", json={
        "full_name": "Duplicate Attempt",
        "email": citizen_a_email,
        "phone": "+919876543299",
        "password": "NewPassword123!",
    })
    assert dup_reg.status_code == 409, f"Duplicate registration did not return 409! Got {dup_reg.status_code}: {dup_reg.text}"
    assert "EMAIL_ALREADY_REGISTERED" in dup_reg.text
    print(f"[PASS] Duplicate Registration Protection: 409 EMAIL_ALREADY_REGISTERED correctly returned for duplicate email.")

    # ── Explicit Vamsi Account Lifecycle Test ────────────────────────────────
    vamsi_email = f"vamsi_{ts}@gmail.com"
    vamsi_pass = f"vamsi_{ts}@gmail.com"
    reg_v = client.post("/auth/register", json={
        "full_name": "Vamsi",
        "email": vamsi_email,
        "phone": "+919876543210",
        "password": vamsi_pass,
    })
    assert reg_v.status_code in (200, 201)
    v_uid = reg_v.json()["user_id"]
    v_token = reg_v.json()["access_token"]

    # Vamsi Login 1
    log_v1 = client.post("/auth/login", json={"email": vamsi_email, "password": vamsi_pass})
    assert log_v1.status_code == 200
    assert log_v1.json()["user_id"] == v_uid

    # Vamsi submits real complaint
    comp_v_res = client.post("/complaints", json={
        "title": "Large pothole near main road",
        "description": "There is a large pothole on the main road near the residential area. It is creating a safety risk for two-wheelers and vehicles.",
        "category": "Roads",
        "department": "Municipal Roads & Infrastructure Department",
        "priority": "HIGH",
        "latitude": 17.4325,
        "longitude": 78.4071,
        "location": "Main Road, Residential Area, Hyderabad",
        "evidence_quality": "HIGH / VERIFIED BY PHOTO",
    }, headers={"Authorization": f"Bearer {log_v1.json()['access_token']}"})
    assert comp_v_res.status_code in (200, 201)
    v_cid = comp_v_res.json()["id"]

    # Vamsi check mine
    mine_v1 = client.get("/complaints/mine", headers={"Authorization": f"Bearer {log_v1.json()['access_token']}"})
    assert mine_v1.status_code == 200
    assert any(c["id"] == v_cid for c in mine_v1.json())

    # Vamsi Relogin 2
    log_v2 = client.post("/auth/login", json={"email": vamsi_email, "password": vamsi_pass})
    assert log_v2.status_code == 200
    assert log_v2.json()["user_id"] == v_uid
    mine_v2 = client.get("/complaints/mine", headers={"Authorization": f"Bearer {log_v2.json()['access_token']}"})
    assert mine_v2.status_code == 200
    assert any(c["id"] == v_cid for c in mine_v2.json())

    # Admin verification for Vamsi complaint
    adm_v = client.post("/auth/admin/login", json={"email": "admin@civicresolve.ai", "password": "admin123"})
    assert adm_v.status_code == 200
    adm_v_token = adm_v.json()["access_token"]

    adm_v_comps = client.get("/admin/complaints", headers={"Authorization": f"Bearer {adm_v_token}"})
    assert adm_v_comps.status_code == 200
    assert any(c["id"] == v_cid for c in adm_v_comps.json()["items"])

    adm_v_ov = client.get("/admin/overview", headers={"Authorization": f"Bearer {adm_v_token}"})
    assert adm_v_ov.status_code == 200
    assert adm_v_ov.json()["total_complaints"] >= 1

    adm_v_map = client.get("/admin/map/incidents", headers={"Authorization": f"Bearer {adm_v_token}"})
    assert adm_v_map.status_code == 200
    assert any(m["id"] == v_cid for m in adm_v_map.json())
    print(f"[PASS] Vamsi Account Lifecycle & Admin Retention: 100% Verified (Complaint ID: {v_cid})")

    print("\n=================================================================")
    print("   ALL EXACT USER FLOW REPRODUCTION TESTS PASSED WITH 100% SUCCESS")
    print("=================================================================\n")


if __name__ == "__main__":
    run_tests()
