from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://user:password@localhost:5432/digital_twin"
    TIMESCALE_URL: str = "postgresql+asyncpg://user:password@localhost:5433/timeseries"
    REDIS_URL: str = "redis://localhost:6379"
    ML_SERVICE_URL: str = "http://localhost:8001"
    CORS_ORIGINS: List[str] = ["http://localhost:3000"]
    SUMO_PORT: int = 8813
    SCENARIO_DETECT_SEC: int = 30
    GRIDLOCK_THRESHOLD: float = 0.85
    ENERGY_SPIKE_THRESHOLD: float = 0.90
    HEAT_EMERGENCY_C: float = 45.0
    FLOOD_RAINFALL_MM: float = 50.0
    AQI_EMERGENCY: int = 300
    ML_ANOMALY_THRESHOLD: float = 0.80

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
