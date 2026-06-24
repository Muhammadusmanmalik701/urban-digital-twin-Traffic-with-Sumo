from fastapi import APIRouter, Query
from app.services.climate_service import climate_service

router = APIRouter(prefix="/climate", tags=["climate"])


@router.get("/current")
async def get_current_climate():
    return await climate_service.get_current_conditions()


@router.get("/heat_zones")
async def get_heat_zones():
    zones = await climate_service.get_heat_zones()
    return {"zones": zones}


@router.get("/heatwave")
async def get_heatwave_areas():
    areas = await climate_service.get_heatwave_areas()
    return {"areas": areas, "source": "Open-Meteo + UHI model"}


@router.get("/intervention")
async def get_intervention_impact(
    area: str = Query(..., description="Area name"),
    tree_cover_pct: float = Query(20, ge=0, le=100),
    water_ha: float = Query(1.0, ge=0, le=50),
    green_roof_pct: float = Query(5, ge=0, le=100),
    cool_roof_pct: float = Query(5, ge=0, le=100),
):
    return await climate_service.get_intervention_impact(
        area, tree_cover_pct, water_ha, green_roof_pct, cool_roof_pct
    )


@router.get("/air_quality")
async def get_air_quality():
    points = await climate_service.get_air_quality_grid()
    return {"points": points, "count": len(points)}


@router.get("/flood_risk")
async def get_flood_risk():
    zones = await climate_service.get_flood_risk()
    return {"flood_zones": zones}
