import { useEffect, useRef, useState, useCallback } from 'react'
import { useLayerStore } from '../../store/layerStore'

const API = 'http://localhost:8000/api'

const AREA_POLYGONS: Record<string, [number, number][]> = {
  'Pessac':        [[-0.660,44.790],[-0.590,44.790],[-0.590,44.825],[-0.660,44.825]],
  'Talence':       [[-0.615,44.795],[-0.560,44.795],[-0.560,44.822],[-0.615,44.822]],
  'Mérignac':      [[-0.740,44.815],[-0.650,44.815],[-0.650,44.855],[-0.740,44.855]],
  'Bordeaux City': [[-0.615,44.820],[-0.540,44.820],[-0.540,44.860],[-0.615,44.860]],
  'Gradignan':     [[-0.650,44.755],[-0.580,44.755],[-0.580,44.790],[-0.650,44.790]],
}

const HEAT_SPOTS: Record<string, { lon: number; lat: number; delta: number; radius: number }[]> = {
  'Bordeaux City': [
    { lon: -0.574, lat: 44.836, delta: +3.2, radius: 280 },
    { lon: -0.567, lat: 44.841, delta: +2.5, radius: 200 },
    { lon: -0.593, lat: 44.830, delta: +2.0, radius: 220 },
    { lon: -0.582, lat: 44.844, delta: -2.2, radius: 350 },
    { lon: -0.554, lat: 44.852, delta: -3.5, radius: 400 },
  ],
  'Mérignac': [
    { lon: -0.710, lat: 44.829, delta: +4.0, radius: 500 },
    { lon: -0.685, lat: 44.835, delta: +3.0, radius: 350 },
    { lon: -0.658, lat: 44.848, delta: -2.2, radius: 400 },
  ],
  'Pessac': [
    { lon: -0.610, lat: 44.808, delta: +2.2, radius: 300 },
    { lon: -0.625, lat: 44.800, delta: +1.8, radius: 250 },
    { lon: -0.603, lat: 44.815, delta: -1.8, radius: 350 },
  ],
  'Talence': [
    { lon: -0.593, lat: 44.812, delta: -3.0, radius: 400 },
    { lon: -0.580, lat: 44.806, delta: +2.0, radius: 220 },
    { lon: -0.600, lat: 44.818, delta: -1.5, radius: 300 },
  ],
  'Gradignan': [
    { lon: -0.618, lat: 44.767, delta: -4.0, radius: 600 },
    { lon: -0.606, lat: 44.778, delta: +1.8, radius: 200 },
    { lon: -0.628, lat: 44.773, delta: -2.5, radius: 350 },
  ],
}

