"""
Climate Service — generates realistic weather, air quality, and flood risk data.
"""
import random
import math
from datetime import datetime, timezone
from typing import List
import logging

logger = logging.getLogger(__name__)


def _aqi_category(aqi: int) -> str:
    if aqi <= 50: return "Good"
    elif aqi <= 100: return "Moderate"
    elif aqi <= 150: return "Unhealthy for Sensitive"
    elif aqi <= 200: return "Unhealthy"
    elif aqi <= 300: return "Very Unhealthy"
    return "Hazardous"


class ClimateService:
    def __init__(self):
        self._base_temp = 35.0
        self._base_aqi = 120

    async def get_current_conditions(self) -> dict:
        hour = datetime.now(timezone.utc).hour
        temp_variation = -3 * math.cos(2 * math.pi * hour / 24)
        outdoor_temp = self._base_temp + temp_variation + random.uniform(-1, 1)
        aqi = self._base_aqi + random.randint(-20, 30)

        return {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "outdoor_temp_c": round(outdoor_temp, 1),
            "feels_like_c": round(outdoor_temp + random.uniform(-2, 4), 1),
            "humidity_pct": random.randint(40, 75),
            "wind_speed_ms": round(random.uniform(1, 12), 1),
            "wind_direction_deg": random.randint(0, 360),
            "rainfall_mm_hr": round(random.uniform(0, 5), 1),
            "aqi": aqi,
            "aqi_category": _aqi_category(aqi),
            "pm25": round(random.uniform(20, 80), 1),
            "no2": round(random.uniform(30, 120), 1),
            "uv_index": round(max(0, 8 * math.sin(math.pi * (hour - 6) / 12)), 1),
        }

    async def get_heat_zones(self) -> List[dict]:
        zones = [
            {"zone_id": 1, "zone_name": "Downtown", "longitude": 67.010, "latitude": 24.860},
            {"zone_id": 2, "zone_name": "Industrial", "longitude": 67.060, "latitude": 24.872},
            {"zone_id": 3, "zone_name": "Residential North", "longitude": 67.020, "latitude": 24.920},
            {"zone_id": 4, "zone_name": "University District", "longitude": 67.042, "latitude": 24.902},
            {"zone_id": 5, "zone_name": "Port Area", "longitude": 66.978, "latitude": 24.837},
        ]
        temps = [38.5, 41.2, 36.1, 35.8, 37.4]
        risk_levels = ["Moderate", "High", "Low", "Low", "Moderate"]
        return [
            {**z, "avg_temp_c": temps[i], "heat_index": round(temps[i] + random.uniform(2, 6), 1), "risk_level": risk_levels[i]}
            for i, z in enumerate(zones)
        ]

    async def get_air_quality_grid(self) -> List[dict]:
        points = []
        for lat in [24.84, 24.86, 24.88, 24.90, 24.92]:
            for lon in [66.99, 67.01, 67.03, 67.05, 67.07]:
                aqi = random.randint(60, 220)
                points.append({
                    "longitude": lon,
                    "latitude": lat,
                    "aqi": aqi,
                    "pm25": round(aqi * 0.4, 1),
                    "no2": round(aqi * 0.6, 1),
                    "category": _aqi_category(aqi),
                })
        return points

    async def get_flood_risk(self) -> List[dict]:
        return [
            {"zone_id": 1, "zone_name": "Underpass — MA Jinnah", "risk_level": "Medium", "water_depth_cm": 5, "roads_closed": 0, "longitude": 67.012, "latitude": 24.858},
            {"zone_id": 2, "zone_name": "SITE Industrial Drain", "risk_level": "High", "water_depth_cm": 25, "roads_closed": 2, "longitude": 67.055, "latitude": 24.868},
            {"zone_id": 3, "zone_name": "Gulshan-e-Iqbal Nullah", "risk_level": "Low", "water_depth_cm": 0, "roads_closed": 0, "longitude": 67.090, "latitude": 24.912},
        ]


climate_service = ClimateService()
