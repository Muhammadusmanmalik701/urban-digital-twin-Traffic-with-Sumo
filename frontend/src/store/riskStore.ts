import { create } from 'zustand'

export type RiskLevel = 'Normal' | 'Caution' | 'Danger' | 'Extreme' | 'Emergency' | 'Unknown'

export interface RiskEntry { level: RiskLevel; detail: string; score: number }

export const RISK_SCORE: Record<RiskLevel, number> = {
  Unknown: 0, Normal: 10, Caution: 35, Danger: 60, Extreme: 82, Emergency: 100,
}

const UNKNOWN: RiskEntry = { level: 'Unknown', detail: '—', score: 0 }

interface CityRiskState {
  heat:    RiskEntry
  flood:   RiskEntry
  air:     RiskEntry
  traffic: RiskEntry
  setHeat:    (level: RiskLevel, detail: string) => void
  setFlood:   (level: RiskLevel, detail: string) => void
  setAir:     (level: RiskLevel, detail: string) => void
  setTraffic: (level: RiskLevel, detail: string) => void
}

export const useRiskStore = create<CityRiskState>((set) => ({
  heat:    UNKNOWN,
  flood:   UNKNOWN,
  air:     UNKNOWN,
  traffic: UNKNOWN,
  setHeat:    (l, d) => set({ heat:    { level: l, detail: d, score: RISK_SCORE[l] } }),
  setFlood:   (l, d) => set({ flood:   { level: l, detail: d, score: RISK_SCORE[l] } }),
  setAir:     (l, d) => set({ air:     { level: l, detail: d, score: RISK_SCORE[l] } }),
  setTraffic: (l, d) => set({ traffic: { level: l, detail: d, score: RISK_SCORE[l] } }),
}))
