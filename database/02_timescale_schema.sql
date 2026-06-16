-- TimescaleDB Extension
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- ============================================================
-- REAL-TIME TRAFFIC FLOW (per road segment)
-- ============================================================

CREATE TABLE IF NOT EXISTS traffic_flow (
    time TIMESTAMPTZ NOT NULL,
    road_id INTEGER,
    vehicle_count INTEGER DEFAULT 0,
    avg_speed_kmh FLOAT DEFAULT 0,
    occupancy_pct FLOAT DEFAULT 0,
    travel_time_sec FLOAT DEFAULT 0,
    queue_length_m FLOAT DEFAULT 0,
    emission_co2_kg FLOAT DEFAULT 0
);

SELECT create_hypertable('traffic_flow', 'time', if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS traffic_flow_road_time_idx ON traffic_flow(road_id, time DESC);

-- ============================================================
-- ENERGY READINGS (per building, per interval)
-- ============================================================

CREATE TABLE IF NOT EXISTS energy_readings (
    time TIMESTAMPTZ NOT NULL,
    building_id INTEGER,
    kwh_total FLOAT DEFAULT 0,
    kwh_hvac FLOAT DEFAULT 0,
    kwh_lighting FLOAT DEFAULT 0,
    kwh_equipment FLOAT DEFAULT 0,
    kwh_elevators FLOAT DEFAULT 0,
    kwh_solar_generated FLOAT DEFAULT 0,
    peak_demand_kw FLOAT DEFAULT 0,
    power_factor FLOAT DEFAULT 0.95,
    voltage_level FLOAT DEFAULT 230,
    indoor_temp_avg FLOAT DEFAULT 22,
    indoor_humidity_avg FLOAT DEFAULT 50,
    outdoor_temp FLOAT DEFAULT 25,
    co2_kg FLOAT DEFAULT 0,
    cost_usd FLOAT DEFAULT 0,
    tariff_zone VARCHAR(10) DEFAULT 'off_peak'
);

SELECT create_hypertable('energy_readings', 'time', if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS energy_readings_building_time_idx ON energy_readings(building_id, time DESC);

-- ============================================================
-- SENSOR READINGS (IoT sensors in buildings)
-- ============================================================

CREATE TABLE IF NOT EXISTS sensor_readings (
    time TIMESTAMPTZ NOT NULL,
    sensor_id INTEGER,
    building_id INTEGER,
    value FLOAT,
    quality VARCHAR(10) DEFAULT 'good'
);

SELECT create_hypertable('sensor_readings', 'time', if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS sensor_readings_sensor_time_idx ON sensor_readings(sensor_id, time DESC);

-- ============================================================
-- CITY KPI SNAPSHOTS (for scenario detection)
-- ============================================================

CREATE TABLE IF NOT EXISTS city_kpi_snapshots (
    time TIMESTAMPTZ NOT NULL,
    zone_id INTEGER,
    congestion_index FLOAT DEFAULT 0,
    vehicle_count INTEGER DEFAULT 0,
    avg_speed_kmh FLOAT DEFAULT 50,
    total_energy_mw FLOAT DEFAULT 0,
    grid_load_pct FLOAT DEFAULT 0,
    outdoor_temp FLOAT DEFAULT 25,
    rainfall_mm_hr FLOAT DEFAULT 0,
    aqi INTEGER DEFAULT 50,
    co2_kg_hr FLOAT DEFAULT 0
);

SELECT create_hypertable('city_kpi_snapshots', 'time', if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS city_kpi_zone_time_idx ON city_kpi_snapshots(zone_id, time DESC);

-- ============================================================
-- CONTINUOUS AGGREGATES (materialized views for fast queries)
-- ============================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS traffic_hourly
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 hour', time) AS hour,
    road_id,
    AVG(vehicle_count) AS avg_vehicles,
    AVG(avg_speed_kmh) AS avg_speed,
    MAX(queue_length_m) AS max_queue,
    SUM(emission_co2_kg) AS total_co2
FROM traffic_flow
GROUP BY hour, road_id
WITH NO DATA;

CREATE MATERIALIZED VIEW IF NOT EXISTS energy_hourly
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 hour', time) AS hour,
    building_id,
    SUM(kwh_total) AS kwh_sum,
    MAX(peak_demand_kw) AS peak_demand,
    AVG(power_factor) AS avg_power_factor,
    SUM(co2_kg) AS total_co2,
    SUM(cost_usd) AS total_cost
FROM energy_readings
GROUP BY hour, building_id
WITH NO DATA;
