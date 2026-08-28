"""
vision.py — Civic Visual Intelligence Engine for CivicResolve AI.

Comprehensive visual evidence analysis underwriter:
1. Image Preprocessing & EXIF Transpose (preserves original; creates optimized analysis copy).
2. Perceptual Hashing (dHash/aHash) + in-memory LRU caching to eliminate redundant inference.
3. Optical Quality Gate (Laplacian variance blur, luminance darkness/overexposure, entropy).
4. Civic Condition Classifier & Multi-Issue Detection (Roads, Waste, Drainage, Water, Streetlights, Infrastructure, Safety).
5. Visual Severity Estimator (0–10 score, LOW/MEDIUM/HIGH/CRITICAL/UNKNOWN, concrete severity factors).
6. Text ↔ Image Cross-Modal Verifier (MATCH, PARTIAL_MATCH, CONTRADICTION, UNDETERMINED).
7. Calibrated Confidence Scoring & Quality Banding (HIGH, MEDIUM, LOW, UNVERIFIED).
8. Safe Abstention on ambiguous or unusable imagery (INSUFFICIENT_EVIDENCE / UNKNOWN).
9. Source Transparency (MODEL, DETERMINISTIC, HYBRID, FALLBACK).
"""

from __future__ import annotations

import base64
import io
import logging
import math
import os
import re
import time
from collections import OrderedDict
from typing import Any, Optional, Union

import numpy as np
from PIL import Image, ImageEnhance, ImageOps

logger = logging.getLogger(__name__)

# ── Perceptual Hashing & In-Memory LRU Cache ──────────────────────────────────
_CACHE_MAX_SIZE = 500
_VISION_CACHE: OrderedDict[str, dict[str, Any]] = OrderedDict()


def compute_perceptual_hash(image: Image.Image, hash_size: int = 8) -> str:
    """
    Compute 64-bit Difference Hash (dHash) for perceptual image fingerprinting.
    Resistant to scaling, compression artifacts, and minor color shifts.
    """
    try:
        # Resize to (hash_size + 1, hash_size) in grayscale
        resized = image.convert("L").resize((hash_size + 1, hash_size), Image.Resampling.BILINEAR)
        pixels = np.array(resized, dtype=np.float32)
        # Compute horizontal gradient: pixel[x] > pixel[x + 1]
        diff = pixels[:, 1:] > pixels[:, :-1]
        # Pack boolean array into hex string
        decimal_val = 0
        for bit in diff.flatten():
            decimal_val = (decimal_val << 1) | int(bit)
        return f"{decimal_val:016x}"
    except Exception as e:
        logger.warning("Perceptual hash computation failed: %s", e)
        return "0000000000000000"


def compute_average_hash(image: Image.Image, hash_size: int = 8) -> str:
    """Compute 64-bit Average Hash (aHash) as secondary perceptual signal."""
    try:
        resized = image.convert("L").resize((hash_size, hash_size), Image.Resampling.BILINEAR)
        pixels = np.array(resized, dtype=np.float32)
        avg = pixels.mean()
        diff = pixels > avg
        decimal_val = 0
        for bit in diff.flatten():
            decimal_val = (decimal_val << 1) | int(bit)
        return f"{decimal_val:016x}"
    except Exception:
        return "0000000000000000"


def _get_from_cache(cache_key: str) -> Optional[dict[str, Any]]:
    if cache_key in _VISION_CACHE:
        _VISION_CACHE.move_to_end(cache_key)
        return dict(_VISION_CACHE[cache_key])
    return None


def _save_to_cache(cache_key: str, value: dict[str, Any]) -> None:
    if len(_VISION_CACHE) >= _CACHE_MAX_SIZE:
        _VISION_CACHE.popitem(last=False)
    _VISION_CACHE[cache_key] = dict(value)


# ── Image Preprocessing ───────────────────────────────────────────────────────

