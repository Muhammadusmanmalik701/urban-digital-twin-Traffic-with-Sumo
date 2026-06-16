export interface Vehicle {
  id: string
  vehicle_type: string
  longitude: number
  latitude: number
  speed_kmh: number
  heading: number
  co2_g_km?: number
}

export interface TrafficSignal {
  intersection_id: number
  phase: number
  green_time_sec: number
  longitude: number
  latitude: number
  status: string
}

export interface ZoneCongestion {
  zone_id: number
  zone_name?: string
  congestion_index: number
  status: string
}

export interface CityKPIs {
  vehicle_count: number
  energy_mwh: number
  grid_load_pct: number
  outdoor_temp_c: number
  aqi: number
  co2_kg_hr: number
  active_incidents?: number
  active_scenarios?: number
}

export interface CityUpdate {
  type: string
  timestamp: string
  traffic: {
    vehicle_count: number
    vehicles: Vehicle[]
    signals: TrafficSignal[]
    zone_congestion: ZoneCongestion[]
  }
  energy: {
    grid_load_pct: number
    total_mw: number
    buildings: BuildingEnergyReading[]
  }
  climate: ClimateSnapshot
  kpis: CityKPIs
}

export interface BuildingEnergyReading {
  building_id: number
  longitude: number
  latitude: number
  kwh_total: number
  peak_demand_kw: number
  co2_kg: number
  cost_usd: number
  tariff_zone: string
}

export interface ClimateSnapshot {
  timestamp: string
  outdoor_temp_c: number
  feels_like_c: number
  humidity_pct: number
  aqi: number
  aqi_category: string
  pm25: number
  rainfall_mm_hr: number
}
