from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import logging

from app.api.routes import traffic, buildings, energy, climate, scenarios, ml_proxy, websocket
from app.core.config import settings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Urban Digital Twin API starting up...")
    yield
    logger.info("Urban Digital Twin API shutting down...")


app = FastAPI(
    title="Urban Digital Twin API",
    description="AI-powered city intelligence platform — traffic, BIM, energy, scenarios",
    version="3.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(traffic.router, prefix="/api")
app.include_router(buildings.router, prefix="/api")
app.include_router(energy.router, prefix="/api")
app.include_router(climate.router, prefix="/api")
app.include_router(scenarios.router, prefix="/api")
app.include_router(ml_proxy.router, prefix="/api")
app.include_router(websocket.router)


@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "service": "urban-digital-twin-api",
        "version": "3.0.0",
        "pillars": {
            "traffic": "operational",
            "bim": "operational",
            "energy": "operational",
            "ml": "operational",
            "scenarios": "operational",
        },
    }


@app.get("/api/kpis")
async def get_city_kpis():
    from app.services.sumo_service import sumo_service
    from app.services.climate_service import climate_service
    import random

    vehicles = await sumo_service.get_vehicles()
    zone_cong = await sumo_service.get_zone_congestion()
    climate = await climate_service.get_current_conditions()
    max_cong = max(zone_cong.values())

    return {
        "vehicle_count": len(vehicles),
        "avg_congestion": round(sum(zone_cong.values()) / len(zone_cong), 3),
        "max_congestion": round(max_cong, 3),
        "energy_mwh": round(random.uniform(820, 870), 1),
        "grid_load_pct": round(random.uniform(78, 96), 1),
        "outdoor_temp_c": climate["outdoor_temp_c"],
        "aqi": climate["aqi"],
        "active_incidents": 1,
        "active_scenarios": 2,
        "co2_kg_hr": round(random.uniform(48000, 55000), 0),
    }
