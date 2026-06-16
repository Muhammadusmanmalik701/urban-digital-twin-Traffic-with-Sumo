from fastapi import APIRouter
from app.services.climate_service import climate_service

router = APIRouter(prefix="/climate", tags=["climate"])


@router.get("/current")
async def get_current_climate():
    return await climate_service.get_current_conditions()


@router.get("/heat_zones")
async def get_heat_zones():
    zones = await climate_service.get_heat_zones()
    return {"zones": zones}


@router.get("/air_quality")
async def get_air_quality():
    points = await climate_service.get_air_quality_grid()
    return {"points": points, "count": len(points)}


@router.get("/flood_risk")
async def get_flood_risk():
    zones = await climate_service.get_flood_risk()
    return {"flood_zones": zones}
