import { create } from 'zustand'

export type LSTMode = 'LST' | 'NDVI' | 'NDBI'

interface SatelliteLSTState {
  mode:        LSTMode
  opacity:     number
  greenRoofs:  boolean
  coolAsphalt: boolean
  gibs:        boolean
  fetchTime:   string
  loading:     boolean
  stats:       { min: number; max: number; mean: number } | null

  setMode:        (m: LSTMode) => void
  setOpacity:     (n: number) => void
  setGreenRoofs:  (v: boolean) => void
  setCoolAsphalt: (v: boolean) => void
  setGibs:        (v: boolean) => void
  setFetchTime:   (s: string) => void
  setLoading:     (v: boolean) => void
  setStats:       (s: SatelliteLSTState['stats']) => void
}

export const useSatelliteLSTStore = create<SatelliteLSTState>((set) => ({
  mode: 'LST', opacity: 72, greenRoofs: false, coolAsphalt: false,
  gibs: false, fetchTime: '—', loading: false, stats: null,

  setMode:        (mode)        => set({ mode }),
  setOpacity:     (opacity)     => set({ opacity }),
  setGreenRoofs:  (greenRoofs)  => set({ greenRoofs }),
  setCoolAsphalt: (coolAsphalt) => set({ coolAsphalt }),
  setGibs:        (gibs)        => set({ gibs }),
  setFetchTime:   (fetchTime)   => set({ fetchTime }),
  setLoading:     (loading)     => set({ loading }),
  setStats:       (stats)       => set({ stats }),
}))
