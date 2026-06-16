"""
Building Information Modeling (BIM) Service.
Provides full building profiles, health reports, and occupancy data.
"""
import random
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any
import logging

logger = logging.getLogger(__name__)

BUILDING_AI_ALERTS = {
    "HVAC_OVERDUE": "HVAC service overdue → estimated +{pct}% energy waste",
    "ENERGY_SPIKE": "Predicted energy spike tomorrow {hour}:00-{end}:00 PM",
    "WINDOW_RETROFIT": "Window U-value above threshold → retrofit recommended",
    "STRUCTURAL_RISK": "Structural health below safe threshold — inspection required",
    "OCCUPANCY_ANOMALY": "Night-time occupancy detected — security alert",
    "SOLAR_OPPORTUNITY": "Roof suitable for {kw} kW solar installation (ROI: {roi} years)",
}


def _health_rating(score: float) -> str:
    if score >= 90:
        return "Excellent"
    elif score >= 75:
        return "Good"
    elif score >= 60:
        return "Fair"
    elif score >= 40:
        return "Poor"
    return "Critical"


def _generate_ai_alerts(building: dict) -> List[str]:
    alerts = []
    structural = building.get("structural_health_score", 80)
    maintenance = building.get("maintenance_status", "good")

    if maintenance in ("poor", "critical") or structural < 60:
        alerts.append(BUILDING_AI_ALERTS["HVAC_OVERDUE"].format(pct=random.randint(5, 15)))

    if building.get("building_use") in ("office", "retail"):
        alerts.append(BUILDING_AI_ALERTS["ENERGY_SPIKE"].format(
            hour=random.randint(14, 15), end=random.randint(16, 17)
        ))

    if building.get("u_value_window", 0) and building["u_value_window"] > 1.4:
        alerts.append(BUILDING_AI_ALERTS["WINDOW_RETROFIT"])

    if structural < 50:
        alerts.append(BUILDING_AI_ALERTS["STRUCTURAL_RISK"])

    if not building.get("has_solar_panels") and building.get("footprint_area_m2", 0) > 500:
        capacity = int(building["footprint_area_m2"] * 0.03)
        alerts.append(BUILDING_AI_ALERTS["SOLAR_OPPORTUNITY"].format(kw=capacity, roi=random.uniform(5, 9)))

    return alerts[:3]


def _energy_today(building: dict) -> dict:
    area = building.get("footprint_area_m2", 500) * building.get("floors_above", 5)
    base_kwh = area * random.uniform(0.04, 0.08)
    return {
        "kwh_total": round(base_kwh, 1),
        "peak_demand_kw": round(base_kwh * 0.12, 1),
        "peak_hour": random.randint(13, 15),
        "cost_usd": round(base_kwh * 0.10, 2),
        "co2_tons": round(base_kwh * 0.0006, 2),
        "vs_yesterday_pct": round(random.uniform(-5, 15), 1),
    }


class BimService:
    async def get_building_full_profile(self, building_id: int, building_row: dict) -> dict:
        structural = building_row.get("structural_health_score", 80)
        systems_score = random.uniform(65, 95)
        maintenance_score = {"excellent": 95, "good": 80, "fair": 60, "poor": 40, "critical": 20}.get(
            building_row.get("maintenance_status", "good"), 70
        )
        energy_score = {"A": 95, "B": 75, "C": 50}.get(building_row.get("building_class", "B"), 70)
        safety = building_row.get("fire_safety_score", 85)

        composite = structural * 0.30 + systems_score * 0.25 + maintenance_score * 0.20 + energy_score * 0.15 + safety * 0.10

        max_occ = building_row.get("max_occupancy", 200)
        current_occ = int(max_occ * random.uniform(0.3, 0.9))

        return {
            "id": building_id,
            "name": building_row.get("name", f"Building {building_id}"),
            "address": building_row.get("address"),
            "building_use": building_row.get("building_use", "office"),
            "building_class": building_row.get("building_class", "B"),
            "floors_above": building_row.get("floors_above", 5),
            "height_m": building_row.get("height_m", 20),
            "footprint_area_m2": building_row.get("footprint_area_m2", 500),
            "year_built": building_row.get("year_built", 2000),
            "max_occupancy": max_occ,
            "current_occupancy": current_occ,
            "occupancy_pct": round(current_occ / max_occ * 100, 1),
            "has_hvac": building_row.get("has_hvac", True),
            "hvac_type": building_row.get("hvac_type"),
            "has_bms": building_row.get("has_bms", False),
            "has_solar_panels": building_row.get("has_solar_panels", False),
            "solar_capacity_kw": building_row.get("solar_capacity_kw", 0),
            "structural_health_score": structural,
            "fire_safety_score": safety,
            "maintenance_status": building_row.get("maintenance_status", "good"),
            "health": {
                "score": round(composite, 1),
                "rating": _health_rating(composite),
                "breakdown": {
                    "structural": round(structural, 1),
                    "systems": round(systems_score, 1),
                    "maintenance": round(maintenance_score, 1),
                    "energy_efficiency": round(energy_score, 1),
                    "safety": round(safety, 1),
                },
                "alerts": _generate_ai_alerts(building_row),
            },
            "systems": building_row.get("systems", []),
            "energy_today": _energy_today(building_row),
            "ai_alerts": _generate_ai_alerts(building_row),
        }

    async def get_maintenance_alerts(self) -> List[dict]:
        return [
            {"building_id": 1, "system": "HVAC", "alert": "Service overdue by 365 days", "severity": "HIGH"},
            {"building_id": 5, "system": "Structural", "alert": "Health score below 50", "severity": "CRITICAL"},
            {"building_id": 7, "system": "Fire System", "alert": "Last inspection > 1 year", "severity": "MEDIUM"},
        ]

    async def calculate_solar_potential(self, building: dict) -> dict:
        area = building.get("footprint_area_m2", 500)
        usable_area = area * 0.70
        irradiance = 5.5
        efficiency = 0.20
        pr = 0.75
        shading = random.uniform(0.05, 0.25)
        annual_kwh = usable_area * efficiency * irradiance * 365 * (1 - shading) * pr
        panel_count = int(usable_area / 1.7)
        cost_usd = panel_count * 280
        annual_savings = annual_kwh * 0.10
        payback = cost_usd / annual_savings if annual_savings > 0 else 99
        return {
            "building_id": building.get("id"),
            "roof_area_m2": round(area, 1),
            "annual_potential_kwh": round(annual_kwh, 0),
            "recommended_panel_count": panel_count,
            "estimated_cost_usd": round(cost_usd, 0),
            "payback_period_years": round(payback, 1),
            "co2_offset_kg_per_year": round(annual_kwh * 0.6, 0),
        }


bim_service = BimService()
