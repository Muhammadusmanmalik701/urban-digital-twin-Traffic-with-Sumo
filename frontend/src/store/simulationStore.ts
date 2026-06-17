import { create } from 'zustand'
import type { Vehicle, ZoneCongestion, CityKPIs, TrafficSignal, ClimateSnapshot } from '../types/simulation'

interface SimulationState {
  vehicles: Vehicle[]
  zoneCongestion: ZoneCongestion[]
  signals: TrafficSignal[]
  kpis: CityKPIs | null
  climate: ClimateSnapshot | null
  isConnected: boolean
  lastUpdate: string | null
  setVehicles: (v: Vehicle[]) => void
  setZoneCongestion: (z: ZoneCongestion[]) => void
  setKPIs: (k: CityKPIs) => void
  setClimate: (c: ClimateSnapshot) => void
  setConnected: (v: boolean) => void
  setLastUpdate: (t: string) => void
}

const DEMO_KPIS: CityKPIs = {
  vehicle_count: 1247,
  energy_mwh: 823,
  outdoor_temp_c: 28.4,
  aqi: 87,
  grid_load_pct: 71,
  active_incidents: 2,
  co2_kg_hr: 4820,
  active_scenarios: 2,
}

export const useSimulationStore = create<SimulationState>((set) => ({
  vehicles: [],
  zoneCongestion: [],
  signals: [],
  kpis: DEMO_KPIS,
  climate: null,
  isConnected: false,
  lastUpdate: new Date().toISOString(),
  setVehicles: (vehicles) => set({ vehicles }),
  setZoneCongestion: (zoneCongestion) => set({ zoneCongestion }),
  setKPIs: (kpis) => set({ kpis }),
  setClimate: (climate) => set({ climate }),
  setConnected: (isConnected) => set({ isConnected }),
  setLastUpdate: (lastUpdate) => set({ lastUpdate }),
}))