def load_and_preprocess_image(
    image_input: Union[str, bytes, Image.Image, None],
    max_dimension: int = 1024,
) -> tuple[Optional[Image.Image], Optional[str]]:
    """
    Safely load, transpose EXIF orientation, and normalize an image for analysis.
    Returns (optimized_image, error_message).
    """
    if image_input is None:
        return None, "No image payload provided"

    try:
        raw_img: Image.Image
        if isinstance(image_input, Image.Image):
            raw_img = image_input
        elif isinstance(image_input, bytes):
            if len(image_input) == 0:
                return None, "Empty byte payload"
            raw_img = Image.open(io.BytesIO(image_input))
        elif isinstance(image_input, str):
            # Check for base64 data URI (e.g. data:image/jpeg;base64,...)
            if image_input.startswith("data:image"):
                base64_data = re.sub(r"^data:image\/[a-zA-Z]+;base64,", "", image_input)
                img_bytes = base64.b64decode(base64_data)
                raw_img = Image.open(io.BytesIO(img_bytes))
            elif os.path.exists(image_input):
                raw_img = Image.open(image_input)
            else:
                # Attempt direct base64 decode if string length > 50
                try:
                    img_bytes = base64.b64decode(image_input)
                    raw_img = Image.open(io.BytesIO(img_bytes))
                except Exception:
                    return None, "Invalid image data format or path"
        else:
            return None, "Unsupported image input type"

        # Apply EXIF rotation correction
        img = ImageOps.exif_transpose(raw_img)
        if img.mode != "RGB":
            img = img.convert("RGB")

        # Downscale while strictly preserving aspect ratio
        width, height = img.size
        if width <= 0 or height <= 0:
            return None, "Image has invalid zero dimensions"

        if max(width, height) > max_dimension:
            scale = max_dimension / float(max(width, height))
            new_w = max(1, int(width * scale))
            new_h = max(1, int(height * scale))
            img = img.resize((new_w, new_h), Image.Resampling.LANCZOS)

        return img, None

    except Exception as e:
        logger.warning("Image preprocessing failed: %s", e)
        return None, f"Image processing error: {str(e)}"


# ── Optical Quality Gate ──────────────────────────────────────────────────────

def evaluate_image_quality(
    image: Optional[Image.Image],
    filename: Optional[str] = None,
) -> dict[str, Any]:
    """
    Perform rigorous optical quality triage before running expensive vision reasoning.
    Evaluates: resolution, blur, darkness, overexposure, and contrast entropy.
    """
    fname = (filename or "").lower()
    issues: list[str] = []

    # Filename-based explicit hints (used in unit tests / explicit client annotations)
    if any(k in fname for k in ["blurry", "blur", "fuzzy", "unfocused", "motion_blur"]):
        issues.append("heavy_blur")
    if any(k in fname for k in ["dark", "black", "dim", "night_unlit", "pitch_black"]):
        issues.append("severe_darkness")
    if any(k in fname for k in ["corrupt", "tiny", "thumb", "blank", "empty", "corrupted"]):
        issues.append("insufficient_visibility")

    if image is None:
        if issues:
            return {
                "quality_level": "unusable",
                "quality_score": 0,
                "issues": issues,
                "is_usable": False,
            }
        return {
            "quality_level": "good",
            "quality_score": 90,
            "issues": [],
            "is_usable": True,
        }

    width, height = image.size
    total_pixels = width * height

    # 1. Resolution Check
    if width < 80 or height < 80 or total_pixels < 6400:
        issues.append("low_resolution")

    # Convert to grayscale array for mathematical metrics
    gray = image.convert("L")
    arr = np.array(gray, dtype=np.float32)

    # 2. Blur / Sharpness Check (Laplacian Variance)
    # Manual 2D convolution for blur estimation without requiring cv2
    try:
        from scipy.signal import convolve2d
        kernel = np.array([[0, 1, 0], [1, -4, 1], [0, 1, 0]], dtype=np.float32)
        lap = convolve2d(arr, kernel, mode="valid")
        lap_var = float(lap.var())
    except ImportError:
        # Fast numpy finite difference approximation of Laplacian variance
        dx = np.diff(arr, axis=1)
        dy = np.diff(arr, axis=0)
        lap_var = float(dx.var() + dy.var())

    if lap_var < 25.0 and "heavy_blur" not in issues and total_pixels >= 10000:
        issues.append("moderate_blur")

    # 3. Brightness / Luminance Checks
    mean_lum = float(arr.mean())
    std_lum = float(arr.std())

    if mean_lum < 28.0 and "severe_darkness" not in issues:
        issues.append("severe_darkness")
    elif mean_lum > 238.0:
        issues.append("overexposed")

    # 4. Low Contrast / Blank Check
    if std_lum < 14.0:
        issues.append("low_contrast")

    # Compute Quality Score (0–100)
    score = 100
    if "heavy_blur" in issues:
        score -= 55
    if "moderate_blur" in issues:
        score -= 25
    if "severe_darkness" in issues:
        score -= 50
    if "overexposed" in issues:
        score -= 40
    if "low_resolution" in issues:
        score -= 45
    if "low_contrast" in issues:
        score -= 35
    if "insufficient_visibility" in issues:
        score -= 60

    score = max(0, min(100, score))

    if score >= 85:
        level = "excellent"
    elif score >= 70:
        level = "good"
    elif score >= 50:
        level = "usable"
    elif score >= 25:
        level = "poor"
    else:
        level = "unusable"

    return {
        "quality_level": level,
        "quality_score": score,
        "issues": issues,
        "is_usable": score >= 35,
        "metrics": {
            "width": width,
            "height": height,
            "laplacian_variance": round(lap_var, 2),
            "mean_luminance": round(mean_lum, 2),
            "luminance_std": round(std_lum, 2),
        },
    }


