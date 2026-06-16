-- ============================================================
-- SCENARIO ENGINE SCHEMA
-- ============================================================

CREATE TABLE IF NOT EXISTS scenarios (
    id SERIAL PRIMARY KEY,
    scenario_type VARCHAR(50) NOT NULL,
    scenario_code VARCHAR(20),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    severity VARCHAR(10) DEFAULT 'MEDIUM',
    status VARCHAR(20) DEFAULT 'active',
    auto_detected BOOLEAN DEFAULT false,
    affected_zone_ids INTEGER[] DEFAULT '{}',
    affected_building_ids INTEGER[] DEFAULT '{}',
    affected_road_ids INTEGER[] DEFAULT '{}',
    kpi_snapshot JSONB DEFAULT '{}',
    started_at TIMESTAMP DEFAULT NOW(),
    resolved_at TIMESTAMP,
    created_by VARCHAR(50) DEFAULT 'system'
);

CREATE INDEX IF NOT EXISTS scenarios_status_idx ON scenarios(status);
CREATE INDEX IF NOT EXISTS scenarios_type_idx ON scenarios(scenario_type);
CREATE INDEX IF NOT EXISTS scenarios_severity_idx ON scenarios(severity);
CREATE INDEX IF NOT EXISTS scenarios_started_idx ON scenarios(started_at DESC);

CREATE TABLE IF NOT EXISTS scenario_solutions (
    id SERIAL PRIMARY KEY,
    scenario_id INTEGER REFERENCES scenarios(id) ON DELETE CASCADE,
    solution_code VARCHAR(20),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    solution_type VARCHAR(30) DEFAULT 'immediate_action',
    rank_score FLOAT DEFAULT 0,
    impact_score FLOAT DEFAULT 0,
    confidence FLOAT DEFAULT 0.5,
    cost_usd FLOAT DEFAULT 0,
    implementation_minutes INTEGER DEFAULT 5,
    impact_details JSONB DEFAULT '{}',
    simulation_result JSONB,
    status VARCHAR(20) DEFAULT 'pending',
    applied_at TIMESTAMP,
    applied_by VARCHAR(50)
);

CREATE INDEX IF NOT EXISTS scenario_solutions_scenario_idx ON scenario_solutions(scenario_id);
CREATE INDEX IF NOT EXISTS scenario_solutions_status_idx ON scenario_solutions(status);
CREATE INDEX IF NOT EXISTS scenario_solutions_rank_idx ON scenario_solutions(rank_score DESC);

CREATE TABLE IF NOT EXISTS solution_outcomes (
    id SERIAL PRIMARY KEY,
    solution_id INTEGER REFERENCES scenario_solutions(id) ON DELETE CASCADE,
    measured_at TIMESTAMP DEFAULT NOW(),
    predicted_impact JSONB DEFAULT '{}',
    actual_impact JSONB DEFAULT '{}',
    accuracy_score FLOAT
);

-- ============================================================
-- ENERGY GRID SCHEMA
-- ============================================================

CREATE TABLE IF NOT EXISTS grid_nodes (
    id SERIAL PRIMARY KEY,
    node_name VARCHAR(100),
    node_type VARCHAR(20) DEFAULT 'transformer',
    capacity_kva FLOAT DEFAULT 1000,
    current_load_kw FLOAT DEFAULT 0,
    voltage_kv FLOAT DEFAULT 11,
    status VARCHAR(20) DEFAULT 'operational',
    zone_id INTEGER,
    geom GEOMETRY(Point, 4326)
);

CREATE INDEX IF NOT EXISTS grid_nodes_geom_idx ON grid_nodes USING GIST(geom);

CREATE TABLE IF NOT EXISTS grid_lines (
    id SERIAL PRIMARY KEY,
    from_node INTEGER REFERENCES grid_nodes(id),
    to_node INTEGER REFERENCES grid_nodes(id),
    capacity_mw FLOAT DEFAULT 10,
    current_load_mw FLOAT DEFAULT 0,
    voltage_kv FLOAT DEFAULT 11,
    line_loss_pct FLOAT DEFAULT 0.02,
    geom GEOMETRY(LineString, 4326)
);

CREATE TABLE IF NOT EXISTS tariff_schedule (
    id SERIAL PRIMARY KEY,
    tariff_name VARCHAR(50),
    hour_start INTEGER,
    hour_end INTEGER,
    day_type VARCHAR(10) DEFAULT 'weekday',
    rate_per_kwh FLOAT DEFAULT 0.10
);