// ── Animated heat wave GLSL shader (GLSL ES 3.0 / CesiumJS 1.117) ──────────
// Creates multi-octave animated color gradient over the scene.
// Color: cyan (cool) → green → yellow → orange → red → purple (extreme)
const HEAT_WAVE_SHADER = `
  uniform sampler2D colorTexture;
  uniform float heatTime;
  uniform float heatIntensity;

  vec3 heatGradient(float t) {
    t = clamp(t, 0.0, 1.0);
    if (t < 0.167) return mix(vec3(0.13,0.83,0.94), vec3(0.29,0.87,0.50), t * 6.0);
    if (t < 0.333) return mix(vec3(0.29,0.87,0.50), vec3(0.98,0.94,0.14), (t-0.167) * 6.0);
    if (t < 0.500) return mix(vec3(0.98,0.94,0.14), vec3(0.98,0.55,0.09), (t-0.333) * 6.0);
    if (t < 0.667) return mix(vec3(0.98,0.55,0.09), vec3(0.94,0.13,0.13), (t-0.500) * 6.0);
    if (t < 0.833) return mix(vec3(0.94,0.13,0.13), vec3(0.73,0.05,0.10), (t-0.667) * 6.0);
    return           mix(vec3(0.73,0.05,0.10), vec3(0.49,0.23,0.93), (t-0.833) * 6.0);
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / czm_viewport.zw;
    float t  = heatTime;
    float px = uv.x;
    float py = uv.y;

    // Multi-octave slow-moving heat pattern (large scale = geographic zones)
    float n1 = sin(px * 4.5  + t * 0.22) * cos(py * 3.8  + t * 0.18);
    float n2 = cos(px * 7.3  - t * 0.16) * sin(py * 6.1  + t * 0.20);
    float n3 = sin((px * 0.8 + py * 1.2) * 5.8 + t * 0.13);
    float n4 = cos(px * 3.2  + py * 4.7  + t * 0.25) * 0.45;
    // Fine vertical shimmer columns (heat rising from streets)
    float cols = sin(px * 55.0 + t * 0.4) * 0.08;

    float pattern = (n1*0.32 + n2*0.28 + n3*0.24 + n4*0.10 + cols*0.06) * 0.5 + 0.5;

    // Slow breathing pulse
    float pulse = sin(t * 0.7) * 0.05 + cos(t * 1.1) * 0.04;
    float heat  = clamp(pattern * 0.88 + pulse + 0.12, 0.0, 1.0);

    // Heat haze shimmer distortion (vertical ripple like hot air)
    float shimX = sin(py * 42.0 + t * 2.6) * cos(py * 19.0 + t * 1.3) * 0.0025 * heatIntensity;
    float shimY = cos(px * 34.0 + t * 2.1) * sin(px * 23.0 + t * 1.7) * 0.0018 * heatIntensity;
    vec4 dist   = texture(colorTexture, uv + vec2(shimX, shimY));

    // Color + alpha
    vec3 heatCol = heatGradient(heat * heatIntensity);
    float alpha  = (0.26 + heat * 0.26) * heatIntensity;

    // Darken original slightly for contrast, then add heat glow
    vec3 darkened = dist.rgb * (1.0 - alpha * 0.35);
    vec3 result   = mix(darkened, heatCol, alpha);

    out_FragColor = vec4(result, dist.a);
  }
`

interface AreaData {
  name: string; lat: number; lon: number; type: string
  temp_c: number; feels_like_c: number; humidity_pct: number
  uhi_delta_c: number; risk: string; color: string
  baseline: { tree_cover_pct: number; water_ha: number; green_roof_pct: number; cool_roof_pct: number }
  interventions: { action: string; impact_c: number; cost: string; timeline: string }[]
  max_achievable_reduction_c: number; potential_temp_c: number; source: string
}

interface SimResult {
  predicted_temp_c: number; reduction_c: number; risk_after: string; model: string
}

