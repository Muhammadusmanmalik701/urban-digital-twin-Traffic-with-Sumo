import { useScenarioStore } from '../../store/scenarioStore'

const SEVERITY_COLORS = {
  CRITICAL: 'text-red-400 border-red-500/40 bg-red-900/20',
  HIGH: 'text-orange-400 border-orange-500/40 bg-orange-900/20',
  MEDIUM: 'text-yellow-400 border-yellow-500/40 bg-yellow-900/20',
  LOW: 'text-blue-400 border-blue-500/40 bg-blue-900/20',
}

const SEVERITY_DOTS = {
  CRITICAL: 'bg-red-500 animate-pulse',
  HIGH: 'bg-orange-500 animate-pulse',
  MEDIUM: 'bg-yellow-500',
  LOW: 'bg-blue-500',
}

export function AlertsFeed() {
  const { activeScenarios, selectScenario } = useScenarioStore()

  if (!activeScenarios.length) {
    return (
      <div className="text-xs text-gray-500 px-1 py-2">No active alerts</div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-1">
        Active Alerts ({activeScenarios.length})
      </div>
      {activeScenarios.map((scenario) => {
        const colors = SEVERITY_COLORS[scenario.severity] || SEVERITY_COLORS.LOW
        const dot = SEVERITY_DOTS[scenario.severity] || SEVERITY_DOTS.LOW
        return (
          <button
            key={scenario.id}
            onClick={() => selectScenario(scenario)}
            className={`w-full text-left px-3 py-2 rounded-lg border transition-all hover:opacity-90 ${colors}`}
          >
            <div className="flex items-start gap-2">
              <div className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${dot}`} />
              <div className="min-w-0">
                <div className="text-xs font-semibold truncate">{scenario.name}</div>
                <div className="text-xs opacity-70 mt-0.5">{scenario.severity} · {scenario.scenario_type}</div>
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}
