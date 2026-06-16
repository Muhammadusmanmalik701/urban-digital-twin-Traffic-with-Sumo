-- ============================================================
-- BUILDING INFORMATION MODELING (BIM) SCHEMA
-- ============================================================

CREATE TABLE IF NOT EXISTS buildings (
    id SERIAL PRIMARY KEY,
    osm_id BIGINT UNIQUE,
    ifc_guid VARCHAR(64) UNIQUE,
    name VARCHAR(255),
    address TEXT,
    building_use VARCHAR(50) DEFAULT 'office',
    building_class VARCHAR(30) DEFAULT 'B',
    floors_above INTEGER DEFAULT 5,
    floors_below INTEGER DEFAULT 1,
    height_m FLOAT DEFAULT 20,
    footprint_area_m2 FLOAT DEFAULT 500,
    year_built INTEGER DEFAULT 2000,
    last_renovated INTEGER,
    construction_type VARCHAR(50) DEFAULT 'concrete_frame',
    facade_material VARCHAR(50) DEFAULT 'concrete',
    roof_type VARCHAR(30) DEFAULT 'flat',
    u_value_wall FLOAT DEFAULT 0.35,
    u_value_roof FLOAT DEFAULT 0.25,
    u_value_window FLOAT DEFAULT 1.6,
    window_to_wall_ratio FLOAT DEFAULT 0.35,
    max_occupancy INTEGER DEFAULT 200,
    current_occupancy INTEGER DEFAULT 0,
    has_hvac BOOLEAN DEFAULT true,
    hvac_type VARCHAR(30) DEFAULT 'central_air',
    has_bms BOOLEAN DEFAULT false,
    has_solar_panels BOOLEAN DEFAULT false,
    solar_capacity_kw FLOAT DEFAULT 0,
    has_ev_charging BOOLEAN DEFAULT false,
    structural_health_score FLOAT DEFAULT 80,
    fire_safety_score FLOAT DEFAULT 85,
    maintenance_status VARCHAR(20) DEFAULT 'good',
    zone_id INTEGER,
    footprint GEOMETRY(Polygon, 4326),
    centroid GEOMETRY(Point, 4326),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS buildings_footprint_idx ON buildings USING GIST(footprint);
CREATE INDEX IF NOT EXISTS buildings_centroid_idx ON buildings USING GIST(centroid);
CREATE INDEX IF NOT EXISTS buildings_use_idx ON buildings(building_use);
CREATE INDEX IF NOT EXISTS buildings_zone_idx ON buildings(zone_id);

CREATE TABLE IF NOT EXISTS building_floors (
    id SERIAL PRIMARY KEY,
    building_id INTEGER REFERENCES buildings(id) ON DELETE CASCADE,
    floor_number INTEGER NOT NULL,
    floor_use VARCHAR(50) DEFAULT 'office',
    area_m2 FLOAT DEFAULT 500,
    ceiling_height_m FLOAT DEFAULT 3.0,
    current_occupancy INTEGER DEFAULT 0,
    max_occupancy INTEGER DEFAULT 50,
    has_sensors BOOLEAN DEFAULT false
);

CREATE INDEX IF NOT EXISTS building_floors_building_idx ON building_floors(building_id);

CREATE TABLE IF NOT EXISTS building_systems (
    id SERIAL PRIMARY KEY,
    building_id INTEGER REFERENCES buildings(id) ON DELETE CASCADE,
    system_type VARCHAR(50) NOT NULL,
    manufacturer VARCHAR(100),
    model VARCHAR(100),
    installed_date DATE,
    last_serviced DATE,
    next_service_due DATE,
    health_score FLOAT DEFAULT 100,
    status VARCHAR(20) DEFAULT 'operational',
    energy_consumption_kw FLOAT DEFAULT 0
);

CREATE INDEX IF NOT EXISTS building_systems_building_idx ON building_systems(building_id);
CREATE INDEX IF NOT EXISTS building_systems_type_idx ON building_systems(system_type, status);

CREATE TABLE IF NOT EXISTS maintenance_records (
    id SERIAL PRIMARY KEY,
    building_id INTEGER REFERENCES buildings(id) ON DELETE CASCADE,
    system_id INTEGER REFERENCES building_systems(id),
    maintenance_type VARCHAR(30) DEFAULT 'scheduled',
    description TEXT,
    performed_by VARCHAR(100),
    performed_at TIMESTAMP,
    cost_usd FLOAT DEFAULT 0,
    next_due TIMESTAMP,
    status VARCHAR(20) DEFAULT 'pending'
);

CREATE TABLE IF NOT EXISTS building_sensors (
    id SERIAL PRIMARY KEY,
    building_id INTEGER REFERENCES buildings(id) ON DELETE CASCADE,
    floor_id INTEGER REFERENCES building_floors(id),
    sensor_type VARCHAR(30) NOT NULL,
    sensor_location VARCHAR(100),
    unit VARCHAR(20),
    is_active BOOLEAN DEFAULT true,
    geom GEOMETRY(Point, 4326)
);

-- ============================================================
-- SEED DATA — Sample buildings for Karachi demo
-- ============================================================

INSERT INTO buildings (name, address, building_use, building_class, floors_above, height_m, footprint_area_m2, year_built, construction_type, max_occupancy, has_hvac, has_bms, has_solar_panels, solar_capacity_kw, structural_health_score, fire_safety_score, maintenance_status, zone_id, footprint, centroid) VALUES
('Karachi Trade Center', 'I.I. Chundrigar Road, Karachi', 'office', 'B', 28, 112, 1608, 1998, 'concrete_frame', 1200, true, true, false, 0, 73, 88, 'fair', 1,
  ST_GeomFromText('POLYGON((67.009 24.862, 67.011 24.862, 67.011 24.864, 67.009 24.864, 67.009 24.862))', 4326),
  ST_GeomFromText('POINT(67.010 24.863)', 4326)),
('MCB Tower', 'M.A. Jinnah Road, Karachi', 'office', 'A', 17, 68, 1200, 2005, 'steel_frame', 800, true, true, true, 150, 91, 95, 'good', 1,
  ST_GeomFromText('POLYGON((67.013 24.860, 67.015 24.860, 67.015 24.862, 67.013 24.862, 67.013 24.860))', 4326),
  ST_GeomFromText('POINT(67.014 24.861)', 4326)),
('DHA Shopping Mall', 'DHA Phase 5, Karachi', 'retail', 'A', 4, 20, 8000, 2012, 'concrete_frame', 5000, true, true, true, 400, 88, 92, 'good', 3,
  ST_GeomFromText('POLYGON((67.027 24.815, 67.033 24.815, 67.033 24.820, 67.027 24.820, 67.027 24.815))', 4326),
  ST_GeomFromText('POINT(67.030 24.817)', 4326)),
('LUMS University Block A', 'DHA, Lahore', 'school', 'A', 5, 22, 3000, 2008, 'concrete_frame', 1500, true, false, true, 200, 94, 97, 'excellent', 4,
  ST_GeomFromText('POLYGON((67.040 24.900, 67.045 24.900, 67.045 24.905, 67.040 24.905, 67.040 24.900))', 4326),
  ST_GeomFromText('POINT(67.042 24.902)', 4326)),
('Port Trust Warehouse 1', 'Karachi Port', 'industrial', 'C', 2, 12, 5000, 1975, 'masonry', 50, false, false, false, 0, 45, 60, 'poor', 5,
  ST_GeomFromText('POLYGON((66.975 24.835, 66.982 24.835, 66.982 24.840, 66.975 24.840, 66.975 24.835))', 4326),
  ST_GeomFromText('POINT(66.978 24.837)', 4326)),
('Avari Towers Hotel', 'Fatima Jinnah Road, Karachi', 'mixed', 'A', 21, 84, 2000, 1988, 'concrete_frame', 600, true, true, false, 0, 79, 90, 'good', 1,
  ST_GeomFromText('POLYGON((67.019 24.858, 67.022 24.858, 67.022 24.861, 67.019 24.861, 67.019 24.858))', 4326),
  ST_GeomFromText('POINT(67.020 24.859)', 4326)),
('Karachi General Hospital', 'Dr. Ruth Pfau Road, Karachi', 'hospital', 'A', 8, 36, 6000, 1959, 'concrete_frame', 2000, true, true, true, 100, 69, 85, 'fair', 1,
  ST_GeomFromText('POLYGON((67.005 24.867, 67.010 24.867, 67.010 24.872, 67.005 24.872, 67.005 24.867))', 4326),
  ST_GeomFromText('POINT(67.007 24.869)', 4326)),
('Industrial Factory Alpha', 'SITE Area, Karachi', 'industrial', 'C', 3, 15, 10000, 1980, 'steel_frame', 300, true, false, false, 0, 62, 70, 'fair', 2,
  ST_GeomFromText('POLYGON((67.055 24.870, 67.065 24.870, 67.065 24.878, 67.055 24.878, 67.055 24.870))', 4326),
  ST_GeomFromText('POINT(67.060 24.874)', 4326))
ON CONFLICT DO NOTHING;

-- Seed building systems for first building
INSERT INTO building_systems (building_id, system_type, manufacturer, installed_date, last_serviced, next_service_due, health_score, status, energy_consumption_kw) VALUES
(1, 'HVAC', 'Carrier', '1998-01-01', '2023-06-01', '2024-06-01', 55, 'degraded', 342),
(1, 'Electrical', 'ABB', '1998-01-01', '2024-01-15', '2025-01-15', 88, 'operational', 50),
(1, 'Elevator', 'Otis', '1998-01-01', '2024-03-01', '2025-03-01', 82, 'operational', 30),
(1, 'Fire System', 'Siemens', '2010-01-01', '2024-05-01', '2025-05-01', 95, 'operational', 5)
ON CONFLICT DO NOTHING;
