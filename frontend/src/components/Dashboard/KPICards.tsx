import { useSimulationStore } from '../../store/simulationStore'

const KPI_CONFIG = [
  { key: 'vehicle_count', label: 'Vehicles', unit: '', icon: '🚗', threshold: 1000, format: (v: number) => v.toLocaleString() },
  { key: 'energy_mwh', label: 'Energy', unit: ' MWh', icon: '⚡', threshold: 850, format: (v: number) => v.toFixed(0) },
  { key: 'outdoor_temp_c', label: 'Temp', unit: '°C', icon: '🌡️', threshold: 42, format: (v: number) => v.toFixed(1) },
  { key: 'aqi', label: 'AQI', unit: '', icon: '💨', threshold: 200, format: (v: number) => v.toFixed(0) },
]

export function KPICards() {
  const { kpis } = useSimulationStore()
  if (!kpis) return null

  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-1">Live KPIs</div>
      {KPI_CONFIG.map(({ key, label, unit, icon, threshold, format }) => {
        const value = kpis[key as keyof typeof kpis] as number
        const isAlert = value !== undefined && value > threshold
        return (
          <div key={key} className={`flex items-center justify-between px-3 py-2 rounded-lg border ${isAlert ? 'border-red-500/40 bg-red-900/20' : 'border-gray-700 bg-gray-800/50'}`}>
            <span className="text-sm text-gray-400">{icon} {label}</span>
            <span className={`text-sm font-mono font-semibold ${isAlert ? 'text-red-400' : 'text-green-400'}`}>
              {value !== undefined ? format(value) : '—'}{unit}
            </span>
          </div>
        )
      })}
    </div>
  )
}
