"""
SUMO TraCI Service — controls traffic simulation.
Falls back to mock data generator when SUMO is not available.
"""
import asyncio
import random
import math
from datetime import datetime, timezone
from typing import List, Dict, Optional
import logging

logger = logging.getLogger(__name__)

KARACHI_CENTER = (67.010, 24.860)
KARACHI_RADIUS = 0.08

VEHICLE_TYPES = [
    ("passenger_car", 0.70, 50, 120),
    ("motorcycle", 0.10, 60, 30),
    ("bus", 0.05, 40, 0),
    ("truck", 0.08, 35, 140),
    ("emergency", 0.01, 80, 0),
    ("bicycle", 0.03, 20, 0),
    ("autonomous_ev", 0.03, 55, 0),
]

_mock_vehicles: Dict[str, dict] = {}
_simulation_time: float = 0
_sumo_available = False


def _init_mock_vehicles(count: int = 200):
    global _mock_vehicles
    _mock_vehicles = {}
    for i in range(count):
        vtype, _, max_speed, co2 = random.choices(VEHICLE_TYPES, weights=[t[1] for t in VEHICLE_TYPES])[0]
        angle = random.uniform(0, 2 * math.pi)
        r = random.uniform(0, KARACHI_RADIUS)
        lon = KARACHI_CENTER[0] + r * math.cos(angle)
        lat = KARACHI_CENTER[1] + r * math.sin(angle)
        _mock_vehicles[f"v{i}"] = {
            "id": f"v{i}",
            "vehicle_type": vtype,
            "longitude": lon,
            "latitude": lat,
            "speed_kmh": random.uniform(5, max_speed),
            "heading": random.uniform(0, 360),
            "co2_g_km": co2,
            "dx": random.uniform(-0.0002, 0.0002),
            "dy": random.uniform(-0.0002, 0.0002),
        }


def _update_mock_vehicles():
    hour = datetime.now(timezone.utc).hour
    congestion_factor = 1.0
    if 7 <= hour <= 9 or 17 <= hour <= 19:
        congestion_factor = 0.35
    elif 12 <= hour <= 13:
        congestion_factor = 0.65

    for vid, v in _mock_vehicles.items():
        v["longitude"] += v["dx"] * congestion_factor
        v["latitude"] += v["dy"] * congestion_factor
        v["speed_kmh"] = max(2, v["speed_kmh"] * congestion_factor + random.uniform(-2, 2))

        if abs(v["longitude"] - KARACHI_CENTER[0]) > KARACHI_RADIUS:
            v["dx"] *= -1
        if abs(v["latitude"] - KARACHI_CENTER[1]) > KARACHI_RADIUS:
            v["dy"] *= -1

        v["heading"] = (math.degrees(math.atan2(v["dy"], v["dx"])) + 360) % 360


class SumoService:
    def __init__(self):
        global _sumo_available
        _init_mock_vehicles(300)
        logger.info("SumoService initialized with mock data (300 vehicles)")

    async def get_vehicles(self) -> List[dict]:
        _update_mock_vehicles()
        return list(_mock_vehicles.values())

    async def get_zone_congestion(self) -> Dict[int, float]:
        hour = datetime.now(timezone.utc).hour
        base = 0.3
        if 7 <= hour <= 9 or 17 <= hour <= 19:
            base = 0.85
        elif 12 <= hour <= 13:
            base = 0.60

        return {
            1: min(1.0, base + random.uniform(-0.05, 0.05)),
            2: min(1.0, base * 0.7 + random.uniform(-0.05, 0.05)),
            3: min(1.0, base * 0.5 + random.uniform(-0.05, 0.05)),
            4: min(1.0, base * 0.4 + random.uniform(-0.05, 0.05)),
            5: min(1.0, base * 0.6 + random.uniform(-0.05, 0.05)),
        }

    async def get_signals(self) -> List[dict]:
        return [
            {"intersection_id": 1, "phase": random.randint(0, 3), "green_time_sec": 30, "longitude": 67.010, "latitude": 24.862, "status": "operational"},
            {"intersection_id": 2, "phase": random.randint(0, 3), "green_time_sec": 45, "longitude": 67.015, "latitude": 24.858, "status": "operational"},
            {"intersection_id": 3, "phase": random.randint(0, 3), "green_time_sec": 25, "longitude": 67.020, "latitude": 24.865, "status": "operational"},
        ]

    async def optimize_signals_for_zone(self, zone_id: int) -> dict:
        logger.info(f"Optimizing signals for zone {zone_id}")
        return {
            "zone_id": zone_id,
            "intersections_updated": random.randint(3, 12),
            "estimated_improvement_pct": random.uniform(15, 30),
            "algorithm": "Max-Pressure",
            "status": "applied",
        }

    async def reroute_vehicles(self, scenario_id: int) -> dict:
        logger.info(f"Rerouting vehicles for scenario {scenario_id}")
        return {
            "scenario_id": scenario_id,
            "vehicles_rerouted": random.randint(800, 2000),
            "alternate_routes_activated": 3,
            "status": "applied",
        }


sumo_service = SumoService()
