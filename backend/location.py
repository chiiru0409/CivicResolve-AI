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
