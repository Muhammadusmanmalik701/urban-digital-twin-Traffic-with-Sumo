import { useState } from 'react'
import { useLayerStore, LayerKey } from '../../store/layerStore'
import { useRiskStore, RiskLevel, RISK_SCORE } from '../../store/riskStore'

// ── Constants ──────────────────────────────────────────────────────────────────

const LAYERS: { key: LayerKey; label: string; icon: string; supportsTime?: boolean; badge?: string }[] = [
  { key: 'showStreetHeat',   label: 'Street Heat',   icon: '🌡️', badge: 'LIVE' },
  { key: 'showHeatWave',     label: 'Heat Wave',     icon: '🔥', supportsTime: true },
  { key: 'showTraffic',      label: 'Traffic',       icon: '🚗' },
  { key: 'showRain',         label: 'Rain',          icon: '🌧', supportsTime: true },
  { key: 'showFloodRisk',    label: 'Flood Risk',    icon: '🌊', supportsTime: true },
  { key: 'showAirQuality',   label: 'Air Quality',   icon: '💨' },
  { key: 'showBuildings',    label: 'Buildings',     icon: '🏢' },
  { key: 'showEnergy',       label: 'Energy',        icon: '⚡' },
  { key: 'showGrid',         label: 'Energy Grid',   icon: '🔌' },
  { key: 'showMLPredictions',label: 'ML Predictions',icon: '🤖' },
  { key: 'showScenarios',    label: 'Scenarios',     icon: '🎭' },
  { key: 'showSatelliteLST', label: 'Satellite LST', icon: '🛰️' },
]

const PRESETS = [
  { id: 'summer_crisis', icon: '☀️', label: 'Heat Crisis', desc: 'Heat + Air + Traffic' },
  { id: 'storm_watch',   icon: '⛈️', label: 'Storm Watch', desc: 'Rain + Flood + Traffic' },
  { id: 'energy_audit',  icon: '⚡', label: 'Energy Audit', desc: 'Buildings + Grid' },
  { id: 'clear_all',     icon: '✕',  label: 'Clear All',   desc: 'Turn off everything' },
]

const RISK_COLOR: Record<RiskLevel, string> = {
  Unknown: '#6b7280', Normal: '#3b82f6', Caution: '#f59e0b',
  Danger: '#f97316', Extreme: '#ef4444', Emergency: '#7c3aed',
}

function diurnalOffset(targetHour: number): number {
  const now = 5 * Math.cos((new Date().getHours() - 14) * Math.PI / 12)
  const tgt = 5 * Math.cos((targetHour           - 14) * Math.PI / 12)
  return +(tgt - now).toFixed(1)
}

// ── Sub-components ────────────────────────────────────────────────────────────

