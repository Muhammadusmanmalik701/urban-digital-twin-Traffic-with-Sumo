from fastapi import APIRouter, HTTPException, Query
from typing import List, Optional
from app.services.bim_service import bim_service
import random

router = APIRouter(prefix="/buildings", tags=["buildings"])

BUILDINGS = [
    {"id": 1, "name": "Karachi Trade Center", "address": "I.I. Chundrigar Road", "building_use": "office", "building_class": "B", "floors_above": 28, "height_m": 112, "footprint_area_m2": 1608, "year_built": 1998, "construction_type": "concrete_frame", "max_occupancy": 1200, "has_hvac": True, "hvac_type": "central_air", "has_bms": True, "has_solar_panels": False, "solar_capacity_kw": 0, "structural_health_score": 73, "fire_safety_score": 88, "maintenance_status": "fair", "longitude": 67.010, "latitude": 24.863, "u_value_window": 1.8},
    {"id": 2, "name": "MCB Tower", "address": "M.A. Jinnah Road", "building_use": "office", "building_class": "A", "floors_above": 17, "height_m": 68, "footprint_area_m2": 1200, "year_built": 2005, "construction_type": "steel_frame", "max_occupancy": 800, "has_hvac": True, "hvac_type": "chiller", "has_bms": True, "has_solar_panels": True, "solar_capacity_kw": 150, "structural_health_score": 91, "fire_safety_score": 95, "maintenance_status": "good", "longitude": 67.014, "latitude": 24.861, "u_value_window": 1.2},
    {"id": 3, "name": "DHA Shopping Mall", "address": "DHA Phase 5", "building_use": "retail", "building_class": "A", "floors_above": 4, "height_m": 20, "footprint_area_m2": 8000, "year_built": 2012, "construction_type": "concrete_frame", "max_occupancy": 5000, "has_hvac": True, "hvac_type": "central_air", "has_bms": True, "has_solar_panels": True, "solar_capacity_kw": 400, "structural_health_score": 88, "fire_safety_score": 92, "maintenance_status": "good", "longitude": 67.030, "latitude": 24.817, "u_value_window": 1.0},
    {"id": 4, "name": "LUMS University Block A", "address": "DHA Lahore", "building_use": "school", "building_class": "A", "floors_above": 5, "height_m": 22, "footprint_area_m2": 3000, "year_built": 2008, "construction_type": "concrete_frame", "max_occupancy": 1500, "has_hvac": True, "hvac_type": "split", "has_bms": False, "has_solar_panels": True, "solar_capacity_kw": 200, "structural_health_score": 94, "fire_safety_score": 97, "maintenance_status": "excellent", "longitude": 67.042, "latitude": 24.902, "u_value_window": 1.1},
    {"id": 5, "name": "Port Trust Warehouse 1", "address": "Karachi Port", "building_use": "industrial", "building_class": "C", "floors_above": 2, "height_m": 12, "footprint_area_m2": 5000, "year_built": 1975, "construction_type": "masonry", "max_occupancy": 50, "has_hvac": False, "hvac_type": None, "has_bms": False, "has_solar_panels": False, "solar_capacity_kw": 0, "structural_health_score": 45, "fire_safety_score": 60, "maintenance_status": "poor", "longitude": 66.978, "latitude": 24.837, "u_value_window": 3.5},
    {"id": 6, "name": "Avari Towers Hotel", "address": "Fatima Jinnah Road", "building_use": "mixed", "building_class": "A", "floors_above": 21, "height_m": 84, "footprint_area_m2": 2000, "year_built": 1988, "construction_type": "concrete_frame", "max_occupancy": 600, "has_hvac": True, "hvac_type": "chiller", "has_bms": True, "has_solar_panels": False, "solar_capacity_kw": 0, "structural_health_score": 79, "fire_safety_score": 90, "maintenance_status": "good", "longitude": 67.020, "latitude": 24.859, "u_value_window": 1.5},
    {"id": 7, "name": "Karachi General Hospital", "address": "Dr. Ruth Pfau Road", "building_use": "hospital", "building_class": "A", "floors_above": 8, "height_m": 36, "footprint_area_m2": 6000, "year_built": 1959, "construction_type": "concrete_frame", "max_occupancy": 2000, "has_hvac": True, "hvac_type": "central_air", "has_bms": True, "has_solar_panels": True, "solar_capacity_kw": 100, "structural_health_score": 69, "fire_safety_score": 85, "maintenance_status": "fair", "longitude": 67.007, "latitude": 24.869, "u_value_window": 1.6},
    {"id": 8, "name": "Industrial Factory Alpha", "address": "SITE Area", "building_use": "industrial", "building_class": "C", "floors_above": 3, "height_m": 15, "footprint_area_m2": 10000, "year_built": 1980, "construction_type": "steel_frame", "max_occupancy": 300, "has_hvac": True, "hvac_type": "split", "has_bms": False, "has_solar_panels": False, "solar_capacity_kw": 0, "structural_health_score": 62, "fire_safety_score": 70, "maintenance_status": "fair", "longitude": 67.060, "latitude": 24.874, "u_value_window": 2.8},
]


