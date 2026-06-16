export interface Scenario {
  id: number
  scenario_type: string
  scenario_code: string
  name: string
  description?: string
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  status: 'active' | 'resolved' | 'monitoring' | 'manual'
  auto_detected: boolean
  affected_zone_ids: number[]
  kpi_snapshot: Record<string, unknown>
  started_at: string
  resolved_at?: string
  created_by: string
}

export interface Solution {
  id?: number
  scenario_id?: number
  solution_code: string
  name: string
  description?: string
  solution_type: 'immediate_action' | 'operator_action' | 'automated' | 'long_term' | 'communication'
  rank_score: number
  impact_score: number
  confidence: number
  cost_usd: number
  implementation_minutes: number
  impact_details: Record<string, unknown>
  simulation_result?: SimulationResult | null
  status: string
}

export interface SimulationResult {
  before: Record<string, number>
  after: Record<string, number>
  delta: {
    congestion_pct?: number
    energy_savings_mwh?: number
    co2_reduction_kg?: number
    cost_savings_usd?: number
    implementation_minutes?: number
    affected_citizens?: number
  }
  confidence: number
  caveats: string[]
}

export interface ImpactReport {
  solution_code: string
  solution_name: string
  scenario_id: number
  simulation: SimulationResult
  implementation_minutes: number
  cost_usd: number
  affected_citizens: number
}
