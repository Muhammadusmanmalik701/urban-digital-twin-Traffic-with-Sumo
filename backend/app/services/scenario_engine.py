"""
Scenario Engine — auto-detects city emergencies and generates ranked solutions.

RANKING ALGORITHM:
  score = (impact_score × 0.40) + (confidence × 0.25) + (speed_score × 0.20) + (cost_efficiency × 0.15)
"""
import random
import math
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
import logging

logger = logging.getLogger(__name__)

SOLUTION_LIBRARY = {
    "SOL_T01": {
        "name": "Adaptive Signal Optimization",
        "description": "Switch all affected intersections to AI-adaptive signal timing using Max-Pressure algorithm",
        "solution_type": "immediate_action",
        "confidence": 0.87,
        "cost_usd": 0,
        "implementation_minutes": 5,
        "impact": {"congestion_reduction_pct": 25, "travel_time_reduction_pct": 18, "co2_reduction_pct": 12, "affected_vehicles": 4500},
        "scenarios": ["SCENARIO_001"],
    },
    "SOL_T02": {
        "name": "Dynamic Lane Reversal",
        "description": "Reverse 2 lanes on Main Boulevard to increase inbound capacity",
        "solution_type": "operator_action",
        "confidence": 0.79,
        "cost_usd": 200,
        "implementation_minutes": 15,
        "impact": {"capacity_increase_pct": 40, "congestion_reduction_pct": 35},
        "scenarios": ["SCENARIO_001"],
    },
    "SOL_T03": {
        "name": "Demand-Responsive Rerouting",
        "description": "Push alternate routes to navigation apps via API + VMS signs using Dijkstra algorithm",
        "solution_type": "immediate_action",
        "confidence": 0.82,
        "cost_usd": 0,
        "implementation_minutes": 2,
        "impact": {"traffic_diversion_pct": 30, "congestion_reduction_pct": 22},
        "scenarios": ["SCENARIO_001"],
    },
    "SOL_T04": {
        "name": "Emergency Public Transit Surge",
        "description": "Deploy 15 additional buses on 3 high-demand corridors",
        "solution_type": "operator_action",
        "confidence": 0.71,
        "cost_usd": 4500,
        "implementation_minutes": 25,
        "impact": {"modal_shift_pct": 15, "car_trips_reduced": 800, "congestion_reduction_pct": 18},
        "scenarios": ["SCENARIO_001"],
    },
    "SOL_T05": {
        "name": "Automatic Accident Rerouting",
        "description": "Instantly calculate and activate 3 alternate routes, update all VMS signs",
        "solution_type": "immediate_action",
        "confidence": 0.91,
        "cost_usd": 0,
        "implementation_minutes": 1,
        "impact": {"alternate_routes": 3, "vehicles_diverted": 2000},
        "scenarios": ["SCENARIO_002"],
    },
    "SOL_E01": {
        "name": "Demand Response — Large Consumers",
        "description": "Signal top 50 energy consumers to reduce load by 20% for 2 hours",
        "solution_type": "immediate_action",
        "confidence": 0.84,
        "cost_usd": 0,
        "implementation_minutes": 5,
        "impact": {"load_reduction_mw": 85, "cost_savings_usd": 42000, "co2_reduction_kg": 31000},
        "scenarios": ["SCENARIO_010"],
    },
    "SOL_E02": {
        "name": "Solar + Battery Dispatch",
        "description": "Discharge all grid-connected batteries and maximize solar export immediately",
        "solution_type": "immediate_action",
        "confidence": 0.91,
        "cost_usd": 0,
        "implementation_minutes": 2,
        "impact": {"additional_power_mw": 22, "grid_load_reduction_pct": 8},
        "scenarios": ["SCENARIO_010"],
    },
    "SOL_E03": {
        "name": "Non-Critical Load Shutdown",
        "description": "Turn off decorative lighting, fountains, and non-essential city loads",
        "solution_type": "automated",
        "confidence": 0.99,
        "cost_usd": 0,
        "implementation_minutes": 1,
        "impact": {"load_reduction_mw": 12},
        "scenarios": ["SCENARIO_010"],
    },
    "SOL_E04": {
        "name": "Peak Tariff Alert to Citizens",
        "description": "Push notification: 3x tariff active 3-7 PM — voluntary demand reduction",
        "solution_type": "communication",
        "confidence": 0.65,
        "cost_usd": 0,
        "implementation_minutes": 2,
        "impact": {"voluntary_reduction_pct": 8},
        "scenarios": ["SCENARIO_010"],
    },
    "SOL_B06": {
        "name": "Emergency Cooling Centers",
        "description": "Open 12 designated public buildings as cooling centers for heat emergency",
        "solution_type": "immediate_action",
        "confidence": 0.93,
        "cost_usd": 8000,
        "implementation_minutes": 30,
        "impact": {"people_protected": 12000, "heat_illness_prevention_pct": 85},
        "scenarios": ["SCENARIO_008", "SCENARIO_015"],
    },
    "SOL_B07": {
        "name": "HVAC Load Shedding Protocol",
        "description": "Raise thermostat setpoints by 2°C in commercial buildings during 2-6 PM peak",
        "solution_type": "immediate_action",
        "confidence": 0.88,
        "cost_usd": 0,
        "implementation_minutes": 10,
        "impact": {"energy_reduction_pct": 18, "grid_relief_mw": 45},
        "scenarios": ["SCENARIO_008", "SCENARIO_010"],
    },
    "SOL_C01": {
        "name": "Heat Emergency Protocol",
        "description": "Full city heat emergency: cooling centers, misting stations, outdoor work restrictions",
        "solution_type": "immediate_action",
        "confidence": 0.92,
        "cost_usd": 125000,
        "implementation_minutes": 120,
        "impact": {"heat_mortality_reduction_pct": 70, "hospitalization_reduction_pct": 55},
        "scenarios": ["SCENARIO_015"],
    },
    "SOL_C04": {
        "name": "Flood Emergency Response",
        "description": "Close flood-prone roads, deploy pumping units, activate emergency shelters",
        "solution_type": "immediate_action",
        "confidence": 0.89,
        "cost_usd": 45000,
        "implementation_minutes": 30,
        "impact": {"roads_reopened_est": 6, "people_evacuated": 3000},
        "scenarios": ["SCENARIO_016"],
    },
}

