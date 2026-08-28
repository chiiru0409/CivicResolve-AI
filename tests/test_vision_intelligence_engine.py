"""
test_vision_intelligence_engine.py — Comprehensive Automated Test Suite for Civic Visual Intelligence Engine.

Validates:
1. Clear pothole detection
2. Minor road surface wear
3. Severe crater / sinkhole hazard
4. Garbage accumulation
5. Overflowing dumpster
6. Waterlogging & stormwater inundation
7. Sewage overflow
8. Broken streetlight & live wire hazard
9. Building structural collapse
10. Unrelated / non-civic image rejection (IRRELEVANT_IMAGE)
11. Blurry image quality rejection
12. Severe darkness rejection
13. Corrupted / unreadable image safety
14. Low resolution thumbnail handling
15. Multi-issue detection (primary + secondary)
16. Text-image exact match
17. Text-image partial match
18. Text-image contradiction detection
19. Ambiguous image abstention
20. Perceptual hashing and duplicate cache
21. Resized duplicate perceptual fingerprinting
22. Unsupported format robustness
23. Large image downscaling & aspect ratio preservation
24. Source transparency annotation
25. People photo rejection as non-civic (Never classified as structural damage)
26. Selfie photo rejection as non-civic
27. Animal / pet photo rejection as non-civic
28. Normal road (intact) not classified as road damage
29. Normal building (intact) not classified as building collapse
30. Normal clean drain not classified as drainage overflow
31. Clean street not classified as garbage accumulation
32. Normal water body not classified as water pipeline burst
33. Normal functioning streetlight not classified as broken streetlight
34. Overexposed image quality degradation
35. Regression test: people photo with road complaint flagged as CONTRADICTION & IRRELEVANT
"""

from __future__ import annotations

import base64
import io
import os
import sys
from pathlib import Path
import pytest
from fastapi.testclient import TestClient
from PIL import Image, ImageDraw

backend_dir = Path(__file__).resolve().parent.parent / "backend"
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from main import app
from database import init_db
from vision import (
    analyze_civic_image,
    compute_perceptual_hash,
    evaluate_image_quality,
    evaluate_image_relevance,
    load_and_preprocess_image,
)


@pytest.fixture(scope="module")
def client():
    init_db()
    return TestClient(app)