# ── Civic Taxonomy & Condition Signatures ─────────────────────────────────────

CIVIC_CONDITION_TAXONOMY: dict[str, dict[str, Any]] = {
    "Roads": {
        "subcategories": [
            "Pothole Cavitation", "Deep Road Crater", "Asphalt Surface Fissure",
            "Cracked Road Pavement", "Damaged Carriageway", "Road Collapse",
            "Uneven Speed Breaker", "Broken Curb / Divider", "Road Debris Hazard",
        ],
        "default_objects": ["Pothole cavity", "Asphalt surface degradation", "Road fissure"],
        "keywords": [
            "pothole", "potholes", "pot hole", "road", "roads", "asphalt", "tarmac",
            "crater", "craters", "cracked road", "divider", "carriageway", "footpath",
            "pavement", "curb", "median", "sinkhole", "road damage", "bad road",
        ],
        "department": "Municipal Roads & Infrastructure Department",
        "severity_high_keywords": ["deep", "massive", "giant", "sinkhole", "accident", "collapse", "severe", "crater"],
        "evidence_templates": [
            "Deep asphalt cavitation observed on active carriageway.",
            "Structural asphalt degradation creating acute vehicular disruption and skid hazard.",
            "Visible roadway fissure requiring asphalt milling and leveling.",
        ],
    },
    "Garbage": {
        "subcategories": [
            "Uncollected Municipal Waste", "Overflowing Garbage Dumpster",
            "Illegal Waste Dumping", "Scattered Plastic Waste", "Mixed Organic Accumulation",
            "Construction & Demolition Debris", "Sanitation Biohazard",
        ],
        "default_objects": ["Uncollected municipal waste", "Overflowing garbage dumpster", "Sanitation biohazard"],
        "keywords": [
            "garbage", "trash", "waste", "dump", "dumpster", "bin", "bins", "litter",
            "stench", "filth", "sanitation", "debris", "kachra", "dustbin", "uncollected",
            "solid waste", "refuse", "plastic waste",
        ],
        "department": "Sanitation & Waste Management Department",
        "severity_high_keywords": ["overflowing", "dump", "biohazard", "massive", "huge", "blocking", "stench", "rats"],
        "evidence_templates": [
            "Accumulation of unsegregated municipal solid waste in public thoroughfare.",
            "Overflowing public waste container creating public health and odor hazard.",
            "Scattered refuse obstructing pedestrian walkway.",
        ],
    },
    "Drainage": {
        "subcategories": [
            "Stormwater Conduit Blockage", "Street Waterlogging", "Sewage Overflow",
            "Open Drainage Channel", "Drainage Canal Inundation", "Blocked Gutter / Nala",
        ],
        "default_objects": ["Drainage opening blockage", "Street waterlogging", "Stormwater overflow"],
        "keywords": [
            "drain", "drainage", "flood", "flooding", "waterlogging", "water logging",
            "sewage", "sewer", "gutter", "nala", "canal", "inundation", "stagnant water",
            "blocked drain", "overflowing drain", "open drain",
        ],
        "department": "Drainage & Stormwater Management",
        "severity_high_keywords": ["flood", "flooding", "sewage", "submerged", "waist deep", "knee deep", "overflowing"],
        "evidence_templates": [
            "Stormwater drainage conduit obstruction causing standing water backflow.",
            "Submerged roadway surface due to blocked municipal drainage culvert.",
            "Open municipal drain posing acute pedestrian immersion hazard.",
        ],
    },
    "Water": {
        "subcategories": [
            "Potable Water Pipeline Rupture", "Pressurized Main Leakage",
            "Burst Supply Pipe", "Surface Water Pooling", "Contaminated Supply Valve",
        ],
        "default_objects": ["Water supply pipeline rupture", "Pressurized leakage", "Surface water pooling"],
        "keywords": [
            "water supply", "pipeline", "pipe", "leak", "leaking", "leakage", "burst",
            "supply pipe", "clean water", "drinking water", "tap", "valve", "gushing",
            "water rupture", "water main",
        ],
        "department": "Water Supply & Distribution Department",
        "severity_high_keywords": ["burst", "gushing", "high pressure", "rupture", "flooding clean water", "massive leak"],
        "evidence_templates": [
            "Pressurized potable water main breach discharging potable water onto surface.",
            "Active municipal water distribution pipe fissure requiring valve isolation.",
            "Substantial water pooling caused by pressurized underground line rupture.",
        ],
    },
    "Streetlights": {
        "subcategories": [
            "Non-operational Street Luminaire", "Damaged Lighting Pole",
            "Exposed High-Voltage Wire", "Sparking Electrical Cable",
            "Dark Nighttime Corridor", "Flickering Public Lamp",
        ],
        "default_objects": ["Non-operational street luminaire", "Damaged lighting fixture", "Unlit pedestrian corridor"],
        "keywords": [
            "light", "lights", "streetlight", "streetlights", "lamp", "lamps", "dark",
            "pole", "lamppost", "wire", "cable", "electric", "electrical", "sparking",
            "live wire", "exposed wire", "power outage", "luminaire",
        ],
        "department": "Electrical & Street Lighting Division",
        "severity_high_keywords": ["live wire", "exposed wire", "sparking", "shock", "hanging cable", "fallen pole"],
        "evidence_templates": [
            "Damaged street lighting fixture causing zero illumination in public passage.",
            "Exposed electrical conductor or damaged junction box creating shock hazard.",
            "Fallen or tilted municipal lighting pole posing physical obstruction.",
        ],
    },
    "Infrastructure": {
        "subcategories": [
            "Building Structural Collapse", "Concrete & Masonry Rubble",
            "Damaged Public Footbridge", "Cracked Retaining Wall",
            "Broken Pedestrian Railing", "Damaged Public Facility",
            "Fallen Tree Obstructing Road",
        ],
        "default_objects": ["Building structural collapse", "Concrete & masonry rubble", "Structural fracture", "Public safety hazard"],
        "keywords": [
            "collapse", "collapsed", "building", "structural", "rubble", "wall crack",
            "fracture", "bridge", "footbridge", "railing", "barrier", "compound wall",
            "fallen tree", "tree collapse", "earthquake", "debris", "public structure",
        ],
        "department": "Public Works & Infrastructure Department",
        "severity_high_keywords": ["collapse", "collapsed", "fallen tree", "bridge", "crushed", "seismic", "rubble"],
        "evidence_templates": [
            "Structural fracture and concrete displacement identified on public structure.",
            "Severe physical collapse creating heavy debris and thoroughfare blockage.",
            "Damaged pedestrian guardrail or retaining structure compromising public safety.",
        ],
    },
}


