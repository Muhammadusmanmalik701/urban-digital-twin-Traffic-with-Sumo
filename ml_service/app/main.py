from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import logging

from app.api.routes import predict, health, train

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Urban Digital Twin — ML Service",
    description="Machine learning microservice for traffic, energy, anomaly, and occupancy prediction",
    version="1.0.0",
)

app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

app.include_router(predict.router, prefix="/predict")
app.include_router(train.router, prefix="/train")
app.include_router(health.router)


@app.get("/")
async def root():
    return {"service": "ml-service", "status": "ready", "models": ["traffic_forecaster", "energy_predictor", "anomaly_detector", "occupancy_predictor", "scenario_impact_model"]}
