from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime


class BuildingSystem(BaseModel):
    id: int
    system_type: str
    manufacturer: Optional[str] = None
    model: Optional[str] = None
    health_score: float = 100
    status: str = "operational"
    energy_consumption_kw: float = 0
    last_serviced: Optional[datetime] = None
    next_service_due: Optional[datetime] = None

    class Config:
        from_attributes = True


class BuildingFloor(BaseModel):
    id: int
    floor_number: int
    floor_use: str
    area_m2: float
    current_occupancy: int = 0
    max_occupancy: int = 50

    class Config:
        from_attributes = True


class HealthReport(BaseModel):
    score: float
    rating: str
    breakdown: Dict[str, float]
    alerts: List[str] = []


class EnergyToday(BaseModel):
    kwh_total: float
    peak_demand_kw: float
    peak_hour: int
    cost_usd: float
    co2_tons: float
    vs_yesterday_pct: float


class BuildingProfile(BaseModel):
    id: int
    name: str
    address: Optional[str] = None
    building_use: str
    building_class: str
    floors_above: int
    height_m: float
    footprint_area_m2: float
    year_built: int
    max_occupancy: int
    current_occupancy: int
    occupancy_pct: float
    has_hvac: bool
    hvac_type: Optional[str] = None
    has_bms: bool
    has_solar_panels: bool
    solar_capacity_kw: float
    structural_health_score: float
    fire_safety_score: float
    maintenance_status: str
    health: HealthReport
    systems: List[BuildingSystem] = []
    energy_today: Optional[EnergyToday] = None
    ai_alerts: List[str] = []

    class Config:
        from_attributes = True


class BuildingSummary(BaseModel):
    id: int
    name: str
    building_use: str
    floors_above: int
    height_m: float
    current_occupancy: int
    max_occupancy: int
    structural_health_score: float
    maintenance_status: str
    longitude: Optional[float] = None
    latitude: Optional[float] = None

    class Config:
        from_attributes = True