SCENARIO_DEFINITIONS = {
    "SCENARIO_001": {
        "name": "Peak Hour Traffic Gridlock",
        "scenario_type": "traffic",
        "description": "City center congestion causing 45-min delays on main corridors",
        "solutions": ["SOL_T01", "SOL_T03", "SOL_T04", "SOL_T02"],
    },
    "SCENARIO_002": {
        "name": "Major Road Accident — Highway Closure",
        "scenario_type": "traffic",
        "description": "Multi-vehicle accident on main highway, lanes closed",
        "solutions": ["SOL_T05"],
    },
    "SCENARIO_010": {
        "name": "City-Wide Energy Demand Spike",
        "scenario_type": "energy",
        "description": "Summer peak demand threatening grid stability",
        "solutions": ["SOL_E01", "SOL_E02", "SOL_E03", "SOL_E04"],
    },
    "SCENARIO_015": {
        "name": "Extreme Heat Wave — Health Crisis",
        "scenario_type": "climate",
        "description": "Temperature above 45°C for 3+ consecutive days",
        "solutions": ["SOL_C01", "SOL_B06"],
    },
    "SCENARIO_016": {
        "name": "Flash Flood",
        "scenario_type": "climate",
        "description": "Rainfall > 80mm/hour causing widespread flooding",
        "solutions": ["SOL_C04"],
    },
}


def _rank_solution(sol_code: str, sol: dict) -> float:
    impact_score = min(1.0, sum(
        v for v in sol["impact"].values() if isinstance(v, (int, float))
    ) / 100)
    confidence = sol["confidence"]
    speed_score = 1.0 / max(sol["implementation_minutes"] / 60, 0.1)
    speed_score = min(1.0, speed_score / 12)
    cost_efficiency = impact_score / max(sol["cost_usd"] / 1000, 0.01)
    cost_efficiency = min(1.0, cost_efficiency / 10)

    score = (impact_score * 0.40) + (confidence * 0.25) + (speed_score * 0.20) + (cost_efficiency * 0.15)
    return round(score * 100, 1)


