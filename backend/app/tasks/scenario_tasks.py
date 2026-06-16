from app.core.celery_app import celery_app
import random
import logging

logger = logging.getLogger(__name__)


@celery_app.task(name="app.tasks.scenario_tasks.detect_scenarios")
def detect_scenarios():
    kpi = {
        "congestion_index": random.uniform(0.3, 0.95),
        "grid_load_pct": random.uniform(60, 98),
        "outdoor_temp": random.uniform(30, 46),
        "rainfall_mm_hr": random.uniform(0, 90),
        "aqi": random.randint(50, 310),
    }
    logger.info(f"Scenario detection tick: congestion={kpi['congestion_index']:.2f}, grid={kpi['grid_load_pct']:.1f}%")
    return kpi


@celery_app.task(name="app.tasks.scenario_tasks.simulate_traffic_tick")
def simulate_traffic_tick():
    return {"vehicles_updated": random.randint(280, 320)}