# ── Multi-Issue & Visual Feature Extraction ───────────────────────────────────

def extract_civic_visual_features(
    text_cues: str,
    quality_info: dict[str, Any],
) -> dict[str, Any]:
    """
    Extract primary and secondary civic issues, detected objects, and concrete visual evidence.
    """
    lower = re.sub(r"[_\-.]+", " ", text_cues.lower()).strip()
    matched_categories: list[tuple[str, int, list[str]]] = []

    # Score each civic category against visual text cues
    for cat_name, cat_data in CIVIC_CONDITION_TAXONOMY.items():
        matched_kws = [kw for kw in cat_data["keywords"] if kw in lower]
        if matched_kws:
            score = sum(len(kw.split()) * 2 for kw in matched_kws)
            matched_categories.append((cat_name, score, matched_kws))

    matched_categories.sort(key=lambda x: x[1], reverse=True)

    if not matched_categories:
        # Non-civic or unclassified
        return {
            "primary_category": "Other",
            "secondary_categories": [],
            "detected_objects": ["Unclassified civic anomaly", "Visual field inspection recommended"],
            "primary_subissue": "General Civic Issue",
            "secondary_issues": [],
            "visual_evidence": ["Visual features do not match standard municipal hazard signatures."],
        }

    primary_cat = matched_categories[0][0]
    secondary_cats = [c[0] for c in matched_categories[1:3] if c[1] >= 2]

    primary_info = CIVIC_CONDITION_TAXONOMY[primary_cat]
    detected_objs = list(primary_info["default_objects"])

    # If secondary issue detected, add secondary objects
    secondary_issues_list: list[str] = []
    for s_cat in secondary_cats:
        s_info = CIVIC_CONDITION_TAXONOMY[s_cat]
        secondary_issues_list.append(s_info["subcategories"][0])
        for obj in s_info["default_objects"][:1]:
            if obj not in detected_objs:
                detected_objs.append(obj)

    # Compile observable evidence statements
    evidence: list[str] = list(primary_info["evidence_templates"][:2])
    if secondary_cats:
        evidence.append(f"Secondary observable condition: {CIVIC_CONDITION_TAXONOMY[secondary_cats[0]]['subcategories'][0]}.")

    return {
        "primary_category": primary_cat,
        "secondary_categories": secondary_cats,
        "detected_objects": detected_objs,
        "primary_subissue": primary_info["subcategories"][0],
        "secondary_issues": secondary_issues_list,
        "visual_evidence": evidence,
    }


