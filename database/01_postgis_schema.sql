-- PostGIS Extension
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;

-- ============================================================
-- ROADS & TRAFFIC
-- ============================================================

CREATE TABLE IF NOT EXISTS roads (
    id SERIAL PRIMARY KEY,
    osm_id BIGINT UNIQUE,
    road_name VARCHAR(255),
    road_class VARCHAR(30),
    lanes INTEGER DEFAULT 2,
    speed_limit_kmh FLOAT DEFAULT 50,
    surface_type VARCHAR(30) DEFAULT 'asphalt',
    last_maintained DATE,
    condition_score FLOAT DEFAULT 8.0,
    flood_prone BOOLEAN DEFAULT false,
    geom GEOMETRY(LineString, 4326),
    length_m FLOAT
);

CREATE INDEX IF NOT EXISTS roads_geom_idx ON roads USING GIST(geom);
CREATE INDEX IF NOT EXISTS roads_class_idx ON roads(road_class);

CREATE TABLE IF NOT EXISTS intersections (
    id SERIAL PRIMARY KEY,
    osm_id BIGINT,
    signal_type VARCHAR(20) DEFAULT 'traffic_light',
    num_approaches INTEGER DEFAULT 4,
    current_phase INTEGER DEFAULT 0,
    cycle_time_sec FLOAT DEFAULT 90,
    last_optimized TIMESTAMP,
    geom GEOMETRY(Point, 4326)
);

CREATE INDEX IF NOT EXISTS intersections_geom_idx ON intersections USING GIST(geom);

CREATE TABLE IF NOT EXISTS road_incidents (
    id SERIAL PRIMARY KEY,
    incident_type VARCHAR(30) NOT NULL,
    severity VARCHAR(10) DEFAULT 'MEDIUM',
    road_id INTEGER REFERENCES roads(id),
    geom GEOMETRY(Point, 4326),
    started_at TIMESTAMP DEFAULT NOW(),
    resolved_at TIMESTAMP,
    affected_lanes INTEGER DEFAULT 1,
    description TEXT,
    auto_detected BOOLEAN DEFAULT false,
    scenario_id INTEGER
);

CREATE INDEX IF NOT EXISTS road_incidents_geom_idx ON road_incidents USING GIST(geom);
CREATE INDEX IF NOT EXISTS road_incidents_type_idx ON road_incidents(incident_type, severity);

-- ============================================================
-- CITY ZONES (for scenario targeting)
-- ============================================================

CREATE TABLE IF NOT EXISTS city_zones (
    id SERIAL PRIMARY KEY,
    zone_name VARCHAR(100),
    zone_type VARCHAR(30),
    geom GEOMETRY(Polygon, 4326)
);

CREATE INDEX IF NOT EXISTS city_zones_geom_idx ON city_zones USING GIST(geom);

-- ============================================================
-- SEED DATA — Sample city (Karachi-inspired mock data)
-- ============================================================

INSERT INTO city_zones (zone_name, zone_type, geom) VALUES
('Zone 1 - Downtown', 'commercial', ST_GeomFromText('POLYGON((67.00 24.85, 67.05 24.85, 67.05 24.90, 67.00 24.90, 67.00 24.85))', 4326)),
('Zone 2 - Industrial', 'industrial', ST_GeomFromText('POLYGON((67.05 24.85, 67.10 24.85, 67.10 24.90, 67.05 24.90, 67.05 24.85))', 4326)),
('Zone 3 - Residential North', 'residential', ST_GeomFromText('POLYGON((67.00 24.90, 67.05 24.90, 67.05 24.95, 67.00 24.95, 67.00 24.90))', 4326)),
('Zone 4 - University District', 'mixed', ST_GeomFromText('POLYGON((67.05 24.90, 67.10 24.90, 67.10 24.95, 67.05 24.95, 67.05 24.90))', 4326)),
('Zone 5 - Port Area', 'industrial', ST_GeomFromText('POLYGON((66.95 24.80, 67.00 24.80, 67.00 24.85, 66.95 24.85, 66.95 24.80))', 4326))
ON CONFLICT DO NOTHING;
