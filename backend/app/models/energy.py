from pydantic import BaseModel
from typing import Optional, List, Dict


class EnergyReading(BaseModel):
    building_id: int
    kwh_total: float
    kwh_hvac: float = 0
    kwh_lighting: float = 0
    kwh_equipment: float = 0
    peak_demand_kw: float = 0
    power_factor: float = 0.95
    co2_kg: float = 0
    cost_usd: float = 0
    tariff_zone: str = "off_peak"


class GridNode(BaseModel):
    id: int
    node_name: str
    node_type: str
    capacity_kva: float
    current_load_kw: float
    load_pct: float
    voltage_kv: float
    status: str
    longitude: Optional[float] = None
    latitude: Optional[float] = None

    class Config:
        from_attributes = True


class GridLine(BaseModel):
    id: int
    from_node: int
    to_node: int
    capacity_mw: float
    current_load_mw: float
    load_pct: float
    line_loss_pct: float

    class Config:
        from_attributes = True


class GridSnapshot(BaseModel):
    timestamp: str
    total_load_mw: float
    total_capacity_mw: float
    load_pct: float
    renewable_mw: float
    nodes: List[GridNode]
    lines: List[GridLine]


class EnergyAnomaly(BaseModel):
    building_id: int
    anomaly_type: str
    description: str
    severity: str
    detected_at: str
    current_kwh: float
    expected_kwh: float
    deviation_pct: float


class SolarPotential(BaseModel):
    building_id: int
    roof_area_m2: float
    annual_potential_kwh: float
    recommended_panel_count: int
    estimated_cost_usd: float
    payback_period_years: float
    co2_offset_kg_per_year: float
