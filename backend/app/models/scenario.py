from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime


class ScenarioBase(BaseModel):
    scenario_type: str
    scenario_code: Optional[str] = None
    name: str
    description: Optional[str] = None
    severity: str = "MEDIUM"
    affected_zone_ids: List[int] = []
    affected_building_ids: List[int] = []
    affected_road_ids: List[int] = []
    kpi_snapshot: Dict[str, Any] = {}


class ScenarioCreate(ScenarioBase):
    auto_detected: bool = False
    created_by: str = "manual"


class ScenarioResponse(ScenarioBase):
    id: int
    status: str
    auto_detected: bool
    started_at: datetime
    resolved_at: Optional[datetime] = None
    created_by: str

    class Config:
        from_attributes = True


class SolutionBase(BaseModel):
    solution_code: Optional[str] = None
    name: str
    description: Optional[str] = None
    solution_type: str = "immediate_action"
    confidence: float = 0.5
    cost_usd: float = 0
    implementation_minutes: int = 5
    impact_details: Dict[str, Any] = {}


class SolutionResponse(SolutionBase):
    id: int
    scenario_id: int
    rank_score: float
    impact_score: float
    simulation_result: Optional[Dict[str, Any]] = None
    status: str
    applied_at: Optional[datetime] = None
    applied_by: Optional[str] = None

    class Config:
        from_attributes = True


class SimulationResult(BaseModel):
    before: Dict[str, Any]
    after: Dict[str, Any]
    delta: Dict[str, Any]
    confidence: float
    caveats: List[str] = []


class ImpactReport(BaseModel):
    solution_id: int
    scenario_id: int
    simulation: SimulationResult
    implementation_minutes: int
    cost_usd: float
    affected_citizens: int