def _create_synthetic_image(width=400, height=300, color="gray", draw_shape="rectangle"):
    """Helper to create synthetic test PIL image."""
    img = Image.new("RGB", (width, height), color=color)
    draw = ImageDraw.Draw(img)
    if draw_shape == "pothole":
        draw.ellipse([width // 4, height // 4, width * 3 // 4, height * 3 // 4], fill="black", outline="darkgray")
    elif draw_shape == "garbage":
        draw.rectangle([width // 3, height // 3, width * 2 // 3, height * 2 // 3], fill="green", outline="brown")
    return img


def _img_to_base64(img: Image.Image) -> str:
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode("utf-8")


# ── Test 1: Clear Pothole Detection ───────────────────────────────────────────
def test_01_clear_pothole(client):
    res = client.post("/api/ai/analyze-image", json={
        "filename": "road_pothole_asphalt_cavity.jpg",
        "description": "Large pothole on the main road",
    })
    assert res.status_code == 200
    data = res.json()
    assert data["suggested_category"] == "Roads"
    assert data["severity"] == "High"
    assert any("pothole" in obj.lower() for obj in data["detected_objects"])
    assert data["confidence"] >= 80


# ── Test 2: Minor Road Surface Wear ───────────────────────────────────────────
def test_02_small_pothole_routine_wear():
    res = analyze_civic_image(
        filename="road_pavement_marking_fissure.jpg",
        description="Minor surface wear on sidewalk",
    )
    assert res["suggested_category"] == "Roads"
    assert res["visual_severity"] in ("Medium", "Low")
    assert res["severity_score"] <= 7


# ── Test 3: Severe Crater / Sinkhole Hazard ───────────────────────────────────
def test_03_severe_pothole_crater():
    res = analyze_civic_image(
        filename="massive_deep_sinkhole_road_collapse.jpg",
        description="Massive deep sinkhole collapsed the entire road",
    )
    assert res["suggested_category"] == "Roads"
    assert res["visual_severity"] == "High"
    assert res["severity_score"] >= 8
    assert any("asphalt" in f.lower() or "carriageway" in f.lower() for f in res["severity_factors"])


# ── Test 4: Garbage Accumulation ──────────────────────────────────────────────
def test_04_garbage_accumulation(client):
    res = client.post("/api/ai/analyze-image", json={
        "filename": "uncollected_garbage_solid_waste_pile.jpg",
        "description": "Piles of uncollected garbage on the street",
    })
    assert res.status_code == 200
    data = res.json()
    assert data["suggested_category"] == "Garbage"
    assert data["severity"] == "High"
    assert any("waste" in obj.lower() or "garbage" in obj.lower() for obj in data["detected_objects"])


# ── Test 5: Overflowing Dumpster ──────────────────────────────────────────────
def test_05_overflowing_garbage_bin():
    res = analyze_civic_image(
        filename="overflowing_municipal_dumpster_bin.jpg",
        description="Garbage bin is overflowing onto the sidewalk",
    )
    assert res["suggested_category"] == "Garbage"
    assert res["primary_issue"] == "Uncollected Municipal Waste"


# ── Test 6: Waterlogging & Stormwater Inundation ──────────────────────────────
def test_06_waterlogging(client):
    res = client.post("/api/ai/analyze-image", json={
        "filename": "street_waterlogging_flood_drainage.jpg",
        "description": "Heavy waterlogging after rain due to blocked drain",
    })
    assert res.status_code == 200
    data = res.json()
    assert data["suggested_category"] == "Drainage"
    assert data["severity"] == "High"


# ── Test 7: Sewage Overflow ───────────────────────────────────────────────────
def test_07_sewage_overflow():
    res = analyze_civic_image(
        filename="sewage_overflow_blocked_sewer_flood.jpg",
        description="Contaminated sewage water flooding the entire lane",
    )
    assert res["suggested_category"] == "Drainage"
    assert res["severity_score"] >= 8
    assert any("sewage" in f.lower() or "water" in f.lower() for f in res["severity_factors"])


# ── Test 8: Broken Streetlight & Live Wire Hazard ─────────────────────────────
def test_08_broken_streetlight_live_wire(client):
    res = client.post("/api/ai/analyze-image", json={
        "filename": "broken_streetlight_exposed_live_wire.jpg",
        "description": "Broken lamppost with sparking live electrical wire",
    })
    assert res.status_code == 200
    data = res.json()
    assert data["suggested_category"] == "Streetlights"
    assert data["severity"] == "High"
    assert any("wire" in obj.lower() or "luminaire" in obj.lower() or "lighting" in obj.lower() for obj in data["detected_objects"])


# ── Test 9: Building Structural Collapse ──────────────────────────────────────
def test_09_damaged_infrastructure_collapse(client):
    res = client.post("/api/ai/analyze-image", json={
        "filename": "building_structural_collapse_rubble.jpg",
        "description": "Building wall collapsed into rubble",
    })
    assert res.status_code == 200
    data = res.json()
    assert data["suggested_category"] == "Infrastructure"
    assert data["severity"] == "Critical"
    assert data["severity_score"] == 10


# ── Test 10: Unrelated / Non-Civic Image ───────────────────────────────────────
def test_10_unrelated_non_civic_image():
    res = analyze_civic_image(
        filename="birthday_party_celebration_cake.jpg",
        description="Someone celebrating a party",
    )
    assert res["analysis_status"] == "IRRELEVANT_IMAGE"
    assert res["confidence_band"] == "UNVERIFIED"
    assert res["severity"] == "UNKNOWN"


# ── Test 11: Blurry Image Quality Rejection ───────────────────────────────────
def test_11_blurry_image_rejection(client):
    res = client.post("/api/ai/analyze-image", json={
        "filename": "blurry_unfocused_motion_blur_photo.jpg",
        "description": "Road damage maybe",
    })
    assert res.status_code == 200
    data = res.json()
    assert data["analysis_status"] == "INSUFFICIENT_EVIDENCE"
    assert data["confidence"] == 0
    assert data["image_quality"]["quality_level"] in ("poor", "unusable")
    assert "heavy_blur" in data["image_quality"]["issues"]


# ── Test 12: Severe Darkness Rejection ────────────────────────────────────────
def test_12_severe_darkness_image():
    res = analyze_civic_image(
        filename="pitch_black_dark_unlit_night.jpg",
        description="Cannot see anything",
    )
    assert res["analysis_status"] == "INSUFFICIENT_EVIDENCE"
    assert "severe_darkness" in res["image_quality"]["issues"]


# ── Test 13: Corrupted / Unreadable Image Safety ──────────────────────────────
def test_13_corrupted_image_handling(client):
    res = client.post("/api/ai/analyze-image", json={
        "filename": "corrupted_empty_file.jpg",
        "image_data": "data:image/jpeg;base64,invalid_corrupt_payload!@#$",
        "description": "Broken upload",
    })
    assert res.status_code == 200
    data = res.json()
    assert data["analysis_status"] == "INSUFFICIENT_EVIDENCE"
    assert data["confidence"] == 0


# ── Test 14: Low Resolution Thumbnail Handling ────────────────────────────────
def test_14_low_resolution_tiny_image():
    tiny_img = _create_synthetic_image(width=40, height=40)
    res = analyze_civic_image(
        image_input=tiny_img,
        filename="thumbnail_tiny.jpg",
        description="Pothole",
    )
    assert "low_resolution" in res["image_quality"]["issues"]
    assert res["image_quality"]["quality_score"] < 60


# ── Test 15: Multi-Issue Detection (Primary + Secondary) ──────────────────────
def test_15_multi_issue_detection():
    res = analyze_civic_image(
        filename="pothole_road_with_overflowing_garbage_dump.jpg",
        description="Large road pothole with overflowing garbage dumped right next to it",
    )
    assert res["suggested_category"] in ("Roads", "Garbage")
    assert len(res["secondary_issues"]) >= 1
    assert len(res["detected_objects"]) >= 2


# ── Test 16: Text-Image Exact Match ───────────────────────────────────────────
def test_16_text_image_exact_match():
    res = analyze_civic_image(
        filename="asphalt_road_pothole_crater.jpg",
        description="Deep pothole on the asphalt road",
    )
    consistency = res["text_visual_consistency"]
    assert consistency["status"] == "MATCH"
    assert consistency["is_conflict"] is False
    assert consistency["score"] >= 90


# ── Test 17: Text-Image Partial Match ─────────────────────────────────────────
def test_17_text_image_partial_match():
    res = analyze_civic_image(
        filename="road_pothole_asphalt.jpg",
        description="Issue near marketplace",
    )
    consistency = res["text_visual_consistency"]
    assert consistency["status"] in ("MATCH", "PARTIAL_MATCH")
    assert consistency["is_conflict"] is False


# ── Test 18: Text-Image Contradiction Detection ───────────────────────────────
def test_18_text_image_contradiction(client):
    res = client.post("/api/ai/analyze-image", json={
        "filename": "road_pothole_crater_asphalt.jpg",
        "description": "A residential building collapsed in our colony yesterday",
    })
    assert res.status_code == 200
    data = res.json()
    assert data["suggested_category"] == "Roads"
    consistency = data["text_visual_consistency"]
    assert consistency["status"] == "CONTRADICTION"
    assert consistency["is_conflict"] is True
    assert consistency["conflict_type"] == "TEXT_VISUAL_MISMATCH"
    assert "visual_option" in consistency
    assert "text_option" in consistency


# ── Test 19: Ambiguous Image Abstention ───────────────────────────────────────
def test_19_ambiguous_image_abstention():
    blank_img = Image.new("RGB", (300, 300), color=(128, 128, 128))
    res = analyze_civic_image(
        image_input=blank_img,
        filename="blank_gray_wall.jpg",
        description="Unspecified civic issue",
    )
    assert res["image_quality"]["quality_score"] < 70 or res["suggested_category"] == "Other"


# ── Test 20: Perceptual Hashing & Duplicate Cache ─────────────────────────────
def test_20_perceptual_hash_exact_duplicate():
    img = _create_synthetic_image(300, 300, color="darkgray", draw_shape="pothole")
    res1 = analyze_civic_image(
        image_input=img,
        filename="pothole_proof_01.jpg",
        description="Pothole on 5th cross",
    )
    # Second identical call
    res2 = analyze_civic_image(
        image_input=img,
        filename="pothole_proof_01.jpg",
        description="Pothole on 5th cross",
    )
    assert res1["perceptual_hash"] == res2["perceptual_hash"]
    assert res2["source"] == "HYBRID_CACHE"
    assert res2["inference_time_ms"] < 20.0


# ── Test 21: Resized Duplicate Perceptual Fingerprinting ──────────────────────
def test_21_resized_duplicate_perceptual_fingerprint():
    img_large = _create_synthetic_image(600, 450, color="gray", draw_shape="garbage")
    img_small = img_large.resize((300, 225), Image.Resampling.BILINEAR)

    hash_large = compute_perceptual_hash(img_large)
    hash_small = compute_perceptual_hash(img_small)
    assert hash_large == hash_small


# ── Test 22: Unsupported Format Robustness ────────────────────────────────────
def test_22_unsupported_format_robustness():
    img, err = load_and_preprocess_image(12345)
    assert img is None
    assert err is not None


# ── Test 23: Large Image Downscaling ──────────────────────────────────────────
def test_23_large_image_downscaling():
    large_img = Image.new("RGB", (3200, 2400), color="blue")
    processed, err = load_and_preprocess_image(large_img, max_dimension=1024)
    assert err is None
    assert processed is not None
    assert max(processed.size) <= 1024
    ratio_orig = 3200 / 2400
    ratio_proc = processed.size[0] / processed.size[1]
    assert abs(ratio_orig - ratio_proc) < 0.02


# ── Test 24: Source Transparency Annotation ───────────────────────────────────
def test_24_source_transparency(client):
    res = client.post("/api/ai/analyze-image", json={
        "filename": "water_pipeline_leakage.jpg",
        "description": "Potable water pipeline rupture",
    })
    assert res.status_code == 200
    data = res.json()
    assert data["source"] in ("MODEL", "DETERMINISTIC", "HYBRID", "HYBRID_CACHE", "FALLBACK")
    assert "inference_time_ms" in data


# ── Test 25: People Photo Rejection as Non-Civic ──────────────────────────────
def test_25_people_photo_rejected_as_non_civic():
    res = analyze_civic_image(
        filename="group_people_portrait_outdoor.jpg",
        description="Two people standing near a street corner",
    )
    assert res["analysis_status"] == "IRRELEVANT_IMAGE"
    assert res["confidence_band"] == "UNVERIFIED"
    assert res["severity"] == "UNKNOWN"
    assert res["severity_score"] == 0
    assert any("person" in obj.lower() or "human" in obj.lower() or "non-civic" in obj.lower() for obj in res["detected_objects"])


# ── Test 26: Selfie Photo Rejection as Non-Civic ──────────────────────────────
def test_26_selfie_rejected_as_non_civic():
    res = analyze_civic_image(
        filename="front_camera_selfie_face.jpg",
        description="Selfie uploaded by citizen",
    )
    assert res["analysis_status"] == "IRRELEVANT_IMAGE"
    assert res["confidence"] <= 20
    assert res["confidence_band"] == "UNVERIFIED"


# ── Test 27: Animal / Pet Photo Rejection as Non-Civic ────────────────────────
def test_27_animal_rejected_as_non_civic():
    res = analyze_civic_image(
        filename="cat_pet_sitting_indoors.jpg",
        description="My cat at home",
    )
    assert res["analysis_status"] == "IRRELEVANT_IMAGE"
    assert res["severity"] == "UNKNOWN"


# ── Test 28: Normal Road (Intact) Not Classified as Road Damage ───────────────
def test_28_normal_road_no_damage_detected():
    res = analyze_civic_image(
        filename="normal_road_asphalt_good_condition.jpg",
        description="Paved street in good condition",
    )
    assert res["analysis_status"] == "NO_CIVIC_DEFECT_DETECTED"
    assert res["severity"] == "UNKNOWN"
    assert res["severity_score"] == 0


# ── Test 29: Normal Building (Intact) Not Classified as Building Collapse ─────
def test_29_normal_building_no_collapse():
    res = analyze_civic_image(
        filename="normal_building_painted_facade.jpg",
        description="Residential building exterior",
    )
    assert res["analysis_status"] == "NO_CIVIC_DEFECT_DETECTED"
    assert res["severity"] == "UNKNOWN"


# ── Test 30: Normal Clean Drain Not Classified as Drainage Defect ─────────────
def test_30_normal_clean_drain_no_defect():
    res = analyze_civic_image(
        filename="normal_drain_clean_gutter.jpg",
        description="Clean dry concrete drain",
    )
    assert res["analysis_status"] == "NO_CIVIC_DEFECT_DETECTED"
    assert res["severity"] == "UNKNOWN"


# ── Test 31: Clean Street Not Classified as Garbage Accumulation ──────────────
def test_31_clean_street_no_garbage():
    res = analyze_civic_image(
        filename="clean_street_swept_sidewalk.jpg",
        description="Clean sidewalk after morning sweep",
    )
    assert res["analysis_status"] == "NO_CIVIC_DEFECT_DETECTED"
    assert res["severity"] == "UNKNOWN"


# ── Test 32: Normal Water Body Not Classified as Pipeline Burst ───────────────
def test_32_normal_water_body_no_leak():
    res = analyze_civic_image(
        filename="normal_water_lake_scenery.jpg",
        description="Calm lake view",
    )
    assert res["analysis_status"] == "NO_CIVIC_DEFECT_DETECTED"
    assert res["severity"] == "UNKNOWN"


# ── Test 33: Normal Streetlight Not Classified as Broken Streetlight ──────────
def test_33_normal_streetlight_intact():
    res = analyze_civic_image(
        filename="normal_streetlight_functioning_lamp.jpg",
        description="Working street illumination pole",
    )
    assert res["analysis_status"] == "NO_CIVIC_DEFECT_DETECTED"
    assert res["severity"] == "UNKNOWN"


# ── Test 34: Overexposed Image Quality Degradation ────────────────────────────
def test_34_overexposed_image_rejection():
    res = analyze_civic_image(
        filename="overexposed_whiteout_glare.jpg",
        description="Glare photo",
    )
    # The optical gate notes quality degradation
    assert res["image_quality"]["quality_score"] <= 80


# ── Test 35: Regression Test: People Photo with Road Complaint ────────────────
def test_35_regression_people_photo_with_road_complaint_is_not_other_damage(client):
    """
    CRITICAL REGRESSION TEST:
    Verifies that a photo of ordinary people submitted with a road complaint
    is NEVER classified as 'Other Damage' with high confidence (e.g. 86%).
    Must return IRRELEVANT_IMAGE, UNKNOWN severity, UNVERIFIED confidence, and CONTRADICTION.
    """
    res = client.post("/api/ai/analyze-image", json={
        "filename": "portrait_two_people_standing_outdoors.jpg",
        "description": "Deep road pothole causing traffic jam",
    })
    assert res.status_code == 200
    data = res.json()

    # 1. Must NOT be high confidence
    assert data["confidence"] <= 20
    assert data["confidence_band"] == "UNVERIFIED"

    # 2. Must NOT be classified as high/medium damage
    assert data["severity"] == "UNKNOWN"
    assert data["severity_score"] == 0

    # 3. Must be flagged as IRRELEVANT_IMAGE
    assert data["analysis_status"] == "IRRELEVANT_IMAGE"

    # 4. Cross-modal must detect CONTRADICTION (Photo of people vs Road pothole text)
    assert data["text_visual_consistency"]["status"] == "CONTRADICTION"
    assert data["text_visual_consistency"]["is_conflict"] is True
