from fastapi import APIRouter
from datetime import datetime, timezone
from app.services.energy_service import energy_service, BUILDING_ENERGY_PROFILES
from app.api.routes.buildings import BUILDINGS
import random

router = APIRouter(prefix="/energy", tags=["energy"])


@router.get("/grid")
async def get_grid_snapshot():
    snapshot = await energy_service.get_city_grid_snapshot(BUILDINGS)
    return {
        **snapshot,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "nodes": [
            {"id": 1, "name": "Main Substation Downtown", "node_type": "substation", "capacity_kva": 50000, "current_load_kw": 32000, "load_pct": 64, "voltage_kv": 66, "status": "operational", "longitude": 67.008, "latitude": 24.865},
            {"id": 2, "name": "Zone 2 Transformer", "node_type": "transformer", "capacity_kva": 10000, "current_load_kw": 8800, "load_pct": 88, "voltage_kv": 11, "status": "overloaded", "longitude": 67.075, "latitude": 24.875},
            {"id": 3, "name": "Zone 3 Transformer", "node_type": "transformer", "capacity_kva": 8000, "current_load_kw": 4000, "load_pct": 50, "voltage_kv": 11, "status": "operational", "longitude": 67.025, "latitude": 24.920},
            {"id": 4, "name": "Port Feeder", "node_type": "feeder", "capacity_kva": 5000, "current_load_kw": 3200, "load_pct": 64, "voltage_kv": 11, "status": "operational", "longitude": 66.980, "latitude": 24.838},
        ],
    }


@router.get("/buildings")
async def get_all_buildings_energy():
    result = []
    for b in BUILDINGS:
        reading = await energy_service.get_live_reading(b)
        result.append({
            "building_id": b["id"],
            "building_name": b["name"],
            "longitude": b["longitude"],
            "latitude": b["latitude"],
            **reading,
        })
    return result


@router.get("/anomalies")
async def get_energy_anomalies():
    return {
        "anomalies": [
            {"building_id": 1, "anomaly_type": "NIGHT_WASTE", "description": "Energy 340% above 2AM baseline", "severity": "HIGH", "detected_at": datetime.now(timezone.utc).isoformat(), "current_kwh": 245, "expected_kwh": 55, "deviation_pct": 345},
            {"building_id": 8, "anomaly_type": "SUDDEN_SPIKE", "description": "Energy jumped 67% in 15 minutes", "severity": "HIGH", "detected_at": datetime.now(timezone.utc).isoformat(), "current_kwh": 980, "expected_kwh": 587, "deviation_pct": 67},
            {"building_id": 5, "anomaly_type": "POWER_FACTOR", "description": "Power factor 0.72 — below 0.85 threshold", "severity": "MEDIUM", "detected_at": datetime.now(timezone.utc).isoformat(), "current_kwh": 120, "expected_kwh": 120, "deviation_pct": 0},
        ]
    }


@router.post("/demand_response")
async def trigger_demand_response(mode: str = "reduce_20pct", duration_min: int = 120):
    eligible = [b for b in BUILDINGS if b["footprint_area_m2"] * b["floors_above"] > 2000]
    return {
        "mode": mode,
        "duration_minutes": duration_min,
        "buildings_targeted": len(eligible),
        "estimated_load_reduction_mw": round(len(eligible) * random.uniform(1.5, 2.5), 1),
        "estimated_cost_savings_usd": len(eligible) * random.randint(400, 900),
        "status": "broadcast_sent",
        "building_ids": [b["id"] for b in eligible],
    }


@router.get("/solar")
async def get_solar_overview():
    from app.services.bim_service import bim_service
    potentials = []
    for b in BUILDINGS:
        if not b["has_solar_panels"]:
            pot = await bim_service.calculate_solar_potential(b)
            potentials.append(pot)
    return {
        "buildings_without_solar": len(potentials),
        "total_annual_potential_kwh": sum(p["annual_potential_kwh"] for p in potentials),
        "total_co2_offset_kg_per_year": sum(p["co2_offset_kg_per_year"] for p in potentials),
        "buildings": potentials,
    }
