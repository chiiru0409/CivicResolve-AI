"""
location.py — Zone and location utilities.

detect_zone() determines which municipal zone a complaint belongs to.
Production: replace with a real GIS / reverse-geocoding API call.
Demo:       uses coordinate bounding boxes and text keyword matching.
"""

from __future__ import annotations
from typing import Optional


# ── Zone bounding boxes (lat/lng — approximate for demo city) ─────────────────
# Each zone is defined as (lat_min, lat_max, lng_min, lng_max).
# These approximate a generic Indian city divided into 4 zones.
_ZONE_BOXES: list[tuple[str, float, float, float, float]] = [
    # name,      lat_min,  lat_max,  lng_min,  lng_max
    ("Zone 1",   16.50,    16.56,    80.60,    80.66),
    ("Zone 2",   16.50,    16.56,    80.66,    80.72),
    ("Zone 3",   16.44,    16.50,    80.60,    80.66),
    ("Zone 4",   16.44,    16.50,    80.66,    80.72),
]

# ── Text-based zone keywords ───────────────────────────────────────────────────
_ZONE_KEYWORDS: dict[str, list[str]] = {
    "Zone 1": [
        "sector 1", "zone 1", "north", "zone1",
        "main market", "city centre", "central",
        "mg road", "college road", "gandhi nagar",
    ],
    "Zone 2": [
        "sector 2", "zone 2", "east", "zone2",
        "industrial area", "ring road", "new town",
        "brigade road", "lake view",
    ],
    "Zone 3": [
        "sector 3", "zone 3", "south", "zone3",
        "residency road", "old city", "heritage",
        "park road", "school road",
    ],
    "Zone 4": [
        "sector 4", "zone 4", "west", "zone4",
        "airport junction", "harmony colony",
        "outer ring", "suburb",
    ],
}


def validate_coordinates(latitude: Optional[float], longitude: Optional[float]) -> bool:
    """Check if coordinates are mathematically valid geographic coordinates."""
    if latitude is None or longitude is None:
        return True  # Absent coordinates are handled separately
    return (-90.0 <= latitude <= 90.0) and (-180.0 <= longitude <= 180.0)


def evaluate_location(
    location_text: Optional[str] = None,
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
) -> dict:
    """
    Evaluates citizen location input.
    Returns:
    {
      "status": "KNOWN_LOCATION" | "AMBIGUOUS_LOCATION" | "UNKNOWN_LOCATION" | "INVALID_LOCATION",
      "zone": str,
      "coordinates_valid": bool,
      "formatted_coordinates": Optional[str],
      "requires_clarification": bool,
      "clarification_prompt": Optional[str],
    }
    """
    # 1. Invalid coordinates check
    if (latitude is not None or longitude is not None):
        if not validate_coordinates(latitude, longitude):
            return {
                "status": "INVALID_LOCATION",
                "zone": "Zone 1",
                "coordinates_valid": False,
                "formatted_coordinates": None,
                "requires_clarification": True,
                "clarification_prompt": "Provided GPS coordinates are outside valid geographic ranges (-90 to +90 lat, -180 to +180 lng). Please provide a valid location.",
            }

    has_coords = latitude is not None and longitude is not None and not (latitude == 0 and longitude == 0)
    loc_str = (location_text or "").strip()

    # 2. Unknown location
    if not loc_str and not has_coords:
        return {
            "status": "UNKNOWN_LOCATION",
            "zone": "Zone 1",
            "coordinates_valid": True,
            "formatted_coordinates": None,
            "requires_clarification": True,
            "clarification_prompt": "No location was provided. Please provide the street name, landmark, or area.",
        }

    # 3. Known Location via GPS
    if has_coords:
        zone = detect_zone(latitude, longitude, loc_str)
        return {
            "status": "KNOWN_LOCATION",
            "zone": zone,
            "coordinates_valid": True,
            "formatted_coordinates": format_coordinates(latitude, longitude),
            "requires_clarification": False,
            "clarification_prompt": None,
        }

    # 4. Ambiguous location keywords (vague phrases like "near my house", "road", "problem here")
    vague_phrases = ["near my house", "my house", "my street", "here", "nearby", "somewhere", "road problem", "around here", "outside"]
    lower_loc = loc_str.lower()
    if any(v == lower_loc for v in vague_phrases) or (len(loc_str) < 6 and not any(k in lower_loc for k in ["road", "nagar", "ward", "zone", "st", "lane", "colony"])):
        return {
            "status": "AMBIGUOUS_LOCATION",
            "zone": detect_zone(None, None, loc_str),
            "coordinates_valid": True,
            "formatted_coordinates": None,
            "requires_clarification": True,
            "clarification_prompt": f"'{loc_str}' is ambiguous. Please provide a specific street, landmark, ward, or city name.",
        }

    # 5. Known text location (has street, landmark, area, or city)
    zone = detect_zone(None, None, loc_str)
    return {
        "status": "KNOWN_LOCATION",
        "zone": zone,
        "coordinates_valid": True,
        "formatted_coordinates": None,
        "requires_clarification": False,
        "clarification_prompt": None,
    }


def detect_zone(
    latitude:  Optional[float] = None,
    longitude: Optional[float] = None,
    location_text: Optional[str] = None,
) -> str:
    """
    Return a zone string ('Zone 1' … 'Zone 4') or 'Zone 1' as default.

    Priority:
    1. Coordinate-based lookup (most accurate).
    2. Text keyword matching.
    3. Default 'Zone 1'.
    """
    # 1. Coordinate lookup
    if latitude is not None and longitude is not None:
        for zone_name, lat_min, lat_max, lng_min, lng_max in _ZONE_BOXES:
            if lat_min <= latitude <= lat_max and lng_min <= longitude <= lng_max:
                return zone_name

    # 2. Text keyword lookup
    if location_text:
        lower = location_text.lower()
        for zone_name, keywords in _ZONE_KEYWORDS.items():
            if any(kw in lower for kw in keywords):
                return zone_name

    # 3. Default
    return "Zone 1"


def format_coordinates(latitude: Optional[float], longitude: Optional[float]) -> Optional[str]:
    """Return a clean coordinate string, e.g. '16.5062°N, 80.6480°E'."""
    if latitude is None or longitude is None:
        return None
    lat_dir = "N" if latitude  >= 0 else "S"
    lng_dir = "E" if longitude >= 0 else "W"
    return f"{abs(latitude):.4f}°{lat_dir}, {abs(longitude):.4f}°{lng_dir}"


def accuracy_label(accuracy_metres: Optional[float]) -> str:
    """Return a human-readable accuracy description."""
    if accuracy_metres is None:
        return "Unknown accuracy"
    if accuracy_metres <= 10:
        return f"High accuracy (±{accuracy_metres:.0f}m)"
    if accuracy_metres <= 50:
        return f"Good accuracy (±{accuracy_metres:.0f}m)"
    if accuracy_metres <= 100:
        return f"Moderate accuracy (±{accuracy_metres:.0f}m)"
    return f"Low accuracy (±{accuracy_metres:.0f}m) — consider manual adjustment"