const FALLBACK_AREAS: AreaData[] = [
  {
    name: 'Bordeaux City', lat: 44.838, lon: -0.579, type: 'dense_urban',
    temp_c: 44.0, feels_like_c: 51.2, humidity_pct: 35, uhi_delta_c: 4.0,
    risk: 'Extreme', color: '#ef4444',
    baseline: { tree_cover_pct: 15, water_ha: 3.5, green_roof_pct: 2, cool_roof_pct: 6 },
    interventions: [
      { action: 'Double canopy on Cours de la Marne & Victor Hugo', impact_c: 0.9, cost: 'Medium', timeline: '5 yrs' },
      { action: 'Garonne riverfront park expansion (+3 ha)', impact_c: 1.1, cost: 'Medium', timeline: '2 yrs' },
      { action: 'Mandatory white roofs on new construction', impact_c: 0.7, cost: 'None (policy)', timeline: 'Immediate' },
      { action: 'Underground cisterns at 8 carparks → fountains', impact_c: 1.3, cost: 'High', timeline: '2-3 yrs' },
    ],
    max_achievable_reduction_c: 4.0, potential_temp_c: 40.0, source: 'Fallback (start backend for live data)',
  },
  {
    name: 'Mérignac', lat: 44.833, lon: -0.685, type: 'industrial_airport',
    temp_c: 43.0, feels_like_c: 49.8, humidity_pct: 35, uhi_delta_c: 3.0,
    risk: 'Extreme', color: '#ef4444',
    baseline: { tree_cover_pct: 12, water_ha: 0.5, green_roof_pct: 1, cool_roof_pct: 8 },
    interventions: [
      { action: 'Industrial roof whitening (3 km²)', impact_c: 1.8, cost: 'Low', timeline: '6 months' },
      { action: 'Airport perimeter forest belt (5 km)', impact_c: 2.1, cost: 'High', timeline: '5-10 yrs' },
      { action: 'Retention basin at ZAC aéroparc (5 ha)', impact_c: 1.5, cost: 'High', timeline: '3-4 yrs' },
    ],
    max_achievable_reduction_c: 5.4, potential_temp_c: 37.6, source: 'Fallback (start backend for live data)',
  },
  {
    name: 'Pessac', lat: 44.806, lon: -0.615, type: 'suburban_university',
    temp_c: 41.5, feels_like_c: 47.3, humidity_pct: 37, uhi_delta_c: 1.5,
    risk: 'Extreme', color: '#f97316',
    baseline: { tree_cover_pct: 22, water_ha: 1.2, green_roof_pct: 3, cool_roof_pct: 5 },
    interventions: [
      { action: 'Plant 2,000 trees along campus corridors', impact_c: 1.2, cost: 'Low', timeline: '3-5 yrs' },
      { action: 'Create 3 retention ponds (1 ha each)', impact_c: 0.9, cost: 'Medium', timeline: '1-2 yrs' },
      { action: 'Green roofs on university buildings', impact_c: 0.5, cost: 'Medium', timeline: '2-3 yrs' },
    ],
    max_achievable_reduction_c: 2.6, potential_temp_c: 38.9, source: 'Fallback (start backend for live data)',
  },
  {
    name: 'Talence', lat: 44.808, lon: -0.589, type: 'suburban_park',
    temp_c: 41.0, feels_like_c: 46.5, humidity_pct: 38, uhi_delta_c: 1.0,
    risk: 'Extreme', color: '#f97316',
    baseline: { tree_cover_pct: 30, water_ha: 2.0, green_roof_pct: 4, cool_roof_pct: 4 },
    interventions: [
      { action: 'Expand Parc Peixotto by 2 ha + water feature', impact_c: 1.0, cost: 'Low', timeline: '1 yr' },
      { action: 'Cool paving on 4 main streets', impact_c: 0.6, cost: 'Medium', timeline: '6 months' },
      { action: 'Misting systems at 5 public squares', impact_c: 0.8, cost: 'Low', timeline: '3 months' },
    ],
    max_achievable_reduction_c: 2.4, potential_temp_c: 38.6, source: 'Fallback (start backend for live data)',
  },
  {
    name: 'Gradignan', lat: 44.772, lon: -0.616, type: 'forest_edge',
    temp_c: 40.0, feels_like_c: 44.8, humidity_pct: 40, uhi_delta_c: 0.0,
    risk: 'Danger', color: '#f59e0b',
    baseline: { tree_cover_pct: 45, water_ha: 4.0, green_roof_pct: 2, cool_roof_pct: 3 },
    interventions: [
      { action: 'Protect existing forest — zero-construction buffer', impact_c: 0.0, cost: 'None (policy)', timeline: 'Immediate' },
      { action: 'Restore La Jalle river natural meanders (3 km)', impact_c: 0.8, cost: 'Medium', timeline: '2 yrs' },
      { action: 'Agro-forestry corridors linking forest patches', impact_c: 0.5, cost: 'Low', timeline: '3-5 yrs' },
    ],
    max_achievable_reduction_c: 1.3, potential_temp_c: 38.7, source: 'Fallback (start backend for live data)',
  },
]

const RISK_COLORS: Record<string, string> = {
  Normal: '#3b82f6', Caution: '#f59e0b', Danger: '#f97316', Extreme: '#ef4444', Emergency: '#7c3aed'
}
const RISK_BG: Record<string, string> = {
  Normal:    'bg-blue-950/60 border-blue-500/40',
  Caution:   'bg-amber-950/60 border-amber-500/40',
  Danger:    'bg-orange-950/60 border-orange-500/40',
  Extreme:   'bg-red-950/70 border-red-500/50',
  Emergency: 'bg-purple-950/70 border-purple-500/60',
}

function getRisk(t: number): string {
  if (t < 36) return 'Normal'
  if (t < 39) return 'Caution'
  if (t < 42) return 'Danger'
  if (t < 46) return 'Extreme'
  return 'Emergency'
}

function posNoise(lon: number, lat: number): number {
  const s = Math.sin(lon * 12.9898 + lat * 78.233) * 43758.5453
  return (s - Math.floor(s) - 0.5) * 2.4
}

