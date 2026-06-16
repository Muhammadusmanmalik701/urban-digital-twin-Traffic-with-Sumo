from fastapi import APIRouter
import os

router = APIRouter(tags=["health"])

MODEL_STATUSES = {
    "traffic_forecaster": "pending",
    "energy_predictor": "pending",
    "anomaly_detector": "pending",
    "occupancy_predictor": "pending",
    "scenario_impact_model": "pending",
}


@router.get("/health")
async def health():
    return {
        "status": "healthy",
        "service": "ml-service",
        "models": MODEL_STATUSES,
        "mlflow_connected": False,
    }
