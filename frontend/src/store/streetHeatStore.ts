import { create } from 'zustand'
import type { ThermalGridPoint } from '../utils/thermalUtils'

export interface HistoricalDay { date: string; mean: number; max: number; min: number }
export interface ForecastDay   { date: string; max: number; min: number; code: number }

interface StreetHeatState {
  status:    'idle' | 'loading' | 'live' | 'offline'
  updatedAt: string
  progress:  string
  stats:     { min: number; max: number; mean: number; count: number } | null
  liveGrid:  ThermalGridPoint[]   // 20-point Open-Meteo grid — used for per-location IDW
  historical: HistoricalDay[]
  forecast:   ForecastDay[]
  anomaly:    number | null

  setStatus:     (s: StreetHeatState['status']) => void
  setUpdatedAt:  (s: string) => void
  setProgress:   (s: string) => void
  setStats:      (s: StreetHeatState['stats']) => void
  setLiveGrid:   (g: ThermalGridPoint[]) => void
  setHistorical: (h: HistoricalDay[]) => void
  setForecast:   (f: ForecastDay[]) => void
  setAnomaly:    (a: number | null) => void
}

export const useStreetHeatStore = create<StreetHeatState>((set) => ({
  status: 'idle', updatedAt: '—', progress: '', stats: null,
  liveGrid: [], historical: [], forecast: [], anomaly: null,

  setStatus:     (status)     => set({ status }),
  setUpdatedAt:  (updatedAt)  => set({ updatedAt }),
  setProgress:   (progress)   => set({ progress }),
  setStats:      (stats)      => set({ stats }),
  setLiveGrid:   (liveGrid)   => set({ liveGrid }),
  setHistorical: (historical) => set({ historical }),
  setForecast:   (forecast)   => set({ forecast }),
  setAnomaly:    (anomaly)    => set({ anomaly }),
}))
