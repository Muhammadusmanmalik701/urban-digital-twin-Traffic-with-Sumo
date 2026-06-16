from fastapi import APIRouter, BackgroundTasks
from datetime import datetime, timezone

router = APIRouter(tags=["train"])

_training_jobs = {}


def _mock_train(model_name: str):
    import time, random
    time.sleep(2)
    _training_jobs[model_name] = {
        "status": "completed",
        "accuracy": round(random.uniform(0.82, 0.94), 3),
        "samples": random.randint(5000, 50000),
        "completed_at": datetime.now(timezone.utc).isoformat(),
    }


@router.post("/{model_name}")
async def trigger_training(model_name: str, background_tasks: BackgroundTasks):
    valid = ["traffic_forecaster", "energy_predictor", "anomaly_detector", "occupancy_predictor", "scenario_impact_model"]
    if model_name not in valid:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail=f"Unknown model. Valid: {valid}")

    _training_jobs[model_name] = {"status": "training", "started_at": datetime.now(timezone.utc).isoformat()}
    background_tasks.add_task(_mock_train, model_name)
    return {"message": f"Training started for {model_name}", "job": _training_jobs[model_name]}


@router.get("/{model_name}/status")
async def training_status(model_name: str):
    return _training_jobs.get(model_name, {"status": "not_started"})