function CityRiskGauge() {
  const { showHeatWave, showFloodRisk, showAirQuality, showTraffic } = useLayerStore()
  const { heat, flood, air, traffic } = useRiskStore()

  const domains = [
    { label: 'Heat',    risk: heat,    active: showHeatWave,   icon: '🌡️' },
    { label: 'Flood',   risk: flood,   active: showFloodRisk,  icon: '🌊' },
    { label: 'Air',     risk: air,     active: showAirQuality, icon: '💨' },
    { label: 'Traffic', risk: traffic, active: showTraffic,    icon: '🚗' },
  ]

  const active = domains.filter(d => d.active)
  if (!active.length) return null

  const known = active.filter(d => d.risk.level !== 'Unknown')
  const avgScore = known.length ? known.reduce((s, d) => s + d.risk.score, 0) / known.length : 0
  const maxEntry = known.reduce<(typeof domains)[0] | null>((mx, d) =>
    !mx || d.risk.score > mx.risk.score ? d : mx, null)
  const gaugeColor = maxEntry ? RISK_COLOR[maxEntry.risk.level] : RISK_COLOR.Unknown

  const alertLevel = maxEntry?.risk.level ?? 'Unknown'
  const isAlert = ['Extreme','Emergency'].includes(alertLevel)

  return (
    <div className={`mb-3 rounded-xl border p-3 ${isAlert ? 'bg-red-950/30 border-red-500/30' : 'bg-gray-900/60 border-white/8'}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">
          {isAlert ? '🚨 City Alert' : '🏙️ City Risk'}
        </span>
        <span className="text-[10px] font-black" style={{ color: gaugeColor }}>
          {alertLevel === 'Unknown' ? 'No data' : alertLevel}
        </span>
      </div>

      {/* Score bar */}
      <div className="w-full h-1.5 bg-gray-800 rounded-full mb-2.5 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{
            width: `${avgScore}%`,
            background: `linear-gradient(to right, #22d3ee, ${gaugeColor})`,
            boxShadow: `0 0 10px ${gaugeColor}60`,
          }}
        />
      </div>

      {/* Per-domain pills */}
      <div className="flex gap-1 flex-wrap">
        {active.map(d => (
          <div key={d.label}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded-md border"
            style={{ borderColor: `${RISK_COLOR[d.risk.level]}40`, backgroundColor: `${RISK_COLOR[d.risk.level]}10` }}
          >
            <span className="text-[8px]">{d.icon}</span>
            <span className="text-[8px] font-bold" style={{ color: RISK_COLOR[d.risk.level] }}>
              {d.risk.level === 'Unknown' ? '—' : d.risk.level}
            </span>
            {d.risk.detail !== '—' && (
              <span className="text-[7px] text-gray-600">{d.risk.detail}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function ScenarioCompare() {
  const { savedScenarios } = useLayerStore()
  const [idxA, setIdxA] = useState(0)
  const [idxB, setIdxB] = useState(Math.min(1, savedScenarios.length - 1))
  const [open, setOpen] = useState(false)

  const sa = savedScenarios[idxA], sb = savedScenarios[idxB]

  return (
    <div className="rounded-xl border border-white/10 overflow-hidden mt-1.5">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-3 py-2 bg-gray-900/50 text-[10px] text-gray-400 hover:text-white transition-all"
      >
        <span>📊 Compare Scenarios</span>
        <span className="text-gray-600">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="px-3 py-2.5 bg-gray-950/60 space-y-2.5">
          {/* Selector row */}
          <div className="grid grid-cols-2 gap-1.5">
            {(['A','B'] as const).map((side, si) => (
              <div key={side}>
                <div className="text-[8px] text-gray-600 mb-0.5 font-bold">{side}</div>
                <select
                  value={si === 0 ? idxA : idxB}
                  onChange={e => si === 0 ? setIdxA(+e.target.value) : setIdxB(+e.target.value)}
                  className="w-full bg-gray-800 border border-white/10 text-white text-[9px] px-1.5 py-1 rounded-lg appearance-none focus:outline-none"
                >
                  {savedScenarios.map((sc, i) => <option key={i} value={i}>{sc.name}</option>)}
                </select>
              </div>
            ))}
          </div>

          {/* Comparison table */}
          {sa && sb && (
            <div className="space-y-1">
              {[
                { label: 'Area',      a: sa.area,                           b: sb.area },
                { label: '🌳 Trees',  a: `+${sa.sliders.tree_cover_pct}%`,  b: `+${sb.sliders.tree_cover_pct}%` },
                { label: '💧 Water',  a: `+${sa.sliders.water_ha} ha`,      b: `+${sb.sliders.water_ha} ha` },
                { label: '🌿 Green',  a: `+${sa.sliders.green_roof_pct}%`,  b: `+${sb.sliders.green_roof_pct}%` },
                { label: '🏚 Cool',   a: `+${sa.sliders.cool_roof_pct}%`,   b: `+${sb.sliders.cool_roof_pct}%` },
              ].map(row => (
                <div key={row.label} className="grid grid-cols-3 gap-1 items-center">
                  <span className="text-[8px] text-gray-600">{row.label}</span>
                  <span className="text-[9px] text-gray-300 text-center">{row.a}</span>
                  <span className="text-[9px] text-gray-300 text-center">{row.b}</span>
                </div>
              ))}
              <div className="border-t border-white/10 pt-1.5 mt-1">
                <div className="grid grid-cols-3 gap-1 items-center">
                  <span className="text-[8px] text-gray-500">Result</span>
                  <span className={`text-[10px] font-black text-center ${sa.predictedTemp <= sb.predictedTemp ? 'text-green-400' : 'text-gray-400'}`}>
                    {sa.predictedTemp}°C
                  </span>
                  <span className={`text-[10px] font-black text-center ${sb.predictedTemp < sa.predictedTemp ? 'text-green-400' : 'text-gray-400'}`}>
                    {sb.predictedTemp}°C
                  </span>
                </div>
                {sa.predictedTemp !== sb.predictedTemp && (
                  <div className="mt-1.5 bg-green-900/20 rounded-lg px-2 py-1 text-center">
                    <span className="text-[9px] text-green-400 font-bold">
                      {sa.predictedTemp <= sb.predictedTemp ? sa.name : sb.name}
                      {' '}↓{Math.abs(sa.predictedTemp - sb.predictedTemp).toFixed(1)}°C cooler
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function LayerTogglePanel() {
  const store = useLayerStore()
  const [expandedOpacity, setExpandedOpacity] = useState<LayerKey | null>(null)

  const anyTimeLayer = LAYERS.some(l => l.supportsTime && store[l.key])
  const offset = diurnalOffset(store.globalTimeHour)

  return (
    <div className="space-y-3 select-none">

      {/* ── City Risk Alert ── */}
      <CityRiskGauge />

      {/* ── Quick Presets ── */}
      <div>
        <div className="text-[9px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Quick Presets</div>
        <div className="grid grid-cols-2 gap-1">
          {PRESETS.map(p => (
            <button
              key={p.id}
              onClick={() => store.applyPreset(p.id as any)}
              title={p.desc}
              className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg border border-white/10 bg-white/4 hover:bg-white/8 active:scale-95 transition-all text-left"
            >
              <span className="text-xs">{p.icon}</span>
              <span className="text-[10px] text-gray-300 font-medium">{p.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Global Timeline ── */}
      {anyTimeLayer && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <div className="text-[9px] font-semibold text-gray-500 uppercase tracking-wider">Global Timeline</div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold text-white">{String(store.globalTimeHour).padStart(2,'0')}:00</span>
              <span className={`text-[9px] font-semibold px-1 py-0.5 rounded ${
                offset > 0 ? 'text-red-400 bg-red-900/20' :
                offset < 0 ? 'text-cyan-400 bg-cyan-900/20' : 'text-gray-500'
              }`}>
                {offset > 0 ? '+' : ''}{offset}°C
              </span>
            </div>
          </div>
          <input
            type="range" min={0} max={23} step={1} value={store.globalTimeHour}
            onChange={e => store.setGlobalTimeHour(+e.target.value)}
            className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
            style={{ background: `linear-gradient(to right,#f97316 ${(store.globalTimeHour/23)*100}%,#1e293b ${(store.globalTimeHour/23)*100}%)` }}
          />
          <div className="flex justify-between text-[7px] text-gray-700 mt-0.5 px-0.5">
            <span>00</span><span>06</span><span>12</span><span>18</span><span>23</span>
          </div>
        </div>
      )}

      {/* ── Layer List ── */}
      <div>
        <div className="text-[9px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Layers</div>
        <div className="space-y-0.5">
          {LAYERS.map(({ key, label, icon, badge }) => {
            const isOn   = store[key]
            const opacity = store.opacities[key]
            const isExpanded = expandedOpacity === key

            return (
              <div key={key}>
                <div className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs transition-all ${
                  isOn
                    ? key === 'showStreetHeat'
                      ? 'text-orange-300 bg-orange-900/20 border border-orange-500/25'
                      : 'text-blue-300 bg-blue-900/25 border border-blue-500/25'
                    : 'text-gray-500 hover:text-gray-300 hover:bg-white/4'
                }`}>
                  <button onClick={() => store.toggleLayer(key)} className="flex items-center gap-2 flex-1 text-left">
                    <span className="text-[11px]">{isOn ? '☑' : '☐'}</span>
                    <span>{icon} {label}</span>
                    {badge && isOn && (
                      <span className="text-[7px] font-bold px-1 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 animate-pulse">
                        {badge}
                      </span>
                    )}
                  </button>
                  {isOn && (
                    <button
                      onClick={() => setExpandedOpacity(isExpanded ? null : key)}
                      className="text-[9px] font-mono transition-colors hover:text-white ml-auto shrink-0"
                      title="Adjust opacity"
                    >
                      {opacity < 100
                        ? <span className="text-amber-400 font-bold">{opacity}%</span>
                        : <span className="text-gray-700 hover:text-gray-400">⋯</span>}
                    </button>
                  )}
                </div>

                {/* Opacity slider (expands below) */}
                {isOn && isExpanded && (
                  <div className="px-3 py-2 bg-gray-900/60 rounded-b-lg border-x border-b border-blue-500/15 -mt-0.5 mb-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] text-gray-500 shrink-0">Opacity</span>
                      <input
                        type="range" min={10} max={100} step={5} value={opacity}
                        onChange={e => store.setOpacity(key, +e.target.value)}
                        className="flex-1 h-1 rounded-full appearance-none cursor-pointer"
                        style={{ background: `linear-gradient(to right,#60a5fa ${((opacity-10)/90)*100}%,#1e293b ${((opacity-10)/90)*100}%)` }}
                      />
                      <span className="text-[9px] text-blue-400 w-7 text-right shrink-0">{opacity}%</span>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Saved Scenarios ── */}
      {store.showScenarios && (
        <div>
          <div className="text-[9px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Saved Scenarios</div>
          {store.savedScenarios.length === 0 ? (
            <div className="text-center text-[10px] text-gray-600 py-3 border border-dashed border-white/10 rounded-xl leading-relaxed">
              No scenarios saved yet.<br />
              <span className="text-gray-700">Use 🧪 What-If Sim in Heat Wave</span>
            </div>
          ) : (
            <div className="space-y-1.5">
              {store.savedScenarios.map((sc, i) => (
                <div key={i} className="bg-gray-900/60 border border-white/8 rounded-xl px-3 py-2">
                  <div className="flex items-start justify-between mb-1">
                    <div>
                      <div className="text-[10px] font-bold text-white">{sc.name}</div>
                      <div className="text-[8px] text-gray-600">{sc.area} · {sc.savedAt}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-green-400 text-sm font-black">{sc.predictedTemp}°C</span>
                      <button
                        onClick={() => store.deleteScenario(i)}
                        className="text-gray-700 hover:text-red-400 transition-colors text-xs"
                      >✕</button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                    {[
                      ['🌳', `+${sc.sliders.tree_cover_pct}% trees`],
                      ['💧', `+${sc.sliders.water_ha} ha water`],
                      ['🌿', `+${sc.sliders.green_roof_pct}% green`],
                      ['🏚', `+${sc.sliders.cool_roof_pct}% cool`],
                    ].map(([ic, v]) => (
                      <div key={v} className="text-[8px] text-gray-600">{ic} {v}</div>
                    ))}
                  </div>
                </div>
              ))}

              {store.savedScenarios.length >= 2 && <ScenarioCompare />}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
