import { useEffect, useState } from 'react'
import { useScenarioStore } from '../../store/scenarioStore'
import { api } from '../../services/api'
import type { Solution, ImpactReport } from '../../types/scenario'

const SEVERITY_BADGE = {
  CRITICAL: 'bg-red-600 text-white',
  HIGH: 'bg-orange-600 text-white',
  MEDIUM: 'bg-yellow-600 text-black',
  LOW: 'bg-blue-600 text-white',
}

const TYPE_ICON = {
  immediate_action: '⚡',
  operator_action: '👷',
  automated: '🤖',
  long_term: '📅',
  communication: '📢',
}

function SolutionCard({ sol, scenarioId, onSimulate, onApply }: { sol: Solution; scenarioId: number; onSimulate: (s: Solution) => void; onApply: (s: Solution) => void }) {
  const rankColor = sol.rank_score >= 80 ? 'text-green-400' : sol.rank_score >= 60 ? 'text-yellow-400' : 'text-blue-400'
  const icon = TYPE_ICON[sol.solution_type] || '🔧'

  return (
    <div className="border border-gray-700 rounded-lg p-3 bg-gray-800/50 hover:border-gray-600 transition-colors">
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span>{icon}</span>
            <span className="text-sm font-semibold text-white truncate">{sol.name}</span>
          </div>
          <div className="text-xs text-gray-400 mt-0.5 line-clamp-2">{sol.description}</div>
        </div>
        <div className={`text-sm font-bold font-mono ml-2 flex-shrink-0 ${rankColor}`}>
          {sol.rank_score?.toFixed(0)}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 text-xs mb-3">
        <span className="text-blue-300">⚡ {sol.implementation_minutes} min</span>
        <span className="text-green-300">💰 ${sol.cost_usd?.toLocaleString()}</span>
        <span className="text-purple-300">🎯 {(sol.confidence * 100).toFixed(0)}%</span>
      </div>

      {Object.entries(sol.impact_details || {}).slice(0, 2).map(([k, v]) => (
        <div key={k} className="text-xs text-gray-400 mb-1">
          · {k.replace(/_/g, ' ')}: <span className="text-white">{typeof v === 'number' ? (k.includes('pct') ? `${v}%` : v.toLocaleString()) : String(v)}</span>
        </div>
      ))}

      <div className="flex gap-2 mt-3">
        <button
          onClick={() => onSimulate(sol)}
          className="flex-1 text-xs bg-gray-700 hover:bg-gray-600 text-white rounded px-2 py-1.5 transition-colors"
        >
          ▶ Simulate
        </button>
        <button
          onClick={() => onApply(sol)}
          className="flex-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded px-2 py-1.5 transition-colors"
        >
          ✅ Apply
        </button>
      </div>
    </div>
  )
}

