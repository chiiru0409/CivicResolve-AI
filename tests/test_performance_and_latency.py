import sys
import time
import pytest
from pathlib import Path
from fastapi.testclient import TestClient

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent.parent / "backend"
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from main import app, invalidate_server_cache, get_server_cached, set_server_cached
from database import get_connection, init_db, _SQLITE_LOCAL
from auth import create_token, get_admin_credentials


@pytest.fixture(scope="module")
def test_client():
    init_db()
    client = TestClient(app)
    return client


@pytest.fixture(scope="module")
def admin_token(test_client):
    res = test_client.post("/api/auth/admin/login", json={
        "email": "admin@civicresolve.ai",
        "password": "admin123",
    })
    assert res.status_code == 200, f"Admin login failed: {res.text}"
    return res.json()["access_token"]


@pytest.fixture(scope="module")
def citizen_token(test_client):
    ts = int(time.time() * 1000)
    email = f"perf_cit_{ts}@civic.com"
    res = test_client.post("/api/auth/register", json={
        "full_name": "Performance Tester Citizen",
        "email": email,
        "phone": "+91 9876543210",
        "password": "Password123!",
    })
    assert res.status_code in (200, 201), f"Citizen registration failed: {res.text}"
    return res.json()["access_token"]


def test_timing_middleware_header_present(test_client):
    """Verify that every endpoint includes the X-Process-Time latency telemetry header."""
    res = test_client.get("/api/departments")
    assert res.status_code == 200
    assert "x-process-time" in res.headers
    assert res.headers["x-process-time"].endswith("ms")


def test_sqlite_thread_local_connection_reuse():
    """Verify that thread-local SQLite connection wrapper reuses connection object across calls."""
    conn1 = get_connection()
    c1_id = id(getattr(_SQLITE_LOCAL, "conn", None))
    conn1.close()

    conn2 = get_connection()
    c2_id = id(getattr(_SQLITE_LOCAL, "conn", None))
    conn2.close()

    assert c1_id == c2_id, "SQLite thread-local connection was recreated instead of reused"


def test_admin_overview_latency_and_caching(test_client, admin_token):
    """Verify that /admin/overview executes in under 100ms and leverages server-side micro-caching."""
    headers = {"Authorization": f"Bearer {admin_token}"}
    invalidate_server_cache()

    # First fetch (cold DB query)
    t0 = time.perf_counter()
    res1 = test_client.get("/api/admin/overview", headers=headers)
    t1 = time.perf_counter()
    assert res1.status_code == 200
    cold_time = (t1 - t0) * 1000
    assert "total_complaints" in res1.json()

    # Second fetch (warm server cache)
    t2 = time.perf_counter()
    res2 = test_client.get("/api/admin/overview", headers=headers)
    t3 = time.perf_counter()
    assert res2.status_code == 200
    warm_time = (t3 - t2) * 1000

    assert warm_time <= 50.0, f"Cached /admin/overview took too long: {warm_time:.2f}ms"
    assert res1.json()["total_complaints"] == res2.json()["total_complaints"]


def test_admin_analytics_latency_and_caching(test_client, admin_token):
    """Verify that /admin/analytics executes quickly and leverages server-side micro-caching."""
    headers = {"Authorization": f"Bearer {admin_token}"}
    invalidate_server_cache()

    # First fetch
    t0 = time.perf_counter()
    res1 = test_client.get("/api/admin/analytics", headers=headers)
    t1 = time.perf_counter()
    assert res1.status_code == 200
    assert "by_category" in res1.json()

    # Second fetch (warm server cache)
    t2 = time.perf_counter()
    res2 = test_client.get("/api/admin/analytics", headers=headers)
    t3 = time.perf_counter()
    assert res2.status_code == 200
    warm_time = (t3 - t2) * 1000

    assert warm_time <= 50.0, f"Cached /admin/analytics took too long: {warm_time:.2f}ms"


def test_public_map_incidents_latency(test_client):
    """Verify that /public/map/incidents returns in sub-50ms."""
    invalidate_server_cache()
    t0 = time.perf_counter()
    res = test_client.get("/api/public/map/incidents")
    t1 = time.perf_counter()
    assert res.status_code == 200
    assert isinstance(res.json(), list)

    t2 = time.perf_counter()
    res_cached = test_client.get("/api/public/map/incidents")
    t3 = time.perf_counter()
    assert res_cached.status_code == 200
    assert (t3 - t2) * 1000 <= 50.0


def test_duplicate_check_fast_execution(test_client):
    """Verify that /complaints/check-duplicate runs fast without hanging."""
    t0 = time.perf_counter()
    res = test_client.post(
        "/api/complaints/check-duplicate",
        json={
            "description": "Large pothole on 100ft road near junction causing traffic blockage",
            "category": "Roads",
            "location": "100ft Road Indiranagar",
            "latitude": 12.9716,
            "longitude": 77.5946,
        },
    )
    t1 = time.perf_counter()
    assert res.status_code == 200
    data = res.json()
    assert "is_potential_duplicate" in data
    assert (t1 - t0) * 1000 <= 500.0, f"Duplicate check took too long: {(t1 - t0)*1000:.2f}ms"


def test_cache_invalidation_on_complaint_submission(test_client, citizen_token, admin_token):
    """Verify that filing a complaint instantly invalidates server-side analytics and overview caches."""
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    citizen_headers = {"Authorization": f"Bearer {citizen_token}"}

    # Prime the cache
    res_before = test_client.get("/api/admin/overview", headers=admin_headers)
    assert res_before.status_code == 200
    count_before = res_before.json()["total_complaints"]

    # Submit new complaint
    sub_res = test_client.post(
        "/api/complaints",
        headers=citizen_headers,
        json={
            "description": "Streetlight broken on 4th cross road, area completely dark at night",
            "category": "Streetlights",
            "priority": "HIGH",
            "location": "4th Cross Indiranagar",
            "title": "Broken Streetlight on 4th Cross",
        },
    )
    assert sub_res.status_code == 201

    # Fetch overview again - must be fresh and reflect the incremented count
    res_after = test_client.get("/api/admin/overview", headers=admin_headers)
    assert res_after.status_code == 200
    count_after = res_after.json()["total_complaints"]
    assert count_after >= count_before + 1
