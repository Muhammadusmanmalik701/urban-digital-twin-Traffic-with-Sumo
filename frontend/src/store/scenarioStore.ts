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

const DEMO_SCENARIOS: Scenario[] = [
  {
    id: 1, scenario_type: 'TRAFFIC', scenario_code: 'T01',
    name: 'Traffic Gridlock — Pont de Pierre',
    description: 'Severe congestion on main bridge. 2.3× normal volume.',
    severity: 'HIGH', status: 'active', auto_detected: true,
    affected_zone_ids: [1, 2], kpi_snapshot: {}, created_by: 'system',
    started_at: new Date().toISOString(),
  },
  {
    id: 2, scenario_type: 'ENERGY', scenario_code: 'E01',
    name: 'Energy Demand Spike — Industrial Zone',
    description: 'Grid load at 94%. Risk of cascading failure.',
    severity: 'CRITICAL', status: 'active', auto_detected: true,
    affected_zone_ids: [3], kpi_snapshot: {}, created_by: 'system',
    started_at: new Date().toISOString(),
  },
  {
    id: 3, scenario_type: 'CLIMATE', scenario_code: 'C01',
    name: 'Heat Wave Alert — Urban Core',
    description: 'Temp forecast 41°C. Cooling centers at capacity.',
    severity: 'MEDIUM', status: 'monitoring', auto_detected: true,
    affected_zone_ids: [1], kpi_snapshot: {}, created_by: 'system',
    started_at: new Date().toISOString(),
  },
]

export const useScenarioStore = create<ScenarioState>((set) => ({
  activeScenarios: DEMO_SCENARIOS,
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
