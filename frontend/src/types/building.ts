export interface BuildingSystem {
  id: number
  system_type: string
  manufacturer?: string
  health_score: number
  status: 'operational' | 'degraded' | 'failed' | 'maintenance'
  energy_consumption_kw: number
  last_serviced?: string
  next_service_due?: string
}

export interface HealthReport {
  score: number
  rating: string
  breakdown: Record<string, number>
  alerts: string[]
}

export interface EnergyToday {
  kwh_total: number
  peak_demand_kw: number
  peak_hour: number
  cost_usd: number
  co2_tons: number
  vs_yesterday_pct: number
}

export interface BuildingProfile {
  id: number
  name: string
  address?: string
  building_use: string
  building_class: string
  floors_above: number
  height_m: number
  footprint_area_m2: number
  year_built: number
  max_occupancy: number
  current_occupancy: number
  occupancy_pct: number
  has_hvac: boolean
  hvac_type?: string
  has_bms: boolean
  has_solar_panels: boolean
  solar_capacity_kw: number
  structural_health_score: number
  fire_safety_score: number
  maintenance_status: string
  health: HealthReport
  systems: BuildingSystem[]
  energy_today?: EnergyToday
  ai_alerts: string[]
  longitude?: number
  latitude?: number
}
