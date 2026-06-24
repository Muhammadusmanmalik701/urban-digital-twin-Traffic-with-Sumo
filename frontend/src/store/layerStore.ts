import { create } from 'zustand'

interface LayerState {
  showTraffic: boolean
  showBuildings: boolean
  showEnergy: boolean
  showHeatWave: boolean
  showAirQuality: boolean
  showMLPredictions: boolean
  showScenarios: boolean
  showFloodRisk: boolean
  showGrid: boolean
  showRain: boolean
  toggleLayer: (layer: keyof Omit<LayerState, 'toggleLayer'>) => void
  setLayer: (layer: keyof Omit<LayerState, 'toggleLayer'>, value: boolean) => void
}

export const useLayerStore = create<LayerState>((set) => ({
  showTraffic: false,
  showBuildings: false,
  showEnergy: false,
  showHeatWave: false,
  showAirQuality: false,
  showMLPredictions: false,
  showScenarios: false,
  showFloodRisk: false,
  showGrid: false,
  showRain: false,
  toggleLayer: (layer) => set((state) => ({ [layer]: !state[layer] })),
  setLayer: (layer, value) => set({ [layer]: value }),
}))
