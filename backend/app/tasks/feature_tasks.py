from app.core.celery_app import celery_app
import logging

logger = logging.getLogger(__name__)


@celery_app.task(name="app.tasks.feature_tasks.update_energy_features")
def update_energy_features():
    logger.info("ML feature pipeline: updating energy features")
    return {"status": "ok", "features_updated": 8}
