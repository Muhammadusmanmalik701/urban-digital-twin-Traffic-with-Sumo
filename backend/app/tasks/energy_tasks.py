from app.core.celery_app import celery_app
import random
import logging

logger = logging.getLogger(__name__)


@celery_app.task(name="app.tasks.energy_tasks.check_energy_anomalies")
def check_energy_anomalies():
    anomalies_found = random.randint(0, 3)
    if anomalies_found:
        logger.warning(f"Energy anomaly check: {anomalies_found} anomalies detected")
    return {"anomalies_found": anomalies_found}
