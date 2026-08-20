"""
test_agent.py — Verify the CivicResolve AI agent (LLM + fallback).

Run from the backend/ directory:
    python test_agent.py

Tests both LLM-powered and fallback analysis.
Does NOT require a running FastAPI server.
Does NOT touch the database.
"""

import sys
import json
import logging

logging.basicConfig(
    level=logging.INFO,
    format="%(levelname)s  %(message)s",
)

from agent import run_analysis

TESTS = [
    {
        "id": 1,
        "description": "There is a huge pothole near the main road. Two bikes almost fell.",
        "expect_category": "Roads",
        "expect_priority": ["HIGH", "MEDIUM"],
        "note": "Pothole + safety keywords",
    },
    {
        "id": 2,
        "description": "Garbage has not been collected for five days near the market. Flies and bad smell everywhere.",
        "expect_category": "Garbage",
        "expect_priority": ["MEDIUM", "HIGH"],
        "note": "Garbage + multiple days",
    },
    {
        "id": 3,
        "description": "The drainage is blocked and dirty water is flooding the street outside our colony.",
        "expect_category": "Drainage",
        "expect_priority": ["HIGH", "MEDIUM"],
        "note": "Drainage flooding",
    },
    {
        "id": 4,
        "description": "The streetlight near the school is not working since last week.",
        "expect_category": "Streetlights",
        "expect_priority": ["MEDIUM", "LOW"],
        "note": "Streetlight failure",
    },
    {
        "id": 5,
        "description": "There is water leaking continuously from a broken public pipeline at the main junction.",
        "expect_category": "Water",
        "expect_priority": ["HIGH", "MEDIUM"],
        "note": "Water pipeline leak",
    },
    {
        "id": 6,
        "description": "Something is wrong here.",
        "expect_category": None,  # any category is acceptable — must not crash
        "expect_priority": None,
        "note": "Ambiguous — must not crash, must return safe result",
    },
    {
        "id": 7,
        "description": "There is a large crack in the footbridge near the bus stop. It looks very dangerous.",
        "expect_category": "Infrastructure",
        "expect_priority": ["HIGH", "MEDIUM"],
        "note": "Infrastructure + danger keywords",
    },
]

PASS = "✅ PASS"
FAIL = "❌ FAIL"
WARN = "⚠️  WARN"

def run_tests():
    print("\n" + "═" * 60)
    print("  CIVICRESOLVE AI AGENT — TEST SUITE")
    print("═" * 60)

    passed = 0
    failed = 0

    for t in TESTS:
        print(f"\nTest {t['id']}: {t['note']}")
        print(f"  Input: {t['description'][:80]}")

        try:
            result = run_analysis(
                description=t["description"],
                location_text="Main Road",
                latitude=16.5062,
                longitude=80.6480,
            )
        except Exception as e:
            print(f"  {FAIL} — Exception raised: {e}")
            failed += 1
            continue

        # Check required fields present
        required = ["category", "priority", "severity", "department_name",
                    "assigned_team", "title", "ai_reason", "ai_confidence",
                    "estimated_response", "zone"]
        missing = [k for k in required if k not in result or result[k] is None]
        if missing:
            print(f"  {FAIL} — Missing fields: {missing}")
            failed += 1
            continue

        # Check category
        cat_ok = t["expect_category"] is None or result["category"] == t["expect_category"]
        # Check priority
        pri_ok = t["expect_priority"] is None or result["priority"] in t["expect_priority"]
        # Check confidence bounds
        conf   = result["ai_confidence"]
        conf_ok = isinstance(conf, int) and 60 <= conf <= 98
        # Check severity bounds
        sev    = result["severity"]
        sev_ok = isinstance(sev, int) and 1 <= sev <= 10

        if cat_ok and pri_ok and conf_ok and sev_ok:
            status = PASS
            passed += 1
        else:
            status = FAIL
            failed += 1

        print(f"  {status}")
        print(f"    category:    {result['category']}"
              + (f"  (expected {t['expect_category']})" if not cat_ok else ""))
        print(f"    priority:    {result['priority']}"
              + (f"  (expected one of {t['expect_priority']})" if not pri_ok else ""))
        print(f"    severity:    {result['severity']}/10")
        print(f"    confidence:  {result['ai_confidence']}%")
        print(f"    department:  {result['department_name']}")
        print(f"    team:        {result['assigned_team']}")
        print(f"    title:       {result['title']}")
        print(f"    reason:      {result['ai_reason'][:80]}...")

    print("\n" + "═" * 60)
    print(f"  Results: {passed}/{len(TESTS)} passed, {failed} failed")
    print("═" * 60 + "\n")

    return failed == 0


if __name__ == "__main__":
    success = run_tests()
    sys.exit(0 if success else 1)
