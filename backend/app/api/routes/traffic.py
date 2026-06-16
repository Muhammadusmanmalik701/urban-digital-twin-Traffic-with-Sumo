from fastapi import APIRouter, HTTPException
from typing import List, Optional
from app.services.sumo_service import sumo_service

router = APIRouter(prefix="/traffic", tags=["traffic"])


@router.get("/vehicles")
async def get_vehicles():
    vehicles = await sumo_service.get_vehicles()
    return {"count": len(vehicles), "vehicles": vehicles}


@router.get("/congestion")
async def get_congestion():
    zone_cong = await sumo_service.get_zone_congestion()
    zone_names = {1: "Downtown", 2: "Industrial", 3: "Residential North", 4: "University", 5: "Port Area"}
    return [
        {
            "zone_id": zid,
            "zone_name": zone_names.get(zid, f"Zone {zid}"),
            "congestion_index": round(cong, 3),
            "status": "gridlock" if cong > 0.85 else "heavy" if cong > 0.65 else "moderate" if cong > 0.40 else "free_flow",
        }
        for zid, cong in zone_cong.items()
    ]


@router.get("/signals")
async def get_signals():
    signals = await sumo_service.get_signals()
    return {"signals": signals}


@router.post("/signals/optimize_zone")
async def optimize_signals(zone_id: int):
    result = await sumo_service.optimize_signals_for_zone(zone_id)
    return result


@router.post("/push_diversion")
async def push_diversion(scenario_id: int):
    result = await sumo_service.reroute_vehicles(scenario_id)
    return result


@router.get("/incidents")
async def get_incidents():
    return {
        "incidents": [
            {
                "id": 1,
                "incident_type": "ROADWORK",
                "severity": "MEDIUM",
                "longitude": 67.014,
                "latitude": 24.861,
                "description": "Utility maintenance on MA Jinnah Road",
                "started_at": "2026-06-11T08:00:00Z",
                "affected_lanes": 1,
            }
        ]
    }


@router.post("/incidents/{incident_id}/activate_rerouting")
async def activate_rerouting(incident_id: int):
    result = await sumo_service.reroute_vehicles(incident_id)
    return {**result, "incident_id": incident_id, "message": "Alternate routes activated and broadcast to VMS signs"}