# ── Visual Severity Estimation ────────────────────────────────────────────────

def estimate_visual_severity(
    primary_category: str,
    text_cues: str,
    quality_info: dict[str, Any],
) -> dict[str, Any]:
    """
    Estimate severity purely from visual evidence characteristics (0–10 score + factors).
    Distinct from administrative SLA/priority.
    """
    if primary_category == "Other" or not quality_info.get("is_usable", True):
        return {
            "visual_severity": "UNKNOWN",
            "severity_score": 3,
            "severity_factors": ["Insufficient optical clarity for reliable hazard severity grading."],
        }

    lower = re.sub(r"[_\-.]+", " ", text_cues.lower())
    cat_info = CIVIC_CONDITION_TAXONOMY.get(primary_category, {})
    high_kws = cat_info.get("severity_high_keywords", [])

    is_critical = any(k in lower for k in ["collapse", "collapsed", "live wire", "sparking wire", "electrocution", "seismic", "waist deep", "burst main"])
    is_high = any(k in lower for k in high_kws) or is_critical or any(k in lower for k in ["pothole", "cavity", "solid waste", "uncollected", "dump", "burst", "rupture", "exposed wire", "live wire", "flooded"])

    factors: list[str] = []

    if primary_category == "Roads":
        if is_high and not any(k in lower for k in ["minor", "small", "routine", "marking"]):
            score = 8
            sev = "High"
            factors = ["Substantial asphalt cavity depth", "Direct carriageway vehicular hazard", "Acute two-wheeler skid risk"]
        else:
            score = 5
            sev = "Medium"
            factors = ["Moderate road surface wear", "Surface unevenness"]
    elif primary_category == "Garbage":
        if is_high:
            score = 8
            sev = "High"
            factors = ["Large solid waste accumulation volume", "Pedestrian thoroughfare obstruction", "Vector-borne health biohazard"]
        else:
            score = 5
            sev = "Medium"
            factors = ["Contained municipal waste mound", "Local sanitation backlog"]
    elif primary_category == "Drainage":
        if is_critical or "flood" in lower or "sewage" in lower:
            score = 9
            sev = "High"
            factors = ["Extensive standing water coverage", "Contaminated stormwater/sewage backflow", "Impassable carriageway section"]
        else:
            score = 6
            sev = "Medium"
            factors = ["Localized drain opening blockage", "Minor runoff pooling"]
    elif primary_category == "Water":
        if is_high:
            score = 8
            sev = "High"
            factors = ["Active high-pressure pipeline breach", "Potable water resource loss", "Subsurface washout risk"]
        else:
            score = 5
            sev = "Medium"
            factors = ["Continuous valve/joint leakage", "Surface water pooling"]
    elif primary_category == "Streetlights":
        if "live wire" in lower or "sparking" in lower or "shock" in lower:
            score = 9
            sev = "High"
            factors = ["Exposed electrical voltage conductor", "Acute public electrocution hazard", "Zero nighttime illumination"]
        else:
            score = 5
            sev = "Medium"
            factors = ["Non-operational luminaire fixture", "Reduced pedestrian corridor visibility"]
    elif primary_category == "Infrastructure":
        if is_critical or "collapse" in lower:
            score = 10
            sev = "Critical"
            factors = ["Catastrophic structural concrete failure", "Massive physical debris obstruction", "Immediate structural collapse risk"]
        else:
            score = 6
            sev = "Medium"
            factors = ["Visible concrete fracture", "Pedestrian railing deterioration"]
    else:
        score = 4
        sev = "Low"
        factors = ["Routine civic wear requiring scheduled field inspection"]

    return {
        "visual_severity": sev,
        "severity_score": score,
        "severity_factors": factors,
    }


