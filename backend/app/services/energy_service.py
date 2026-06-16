"""
Energy Intelligence Service — generates realistic energy readings and detects anomalies.
"""
import random
import math
from datetime import datetime, timezone
from typing import List, Dict, Optional
import logging

logger = logging.getLogger(__name__)

BUILDING_ENERGY_PROFILES = {
    "office": {"base_kwh_m2": 0.05, "peak_mult": 2.5, "peak_hours": (8, 18), "weekend_mult": 0.15},
    "retail": {"base_kwh_m2": 0.04, "peak_mult": 2.0, "peak_hours": (10, 22), "weekend_mult": 1.2},
    "hospital": {"base_kwh_m2": 0.08, "peak_mult": 1.5, "peak_hours": (0, 24), "weekend_mult": 0.9},
    "school": {"base_kwh_m2": 0.03, "peak_mult": 2.0, "peak_hours": (7, 16), "weekend_mult": 0.1},
    "industrial": {"base_kwh_m2": 0.10, "peak_mult": 1.8, "peak_hours": (6, 22), "weekend_mult": 0.6},
    "residential": {"base_kwh_m2": 0.02, "peak_mult": 1.8, "peak_hours": (6, 9), "weekend_mult": 1.1},
    "mixed": {"base_kwh_m2": 0.045, "peak_mult": 2.0, "peak_hours": (8, 20), "weekend_mult": 0.7},
}

CO2_PER_KWH = 0.6
TARIFF = {"peak": 0.28, "shoulder": 0.16, "off_peak": 0.08}


def _get_tariff_zone(hour: int) -> str:
    if 17 <= hour <= 22:
        return "peak"
    elif 7 <= hour <= 17:
        return "shoulder"
    return "off_peak"


def _calc_energy(building: dict, hour: int, outdoor_temp: float = 30) -> dict:
    use = building.get("building_use", "office")
    profile = BUILDING_ENERGY_PROFILES.get(use, BUILDING_ENERGY_PROFILES["office"])
    area = building.get("footprint_area_m2", 500) * building.get("floors_above", 5)
    base = area * profile["base_kwh_m2"]

    peak_start, peak_end = profile["peak_hours"]
    if peak_start <= hour < peak_end:
        load_factor = profile["peak_mult"]
    else:
        load_factor = 0.4

    temp_factor = 1 + max(0, (outdoor_temp - 25) * 0.03)
    kwh_hvac = base * load_factor * temp_factor * 0.45
    kwh_lighting = base * load_factor * 0.20
    kwh_equipment = base * load_factor * 0.30
    kwh_elevators = base * 0.05 * (1 if peak_start <= hour < peak_end else 0.3)
    kwh_total = kwh_hvac + kwh_lighting + kwh_equipment + kwh_elevators
    kwh_total *= (1 + random.uniform(-0.05, 0.05))

    solar = building.get("solar_capacity_kw", 0)
    solar_gen = solar * max(0, math.sin(math.pi * (hour - 6) / 12)) * random.uniform(0.7, 1.0) if 6 <= hour <= 18 else 0

    tariff_zone = _get_tariff_zone(hour)
    rate = TARIFF[tariff_zone]

    return {
        "kwh_total": round(kwh_total, 2),
        "kwh_hvac": round(kwh_hvac, 2),
        "kwh_lighting": round(kwh_lighting, 2),
        "kwh_equipment": round(kwh_equipment, 2),
        "kwh_elevators": round(kwh_elevators, 2),
        "kwh_solar_generated": round(solar_gen, 2),
        "peak_demand_kw": round(kwh_total * 0.9, 2),
        "power_factor": round(random.uniform(0.88, 0.98), 2),
        "co2_kg": round(kwh_total * CO2_PER_KWH, 2),
        "cost_usd": round(max(0, kwh_total - solar_gen) * rate, 2),
        "tariff_zone": tariff_zone,
        "outdoor_temp": outdoor_temp,
    }


def detect_anomalies(readings_history: List[dict], current: dict, building: dict) -> List[dict]:
    anomalies = []
    if not readings_history:
        return anomalies

    values = [r["kwh_total"] for r in readings_history]
    mean = sum(values) / len(values)
    std = math.sqrt(sum((v - mean) ** 2 for v in values) / len(values)) if len(values) > 1 else 0

    kwh = current["kwh_total"]
    hour = datetime.now(timezone.utc).hour

    if std > 0 and kwh > mean + 2.5 * std:
        anomalies.append({
            "anomaly_type": "BASELINE_DEVIATION",
            "description": f"Energy {round((kwh-mean)/mean*100)}% above baseline",
            "severity": "HIGH" if kwh > mean + 3 * std else "MEDIUM",
            "current_kwh": kwh,
            "expected_kwh": round(mean, 2),
            "deviation_pct": round((kwh - mean) / mean * 100, 1),
        })

    if len(readings_history) >= 1:
        prev = readings_history[-1]["kwh_total"]
        if prev > 0 and (kwh - prev) / prev > 0.40:
            anomalies.append({
                "anomaly_type": "SUDDEN_SPIKE",
                "description": f"Energy jumped {round((kwh-prev)/prev*100)}% in one interval",
                "severity": "HIGH",
                "current_kwh": kwh,
                "expected_kwh": prev,
                "deviation_pct": round((kwh - prev) / prev * 100, 1),
            })

    if 2 <= hour <= 5 and kwh > mean * 0.3:
        anomalies.append({
            "anomaly_type": "NIGHT_WASTE",
            "description": "Significant energy use detected 2-5 AM — building should be empty",
            "severity": "MEDIUM",
            "current_kwh": kwh,
            "expected_kwh": round(mean * 0.15, 2),
            "deviation_pct": round((kwh - mean * 0.15) / (mean * 0.15) * 100, 1),
        })

    return anomalies


class EnergyService:
    async def get_live_reading(self, building: dict) -> dict:
        hour = datetime.now(timezone.utc).hour
        outdoor_temp = random.uniform(28, 40)
        return _calc_energy(building, hour, outdoor_temp)

    async def get_city_grid_snapshot(self, buildings: List[dict]) -> dict:
        total_mw = sum(b.get("footprint_area_m2", 500) * b.get("floors_above", 5) * 0.00006 for b in buildings)
        total_mw += random.uniform(-5, 10)
        capacity_mw = 1800
        renewable_mw = random.uniform(80, 150)
        return {
            "total_load_mw": round(total_mw, 1),
            "total_capacity_mw": capacity_mw,
            "load_pct": round(total_mw / capacity_mw * 100, 1),
            "renewable_mw": round(renewable_mw, 1),
            "renewable_pct": round(renewable_mw / total_mw * 100, 1),
        }


energy_service = EnergyService()