function spotInfluence(lon: number, lat: number, spot: { lon: number; lat: number; delta: number; radius: number }): number {
  const dx = (lon - spot.lon) * 111320 * Math.cos(lat * Math.PI / 180)
  const dy = (lat - spot.lat) * 111320
  return spot.delta * Math.exp(-(dx * dx + dy * dy) / (spot.radius * spot.radius))
}

function tempToColor(t: number): [number, number, number, number] {
  if (t < 37)   return [34,  211, 238, 0.80]
  if (t < 39)   return [74,  222, 128, 0.82]
  if (t < 40.5) return [250, 204, 21,  0.85]
  if (t < 42)   return [249, 115, 22,  0.87]
  if (t < 43.5) return [239, 68,  68,  0.90]
  if (t < 45)   return [185, 28,  28,  0.92]
  return               [124, 58,  237, 0.95]
}

function buildHeatGrid(area: AreaData): { lon: number; lat: number; temp: number }[] {
  const poly  = AREA_POLYGONS[area.name]
  if (!poly) return []
  const lons  = poly.map(p => p[0])
  const lats  = poly.map(p => p[1])
  const spots = HEAT_SPOTS[area.name] ?? []
  const STEP  = 0.0018

  const pts: { lon: number; lat: number; temp: number }[] = []
  for (let lon = Math.min(...lons) + STEP / 2; lon < Math.max(...lons); lon += STEP)
    for (let lat = Math.min(...lats) + STEP / 2; lat < Math.max(...lats); lat += STEP)
      pts.push({ lon, lat, temp: area.temp_c + posNoise(lon, lat) + spots.reduce((a, s) => a + spotInfluence(lon, lat, s), 0) })
  return pts
}