class ScenarioEngine:
    async def generate_solutions(self, scenario_code: str) -> List[dict]:
        defn = SCENARIO_DEFINITIONS.get(scenario_code, {})
        sol_codes = defn.get("solutions", [])
        results = []
        for code in sol_codes:
            sol = SOLUTION_LIBRARY.get(code)
            if sol:
                rank = _rank_solution(code, sol)
                results.append({
                    "solution_code": code,
                    "name": sol["name"],
                    "description": sol["description"],
                    "solution_type": sol["solution_type"],
                    "rank_score": rank,
                    "impact_score": sol["confidence"],
                    "confidence": sol["confidence"],
                    "cost_usd": sol["cost_usd"],
                    "implementation_minutes": sol["implementation_minutes"],
                    "impact_details": sol["impact"],
                    "status": "pending",
                })
        return sorted(results, key=lambda x: x["rank_score"], reverse=True)

    async def simulate_solution(self, solution_code: str, kpi_snapshot: dict) -> dict:
        sol = SOLUTION_LIBRARY.get(solution_code, {})
        impact = sol.get("impact", {})

        congestion_before = kpi_snapshot.get("congestion_index", 0.87)
        energy_mw_before = kpi_snapshot.get("energy_mw", 1240)
        co2_before = kpi_snapshot.get("co2_kg", 85000)

        congestion_reduction = impact.get("congestion_reduction_pct", 0) / 100
        energy_reduction = (impact.get("load_reduction_mw", 0) / max(energy_mw_before, 1))
        co2_reduction_abs = impact.get("co2_reduction_kg", co2_before * congestion_reduction * 0.5)

        congestion_after = max(0, congestion_before * (1 - congestion_reduction))
        energy_after = max(0, energy_mw_before - impact.get("load_reduction_mw", 0))
        co2_after = max(0, co2_before - co2_reduction_abs)

        return {
            "before": {
                "congestion": round(congestion_before, 2),
                "energy_mw": round(energy_mw_before, 1),
                "co2_kg": round(co2_before, 0),
                "avg_speed_kmh": round(50 * (1 - congestion_before * 0.7), 1),
            },
            "after": {
                "congestion": round(congestion_after, 2),
                "energy_mw": round(energy_after, 1),
                "co2_kg": round(co2_after, 0),
                "avg_speed_kmh": round(50 * (1 - congestion_after * 0.7), 1),
            },
            "delta": {
                "congestion_pct": round(-congestion_reduction * 100, 1),
                "energy_savings_mwh": round(energy_mw_before - energy_after, 1),
                "co2_reduction_kg": round(co2_reduction_abs, 0),
                "cost_savings_usd": impact.get("cost_savings_usd", 0),
                "implementation_minutes": sol.get("implementation_minutes", 5),
                "affected_citizens": impact.get("affected_vehicles", impact.get("people_protected", 45000)),
            },
            "confidence": sol.get("confidence", 0.8),
            "caveats": [
                "Results assume current conditions persist",
                f"Based on {int(sol.get('confidence', 0.8)*100)}% confidence analytical model",
            ],
        }

    async def check_auto_detection(self, kpi: dict) -> Optional[dict]:
        congestion = kpi.get("congestion_index", 0)
        grid_load = kpi.get("grid_load_pct", 0)
        temp = kpi.get("outdoor_temp", 25)
        rainfall = kpi.get("rainfall_mm_hr", 0)
        aqi = kpi.get("aqi", 50)

        if congestion > 0.85:
            return {
                "scenario_code": "SCENARIO_001",
                "severity": "HIGH" if congestion > 0.90 else "MEDIUM",
                "kpi_snapshot": kpi,
            }
        if grid_load > 90:
            return {
                "scenario_code": "SCENARIO_010",
                "severity": "HIGH" if grid_load > 95 else "MEDIUM",
                "kpi_snapshot": kpi,
            }
        if temp > 45:
            return {
                "scenario_code": "SCENARIO_015",
                "severity": "HIGH",
                "kpi_snapshot": kpi,
            }
        if rainfall > 80:
            return {
                "scenario_code": "SCENARIO_016",
                "severity": "HIGH",
                "kpi_snapshot": kpi,
            }
        return None


scenario_engine = ScenarioEngine()
