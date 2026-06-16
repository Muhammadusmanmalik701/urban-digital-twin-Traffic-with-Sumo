import { create } from 'zustand'
import type { Scenario, Solution, ImpactReport } from '../types/scenario'

interface ScenarioState {
  activeScenarios: Scenario[]
  selectedScenario: Scenario | null
  solutions: Solution[]
  impactReport: ImpactReport | null
  isPanelOpen: boolean
  isSimulating: boolean
  setActiveScenarios: (s: Scenario[]) => void
  selectScenario: (s: Scenario | null) => void
  setSolutions: (s: Solution[]) => void
  setImpactReport: (r: ImpactReport | null) => void
  setIsPanelOpen: (v: boolean) => void
  setIsSimulating: (v: boolean) => void
  addScenario: (s: Scenario) => void
}

export const useScenarioStore = create<ScenarioState>((set) => ({
  activeScenarios: [],
  selectedScenario: null,
  solutions: [],
  impactReport: null,
  isPanelOpen: false,
  isSimulating: false,
  setActiveScenarios: (activeScenarios) => set({ activeScenarios }),
  selectScenario: (selectedScenario) => set({ selectedScenario, isPanelOpen: selectedScenario !== null }),
  setSolutions: (solutions) => set({ solutions }),
  setImpactReport: (impactReport) => set({ impactReport }),
  setIsPanelOpen: (isPanelOpen) => set({ isPanelOpen }),
  setIsSimulating: (isSimulating) => set({ isSimulating }),
  addScenario: (s) => set((state) => ({ activeScenarios: [...state.activeScenarios, s] })),
}))
