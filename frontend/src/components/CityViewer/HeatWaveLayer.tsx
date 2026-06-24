import { useEffect, useRef, useState, useCallback } from 'react'
import { useLayerStore } from '../../store/layerStore'

const API = 'http://localhost:8000/api'

// Area polygons (rough convex hulls in lon,lat)
const AREA_POLYGONS: Record<string, [number, number][]> = {
  'Pessac':        [[-0.660,44.790],[-0.590,44.790],[-0.590,44.825],[-0.660,44.825]],
  'Talence':       [[-0.615,44.795],[-0.560,44.795],[-0.560,44.822],[-0.615,44.822]],
  'Mérignac':      [[-0.740,44.815],[-0.650,44.815],[-0.650,44.855],[-0.740,44.855]],
  'Bordeaux City': [[-0.615,44.820],[-0.540,44.820],[-0.540,44.860],[-0.615,44.860]],
  'Gradignan':     [[-0.650,44.755],[-0.580,44.755],[-0.580,44.790],[-0.650,44.790]],
}

interface AreaData {
  name: string; lat: number; lon: number; type: string
  temp_c: number; feels_like_c: number; humidity_pct: number
  uhi_delta_c: number; risk: string; color: string
  baseline: { tree_cover_pct: number; water_ha: number; green_roof_pct: number; cool_roof_pct: number }
  interventions: { action: string; impact_c: number; cost: string; timeline: string }[]
  max_achievable_reduction_c: number; potential_temp_c: number; source: string
}

interface InterventionResult {
  area: string; current_temp_c: number; predicted_temp_c: number
  reduction_c: number; risk_before: string; risk_after: string; model: string
}

const RISK_COLORS: Record<string, string> = {
  Normal: '#3b82f6', Caution: '#f59e0b', Danger: '#f97316', Extreme: '#ef4444', Emergency: '#7c3aed'
}

const RISK_BG: Record<string, string> = {
  Normal: 'bg-blue-950/60 border-blue-500/40',
  Caution: 'bg-amber-950/60 border-amber-500/40',
  Danger: 'bg-orange-950/60 border-orange-500/40',
  Extreme: 'bg-red-950/70 border-red-500/50',
  Emergency: 'bg-purple-950/70 border-purple-500/60',
}