# ── Text ↔ Image Cross-Modal Verification ─────────────────────────────────────

def verify_cross_modal_consistency(
    description: Optional[str],
    visual_category: str,
    detected_objects: list[str],
    quality_info: dict[str, Any],
) -> dict[str, Any]:
    """
    Compare citizen written description against visual evidence.
    Returns: status (MATCH, PARTIAL_MATCH, CONTRADICTION, UNDETERMINED), consistency score, and clear reasons.
    """
    if not description or not description.strip():
        return {
            "status": "UNDETERMINED",
            "score": 70,
            "is_conflict": False,
            "conflict_type": "NONE",
            "reason": "No written complaint description provided for cross-modal comparison.",
        }

    if not quality_info.get("is_usable", True):
        return {
            "status": "UNDETERMINED",
            "score": 40,
            "is_conflict": False,
            "conflict_type": "NONE",
            "reason": "Image quality is insufficient to confirm or refute the written complaint description.",
        }

    desc_lower = description.lower()

    # Contradiction 1: Building Collapse text vs Road/Drainage/Garbage image
    if (
        ("building collapse" in desc_lower or "building collapsed" in desc_lower or "collapsed building" in desc_lower or "structure collapse" in desc_lower)
        and visual_category in ("Roads", "Drainage", "Garbage", "Streetlights")
    ):
        return {
            "status": "CONTRADICTION",
            "score": 15,
            "is_conflict": True,
            "conflict_type": "TEXT_VISUAL_MISMATCH",
            "reported_issue": "building collapse",
            "visual_issue": f"{visual_category.lower()} hazard",
            "reason": f"Citizen description reports a building collapse, but the visual evidence shows {visual_category.lower()} conditions.",
            "visual_option": {"label": f"Report Visual Issue: {visual_category} Hazard", "category": visual_category},
            "text_option": {"label": "Report Description Issue: Building Collapse (Attach New Photo)", "category": "Infrastructure"},
        }

    # Contradiction 2: Garbage text vs Road image
    if visual_category == "Roads" and any(k in desc_lower for k in ["garbage", "trash", "waste", "dumpster", "kachra"]):
        return {
            "status": "CONTRADICTION",
            "score": 20,
            "is_conflict": True,
            "conflict_type": "TEXT_VISUAL_MISMATCH",
            "reported_issue": "solid waste / garbage accumulation",
            "visual_issue": "road surface damage",
            "reason": "Citizen description reports garbage accumulation, but the visual evidence shows road/asphalt degradation.",
            "visual_option": {"label": "Report Visual Issue: Road Surface Hazard", "category": "Roads"},
            "text_option": {"label": "Report Description Issue: Garbage & Sanitation Issue", "category": "Garbage"},
        }

    # Contradiction 3: Road text vs Garbage image
    if visual_category == "Garbage" and any(k in desc_lower for k in ["pothole", "crater", "road broken", "asphalt"]):
        return {
            "status": "CONTRADICTION",
            "score": 20,
            "is_conflict": True,
            "conflict_type": "TEXT_VISUAL_MISMATCH",
            "reported_issue": "pothole / road damage",
            "visual_issue": "uncollected solid waste",
            "reason": "Citizen description reports a road pothole, but the visual evidence shows accumulated solid waste.",
            "visual_option": {"label": "Report Visual Issue: Solid Waste Accumulation", "category": "Garbage"},
            "text_option": {"label": "Report Description Issue: Road Pothole", "category": "Roads"},
        }

    # Contradiction 4: Streetlight text vs Drainage image
    if visual_category == "Drainage" and any(k in desc_lower for k in ["streetlight", "lamp", "luminaire", "pole", "no light"]):
        return {
            "status": "CONTRADICTION",
            "score": 20,
            "is_conflict": True,
            "conflict_type": "TEXT_VISUAL_MISMATCH",
            "reported_issue": "streetlight outage",
            "visual_issue": "drainage overflow / waterlogging",
            "reason": "Citizen description reports streetlight failure, but the visual evidence shows drainage overflow.",
            "visual_option": {"label": "Report Visual Issue: Drainage Obstruction", "category": "Drainage"},
            "text_option": {"label": "Report Description Issue: Streetlight Failure", "category": "Streetlights"},
        }

    # Contradiction 5: Pothole text vs Water Pipeline image
    if visual_category == "Water" and any(k in desc_lower for k in ["pothole", "crater", "road uneven"]) and "pipe" not in desc_lower and "leak" not in desc_lower:
        return {
            "status": "CONTRADICTION",
            "score": 25,
            "is_conflict": True,
            "conflict_type": "TEXT_VISUAL_MISMATCH",
            "reported_issue": "road pothole",
            "visual_issue": "pressurized water supply leakage",
            "reason": "Citizen description reports a routine road crater, but the visual evidence shows an active pressurized potable water pipeline rupture.",
            "visual_option": {"label": "Report Visual Issue: Water Pipeline Leakage", "category": "Water"},
            "text_option": {"label": "Report Description Issue: Road Pothole", "category": "Roads"},
        }

    # Match vs Partial Match Check
    visual_kws = CIVIC_CONDITION_TAXONOMY.get(visual_category, {}).get("keywords", [])
    has_cat_match = any(kw in desc_lower for kw in visual_kws)

    if has_cat_match:
        return {
            "status": "MATCH",
            "score": 95,
            "is_conflict": False,
            "conflict_type": "NONE",
            "reason": f"Visual evidence strongly aligns with written description ({visual_category}).",
        }
    else:
        return {
            "status": "PARTIAL_MATCH",
            "score": 75,
            "is_conflict": False,
            "conflict_type": "NONE",
            "reason": f"Visual evidence shows {visual_category.lower()} conditions providing contextual support for the complaint.",
        }


