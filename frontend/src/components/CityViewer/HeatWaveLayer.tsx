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

// Hot/cool micro-spots for each area (real Bordeaux geography)
const HEAT_SPOTS: Record<string, { lon: number; lat: number; delta: number; radius: number }[]> = {
  'Bordeaux City': [
    { lon: -0.574, lat: 44.836, delta: +3.2, radius: 280 }, // Gare Saint-Jean
    { lon: -0.567, lat: 44.841, delta: +2.5, radius: 200 }, // Place de la Victoire
    { lon: -0.593, lat: 44.830, delta: +2.0, radius: 220 }, // Cours de la Marne
    { lon: -0.582, lat: 44.844, delta: -2.2, radius: 350 }, // Jardin Public
    { lon: -0.554, lat: 44.852, delta: -3.5, radius: 400 }, // Garonne waterfront
  ],
  'Mérignac': [
    { lon: -0.710, lat: 44.829, delta: +4.0, radius: 500 }, // Airport runways
    { lon: -0.685, lat: 44.835, delta: +3.0, radius: 350 }, // Industrial ZAC
    { lon: -0.668, lat: 44.840, delta: +2.0, radius: 250 }, // Commercial N230
    { lon: -0.658, lat: 44.848, delta: -2.2, radius: 400 }, // Parc du Bocage
    { lon: -0.695, lat: 44.818, delta: -1.5, radius: 300 }, // Parc des Jalles
  ],
  'Pessac': [
    { lon: -0.610, lat: 44.808, delta: +2.2, radius: 300 }, // University concrete
    { lon: -0.625, lat: 44.800, delta: +1.8, radius: 250 }, // Commercial strip
    { lon: -0.603, lat: 44.815, delta: -1.8, radius: 350 }, // Campus park
    { lon: -0.615, lat: 44.820, delta: -1.2, radius: 280 }, // Parc de Camponac
  ],
  'Talence': [
    { lon: -0.593, lat: 44.812, delta: -3.0, radius: 400 }, // Parc Peixotto
    { lon: -0.580, lat: 44.806, delta: +2.0, radius: 220 }, // Dense residential
    { lon: -0.568, lat: 44.810, delta: +1.8, radius: 200 }, // Cours du Médoc
    { lon: -0.600, lat: 44.818, delta: -1.5, radius: 300 }, // University green
  ],
  'Gradignan': [
    { lon: -0.618, lat: 44.767, delta: -4.0, radius: 600 }, // Forêt de Gradignan
    { lon: -0.606, lat: 44.778, delta: +1.8, radius: 200 }, // Town centre
    { lon: -0.628, lat: 44.773, delta: -2.5, radius: 350 }, // La Jalle river
    { lon: -0.598, lat: 44.785, delta: -1.2, radius: 300 }, // Suburban gardens
  ],
}

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

function hexToRgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1,3),16), parseInt(hex.slice(3,5),16), parseInt(hex.slice(5,7),16)]
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
  const lons  = poly.map(p => p[0]), lats = poly.map(p => p[1])
  const spots = HEAT_SPOTS[area.name] ?? []
  const STEP  = 0.0018
  const pts: { lon: number; lat: number; temp: number }[] = []
  for (let lon = Math.min(...lons) + STEP/2; lon < Math.max(...lons); lon += STEP)
    for (let lat = Math.min(...lats) + STEP/2; lat < Math.max(...lats); lat += STEP)
      pts.push({ lon, lat, temp: area.temp_c + posNoise(lon, lat) + spots.reduce((a,s) => a + spotInfluence(lon,lat,s), 0) })
  return pts
}

