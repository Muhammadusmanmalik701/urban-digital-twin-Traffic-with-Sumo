import { create } from 'zustand'

export type LayerKey =
  'showTraffic' | 'showBuildings' | 'showEnergy' | 'showHeatWave' |
  'showAirQuality' | 'showMLPredictions' | 'showScenarios' | 'showFloodRisk' | 'showGrid' | 'showRain' |
  'showSatelliteLST' | 'showStreetHeat'

export type SimSliders = {
  tree_cover_pct: number; water_ha: number; green_roof_pct: number; cool_roof_pct: number
}

export interface SavedScenario {
  name: string; area: string; sliders: SimSliders; predictedTemp: number; savedAt: string
}

const ALL_KEYS: LayerKey[] = [
  'showTraffic','showBuildings','showEnergy','showHeatWave',
  'showAirQuality','showMLPredictions','showScenarios','showFloodRisk','showGrid','showRain',
  'showSatelliteLST','showStreetHeat',
]

const PRESETS: Record<string, Partial<Record<LayerKey, boolean>>> = {
  summer_crisis: { showHeatWave: true, showAirQuality: true, showTraffic: true },
  storm_watch:   { showRain: true, showFloodRisk: true, showTraffic: true },
  energy_audit:  { showBuildings: true, showEnergy: true, showGrid: true },
  full_picture:  Object.fromEntries(ALL_KEYS.map(k => [k, true])) as Record<LayerKey, boolean>,
  clear_all:     {},
}

interface LayerState {
  showTraffic: boolean; showBuildings: boolean; showEnergy: boolean; showHeatWave: boolean
  showAirQuality: boolean; showMLPredictions: boolean; showScenarios: boolean
  showFloodRisk: boolean; showGrid: boolean; showRain: boolean; showSatelliteLST: boolean; showStreetHeat: boolean
  opacities: Record<LayerKey, number>
  focusArea: string | null
  globalTimeHour: number
  savedScenarios: SavedScenario[]
  toggleLayer:       (layer: LayerKey) => void
  setLayer:          (layer: LayerKey, value: boolean) => void
  setOpacity:        (layer: LayerKey, value: number) => void
  setFocusArea:      (area: string | null) => void
  setGlobalTimeHour: (hour: number) => void
  applyPreset:       (preset: keyof typeof PRESETS) => void
  saveScenario:      (s: SavedScenario) => void
  deleteScenario:    (i: number) => void
}

const defaultOpacities = Object.fromEntries(ALL_KEYS.map(k => [k, 100])) as Record<LayerKey, number>

export const useLayerStore = create<LayerState>((set) => ({
  showTraffic: false, showBuildings: false, showEnergy: false, showHeatWave: false,
  showAirQuality: false, showMLPredictions: false, showScenarios: false,
  showFloodRisk: false, showGrid: false, showRain: false, showSatelliteLST: false, showStreetHeat: false,
  opacities: defaultOpacities,
  focusArea: null,
  globalTimeHour: new Date().getHours(),
  savedScenarios: [],
  toggleLayer:       (layer) => set((s) => ({ [layer]: !s[layer] })),
  setLayer:          (layer, value) => set({ [layer]: value }),
  setOpacity:        (layer, value) => set((s) => ({ opacities: { ...s.opacities, [layer]: value } })),
  setFocusArea:      (area) => set({ focusArea: area }),
  setGlobalTimeHour: (hour) => set({ globalTimeHour: hour }),
  applyPreset: (preset) => {
    const off = Object.fromEntries(ALL_KEYS.map(k => [k, false]))
    set({ ...off, ...(PRESETS[preset] ?? {}) })
  },
  saveScenario:   (s) => set((state) => ({ savedScenarios: [...state.savedScenarios, s] })),
  deleteScenario: (i) => set((s) => ({ savedScenarios: s.savedScenarios.filter((_, idx) => idx !== i) })),
}))