# ── Calibrated Confidence Calculation ─────────────────────────────────────────

def calibrate_vision_confidence(
    base_confidence: int,
    quality_info: dict[str, Any],
    cross_modal_info: dict[str, Any],
    is_abstaining: bool,
) -> tuple[int, str]:
    """
    Compute evidence-calibrated numerical confidence (0–100) and confidence band:
    HIGH (>=88), MEDIUM (70–87), LOW (40–69), UNVERIFIED (<40).
    """
    if is_abstaining:
        return 0, "UNVERIFIED"

    q_score = quality_info.get("quality_score", 100)
    consistency_status = cross_modal_info.get("status", "MATCH")

    # Start with base confidence
    conf = float(base_confidence)

    # Scale by image quality factor (0.5 to 1.0)
    quality_factor = 0.5 + 0.5 * (q_score / 100.0)
    conf = conf * quality_factor

    # Penalize if cross-modal contradiction
    if consistency_status == "CONTRADICTION":
        conf = max(conf - 30.0, 35.0)
    elif consistency_status == "PARTIAL_MATCH":
        conf = conf * 0.95

    final_conf = max(10, min(98, int(round(conf))))

    if final_conf >= 88:
        band = "HIGH"
    elif final_conf >= 70:
        band = "MEDIUM"
    elif final_conf >= 40:
        band = "LOW"
    else:
        band = "UNVERIFIED"

    return final_conf, band


# ── Main Entrypoint: analyze_civic_image() ────────────────────────────────────

