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

export const useSimulationStore = create<SimulationState>((set) => ({
  vehicles: [],
  zoneCongestion: [],
  signals: [],
  kpis: null,
  climate: null,
  isConnected: false,
  lastUpdate: null,
  setVehicles: (vehicles) => set({ vehicles }),
  setZoneCongestion: (zoneCongestion) => set({ zoneCongestion }),
  setKPIs: (kpis) => set({ kpis }),
  setClimate: (climate) => set({ climate }),
  setConnected: (isConnected) => set({ isConnected }),
  setLastUpdate: (lastUpdate) => set({ lastUpdate }),
}))