export function HeatWaveLayer({ viewer }: { viewer: any }) {
  const { showHeatWave } = useLayerStore()

  const polyEntRef   = useRef<any[]>([])
  const labelEntRef  = useRef<any[]>([])
  const heatPrimRef  = useRef<any>(null)
  const postStageRef = useRef<any>(null)
  const heatTimeRef  = useRef(0)
  const rafRef       = useRef<number>(0)
  const intervalRef  = useRef<any>(null)

  const [areas, setAreas]           = useState<AreaData[]>([])
  const [selected, setSelected]     = useState<AreaData | null>(null)
  const [simMode, setSimMode]       = useState(false)
  const [simSliders, setSimSliders] = useState({ tree_cover_pct: 0, water_ha: 0, green_roof_pct: 0, cool_roof_pct: 0 })
  const [simResult, setSimResult]   = useState<SimResult | null>(null)
  const [lastUpdate, setLastUpdate] = useState('')

  // ── Fetch / fallback ────────────────────────────────────────────────────────
  const fetchAreas = useCallback(async () => {
    try {
      const r = await fetch(`${API}/climate/heatwave`, { signal: AbortSignal.timeout(5000) })
      if (!r.ok) throw new Error()
      const d = await r.json()
      setAreas(d.areas?.length ? d.areas : FALLBACK_AREAS)
      setLastUpdate(new Date().toLocaleTimeString('fr-FR') + ' 🟢')
    } catch {
      setAreas(FALLBACK_AREAS)
      setLastUpdate(new Date().toLocaleTimeString('fr-FR') + ' ⚫ offline')
    }
  }, [])

  useEffect(() => {
    if (!showHeatWave) { clearInterval(intervalRef.current); return }
    fetchAreas()
    intervalRef.current = setInterval(fetchAreas, 300_000)
    return () => clearInterval(intervalRef.current)
  }, [showHeatWave, fetchAreas])

  // ── Animated PostProcessStage — heat wave shader ────────────────────────────
  useEffect(() => {
    if (!viewer) return
    const Cesium = (window as any).Cesium

    // Remove old stage + stop animation
    if (postStageRef.current) {
      try { viewer.scene.postProcessStages.remove(postStageRef.current) } catch { /* already removed */ }
      postStageRef.current = null
    }
    cancelAnimationFrame(rafRef.current)

    if (!showHeatWave) return

    try {
      const stage = new Cesium.PostProcessStage({
        fragmentShader: HEAT_WAVE_SHADER,
        uniforms: {
          heatTime:      () => heatTimeRef.current,
          heatIntensity: () => 0.88,
        },
      })
      viewer.scene.postProcessStages.add(stage)
      postStageRef.current = stage

      // Drive heatTime uniform via rAF
      const tick = (ts: number) => {
        heatTimeRef.current = ts / 1000
        rafRef.current = requestAnimationFrame(tick)
      }
      rafRef.current = requestAnimationFrame(tick)
    } catch (e) {
      console.warn('Heat wave PostProcessStage failed:', e)
    }

    return () => {
      if (postStageRef.current) {
        try { viewer.scene.postProcessStages.remove(postStageRef.current) } catch { /* ok */ }
        postStageRef.current = null
      }
      cancelAnimationFrame(rafRef.current)
    }
  }, [viewer, showHeatWave])

  // ── Area polygon outlines + labels ──────────────────────────────────────────
  useEffect(() => {
    if (!viewer) return
    const Cesium = (window as any).Cesium

    polyEntRef.current.forEach(e => viewer.entities.remove(e))
    labelEntRef.current.forEach(e => viewer.entities.remove(e))
    polyEntRef.current  = []
    labelEntRef.current = []

    if (!showHeatWave || !areas.length) return

    areas.forEach(area => {
      const poly = AREA_POLYGONS[area.name]
      if (!poly) return
      const positions = poly.map(([lon, lat]) => Cesium.Cartesian3.fromDegrees(lon, lat))

      // Thin border only — shader handles fill
      polyEntRef.current.push(viewer.entities.add({
        polygon: {
          hierarchy: new Cesium.PolygonHierarchy(positions),
          material: Cesium.Color.fromCssColorString(area.color).withAlpha(0.08),
          outline: true,
          outlineColor: Cesium.Color.fromCssColorString(area.color).withAlpha(0.90),
          outlineWidth: 3,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        },
      }))

      // Floating label
      labelEntRef.current.push(viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(area.lon, area.lat, 250),
        label: {
          text: `${area.name}\n${area.temp_c}°C · ${area.risk}`,
          font: 'bold 14px sans-serif',
          fillColor: Cesium.Color.WHITE,
          outlineColor: Cesium.Color.fromCssColorString(area.color),
          outlineWidth: 3,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
          pixelOffset: new Cesium.Cartesian2(0, -8),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          scaleByDistance: new Cesium.NearFarScalar(500, 1.3, 12000, 0.45),
        },
      }))
    })
  }, [viewer, showHeatWave, areas])

  // ── Street-level heat dot grid (geographic accuracy) ───────────────────────
  useEffect(() => {
    if (!viewer) return
    const Cesium = (window as any).Cesium

    if (heatPrimRef.current) {
      viewer.scene.primitives.remove(heatPrimRef.current)
      heatPrimRef.current = null
    }
    if (!showHeatWave || !areas.length) return

    const col = new Cesium.PointPrimitiveCollection()
    areas.forEach(area => {
      buildHeatGrid(area).forEach(({ lon, lat, temp }) => {
        const [r, g, b, a] = tempToColor(temp)
        col.add({
          position:  Cesium.Cartesian3.fromDegrees(lon, lat, 5),
          color:     new Cesium.Color(r / 255, g / 255, b / 255, a),
          pixelSize: 11,
        })
      })
    })
    viewer.scene.primitives.add(col)
    heatPrimRef.current = col
  }, [viewer, showHeatWave, areas])

  // ── Full cleanup ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!showHeatWave && viewer) {
      polyEntRef.current.forEach(e => viewer.entities.remove(e))
      labelEntRef.current.forEach(e => viewer.entities.remove(e))
      polyEntRef.current  = []
      labelEntRef.current = []
      if (heatPrimRef.current) { viewer.scene.primitives.remove(heatPrimRef.current); heatPrimRef.current = null }
      if (postStageRef.current) { try { viewer.scene.postProcessStages.remove(postStageRef.current) } catch { /* ok */ }; postStageRef.current = null }
      cancelAnimationFrame(rafRef.current)
    }
  }, [showHeatWave, viewer])

  // ── Reactive ML sim (pure frontend) ────────────────────────────────────────
  useEffect(() => {
    if (!selected || !simMode) { setSimResult(null); return }
    const reduction = Math.max(0,
      simSliders.tree_cover_pct * 0.05  +
      simSliders.water_ha       * 0.35  +
      simSliders.green_roof_pct * 0.025 +
      simSliders.cool_roof_pct  * 0.018
    )
    const predicted = Math.round((selected.temp_c - reduction) * 10) / 10
    setSimResult({
      predicted_temp_c: predicted,
      reduction_c:      Math.round(reduction * 100) / 100,
      risk_after:       getRisk(predicted),
      model:            'Shashua-Bar 2000 · Völker 2013 · Akbari 2009',
    })
  }, [simSliders, selected, simMode])

  if (!showHeatWave) return null

  return (
    <>
      {/* ── Bottom area cards ── */}
      {!selected && (
        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-2">
          <div className="flex gap-2">
            {areas.map(a => (
              <button key={a.name}
                onClick={() => { setSelected(a); setSimMode(false); setSimSliders({ tree_cover_pct: 0, water_ha: 0, green_roof_pct: 0, cool_roof_pct: 0 }) }}
                className="flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl border backdrop-blur-lg transition-all hover:scale-105 active:scale-95"
                style={{ backgroundColor: `${a.color}18`, borderColor: `${a.color}55` }}
              >
                <span className="text-[10px] text-gray-400 font-medium">{a.name}</span>
                <span className="text-xl font-black" style={{ color: a.color }}>{a.temp_c}°C</span>
                <span className="text-[9px] font-semibold" style={{ color: RISK_COLORS[a.risk] }}>{a.risk}</span>
              </button>
            ))}
          </div>

          {/* Color legend */}
          {areas.length > 0 && (
            <div className="flex items-center gap-1.5 bg-gray-950/85 backdrop-blur px-3 py-1.5 rounded-xl border border-white/10">
              {[
                ['#22d3ee','<38°C'],['#4ade80','39°C'],['#facc15','41°C'],
                ['#f97316','42°C'],['#ef4444','44°C'],['#7c3aed','45+°C'],
              ].map(([c, l]) => (
                <div key={l} className="flex items-center gap-1">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c }} />
                  <span className="text-[9px] text-gray-500">{l}</span>
                </div>
              ))}
              {lastUpdate && <span className="text-[9px] text-gray-600 ml-1">🌡 {lastUpdate}</span>}
            </div>
          )}
        </div>
      )}

      {/* ── Detail panel ── */}
      {selected && (
        <div className="absolute top-1/2 -translate-y-1/2 right-4 z-20 w-80 bg-gray-950/97 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
          <div className={`px-4 py-3 border-b flex items-start justify-between ${RISK_BG[selected.risk]}`}>
            <div>
              <div className="text-white font-bold">{selected.name}</div>
              <div className="text-[10px] text-gray-400 capitalize mt-0.5">{selected.type.replace(/_/g,' ')}</div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-black" style={{ color: selected.color }}>{selected.temp_c}°C</div>
              <div className="text-[10px] font-bold" style={{ color: RISK_COLORS[selected.risk] }}>{selected.risk}</div>
            </div>
            <button onClick={() => setSelected(null)} className="text-gray-500 hover:text-white text-lg ml-2 mt-0.5">✕</button>
          </div>

          <div className="px-4 py-3 space-y-3">
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

            <div className="bg-green-950/50 border border-green-500/30 rounded-xl px-3 py-2">
              <div className="text-[10px] text-green-400 font-bold">🌱 Max achievable cooling</div>
              <div className="flex justify-between items-center mt-1">
                <span className="text-white text-sm font-bold">↓ {selected.max_achievable_reduction_c}°C possible</span>
                <span className="text-green-300 font-bold">{selected.potential_temp_c}°C potential</span>
              </div>
            </div>

            {/* Tab toggle */}
            <div className="flex gap-1 p-0.5 bg-white/5 rounded-xl">
              {([{v: false, l: '🤖 AI Suggestions'},{v: true, l: '🧪 What-If Sim'}] as const).map(m => (
                <button key={String(m.v)} onClick={() => setSimMode(m.v)}
                  className={`flex-1 text-[10px] py-1.5 rounded-lg font-bold transition-all ${simMode === m.v ? 'bg-blue-500/30 border border-blue-400/50 text-blue-200' : 'text-gray-500 hover:text-gray-300'}`}>
                  {m.l}
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
                      <span className="text-green-400 font-black text-xs shrink-0">-{iv.impact_c}°C</span>
                    </div>
                    <div className="flex gap-1.5 mt-1.5">
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full border ${
                        iv.cost === 'Low' ? 'border-green-500/40 text-green-400' :
                        iv.cost === 'None (policy)' ? 'border-blue-500/40 text-blue-300' :
                        iv.cost === 'Medium' ? 'border-amber-500/40 text-amber-400' :
                        'border-red-500/40 text-red-400'}`}>💰 {iv.cost}</span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full border border-white/10 text-gray-500">⏱ {iv.timeline}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* What-If Sim */}
            {simMode && (
              <div className="space-y-3">
                <div className="text-[10px] text-gray-500 uppercase tracking-wide">Sliders → live ML prediction ↓</div>

                {([
                  { key: 'tree_cover_pct', label: '🌳 Tree Cover',    unit: '%',  max: 60, step: 1,   coeff: 0.05  },
                  { key: 'water_ha',       label: '💧 Water Bodies',  unit: 'ha', max: 20, step: 0.5, coeff: 0.35  },
                  { key: 'green_roof_pct', label: '🌿 Green Roofs',   unit: '%',  max: 80, step: 1,   coeff: 0.025 },
                  { key: 'cool_roof_pct',  label: '🏚 Cool Roofs',    unit: '%',  max: 80, step: 1,   coeff: 0.018 },
                ] as const).map(s => {
                  const val = simSliders[s.key]
                  const impact = +(val * s.coeff).toFixed(2)
                  return (
                    <div key={s.key} className="bg-white/4 rounded-xl px-3 py-2">
                      <div className="flex justify-between mb-1">
                        <span className="text-[10px] text-gray-300 font-semibold">{s.label}</span>
                        <div className="flex items-center gap-2">
                          {impact > 0 && <span className="text-[9px] text-green-400 font-bold">-{impact}°C</span>}
                          <span className="text-[10px] text-white font-mono">+{val}{s.unit}</span>
                        </div>
                      </div>
                      <input type="range" min={0} max={s.max} step={s.step} value={val}
                        onChange={e => setSimSliders(p => ({ ...p, [s.key]: Number(e.target.value) }))}
                        className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                        style={{ background: `linear-gradient(to right,#22c55e ${(val/s.max)*100}%,#1e293b ${(val/s.max)*100}%)` }}
                      />
                    </div>
                  )
                })}

                {/* Live result */}
                {simResult && simResult.reduction_c > 0 ? (
                  <div className={`rounded-xl border px-4 py-3 ${RISK_BG[simResult.risk_after]}`}>
                    <div className="text-[10px] text-gray-400 mb-2">📊 ML Prediction (live)</div>
                    <div className="flex items-end justify-between">
                      <div>
                        <div className="text-3xl font-black text-white">{simResult.predicted_temp_c}°C</div>
                        <div className="text-xs font-bold mt-0.5" style={{ color: RISK_COLORS[simResult.risk_after] }}>{simResult.risk_after}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-green-400 font-black text-2xl">↓ {simResult.reduction_c}°C</div>
                        <div className="text-[9px] text-gray-500">vs {selected.temp_c}°C now</div>
                      </div>
                    </div>
                    {simResult.risk_after !== selected.risk && (
                      <div className="mt-2 bg-green-900/30 rounded-lg px-2 py-1">
                        <div className="text-[9px] text-green-400">✅ {selected.risk} → {simResult.risk_after}</div>
                      </div>
                    )}
                    <div className="text-[8px] text-gray-700 mt-2">{simResult.model}</div>
                  </div>
                ) : (
                  <div className="text-center text-[10px] text-gray-600 py-3 border border-dashed border-white/10 rounded-xl">
                    Move sliders above → prediction appears here
                  </div>
                )}

                <button onClick={() => setSimSliders({ tree_cover_pct: 0, water_ha: 0, green_roof_pct: 0, cool_roof_pct: 0 })}
                  className="w-full text-[10px] py-1.5 rounded-lg border border-white/10 text-gray-600 hover:text-gray-300 transition-all">
                  ↺ Reset
                </button>
              </div>
            )}

            <div className="text-[9px] text-gray-700 text-center">{selected.source}</div>
          </div>
        </div>
      )}
    </>
  )
}