export function HeatWaveLayer({ viewer }: { viewer: any }) {
  const { showHeatWave } = useLayerStore()

  const canvasRef    = useRef<HTMLCanvasElement | null>(null)
  const rafRef       = useRef<number>(0)
  const selectedRef  = useRef<AreaData | null>(null)
  const polyEntRef   = useRef<any[]>([])
  const labelEntRef  = useRef<any[]>([])
  const heatPrimRef  = useRef<any>(null)
  const intervalRef  = useRef<any>(null)

  const [areas, setAreas]           = useState<AreaData[]>([])
  const [selected, setSelected]     = useState<AreaData | null>(null)
  const [simMode, setSimMode]       = useState(false)
  const [simSliders, setSimSliders] = useState({ tree_cover_pct: 0, water_ha: 0, green_roof_pct: 0, cool_roof_pct: 0 })
  const [simResult, setSimResult]   = useState<SimResult | null>(null)
  const [lastUpdate, setLastUpdate] = useState('')

  // Keep ref in sync for RAF access
  useEffect(() => { selectedRef.current = selected }, [selected])

  // ── Fetch areas ─────────────────────────────────────────────────────────────
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

  // ── Canvas heat animation — ONLY on selected area ───────────────────────────
  useEffect(() => {
    if (!viewer || !showHeatWave) {
      cancelAnimationFrame(rafRef.current)
      return
    }

    const Cesium = (window as any).Cesium

    const draw = () => {
      const canvas = canvasRef.current
      const sel    = selectedRef.current
      if (!canvas) { rafRef.current = requestAnimationFrame(draw); return }

      // Sync canvas pixel size to container
      const parent = canvas.parentElement
      if (parent) {
        if (canvas.width  !== parent.clientWidth)  canvas.width  = parent.clientWidth
        if (canvas.height !== parent.clientHeight) canvas.height = parent.clientHeight
      }

      const ctx = canvas.getContext('2d')!
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      // No area selected → clear (street dots still visible)
      if (!sel) { rafRef.current = requestAnimationFrame(draw); return }

      const poly = AREA_POLYGONS[sel.name]
      if (!poly) { rafRef.current = requestAnimationFrame(draw); return }

      // Project area polygon corners to screen pixels
      const pts = poly.map(([lon, lat]) => {
        try { return viewer.scene.cartesianToCanvasCoordinates(Cesium.Cartesian3.fromDegrees(lon, lat, 30)) }
        catch { return null }
      }).filter(Boolean) as { x: number; y: number }[]

      if (pts.length < 3) { rafRef.current = requestAnimationFrame(draw); return }

      const t = performance.now() / 1000
      const w = canvas.width, h = canvas.height
      const [br, bg, bb] = hexToRgb(sel.color)

      ctx.save()

      // ── Clip to projected area polygon ──────────────────────────────────────
      ctx.beginPath()
      ctx.moveTo(pts[0].x, pts[0].y)
      pts.slice(1).forEach(p => ctx.lineTo(p.x, p.y))
      ctx.closePath()
      ctx.clip()

      // ── 1. Base semi-transparent heat fill ──────────────────────────────────
      ctx.fillStyle = `rgba(${br},${bg},${bb},0.14)`
      ctx.fillRect(0, 0, w, h)

      // ── 2. Animated rising heat bands (vertical shimmer) ────────────────────
      const bandH = h * 0.18
      const scroll = (t * 28) % (bandH * 2)
      for (let by = -bandH * 2 + scroll; by < h + bandH; by += bandH * 2) {
        const bAlpha = 0.07 + Math.sin(t * 0.9 + by * 0.005) * 0.025
        const bGrad = ctx.createLinearGradient(0, by, 0, by + bandH)
        bGrad.addColorStop(0,   `rgba(255,160,20,0)`)
        bGrad.addColorStop(0.5, `rgba(255,160,20,${bAlpha.toFixed(3)})`)
        bGrad.addColorStop(1,   `rgba(255,160,20,0)`)
        ctx.fillStyle = bGrad
        ctx.fillRect(0, by, w, bandH)
      }

      // ── 3. Hot/cool spot radial gradients at real geographic positions ──────
      const spots = HEAT_SPOTS[sel.name] ?? []
      spots.forEach(spot => {
        let sp: { x: number; y: number } | null = null
        try { sp = viewer.scene.cartesianToCanvasCoordinates(Cesium.Cartesian3.fromDegrees(spot.lon, spot.lat, 30)) }
        catch { return }
        if (!sp) return

        const pulse  = 1 + Math.sin(t * 1.3 + spot.lon * 7) * 0.13
        const pxRad  = (Math.abs(spot.delta) * 32 + 85) * pulse
        const grad   = ctx.createRadialGradient(sp.x, sp.y, 0, sp.x, sp.y, pxRad)

        if (spot.delta >= 3.5) {         // extreme hot (airport tarmac, dense city)
          grad.addColorStop(0,   `rgba(124,58,237,0.75)`)  // purple core
          grad.addColorStop(0.25,`rgba(239,68,68, 0.60)`)  // red
          grad.addColorStop(0.6, `rgba(249,115,22,0.30)`)  // orange fade
          grad.addColorStop(1,   `rgba(249,115,22,0)`)
        } else if (spot.delta >= 2) {    // hot
          grad.addColorStop(0,   `rgba(239,68,68, 0.65)`)
          grad.addColorStop(0.4, `rgba(249,115,22,0.40)`)
          grad.addColorStop(0.8, `rgba(250,204,21,0.15)`)
          grad.addColorStop(1,   `rgba(250,204,21,0)`)
        } else if (spot.delta > 0) {     // warm
          grad.addColorStop(0,   `rgba(249,115,22,0.50)`)
          grad.addColorStop(0.5, `rgba(250,204,21,0.25)`)
          grad.addColorStop(1,   `rgba(250,204,21,0)`)
        } else if (spot.delta <= -3) {   // very cool (forest, river, water)
          grad.addColorStop(0,   `rgba(34,211,238,0.70)`)  // cyan core
          grad.addColorStop(0.35,`rgba(74,222,128,0.45)`)  // green
          grad.addColorStop(0.7, `rgba(74,222,128,0.18)`)
          grad.addColorStop(1,   `rgba(74,222,128,0)`)
        } else {                         // cool (park, garden)
          grad.addColorStop(0,   `rgba(74,222,128,0.55)`)
          grad.addColorStop(0.5, `rgba(34,211,238,0.25)`)
          grad.addColorStop(1,   `rgba(34,211,238,0)`)
        }

        ctx.fillStyle = grad
        ctx.fillRect(0, 0, w, h)
      })

      // ── 4. Animated pulsing wave overlay ────────────────────────────────────
      const waveAlpha = 0.04 + Math.sin(t * 0.7) * 0.02
      const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length
      const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length
      const maxR = Math.max(...pts.map(p => Math.hypot(p.x - cx, p.y - cy))) * 1.2
      const wGrad = ctx.createRadialGradient(cx, cy, maxR * 0.2, cx, cy, maxR)
      wGrad.addColorStop(0,   `rgba(${br},${bg},${bb},0)`)
      wGrad.addColorStop(0.6, `rgba(${br},${bg},${bb},${waveAlpha.toFixed(3)})`)
      wGrad.addColorStop(1,   `rgba(${br},${bg},${bb},${(waveAlpha * 1.5).toFixed(3)})`)
      ctx.fillStyle = wGrad
      ctx.fillRect(0, 0, w, h)

      ctx.restore()

      // ── 5. Glowing pulsing border (outside clip) ────────────────────────────
      const glow  = 0.55 + Math.sin(t * 1.8) * 0.25
      const gHex  = Math.round(glow * 255).toString(16).padStart(2,'0')
      ctx.save()
      ctx.beginPath()
      ctx.moveTo(pts[0].x, pts[0].y)
      pts.slice(1).forEach(p => ctx.lineTo(p.x, p.y))
      ctx.closePath()
      ctx.shadowColor  = sel.color
      ctx.shadowBlur   = 18
      ctx.strokeStyle  = `${sel.color}${gHex}`
      ctx.lineWidth    = 3
      ctx.stroke()
      ctx.restore()

      rafRef.current = requestAnimationFrame(draw)
    }

    rafRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(rafRef.current)
  }, [viewer, showHeatWave])

  // ── Area polygon outlines + floating labels ──────────────────────────────────
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

      polyEntRef.current.push(viewer.entities.add({
        polygon: {
          hierarchy: new Cesium.PolygonHierarchy(positions),
          material: Cesium.Color.fromCssColorString(area.color).withAlpha(0.06),
          outline: true,
          outlineColor: Cesium.Color.fromCssColorString(area.color).withAlpha(0.55),
          outlineWidth: 2,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        },
      }))

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

  // ── Street-level heat dot grid ───────────────────────────────────────────────
  useEffect(() => {
    if (!viewer) return
    const Cesium = (window as any).Cesium

    if (heatPrimRef.current) { viewer.scene.primitives.remove(heatPrimRef.current); heatPrimRef.current = null }
    if (!showHeatWave || !areas.length) return

    const col = new Cesium.PointPrimitiveCollection()
    areas.forEach(area => {
      buildHeatGrid(area).forEach(({ lon, lat, temp }) => {
        const [r, g, b, a] = tempToColor(temp)
        col.add({ position: Cesium.Cartesian3.fromDegrees(lon, lat, 5), color: new Cesium.Color(r/255, g/255, b/255, a), pixelSize: 10 })
      })
    })
    viewer.scene.primitives.add(col)
    heatPrimRef.current = col
  }, [viewer, showHeatWave, areas])

  // ── Full cleanup on layer off ────────────────────────────────────────────────
  useEffect(() => {
    if (!showHeatWave && viewer) {
      cancelAnimationFrame(rafRef.current)
      polyEntRef.current.forEach(e => viewer.entities.remove(e))
      labelEntRef.current.forEach(e => viewer.entities.remove(e))
      polyEntRef.current = []; labelEntRef.current = []
      if (heatPrimRef.current) { viewer.scene.primitives.remove(heatPrimRef.current); heatPrimRef.current = null }
    }
  }, [showHeatWave, viewer])

  // ── Reactive ML sim (pure frontend) ─────────────────────────────────────────
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
      {/* ── Full-screen canvas (area-clipped heat animation) ── */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ zIndex: 10 }}
      />

      {/* ── Bottom area cards ── */}
      {!selected && (
        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-2">
          <div className="text-[10px] text-gray-500 text-center">Click an area to see heat wave</div>
          <div className="flex gap-2">
            {areas.map(a => (
              <button key={a.name}
                onClick={() => { setSelected(a); setSimMode(false); setSimSliders({ tree_cover_pct: 0, water_ha: 0, green_roof_pct: 0, cool_roof_pct: 0 }) }}
                className="flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl border backdrop-blur-lg transition-all hover:scale-105 active:scale-95"
                style={{ backgroundColor: `${a.color}15`, borderColor: `${a.color}55` }}
              >
                <span className="text-[10px] text-gray-400 font-medium">{a.name}</span>
                <span className="text-xl font-black" style={{ color: a.color }}>{a.temp_c}°C</span>
                <span className="text-[9px] font-semibold" style={{ color: RISK_COLORS[a.risk] }}>{a.risk}</span>
              </button>
            ))}
          </div>
          {/* Color legend */}
          <div className="flex items-center gap-1.5 bg-gray-950/85 backdrop-blur px-3 py-1.5 rounded-xl border border-white/10">
            {([['#22d3ee','<38°C'],['#4ade80','39°C'],['#facc15','41°C'],['#f97316','42°C'],['#ef4444','44°C'],['#7c3aed','45+°C']] as const).map(([c,l]) => (
              <div key={l} className="flex items-center gap-1">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c }} />
                <span className="text-[9px] text-gray-500">{l}</span>
              </div>
            ))}
            {lastUpdate && <span className="text-[9px] text-gray-600 ml-1">🌡 {lastUpdate}</span>}
          </div>
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
                <span className="text-white text-sm font-bold">↓ {selected.max_achievable_reduction_c}°C</span>
                <span className="text-green-300 font-bold">{selected.potential_temp_c}°C potential</span>
              </div>
            </div>

            <div className="flex gap-1 p-0.5 bg-white/5 rounded-xl">
              {([{v: false, l: '🤖 AI Suggestions'},{v: true, l: '🧪 What-If Sim'}] as const).map(m => (
                <button key={String(m.v)} onClick={() => setSimMode(m.v)}
                  className={`flex-1 text-[10px] py-1.5 rounded-lg font-bold transition-all ${simMode === m.v ? 'bg-blue-500/30 border border-blue-400/50 text-blue-200' : 'text-gray-500 hover:text-gray-300'}`}>
                  {m.l}
                </button>
              ))}
            </div>

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

            {simMode && (
              <div className="space-y-3">
                <div className="text-[10px] text-gray-500 uppercase tracking-wide">Sliders → live ML prediction ↓</div>
                {([
                  { key: 'tree_cover_pct', label: '🌳 Tree Cover',   unit: '%',  max: 60, step: 1,   coeff: 0.05  },
                  { key: 'water_ha',       label: '💧 Water Bodies', unit: 'ha', max: 20, step: 0.5, coeff: 0.35  },
                  { key: 'green_roof_pct', label: '🌿 Green Roofs',  unit: '%',  max: 80, step: 1,   coeff: 0.025 },
                  { key: 'cool_roof_pct',  label: '🏚 Cool Roofs',   unit: '%',  max: 80, step: 1,   coeff: 0.018 },
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
