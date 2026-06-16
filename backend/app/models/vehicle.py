from pydantic import BaseModel
from typing import Optional, List


class Vehicle(BaseModel):
    id: str
    vehicle_type: str = "passenger_car"
    longitude: float
    latitude: float
    speed_kmh: float = 0
    heading: float = 0
    road_id: Optional[int] = None
    emission_co2_g_km: float = 0


class TrafficSignal(BaseModel):
    intersection_id: int
    phase: int
    green_time_sec: float
    longitude: float
    latitude: float
    status: str = "operational"


class RoadIncident(BaseModel):
    id: int
    incident_type: str
    severity: str
    road_id: Optional[int] = None
    longitude: float
    latitude: float
    description: Optional[str] = None
    started_at: str
    affected_lanes: int = 1


class TrafficSnapshot(BaseModel):
    timestamp: str
    vehicles: List[Vehicle]
    signals: List[TrafficSignal]
    incidents: List[RoadIncident]
    zone_congestion: dict = {}


class ZoneCongestion(BaseModel):
    zone_id: int
    zone_name: str
    congestion_index: float
    vehicle_count: int
    avg_speed_kmh: float
    status: str
