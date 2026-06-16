from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import random
import math
from datetime import datetime, timezone

router = APIRouter(tags=["predict"])


class TrafficPredictRequest(BaseModel):
    zone_id: int
    horizon_min: int = 60
    features: Optional[dict] = None


class EnergyPredictRequest(BaseModel):
    building_id: int
    building_type: Optional[str] = "office"
    area_m2: Optional[float] = 5000
    outdoor_temp: Optional[float] = 30


class AnomalyRequest(BaseModel):
    entity_type: str
    entity_id: int
    features: dict


@router.post("/traffic")
async def predict_traffic(req: TrafficPredictRequest):
    hour = datetime.now(timezone.utc).hour
    base = 0.65 + 0.20 * math.sin(2 * math.pi * (hour - 8) / 24)
    return {
        "zone_id": req.zone_id,
        "horizon_minutes": req.horizon_min,
        "predictions": [
            {
                "minutes_ahead": i * 15,
                "congestion_index": round(min(1.0, base + random.uniform(-0.05, 0.05)), 3),
                "confidence": round(0.87 - i * 0.02, 2),
                "risk_level": "HIGH" if base > 0.85 else "MEDIUM" if base > 0.65 else "LOW",
            }
            for i in range(1, req.horizon_min // 15 + 1)
        ],
        "model": "traffic_forecaster_v1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


@router.post("/energy")
async def predict_energy(req: EnergyPredictRequest):
    hour = datetime.now(timezone.utc).hour
    base = req.area_m2 * 0.05 * (1 + 1.5 * max(0, math.sin(math.pi * (hour - 7) / 11))) if 7 <= hour <= 18 else req.area_m2 * 0.02
    temp_factor = 1 + (req.outdoor_temp - 25) * 0.03
    return {
        "building_id": req.building_id,
        "next_hour_kwh": round(base * temp_factor * random.uniform(0.95, 1.05), 1),
        "next_24h_kwh": round(base * temp_factor * 18, 0),
        "peak_hour": 14,
        "peak_demand_kw": round(base * 0.12, 1),
        "model": "energy_predictor_v1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


@router.post("/anomaly")
async def detect_anomaly(req: AnomalyRequest):
    score = random.uniform(0.1, 0.95)
    return {
        "entity_type": req.entity_type,
        "entity_id": req.entity_id,
        "anomaly_score": round(score, 3),
        "is_anomaly": score > 0.80,
        "anomaly_type": "ENERGY_SPIKE" if score > 0.80 else "NORMAL",
        "model": "anomaly_detector_v1",
    }


@router.post("/occupancy")
async def predict_occupancy(building_id: int, building_type: str = "office"):
    hour = datetime.now(timezone.utc).hour
    occ = max(0, min(1, 0.9 * math.sin(math.pi * (hour - 7) / 11))) if 7 <= hour <= 18 else 0.05
    return {
        "building_id": building_id,
        "predicted_occupancy_pct": round(occ * 100, 1),
        "peak_hour": 11,
        "model": "occupancy_predictor_v1",
    }