export function HeatWaveLayer({ viewer }: { viewer: any }) {
  const { showHeatWave } = useLayerStore()
  const entitiesRef = useRef<any[]>([])
  const labelsRef   = useRef<any[]>([])
  const intervalRef = useRef<any>(null)

  const [areas, setAreas]           = useState<AreaData[]>([])
  const [selected, setSelected]     = useState<AreaData | null>(null)
  const [simMode, setSimMode]       = useState(false)
  const [simSliders, setSimSliders] = useState({ tree_cover_pct: 0, water_ha: 0, green_roof_pct: 0, cool_roof_pct: 0 })
  const [simResult, setSimResult]   = useState<InterventionResult | null>(null)
  const [loading, setLoading]       = useState(false)
  const [lastUpdate, setLastUpdate] = useState<string>('')

  const fetchAreas = useCallback(async () => {
    try {
      const r = await fetch(`${API}/climate/heatwave`)
      if (!r.ok) return
      const d = await r.json()
      setAreas(d.areas ?? [])
      setLastUpdate(new Date().toLocaleTimeString('fr-FR'))
    } catch { /* backend offline */ }
  }, [])

  // Draw polygons + labels on CesiumJS
  useEffect(() => {
    if (!viewer) return
    const Cesium = (window as any).Cesium

    // Cleanup
    entitiesRef.current.forEach(e => viewer.entities.remove(e))
    labelsRef.current.forEach(e => viewer.entities.remove(e))
    entitiesRef.current = []
    labelsRef.current   = []

    if (!showHeatWave || areas.length === 0) return

    areas.forEach(area => {
      const poly = AREA_POLYGONS[area.name]
      if (!poly) return

      const positions = poly.map(([lon, lat]) => Cesium.Cartesian3.fromDegrees(lon, lat, 0))
      const color = Cesium.Color.fromCssColorString(area.color).withAlpha(0.45)
      const borderColor = Cesium.Color.fromCssColorString(area.color).withAlpha(0.85)

      // Filled polygon
      const polyEntity = viewer.entities.add({
        polygon: {
          hierarchy: new Cesium.PolygonHierarchy(positions),
          material: color,
          outline: true,
          outlineColor: borderColor,
          outlineWidth: 2,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        },
      })
      entitiesRef.current.push(polyEntity)

      // Temperature label above center
      const labelEntity = viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(area.lon, area.lat, 120),
        label: {
          text: `${area.name}\n${area.temp_c}°C  |  ${area.risk}`,
          font: 'bold 13px sans-serif',
          fillColor: Cesium.Color.WHITE,
          outlineColor: Cesium.Color.fromCssColorString(area.color),
          outlineWidth: 3,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
          pixelOffset: new Cesium.Cartesian2(0, -10),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          scaleByDistance: new Cesium.NearFarScalar(800, 1.2, 8000, 0.6),
        },
      })
      labelsRef.current.push(labelEntity)
    })
  }, [viewer, showHeatWave, areas])

  // Fetch on mount + interval
  useEffect(() => {
    if (!showHeatWave) {
      clearInterval(intervalRef.current)
      return
    }
    fetchAreas()
    intervalRef.current = setInterval(fetchAreas, 300_000) // every 5 min
    return () => clearInterval(intervalRef.current)
  }, [showHeatWave, fetchAreas])

  // Cleanup on layer off
  useEffect(() => {
    if (!showHeatWave && viewer) {
      entitiesRef.current.forEach(e => viewer.entities.remove(e))
      labelsRef.current.forEach(e => viewer.entities.remove(e))
      entitiesRef.current = []
      labelsRef.current   = []
    }
  }, [showHeatWave, viewer])

  const runSimulation = async () => {
    if (!selected) return
    setLoading(true)
    try {
      const bl = selected.baseline
      const params = new URLSearchParams({
        area: selected.name,
        tree_cover_pct:  String(bl.tree_cover_pct  + simSliders.tree_cover_pct),
        water_ha:        String(bl.water_ha        + simSliders.water_ha),
        green_roof_pct:  String(bl.green_roof_pct  + simSliders.green_roof_pct),
        cool_roof_pct:   String(bl.cool_roof_pct   + simSliders.cool_roof_pct),
      })
      const r = await fetch(`${API}/climate/intervention?${params}`)
      const d = await r.json()
      setSimResult(d)
    } catch { /* offline */ }
    setLoading(false)
  }

  if (!showHeatWave) return null

  return (
    <>
      {/* ── Area cards row (bottom of screen) ── */}
      {areas.length > 0 && !selected && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 flex gap-2">
          {areas.map(a => (
            <button
              key={a.name}
              onClick={() => { setSelected(a); setSimMode(false); setSimResult(null); setSimSliders({ tree_cover_pct: 0, water_ha: 0, green_roof_pct: 0, cool_roof_pct: 0 }) }}
              className="flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl border backdrop-blur-lg transition-all hover:scale-105"
              style={{ backgroundColor: `${a.color}18`, borderColor: `${a.color}60` }}
            >
              <span className="text-[10px] text-gray-300 font-semibold">{a.name}</span>
              <span className="text-lg font-black" style={{ color: a.color }}>{a.temp_c}°C</span>
              <span className="text-[9px]" style={{ color: RISK_COLORS[a.risk] }}>{a.risk}</span>
            </button>
          ))}
          {lastUpdate && (
            <div className="self-end text-[9px] text-gray-600 ml-1">🌡 {lastUpdate}</div>
          )}
        </div>
      )}

      {/* ── Detail panel ── */}
      {selected && (
        <div className="absolute top-1/2 -translate-y-1/2 right-4 z-20 w-80 bg-gray-950/97 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className={`px-4 py-3 border-b flex items-center justify-between ${RISK_BG[selected.risk]}`}>
            <div>
              <div className="text-white font-bold text-sm">{selected.name}</div>
              <div className="text-[10px] text-gray-400 capitalize">{selected.type.replace(/_/g,' ')}</div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-black" style={{ color: selected.color }}>{selected.temp_c}°C</div>
              <div className="text-[10px]" style={{ color: RISK_COLORS[selected.risk] }}>{selected.risk}</div>
            </div>
            <button onClick={() => setSelected(null)} className="text-gray-500 hover:text-white ml-2">✕</button>
          </div>

          <div className="px-4 py-3 space-y-3">
            {/* Stats row */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Feels Like', value: `${selected.feels_like_c}°C`, icon: '🌡' },
                { label: 'Humidity',   value: `${selected.humidity_pct}%`,  icon: '💧' },
                { label: 'UHI Delta',  value: `+${selected.uhi_delta_c}°C`, icon: '🏙' },
              ].map(s => (
                <div key={s.label} className="bg-white/5 rounded-xl px-2 py-2 text-center">
                  <div className="text-[10px] text-gray-500">{s.icon} {s.label}</div>
                  <div className="text-xs font-bold text-white">{s.value}</div>
                </div>
              ))}
            </div>

            {/* Potential reduction */}
            <div className="bg-green-950/50 border border-green-500/30 rounded-xl px-3 py-2">
              <div className="text-[10px] text-green-400 font-bold">🌱 Max achievable cooling</div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-white font-bold text-sm">↓ {selected.max_achievable_reduction_c}°C possible</span>
                <span className="text-green-300 font-bold">{selected.potential_temp_c}°C potential</span>
              </div>
            </div>

            {/* Mode toggle */}
            <div className="flex gap-1 p-0.5 bg-white/5 rounded-xl">
              {[{id: 'ai', label: '🤖 AI Suggestions'}, {id: 'sim', label: '🧪 What-If Sim'}].map(m => (
                <button key={m.id} onClick={() => setSimMode(m.id === 'sim')}
                  className={`flex-1 text-[10px] py-1.5 rounded-lg font-bold transition-all ${simMode === (m.id === 'sim') ? 'bg-blue-500/30 border border-blue-400/50 text-blue-200' : 'text-gray-500 hover:text-gray-300'}`}>
                  {m.label}
                </button>
              ))}
            </div>

            {/* AI Suggestions */}
            {!simMode && (
              <div className="space-y-2">
                <div className="text-[10px] text-gray-500 uppercase tracking-wide">Evidence-based interventions</div>
                {selected.interventions.map((iv, i) => (
                  <div key={i} className="bg-white/4 border border-white/8 rounded-xl px-3 py-2">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[10px] text-gray-200 leading-snug flex-1">{iv.action}</p>
                      <span className="text-green-400 font-bold text-xs shrink-0">-{iv.impact_c}°C</span>
                    </div>
                    <div className="flex gap-2 mt-1.5">
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full border ${iv.cost === 'Low' ? 'border-green-500/40 text-green-400' : iv.cost === 'Medium' ? 'border-amber-500/40 text-amber-400' : iv.cost === 'None (policy)' ? 'border-blue-500/40 text-blue-300' : 'border-red-500/40 text-red-400'}`}>
                        💰 {iv.cost}
                      </span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full border border-white/10 text-gray-500">
                        ⏱ {iv.timeline}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* What-If Simulator */}
            {simMode && (
              <div className="space-y-2">
                <div className="text-[10px] text-gray-500 uppercase tracking-wide">Add to current baseline</div>
                {([
                  { key: 'tree_cover_pct', label: '🌳 Tree Cover', unit: '%', max: 60, step: 1 },
                  { key: 'water_ha',       label: '💧 Water Bodies', unit: 'ha', max: 20, step: 0.5 },
                  { key: 'green_roof_pct', label: '🌿 Green Roofs', unit: '%', max: 80, step: 1 },
                  { key: 'cool_roof_pct',  label: '🏚 Cool Roofs', unit: '%', max: 80, step: 1 },
                ] as const).map(s => (
                  <div key={s.key}>
                    <div className="flex justify-between mb-0.5">
                      <span className="text-[10px] text-gray-400">{s.label}</span>
                      <span className="text-[10px] text-white font-mono">+{simSliders[s.key]}{s.unit}</span>
                    </div>
                    <input type="range" min={0} max={s.max} step={s.step} value={simSliders[s.key]}
                      onChange={e => setSimSliders(p => ({ ...p, [s.key]: Number(e.target.value) }))}
                      className="w-full h-1 rounded-full appearance-none cursor-pointer"
                      style={{ background: `linear-gradient(to right,#22c55e ${(simSliders[s.key]/s.max)*100}%,#1e293b ${(simSliders[s.key]/s.max)*100}%)` }}
                    />
                  </div>
                ))}

                <button onClick={runSimulation} disabled={loading}
                  className="w-full py-2 rounded-xl bg-blue-600/30 border border-blue-400/40 text-blue-200 text-xs font-bold hover:bg-blue-600/50 transition-all disabled:opacity-50">
                  {loading ? '⏳ Computing...' : '🔬 Run Prediction'}
                </button>

                {simResult && (
                  <div className={`rounded-xl border px-3 py-2.5 ${RISK_BG[simResult.risk_after]}`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-[10px] text-gray-400">ML Prediction</div>
                        <div className="text-lg font-black text-white">{simResult.predicted_temp_c}°C</div>
                        <div className="text-[10px]" style={{ color: RISK_COLORS[simResult.risk_after] }}>{simResult.risk_after}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-green-400 font-black text-xl">↓ {simResult.reduction_c}°C</div>
                        <div className="text-[9px] text-gray-500">vs {simResult.current_temp_c}°C current</div>
                        <div className="text-[9px] text-gray-600 mt-1">{simResult.model}</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Source */}
            <div className="text-[9px] text-gray-700 text-center">{selected.source}</div>
          </div>
        </div>
      )}
    </>
  )
}