function ImpactView({ report, onBack }: { report: ImpactReport; onBack: () => void }) {
  const { simulation } = report
  const d = simulation.delta

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="text-gray-400 hover:text-white text-sm">← Back</button>
        <div className="text-sm font-bold text-white">Impact Simulation</div>
      </div>
      <div className="text-xs text-gray-400 font-semibold">{report.solution_name}</div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-3">
          <div className="text-red-400 font-semibold mb-2">BEFORE</div>
          {Object.entries(simulation.before).map(([k, v]) => (
            <div key={k} className="flex justify-between mb-1">
              <span className="text-gray-400">{k.replace(/_/g, ' ')}:</span>
              <span className="text-white font-mono">{typeof v === 'number' ? v.toFixed(1) : v}</span>
            </div>
          ))}
        </div>
        <div className="bg-green-900/20 border border-green-500/30 rounded-lg p-3">
          <div className="text-green-400 font-semibold mb-2">AFTER</div>
          {Object.entries(simulation.after).map(([k, v]) => (
            <div key={k} className="flex justify-between mb-1">
              <span className="text-gray-400">{k.replace(/_/g, ' ')}:</span>
              <span className="text-green-300 font-mono">{typeof v === 'number' ? v.toFixed(1) : v}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-3 text-xs space-y-1">
        {d.congestion_pct !== undefined && <div>Congestion: <span className="text-green-400 font-mono">{d.congestion_pct?.toFixed(1)}%</span></div>}
        {d.energy_savings_mwh !== undefined && <div>Energy saved: <span className="text-green-400 font-mono">{d.energy_savings_mwh} MWh</span></div>}
        {d.co2_reduction_kg !== undefined && <div>CO₂ reduced: <span className="text-green-400 font-mono">{d.co2_reduction_kg?.toLocaleString()} kg</span></div>}
        {d.cost_savings_usd !== undefined && d.cost_savings_usd > 0 && <div>Cost savings: <span className="text-green-400 font-mono">${d.cost_savings_usd?.toLocaleString()}</span></div>}
        <div>Citizens helped: <span className="text-blue-400 font-mono">{d.affected_citizens?.toLocaleString()}</span></div>
        <div>Cost: <span className="text-white font-mono">${report.cost_usd?.toLocaleString()}</span> · Time: <span className="text-white font-mono">{report.implementation_minutes} min</span></div>
        <div>Confidence: <span className="text-purple-400 font-mono">{(simulation.confidence * 100).toFixed(0)}%</span></div>
        {simulation.caveats?.map((c, i) => <div key={i} className="text-yellow-600">⚠ {c}</div>)}
      </div>
    </div>
  )
}

export function ScenarioPanel() {
  const { selectedScenario, isPanelOpen, setIsPanelOpen, solutions, setSolutions, impactReport, setImpactReport, isSimulating, setIsSimulating } = useScenarioStore()
  const [applying, setApplying] = useState<string | null>(null)

  useEffect(() => {
    if (!selectedScenario) return
    api.getScenarioSolutions(selectedScenario.id)
      .then((data) => setSolutions(data as Solution[]))
      .catch(console.error)
  }, [selectedScenario?.id])

  if (!isPanelOpen || !selectedScenario) return null

  const badge = SEVERITY_BADGE[selectedScenario.severity] || SEVERITY_BADGE.LOW

  const handleSimulate = async (sol: Solution) => {
    setIsSimulating(true)
    setImpactReport(null)
    try {
      const result = await api.simulateSolution(selectedScenario.id, sol.solution_code)
      setImpactReport(result as ImpactReport)
    } catch (e) {
      console.error(e)
    } finally {
      setIsSimulating(false)
    }
  }

  const handleApply = async (sol: Solution) => {
    setApplying(sol.solution_code)
    try {
      await api.applySolution(selectedScenario.id, sol.solution_code)
      alert(`✅ Solution "${sol.name}" applied successfully!`)
    } catch (e) {
      console.error(e)
    } finally {
      setApplying(null)
    }
  }

  return (
    <div className="absolute top-0 right-0 h-full w-96 bg-gray-900 border-l border-gray-700 flex flex-col z-40 shadow-2xl">
      <div className="flex items-center justify-between p-4 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <span className="text-lg">🚨</span>
          <div>
            <div className="text-sm font-bold text-white">{selectedScenario.name}</div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={`text-xs px-1.5 py-0.5 rounded font-semibold ${badge}`}>{selectedScenario.severity}</span>
              <span className="text-xs text-gray-400">{selectedScenario.scenario_type}</span>
            </div>
          </div>
        </div>
        <button onClick={() => setIsPanelOpen(false)} className="text-gray-400 hover:text-white text-xl">×</button>
      </div>

      {selectedScenario.description && (
        <div className="px-4 py-3 text-xs text-gray-400 border-b border-gray-800 bg-gray-800/30">
          {selectedScenario.description}
        </div>
      )}

      {Object.keys(selectedScenario.kpi_snapshot || {}).length > 0 && (
        <div className="px-4 py-3 border-b border-gray-800">
          <div className="text-xs font-semibold text-gray-400 mb-2">IMPACT SUMMARY</div>
          <div className="grid grid-cols-2 gap-1 text-xs">
            {Object.entries(selectedScenario.kpi_snapshot).slice(0, 4).map(([k, v]) => (
              <div key={k} className="flex gap-1">
                <span className="text-gray-500">{k.replace(/_/g, ' ')}:</span>
                <span className="text-orange-400 font-mono">{String(v)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4">
        {isSimulating && (
          <div className="text-center py-4 text-sm text-blue-400">
            <div className="animate-spin text-2xl mb-2">⟳</div>
            Running impact simulation...
          </div>
        )}

        {impactReport && !isSimulating ? (
          <ImpactView report={impactReport} onBack={() => setImpactReport(null)} />
        ) : (
          <div className="space-y-3">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              AI Recommended Solutions ({solutions.length})
            </div>
            {solutions.map((sol) => (
              <SolutionCard
                key={sol.solution_code}
                sol={sol}
                scenarioId={selectedScenario.id}
                onSimulate={handleSimulate}
                onApply={handleApply}
              />
            ))}
            {!solutions.length && <div className="text-xs text-gray-500 text-center py-4">Loading solutions...</div>}
          </div>
        )}
      </div>
    </div>
  )
}