@router.get("/", response_model=List[dict])
async def list_buildings(use: Optional[str] = None, zone_id: Optional[int] = None):
    result = BUILDINGS
    if use:
        result = [b for b in result if b["building_use"] == use]
    return result


@router.get("/summary")
async def buildings_summary():
    return {
        "total": len(BUILDINGS),
        "by_use": {use: sum(1 for b in BUILDINGS if b["building_use"] == use) for use in set(b["building_use"] for b in BUILDINGS)},
        "critical_maintenance": sum(1 for b in BUILDINGS if b["maintenance_status"] in ("poor", "critical")),
        "total_occupancy_capacity": sum(b["max_occupancy"] for b in BUILDINGS),
    }


@router.get("/{building_id}", response_model=dict)
async def get_building(building_id: int):
    b = next((x for x in BUILDINGS if x["id"] == building_id), None)
    if not b:
        raise HTTPException(status_code=404, detail="Building not found")
    profile = await bim_service.get_building_full_profile(building_id, b)
    profile["longitude"] = b["longitude"]
    profile["latitude"] = b["latitude"]
    return profile


@router.get("/{building_id}/energy")
async def get_building_energy(building_id: int, hours: int = 24):
    b = next((x for x in BUILDINGS if x["id"] == building_id), None)
    if not b:
        raise HTTPException(status_code=404, detail="Building not found")
    readings = []
    import math
    area = b["footprint_area_m2"] * b["floors_above"]
    for h in range(hours):
        hour = h % 24
        base = area * 0.05
        load = 1.0 + 1.5 * max(0, math.sin(math.pi * (hour - 7) / 11)) if 7 <= hour <= 18 else 0.3
        kwh = base * load * (1 + random.uniform(-0.05, 0.05))
        readings.append({"hour": h, "kwh_total": round(kwh, 1), "peak_demand_kw": round(kwh * 0.1, 1)})
    return {"building_id": building_id, "hours": hours, "readings": readings}


@router.get("/{building_id}/solar_potential")
async def get_solar_potential(building_id: int):
    b = next((x for x in BUILDINGS if x["id"] == building_id), None)
    if not b:
        raise HTTPException(status_code=404, detail="Building not found")
    return await bim_service.calculate_solar_potential(b)


@router.post("/bms_command")
async def send_bms_command(command_type: str, delta: float = 2.0, building_ids: Optional[List[int]] = None):
    target = building_ids or [b["id"] for b in BUILDINGS if b["has_bms"]]
    return {
        "command": command_type,
        "delta": delta,
        "buildings_affected": len(target),
        "building_ids": target,
        "status": "sent",
        "estimated_energy_reduction_pct": 18 if command_type == "setpoint_raise" else 0,
    }
