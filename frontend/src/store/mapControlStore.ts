import { create } from 'zustand'

export type RoadFilterType = 'major' | 'primary' | 'secondary' | 'local' | 'tram' | 'rail'

interface MapControlState {
  selectedAreas: string[]
  flyTarget: { area: string; seq: number } | null
  loadTrigger: number
  roadFilter: Record<RoadFilterType, boolean>
  roadCount: number
  loadingRoads: boolean
  loadProgress: string

  toggleArea: (area: string) => void
  flyToArea: (area: string) => void
  triggerLoad: () => void
  setRoadFilter: (f: Record<RoadFilterType, boolean>) => void
  setRoadCount: (n: number) => void
  setLoadingRoads: (v: boolean) => void
  setLoadProgress: (s: string) => void
}

export const useMapControlStore = create<MapControlState>((set) => ({
  selectedAreas: ['Bordeaux City'],
  flyTarget: null,
  loadTrigger: 0,
  roadFilter: { major: true, primary: true, secondary: true, local: false, tram: true, rail: true },
  roadCount: 0,
  loadingRoads: false,
  loadProgress: '',

  toggleArea: (area) =>
    set((s) => ({
      selectedAreas: s.selectedAreas.includes(area)
        ? s.selectedAreas.filter((a) => a !== area)
        : [...s.selectedAreas, area],
    })),

  flyToArea: (area) =>
    set((s) => ({ flyTarget: { area, seq: (s.flyTarget?.seq ?? 0) + 1 } })),

  triggerLoad: () => set((s) => ({ loadTrigger: s.loadTrigger + 1 })),

  setRoadFilter: (roadFilter) => set({ roadFilter }),
  setRoadCount: (roadCount) => set({ roadCount }),
  setLoadingRoads: (loadingRoads) => set({ loadingRoads }),
  setLoadProgress: (loadProgress) => set({ loadProgress }),
}))
