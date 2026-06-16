import { useLayerStore } from '../../store/layerStore'

const LAYERS = [
  { key: 'showTraffic', label: 'Traffic', icon: '🚗' },
  { key: 'showBuildings', label: 'Buildings', icon: '🏢' },
  { key: 'showEnergy', label: 'Energy', icon: '⚡' },
  { key: 'showHeatWave', label: 'Heat Wave', icon: '🌡️' },
  { key: 'showAirQuality', label: 'Air Quality', icon: '💨' },
  { key: 'showMLPredictions', label: 'ML Predictions', icon: '🤖' },
  { key: 'showScenarios', label: 'Scenarios', icon: '🎭' },
  { key: 'showFloodRisk', label: 'Flood Risk', icon: '🌊' },
  { key: 'showGrid', label: 'Energy Grid', icon: '🔌' },
] as const

export function LayerTogglePanel() {
  const store = useLayerStore()

  return (
    <div className="space-y-1">
      <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-1 mb-2">Layers</div>
      {LAYERS.map(({ key, label, icon }) => {
        const isOn = store[key]
        return (
          <button
            key={key}
            onClick={() => store.toggleLayer(key)}
            className={`w-full flex items-center gap-2 px-3 py-1.5 rounded text-xs transition-all ${
              isOn ? 'text-blue-300 bg-blue-900/30 border border-blue-500/30' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            <span>{isOn ? '☑' : '☐'}</span>
            <span>{icon} {label}</span>
          </button>
        )
      })}
    </div>
  )
}
