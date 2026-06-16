from fastapi import APIRouter
import httpx
import random
import math
from datetime import datetime, timezone
from app.core.config import settings

router = APIRouter(prefix="/ml", tags=["ml"])


async def _call_ml(path: str, payload: dict) -> dict:
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            r = await client.post(f"{settings.ML_SERVICE_URL}{path}", json=payload)
            return r.json()
    except Exception:
        return None


@router.get("/predictions/traffic")
async def predict_traffic(zone_id: int = 1, horizon_min: int = 60):
    hour = datetime.now(timezone.utc).hour
    result = await _call_ml("/predict/traffic", {"zone_id": zone_id, "horizon_min": horizon_min})
    if result:
        return result
    base = 0.65 + 0.20 * math.sin(2 * math.pi * (hour - 8) / 24)
    return {
        "zone_id": zone_id,
        "horizon_minutes": horizon_min,
        "predictions": [
            {"minutes_ahead": i * 15, "congestion_index": round(min(1.0, base + random.uniform(-0.05, 0.05)), 2), "confidence": round(0.87 - i * 0.02, 2)}
            for i in range(1, 5)
        ],
        "model": "mock_fallback",
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/predictions/energy")
async def predict_energy(building_id: int = 1):
    result = await _call_ml("/predict/energy", {"building_id": building_id})
    if result:
        return result
    hour = datetime.now(timezone.utc).hour
    base_kwh = 200 + 100 * math.sin(math.pi * (hour - 7) / 11) if 7 <= hour <= 18 else 80
    return {
        "building_id": building_id,
        "next_hour_kwh": round(base_kwh * (1 + random.uniform(-0.1, 0.1)), 1),
        "next_24h_kwh": round(base_kwh * 18, 0),
        "peak_hour": 14,
        "peak_demand_kw": round(base_kwh * 0.12, 1),
        "model": "mock_fallback",
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/anomalies")
async def detect_anomalies():
    return {
        "anomalies": [
            {"entity_type": "building", "entity_id": 8, "anomaly_type": "ENERGY_NIGHT_WASTE", "anomaly_score": 0.92, "description": "Factory running full load at 3AM"},
            {"entity_type": "road", "entity_id": 3, "anomaly_type": "UNEXPECTED_CONGESTION", "anomaly_score": 0.88, "description": "Congestion outside normal peak hours"},
        ],
        "model": "IsolationForest_v1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/predictions/occupancy")
async def predict_occupancy(building_id: int = 1):
    hour = datetime.now(timezone.utc).hour
    occ = max(0, min(1, 0.85 * math.sin(math.pi * (hour - 7) / 11))) if 7 <= hour <= 18 else 0.05
    return {
        "building_id": building_id,
        "current_occupancy_pct": round(occ * 100, 1),
        "peak_occupancy_hour": 11,
        "model": "mock_fallback",
    }
