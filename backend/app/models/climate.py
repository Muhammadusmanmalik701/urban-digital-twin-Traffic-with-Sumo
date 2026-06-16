from pydantic import BaseModel
from typing import Optional, List


class ClimateSnapshot(BaseModel):
    timestamp: str
    outdoor_temp_c: float
    feels_like_c: float
    humidity_pct: float
    wind_speed_ms: float
    wind_direction_deg: float
    rainfall_mm_hr: float
    aqi: int
    aqi_category: str
    pm25: float
    no2: float
    uv_index: float


class HeatZone(BaseModel):
    zone_id: int
    zone_name: str
    avg_temp_c: float
    heat_index: float
    risk_level: str
    longitude: float
    latitude: float


class FloodRiskZone(BaseModel):
    zone_id: int
    zone_name: str
    risk_level: str
    water_depth_cm: float
    roads_closed: int
    longitude: float
    latitude: float


class AirQualityPoint(BaseModel):
    longitude: float
    latitude: float
    aqi: int
    pm25: float
    no2: float
    category: str