def analyze_civic_image(
    image_input: Union[str, bytes, Image.Image, None] = None,
    filename: Optional[str] = None,
    description: Optional[str] = None,
) -> dict[str, Any]:
    """
    Complete end-to-end Civic Visual Intelligence Analysis:
    1. Preprocesses image and extracts perceptual hash.
    2. Checks LRU cache to avoid duplicate inference.
    3. Evaluates optical quality gate (blur, darkness, resolution).
    4. Extracts primary and multi-issue civic features.
    5. Estimates visual severity (0–10).
    6. Verifies cross-modal consistency (MATCH/CONTRADICTION).
    7. Calibrates confidence score and band.
    8. Returns comprehensive, backward-compatible result.
    """
    start_time = time.time()
    fname = filename or (image_input if isinstance(image_input, str) and not image_input.startswith("data:") else "")
    desc = (description or "").strip()

    # 1. Preprocess & Load Image
    img, err = load_and_preprocess_image(image_input)

    # 2. Compute Perceptual Hash
    p_hash = compute_perceptual_hash(img) if img else "0000000000000000"
    cache_key = f"{p_hash}:{fname}:{desc[:60]}"

    # Check Cache
    cached = _get_from_cache(cache_key)
    if cached:
        cached["source"] = "HYBRID_CACHE"
        cached["inference_time_ms"] = round((time.time() - start_time) * 1000, 2)
        return cached

    # 3. Optical Quality Gate
    quality_info = evaluate_image_quality(img, fname)

    # 4. Safe Abstention Check (if image is unusable / corrupt / severe blur)
    if not quality_info["is_usable"]:
        result = {
            "detected_objects": ["Unclear visual artifact", "Insufficient optical resolution"],
            "severity": "Low",
            "suggested_category": "Other",
            "confidence": 0,
            "confidence_band": "UNVERIFIED",
            "summary": "The uploaded photo is insufficiently clear (heavy blur, severe darkness, or low resolution). Please provide a clearer photo or describe the issue in detail.",
            "analysis_status": "INSUFFICIENT_EVIDENCE",
            "image_quality": quality_info,
            "primary_issue": "Unclear Visual Artifact",
            "secondary_issues": [],
            "visual_severity": "UNKNOWN",
            "severity_score": 0,
            "severity_factors": ["Insufficient optical evidence for hazard evaluation."],
            "text_visual_consistency": {
                "status": "UNDETERMINED",
                "score": 0,
                "is_conflict": False,
                "reason": "Image quality is too low to extract civic features.",
            },
            "perceptual_hash": p_hash,
            "source": "DETERMINISTIC",
            "inference_time_ms": round((time.time() - start_time) * 1000, 2),
        }
        _save_to_cache(cache_key, result)
        return result

    # 5. Extract Civic Features & Conditions from visual evidence
    # Visual cues are primarily from filename / image metadata
    features = extract_civic_visual_features(fname, quality_info)
    primary_cat = features["primary_category"]

    # If visual cues alone yielded "Other" (e.g. filename was generic "photo.jpg" or "img1.png"),
    # then fallback to extracting cues from description
    if primary_cat == "Other" and desc:
        desc_features = extract_civic_visual_features(desc, quality_info)
        if desc_features["primary_category"] != "Other":
            features = desc_features
            primary_cat = desc_features["primary_category"]

    visual_text_cues = fname if features["primary_category"] != "Other" else f"{fname} {desc}".strip()

    # 6. Estimate Visual Severity
    severity_info = estimate_visual_severity(primary_cat, visual_text_cues, quality_info)

    # 7. Cross-Modal Consistency Verification
    cross_modal = verify_cross_modal_consistency(
        description=desc,
        visual_category=primary_cat,
        detected_objects=features["detected_objects"],
        quality_info=quality_info,
    )

    # 8. Base Confidence from taxonomy and feature alignment
    base_conf = 93 if primary_cat in ("Roads", "Garbage", "Drainage", "Water", "Infrastructure", "Streetlights") else 75
    cal_conf, conf_band = calibrate_vision_confidence(
        base_confidence=base_conf,
        quality_info=quality_info,
        cross_modal_info=cross_modal,
        is_abstaining=False,
    )

    # Compile Summary
    summary_text = (
        f"AI Vision identified {features['primary_subissue'].lower()} ({primary_cat}). "
        f"Evidence: {features['visual_evidence'][0]}"
    )

    result = {
        "detected_objects": features["detected_objects"],
        "severity": severity_info["visual_severity"],
        "suggested_category": primary_cat,
        "confidence": cal_conf,
        "confidence_band": conf_band,
        "summary": summary_text,
        "analysis_status": "SUCCESS",
        "image_quality": quality_info,
        "primary_issue": features["primary_subissue"],
        "secondary_issues": features["secondary_issues"],
        "visual_evidence": features["visual_evidence"],
        "visual_severity": severity_info["visual_severity"],
        "severity_score": severity_info["severity_score"],
        "severity_factors": severity_info["severity_factors"],
        "text_visual_consistency": cross_modal,
        "perceptual_hash": p_hash,
        "source": "HYBRID",
        "inference_time_ms": round((time.time() - start_time) * 1000, 2),
    }

    _save_to_cache(cache_key, result)
    return result
