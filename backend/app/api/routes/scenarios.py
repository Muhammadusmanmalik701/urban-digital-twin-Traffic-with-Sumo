from fastapi import APIRouter, HTTPException, Query
from typing import List, Optional
from datetime import datetime, timezone
from app.models.scenario import ScenarioCreate, ScenarioResponse, SolutionResponse, ImpactReport, SimulationResult
from app.services.scenario_engine import scenario_engine, SCENARIO_DEFINITIONS, SOLUTION_LIBRARY
import random

router = APIRouter(prefix="/scenarios", tags=["scenarios"])

_scenarios_db: List[dict] = [
    {
        "id": 1,
        "scenario_type": "traffic",
        "scenario_code": "SCENARIO_001",
        "name": "Peak Hour Traffic Gridlock",
        "description": "City center congestion causing 45-min delays on main corridors",
        "severity": "HIGH",
        "status": "active",
        "auto_detected": True,
        "affected_zone_ids": [1, 3, 5],
        "affected_building_ids": [],
        "affected_road_ids": [],
        "kpi_snapshot": {"congestion_index": 0.87, "avg_speed_kmh": 18, "vehicle_count": 4500, "co2_increase_pct": 40},
        "started_at": datetime.now(timezone.utc).isoformat(),
        "resolved_at": None,
        "created_by": "auto_detector",
    },
    {
        "id": 2,
        "scenario_type": "energy",
        "scenario_code": "SCENARIO_010",
        "name": "City-Wide Energy Demand Spike",
        "description": "Summer peak demand threatening grid stability at 94% capacity",
        "severity": "HIGH",
        "status": "active",
        "auto_detected": True,
        "affected_zone_ids": [1, 2, 3, 4, 5],
        "affected_building_ids": [],
        "affected_road_ids": [],
        "kpi_snapshot": {"grid_load_pct": 94, "total_mw": 1240, "blackout_risk": "HIGH"},
        "started_at": datetime.now(timezone.utc).isoformat(),
        "resolved_at": None,
        "created_by": "auto_detector",
    },
]
_next_scenario_id = 3


@router.get("/", response_model=List[dict])
async def list_scenarios(status: Optional[str] = None, severity: Optional[str] = None):
    result = _scenarios_db
    if status:
        result = [s for s in result if s["status"] == status]
    if severity:
        result = [s for s in result if s["severity"] == severity]
    return result


@router.get("/active", response_model=List[dict])
async def get_active_scenarios():
    return [s for s in _scenarios_db if s["status"] == "active"]


@router.get("/{scenario_id}", response_model=dict)
async def get_scenario(scenario_id: int):
    s = next((x for x in _scenarios_db if x["id"] == scenario_id), None)
    if not s:
        raise HTTPException(status_code=404, detail="Scenario not found")
    return s


@router.post("/", response_model=dict)
async def create_scenario(body: ScenarioCreate):
    global _next_scenario_id
    defn = SCENARIO_DEFINITIONS.get(body.scenario_code or "", {})
    new = {
        "id": _next_scenario_id,
        "scenario_type": body.scenario_type,
        "scenario_code": body.scenario_code,
        "name": body.name or defn.get("name", body.name),
        "description": body.description or defn.get("description"),
        "severity": body.severity,
        "status": "active",
        "auto_detected": body.auto_detected,
        "affected_zone_ids": body.affected_zone_ids,
        "affected_building_ids": body.affected_building_ids,
        "affected_road_ids": body.affected_road_ids,
        "kpi_snapshot": body.kpi_snapshot,
        "started_at": datetime.now(timezone.utc).isoformat(),
        "resolved_at": None,
        "created_by": body.created_by,
    }
    _scenarios_db.append(new)
    _next_scenario_id += 1
    return new


@router.patch("/{scenario_id}/resolve")
async def resolve_scenario(scenario_id: int):
    s = next((x for x in _scenarios_db if x["id"] == scenario_id), None)
    if not s:
        raise HTTPException(status_code=404, detail="Scenario not found")
    s["status"] = "resolved"
    s["resolved_at"] = datetime.now(timezone.utc).isoformat()
    return {"message": "Scenario resolved", "scenario_id": scenario_id}


@router.get("/{scenario_id}/solutions", response_model=List[dict])
async def get_scenario_solutions(scenario_id: int):
    s = next((x for x in _scenarios_db if x["id"] == scenario_id), None)
    if not s:
        raise HTTPException(status_code=404, detail="Scenario not found")
    solutions = await scenario_engine.generate_solutions(s.get("scenario_code", ""))
    for i, sol in enumerate(solutions):
        sol["id"] = scenario_id * 100 + i + 1
        sol["scenario_id"] = scenario_id
    return solutions


@router.post("/{scenario_id}/solutions/{solution_code}/simulate", response_model=dict)
async def simulate_solution(scenario_id: int, solution_code: str):
    s = next((x for x in _scenarios_db if x["id"] == scenario_id), None)
    if not s:
        raise HTTPException(status_code=404, detail="Scenario not found")
    result = await scenario_engine.simulate_solution(solution_code, s.get("kpi_snapshot", {}))
    sol_meta = SOLUTION_LIBRARY.get(solution_code, {})
    return {
        "solution_code": solution_code,
        "solution_name": sol_meta.get("name", solution_code),
        "scenario_id": scenario_id,
        "simulation": result,
        "implementation_minutes": sol_meta.get("implementation_minutes", 5),
        "cost_usd": sol_meta.get("cost_usd", 0),
        "affected_citizens": result["delta"].get("affected_citizens", 45000),
    }


@router.post("/{scenario_id}/solutions/{solution_code}/apply")
async def apply_solution(scenario_id: int, solution_code: str, applied_by: str = "operator"):
    s = next((x for x in _scenarios_db if x["id"] == scenario_id), None)
    if not s:
        raise HTTPException(status_code=404, detail="Scenario not found")
    sol = SOLUTION_LIBRARY.get(solution_code)
    if not sol:
        raise HTTPException(status_code=404, detail="Solution not found")

    return {
        "status": "applied",
        "solution_code": solution_code,
        "solution_name": sol["name"],
        "scenario_id": scenario_id,
        "applied_by": applied_by,
        "applied_at": datetime.now(timezone.utc).isoformat(),
        "message": f"Solution '{sol['name']}' applied successfully. Expected improvement in {sol['implementation_minutes']} minutes.",
        "action_taken": f"Executed {sol['solution_type']} protocol",
    }
