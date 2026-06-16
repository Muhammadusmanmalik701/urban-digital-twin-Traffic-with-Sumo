-- ============================================================
-- ML FEATURES SCHEMA (TimescaleDB)
-- ============================================================

-- Feature store for ML models
CREATE TABLE IF NOT EXISTS ml_traffic_features (
    time TIMESTAMPTZ NOT NULL,
    zone_id INTEGER,
    hour_sin FLOAT,
    hour_cos FLOAT,
    day_of_week INTEGER,
    vehicle_count INTEGER,
    avg_speed_kmh FLOAT,
    outdoor_temp FLOAT,
    rainfall_mm FLOAT,
    lag_1h_congestion FLOAT,
    lag_3h_congestion FLOAT,
    lag_6h_congestion FLOAT,
    congestion_index FLOAT
);

SELECT create_hypertable('ml_traffic_features', 'time', if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS ml_traffic_zone_time_idx ON ml_traffic_features(zone_id, time DESC);

CREATE TABLE IF NOT EXISTS ml_energy_features (
    time TIMESTAMPTZ NOT NULL,
    building_id INTEGER,
    building_type VARCHAR(50),
    floor_area_m2 FLOAT,
    outdoor_temp FLOAT,
    hour_sin FLOAT,
    hour_cos FLOAT,
    day_of_week INTEGER,
    occupancy_pct FLOAT,
    lag_1h_kwh FLOAT,
    lag_24h_kwh FLOAT,
    kwh_actual FLOAT,
    peak_demand_kw FLOAT
);

SELECT create_hypertable('ml_energy_features', 'time', if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS ml_energy_building_time_idx ON ml_energy_features(building_id, time DESC);

-- Model metadata
CREATE TABLE IF NOT EXISTS ml_model_registry (
    id SERIAL PRIMARY KEY,
    model_name VARCHAR(100) UNIQUE NOT NULL,
    model_version VARCHAR(20) DEFAULT '1.0.0',
    algorithm VARCHAR(50),
    status VARCHAR(20) DEFAULT 'training',
    accuracy_metric FLOAT,
    training_samples INTEGER,
    trained_at TIMESTAMP,
    model_path VARCHAR(255),
    mlflow_run_id VARCHAR(100),
    metadata JSONB DEFAULT '{}'
);

INSERT INTO ml_model_registry (model_name, algorithm, status) VALUES
('traffic_forecaster', 'RandomForest+LSTM', 'pending'),
('energy_predictor', 'XGBoost', 'pending'),
('anomaly_detector', 'IsolationForest', 'pending'),
('occupancy_predictor', 'GradientBoosting', 'pending'),
('scenario_impact_model', 'GradientBoosting', 'pending')
ON CONFLICT DO NOTHING;

-- Anomaly log
CREATE TABLE IF NOT EXISTS anomaly_log (
    id SERIAL PRIMARY KEY,
    detected_at TIMESTAMPTZ DEFAULT NOW(),
    anomaly_type VARCHAR(50),
    entity_type VARCHAR(20),
    entity_id INTEGER,
    anomaly_score FLOAT,
    description TEXT,
    is_confirmed BOOLEAN DEFAULT false,
    scenario_id INTEGER
);

CREATE INDEX IF NOT EXISTS anomaly_log_detected_idx ON anomaly_log(detected_at DESC);
CREATE INDEX IF NOT EXISTS anomaly_log_type_idx ON anomaly_log(anomaly_type);
