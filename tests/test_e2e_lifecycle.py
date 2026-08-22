"""
Complete End-to-End CivicResolve AI System & Database Verification Test
"""

import sys
import os
import time
import json
import sqlite3

# Adjust path to import backend modules
os.environ["OLLAMA_TIMEOUT"] = "1"
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'backend')))

from fastapi.testclient import TestClient
from main import app
from database import get_connection, init_db

def run_tests():
    print("=================================================================")
    print("      CIVICRESOLVE AI — PRODUCTION STABILIZATION TEST SUITE      ")
    print("=================================================================\n")

    # Initialize / verify tables
    init_db()
    client = TestClient(app)

    # 1. Citizen A Registration & Login
    citizen_a_email = f"citizen_a_{int(time.time())}@test.com"
    reg_a = client.post("/auth/register", json={
        "email": citizen_a_email,
        "password": "Password123!",
        "full_name": "Citizen Ramesh Kumar",
        "phone": "+919876543210"
    })
    assert reg_a.status_code in [200, 201], f"Citizen A register failed: {reg_a.text}"
    data_a = reg_a.json()
    token_a = data_a["access_token"]
    user_a_id = data_a["user_id"]
    print(f"[PASS] Citizen A Registered: ID={user_a_id}, Email={data_a['email']}")

    # 2. Citizen A Login (Identity Persistence)
    login_a = client.post("/auth/login", json={
        "email": citizen_a_email,
        "password": "Password123!"
    })
    assert login_a.status_code == 200, f"Citizen A login failed: {login_a.text}"
    assert login_a.json()["user_id"] == user_a_id, "User ID mismatch upon re-login!"
    print("[PASS] Citizen A Re-login: Identity restored consistently.")

    # 3. Citizen A Submits Complaint with Photo and GPS & Rubric
    comp_data_a = {
        "title": "Severe Main Road Crater / Pothole",
        "description": "Massive deep crater on Jubilee Hills Road No 36 causing severe vehicle axle damage and bottleneck.",
        "category": "Roads",
        "department": "Roads & Highways Department",
        "priority": "HIGH",
        "latitude": 17.4325,
        "longitude": 78.4071,
        "location": "Road No. 36, Jubilee Hills, Hyderabad",
        "landmark": "Near Metro Pillar 104",
        "image_path": "https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?w=800",
        "evidence_quality": "HIGH / VERIFIED BY PHOTO",
        "ai_confidence": 94,
        "ai_reason": "High-traffic arterial corridor with structural bitumen rupture.",
        "public_safety_impact": "High risk of two-wheeler skid and major vehicle damage",
        "inspection_required": True,
        "location_risk": "HIGH TRAFFIC CORRIDOR",
        "action_plan": "1. Deploy asphalt repair crew\n2. Barricade crater\n3. Resurface section",
        "assigned_team": "Rapid Road Repair Team"
    }

    sub_a = client.post("/complaints", json=comp_data_a, headers={"Authorization": f"Bearer {token_a}"})
    assert sub_a.status_code in [200, 201], f"Complaint submission failed: {sub_a.text}"
    comp_a = sub_a.json()
    comp_a_id = comp_a["id"]
    print(f"[PASS] Complaint A Created in DB: {comp_a_id} (Status: {comp_a['status']})")
    assert comp_a["public_safety_impact"] is not None
    assert comp_a["inspection_required"] in [True, 1]

    # Verify directly in SQLite DB
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, title, citizen_id, public_safety_impact, status FROM complaints WHERE id = ?", (comp_a_id,))
    row = cursor.fetchone()
    assert row is not None, "Complaint A was not permanently written to SQLite!"
    assert row["citizen_id"] == user_a_id, "Citizen ID in DB does not match Citizen A!"
    print(f"[PASS] Verified SQLite Disk Persistence: DB row={row['id']}, citizen_id={row['citizen_id']}")

    # 4. Citizen B Registration & Data Isolation
    citizen_b_email = f"citizen_b_{int(time.time())}@test.com"
    reg_b = client.post("/auth/register", json={
        "email": citizen_b_email,
        "password": "Password123!",
        "full_name": "Citizen Priya Sharma",
        "phone": "+919876543211"
    })
    assert reg_b.status_code in [200, 201]
    token_b = reg_b.json()["access_token"]
    user_b_id = reg_b.json()["user_id"]

    # Citizen B calls /complaints/mine -> MUST BE 0
    mine_b = client.get("/complaints/mine", headers={"Authorization": f"Bearer {token_b}"})
    assert mine_b.status_code == 200
    assert len(mine_b.json()) == 0, f"Citizen B saw Citizen A's complaints! Count={len(mine_b.json())}"
    print("[PASS] Citizen Data Isolation: Citizen B sees 0 complaints.")

    # Citizen B Submits Complaint B
    comp_data_b = {
        "title": "Overflowing Garbage Dumpster",
        "description": "Commercial garbage overflowing onto pedestrian walkway near market square for 4 days.",
        "category": "Garbage",
        "department": "Sanitation & Waste Management",
        "priority": "MEDIUM",
        "latitude": 17.4390,
        "longitude": 78.4480,
        "location": "Banjara Hills Market Road",
        "image_path": "https://images.unsplash.com/photo-1605600659908-0ef719419d41?w=800",
        "evidence_quality": "HIGH / VERIFIED BY PHOTO",
        "ai_confidence": 91
    }
    sub_b = client.post("/complaints", json=comp_data_b, headers={"Authorization": f"Bearer {token_b}"})
    assert sub_b.status_code in [200, 201]
    comp_b_id = sub_b.json()["id"]
    print(f"[PASS] Complaint B Created in DB: {comp_b_id}")

    # Verify Citizen A still only sees Complaint A, and Citizen B only sees Complaint B
    mine_a = client.get("/complaints/mine", headers={"Authorization": f"Bearer {token_a}"})
    mine_b = client.get("/complaints/mine", headers={"Authorization": f"Bearer {token_b}"})
    assert len(mine_a.json()) == 1 and mine_a.json()[0]["id"] == comp_a_id
    assert len(mine_b.json()) == 1 and mine_b.json()[0]["id"] == comp_b_id
    print("[PASS] Multi-tenant Privacy Check: Citizen A and B have separate, protected complaint histories.")

    # 5. Duplicate Check Endpoint Test
    dup_res = client.post("/complaints/check-duplicate", json={
        "description": "Big pothole on Road 36 Jubilee Hills",
        "location": "Jubilee Hills",
        "latitude": 17.4326,
        "longitude": 78.4072
    })
    assert dup_res.status_code == 200
    dup_data = dup_res.json()
    assert dup_data["is_potential_duplicate"] == True
    print(f"[PASS] Duplicate Detection API: Found existing {dup_data['existing_complaint_id']} with {dup_data['similarity_percentage']}% similarity.")

    # 6. Admin Authentication & Operations
    admin_login = client.post("/auth/admin/login", json={
        "email": "admin@civicresolve.ai",
        "password": "admin123"
    })
    assert admin_login.status_code == 200, f"Admin login failed: {admin_login.text}"
    admin_token = admin_login.json()["access_token"]
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    print("[PASS] Admin Authenticated successfully.")

    # 7. CRITICAL VERIFICATION: Admin Read/Detail does NOT delete complaint
    count_before = len(client.get("/admin/complaints", headers=admin_headers).json()["items"])
    detail_res = client.get(f"/admin/complaints/{comp_a_id}", headers=admin_headers)
    assert detail_res.status_code == 200
    assert detail_res.json()["id"] == comp_a_id
    count_after = len(client.get("/admin/complaints", headers=admin_headers).json()["items"])
    assert count_before == count_after, "CRITICAL ERROR: Viewing complaint modified or deleted records!"
    print(f"[PASS] Non-Destructive Read Verified: Viewing complaint {comp_a_id} left count invariant ({count_after} records).")

    # 8. Admin Status Progression
    status_progression = ["Assigned", "In Progress", "Inspection", "Resolved"]
    for st in status_progression:
        patch_res = client.patch(f"/admin/complaints/{comp_a_id}/status", json={
            "status": st,
            "message": f"Field operational status updated to {st}",
            "updated_by": "admin"
        }, headers=admin_headers)
        assert patch_res.status_code == 200
        assert patch_res.json()["status"] == st
        print(f"  -> Status updated to: {st}")

    # 9. Public Map Incidents Filter Check
    # Active complaints filter out Resolved/Closed
    map_incidents = client.get("/public/map/incidents").json()
    map_ids = [m["id"] for m in map_incidents]
    assert comp_a_id not in map_ids, "Resolved complaint A is still in active public map layer!"
    assert comp_b_id in map_ids, "Active complaint B is missing from active public map layer!"
    print(f"[PASS] Map Layer Lifecycle Verified: Active incidents ({len(map_incidents)}) correctly excludes Resolved cases.")

    print("\n=================================================================")
    print("   ALL 9 END-TO-END CIVICRESOLVE TESTS PASSED WITH 100% SUCCESS  ")
    print("=================================================================\n")

if __name__ == "__main__":
    run_tests()
