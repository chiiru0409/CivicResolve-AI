"""
Live Production Verification Test Suite for CivicResolve AI
Tests the live deployed Vercel application at: https://civic-resolve-ai-seven.vercel.app/
"""

import urllib.request
import urllib.parse
import json
import time

BASE_URL = "https://civic-resolve-ai-seven.vercel.app/api"

def request(method, path, data=None, headers=None):
    url = f"{BASE_URL}{path}"
    h = {"Content-Type": "application/json", "User-Agent": "CivicResolve-E2ELiveTester/1.0"}
    if headers:
        h.update(headers)
    body = json.dumps(data).encode('utf-8') if data else None
    req = urllib.request.Request(url, data=body, headers=h, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            status = resp.status
            resp_body = resp.read().decode('utf-8')
            return status, json.loads(resp_body) if resp_body else {}
    except urllib.error.HTTPError as e:
        resp_body = e.read().decode('utf-8')
        try:
            return e.code, json.loads(resp_body)
        except Exception:
            return e.code, {"error": resp_body}
    except Exception as e:
        return 500, {"error": str(e)}

def run_full_lifecycle():
    print("=================================================================")
    print("   CIVICRESOLVE AI — PRODUCTION LIVE DEPLOYMENT TEST SUITE       ")
    print(f"   Target URL: {BASE_URL}")
    print("=================================================================\n")

    ts = int(time.time())

    # 1. Citizen A Registration
    email_a = f"citizen_a_{ts}@livecivic.com"
    code, res = request("POST", "/auth/register", {
        "full_name": "Citizen Ramesh Kumar",
        "email": email_a,
        "phone": "+919876543210",
        "password": "Password123!"
    })
    assert code in (200, 201), f"Citizen A register failed: {res}"
    token_a = res["access_token"]
    user_a_id = res["user_id"]
    h_a = {"Authorization": f"Bearer {token_a}"}
    print(f"[PASS] Citizen A Registered: ID={user_a_id}, Email={email_a}")

    # 2. Citizen A Re-login & /auth/me
    code, res = request("POST", "/auth/login", {"email": email_a, "password": "Password123!"})
    assert code == 200, f"Citizen A login failed: {res}"
    assert res["user_id"] == user_a_id, "User ID mismatch upon re-login!"
    code, me_a = request("GET", "/auth/me", headers=h_a)
    assert code == 200 and me_a["email"] == email_a
    print("[PASS] Citizen A Identity Restored: Token & /auth/me verified.")

    # 3. Citizen A Submits Complaint A
    code, comp_a = request("POST", "/complaints", {
        "title": "Severe Main Road Crater",
        "description": "Deep road rupture causing severe vehicle damage on Jubilee Hills Road 36.",
        "category": "Roads",
        "department": "Municipal Roads & Infrastructure",
        "priority": "HIGH",
        "location": "Road No 36, Jubilee Hills, Hyderabad",
        "latitude": 17.4325,
        "longitude": 78.4071,
        "evidence_quality": "HIGH / VERIFIED BY PHOTO",
        "ai_confidence": 94
    }, headers=h_a)
    assert code in (200, 201), f"Complaint A submission failed: {comp_a}"
    comp_a_id = comp_a["id"]
    print(f"[PASS] Complaint A Created: {comp_a_id} (Status: {comp_a['status']})")

    # 4. Citizen A Queries /complaints/mine
    code, mine_a = request("GET", "/complaints/mine", headers=h_a)
    assert code == 200 and len(mine_a) >= 1
    assert any(c["id"] == comp_a_id for c in mine_a)
    print(f"[PASS] Citizen A Dashboard: Found Complaint A in /complaints/mine.")

    # 5. Citizen B Registration & Data Isolation
    email_b = f"citizen_b_{ts}@livecivic.com"
    code, res = request("POST", "/auth/register", {
        "full_name": "Citizen Priya Sharma",
        "email": email_b,
        "phone": "+919876543211",
        "password": "Password123!"
    })
    assert code in (200, 201)
    token_b = res["access_token"]
    user_b_id = res["user_id"]
    h_b = {"Authorization": f"Bearer {token_b}"}
    print(f"[PASS] Citizen B Registered: ID={user_b_id}, Email={email_b}")

    # Citizen B calls /complaints/mine -> MUST NOT see Citizen A's complaints
    code, mine_b = request("GET", "/complaints/mine", headers=h_b)
    assert code == 200
    assert not any(c["id"] == comp_a_id for c in mine_b), "Citizen B saw Citizen A's complaints!"
    print("[PASS] Multi-tenant Isolation: Citizen B sees 0 complaints of Citizen A.")

    # Citizen B Submits Complaint B
    code, comp_b = request("POST", "/complaints", {
        "title": "Overflowing Garbage Dumpster",
        "description": "Market square commercial garbage dumpster overflowing for 3 days.",
        "category": "Garbage",
        "department": "Sanitation & Waste Management",
        "priority": "MEDIUM",
        "location": "Banjara Hills Market Road",
        "latitude": 17.4390,
        "longitude": 78.4480,
        "evidence_quality": "HIGH / VERIFIED BY PHOTO",
        "ai_confidence": 91
    }, headers=h_b)
    assert code in (200, 201)
    comp_b_id = comp_b["id"]
    print(f"[PASS] Complaint B Created: {comp_b_id}")

    # 6. Admin Authentication & Operations
    code, admin_res = request("POST", "/auth/admin/login", {
        "email": "admin@civicresolve.ai",
        "password": "admin123"
    })
    assert code == 200, f"Admin login failed: {admin_res}"
    admin_token = admin_res["access_token"]
    h_admin = {"Authorization": f"Bearer {admin_token}"}
    print("[PASS] Admin Login: Authority token issued.")

    # 7. Admin List Complaints (Both A and B exist)
    code, adm_list = request("GET", "/admin/complaints", headers=h_admin)
    assert code == 200
    items = adm_list.get("items", [])
    ids = [c["id"] for c in items]
    assert comp_a_id in ids and comp_b_id in ids, f"Admin list missing complaints! ids={ids}"
    initial_count = len(items)
    print(f"[PASS] Admin Complaints List: Both Complaint A and B present (Total: {initial_count}).")

    # 8. Non-Destructive Read: Admin opens Complaint Detail
    code, detail_a = request("GET", f"/admin/complaints/{comp_a_id}", headers=h_admin)
    assert code == 200 and detail_a["id"] == comp_a_id
    code, adm_list2 = request("GET", "/admin/complaints", headers=h_admin)
    assert len(adm_list2.get("items", [])) == initial_count, "Opening complaint modified/deleted records!"
    print(f"[PASS] Non-Destructive Read Verified: Detail view did not mutate records.")

    # 9. Admin Navigation to Map & Invariance
    code, map_pins = request("GET", "/public/map/incidents")
    assert code == 200
    map_ids = [m["id"] for m in map_pins]
    assert comp_a_id in map_ids and comp_b_id in map_ids, "Map incidents missing active pins!"
    print(f"[PASS] Live Map Incidents: Found {len(map_pins)} active incident pins.")

    # 10. Admin Status Progression
    code, patch_res = request("PATCH", f"/admin/complaints/{comp_a_id}/status", {
        "status": "In Progress",
        "message": "Field repair team dispatched to site.",
        "updated_by": "admin"
    }, headers=h_admin)
    assert code == 200 and patch_res["status"] == "In Progress"
    print(f"[PASS] Status Update: Complaint A transitioned to 'In Progress'.")

    # 11. Public Tracking Verification
    code, track_a = request("GET", f"/track/{comp_a_id}")
    assert code == 200 and track_a["status"] == "In Progress"
    print(f"[PASS] Public Tracking: Status matches 'In Progress'.")

    # 12. Resolve Complaint A
    code, patch_res2 = request("PATCH", f"/admin/complaints/{comp_a_id}/status", {
        "status": "Resolved",
        "message": "Bitumen crater repaired and inspected.",
        "updated_by": "admin"
    }, headers=h_admin)
    assert code == 200 and patch_res2["status"] == "Resolved"
    print(f"[PASS] Resolution: Complaint A marked 'Resolved'.")

    # 13. Map Layer Exclusion for Resolved Items
    code, map_pins2 = request("GET", "/public/map/incidents")
    map_ids2 = [m["id"] for m in map_pins2]
    assert comp_a_id not in map_ids2, "Resolved complaint A is still in active map layer!"
    assert comp_b_id in map_ids2, "Active complaint B was improperly dropped from map!"
    print("[PASS] Map Lifecycle Verification: Resolved Complaint A archived from active map pins.")

    # 14. Citizen A History Retention
    code, mine_a_final = request("GET", "/complaints/mine", headers=h_a)
    assert code == 200 and any(c["id"] == comp_a_id and c["status"] == "Resolved" for c in mine_a_final)
    print("[PASS] Citizen Retention: Complaint A remains permanently in citizen record history.")

    print("\n=================================================================")
    print("   ALL 14 PRODUCTION LIVE LIFECYCLE TESTS PASSED WITH 100% SUCCESS")
    print("=================================================================\n")

if __name__ == "__main__":
    run_full_lifecycle()