INSERT INTO tariff_schedule (tariff_name, hour_start, hour_end, day_type, rate_per_kwh) VALUES
('Peak', 17, 22, 'weekday', 0.28),
('Shoulder', 7, 17, 'weekday', 0.16),
('Off-Peak', 22, 7, 'weekday', 0.08),
('Weekend', 0, 24, 'weekend', 0.10)
ON CONFLICT DO NOTHING;

-- Seed grid nodes
INSERT INTO grid_nodes (node_name, node_type, capacity_kva, current_load_kw, voltage_kv, zone_id, geom) VALUES
('Main Substation Downtown', 'substation', 50000, 32000, 66, 1, ST_GeomFromText('POINT(67.008 24.865)', 4326)),
('Transformer Zone 2', 'transformer', 10000, 7500, 11, 2, ST_GeomFromText('POINT(67.075 24.875)', 4326)),
('Transformer Zone 3', 'transformer', 8000, 4000, 11, 3, ST_GeomFromText('POINT(67.025 24.920)', 4326)),
('Port Feeder', 'feeder', 5000, 3200, 11, 5, ST_GeomFromText('POINT(66.980 24.838)', 4326))
ON CONFLICT DO NOTHING;

-- Seed sample scenarios
INSERT INTO scenarios (scenario_type, scenario_code, name, description, severity, status, auto_detected, kpi_snapshot) VALUES
('traffic', 'SCENARIO_001', 'Peak Hour Traffic Gridlock', 'City center congestion causing 45-min delays on main corridors', 'HIGH', 'active', true,
 '{"congestion_index": 0.87, "avg_speed_kmh": 18, "vehicle_count": 4500, "co2_increase_pct": 40}'),
('energy', 'SCENARIO_010', 'City-Wide Energy Demand Spike', 'Summer peak demand threatening grid stability', 'HIGH', 'active', true,
 '{"grid_load_pct": 94, "total_mw": 1240, "blackout_risk": "HIGH"}')
ON CONFLICT DO NOTHING;

-- Seed solutions for scenario 1
INSERT INTO scenario_solutions (scenario_id, solution_code, name, description, solution_type, rank_score, impact_score, confidence, cost_usd, implementation_minutes, impact_details) VALUES
(1, 'SOL_T01', 'Adaptive Signal Optimization', 'Switch all affected intersections to AI-adaptive signal timing', 'immediate_action', 94, 0.87, 0.87, 0, 5,
 '{"congestion_reduction_pct": 25, "travel_time_reduction_pct": 18, "co2_reduction_pct": 12, "affected_vehicles": 4500}'),
(1, 'SOL_T03', 'Demand-Responsive Rerouting', 'Push alternate routes to navigation apps via API + VMS signs', 'immediate_action', 81, 0.78, 0.82, 0, 2,
 '{"traffic_diversion_pct": 30, "congestion_reduction_pct": 22}'),
(1, 'SOL_T04', 'Emergency Public Transit Surge', 'Deploy 15 additional buses on 3 high-demand corridors', 'operator_action', 71, 0.65, 0.71, 4500, 25,
 '{"modal_shift_pct": 15, "car_trips_reduced": 800, "congestion_reduction_pct": 18}')
ON CONFLICT DO NOTHING;

INSERT INTO scenario_solutions (scenario_id, solution_code, name, description, solution_type, rank_score, impact_score, confidence, cost_usd, implementation_minutes, impact_details) VALUES
(2, 'SOL_E01', 'Demand Response — Large Consumers', 'Signal top 50 energy consumers to reduce load by 20% for 2 hours', 'immediate_action', 88, 0.84, 0.84, 0, 5,
 '{"load_reduction_mw": 85, "cost_savings_usd": 42000, "co2_reduction_kg": 31000}'),
(2, 'SOL_E02', 'Solar + Battery Dispatch', 'Discharge all grid-connected batteries and maximize solar export', 'immediate_action', 82, 0.80, 0.91, 0, 2,
 '{"additional_power_mw": 22, "grid_load_reduction_pct": 8}'),
(2, 'SOL_E03', 'Non-Critical Load Shutdown', 'Turn off decorative lighting, fountains, and non-essential city loads', 'automated', 76, 0.65, 0.99, 0, 1,
 '{"load_reduction_mw": 12}')
ON CONFLICT DO NOTHING;
