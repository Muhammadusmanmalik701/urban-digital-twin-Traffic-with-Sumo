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
  toggleLayer: (layer: keyof Omit<LayerState, 'toggleLayer'>) => void
  setLayer: (layer: keyof Omit<LayerState, 'toggleLayer'>, value: boolean) => void
}

export const useLayerStore = create<LayerState>((set) => ({
  showTraffic: true,
  showBuildings: true,
  showEnergy: true,
  showHeatWave: false,
  showAirQuality: false,
  showMLPredictions: true,
  showScenarios: true,
  showFloodRisk: false,
  showGrid: false,
  toggleLayer: (layer) => set((state) => ({ [layer]: !state[layer] })),
  setLayer: (layer, value) => set({ [layer]: value }),
}))
