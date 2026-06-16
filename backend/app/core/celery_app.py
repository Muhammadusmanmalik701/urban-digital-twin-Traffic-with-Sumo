from celery import Celery
from celery.schedules import crontab
import os

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")

celery_app = Celery(
    "urban_digital_twin",
    broker=REDIS_URL,
    backend=REDIS_URL,
    include=["app.tasks.scenario_tasks", "app.tasks.energy_tasks", "app.tasks.feature_tasks"],
)

celery_app.conf.beat_schedule = {
    "detect-scenarios-every-30s": {
        "task": "app.tasks.scenario_tasks.detect_scenarios",
        "schedule": 30.0,
    },
    "update-energy-features-every-5m": {
        "task": "app.tasks.feature_tasks.update_energy_features",
        "schedule": crontab(minute="*/5"),
    },
    "check-energy-anomalies-every-5m": {
        "task": "app.tasks.energy_tasks.check_energy_anomalies",
        "schedule": crontab(minute="*/5"),
    },
    "simulate-traffic-every-100ms": {
        "task": "app.tasks.scenario_tasks.simulate_traffic_tick",
        "schedule": 1.0,
    },
}

celery_app.conf.timezone = "UTC"
celery_app.conf.task_serializer = "json"
celery_app.conf.result_serializer = "json"
celery_app.conf.accept_content = ["json"]
