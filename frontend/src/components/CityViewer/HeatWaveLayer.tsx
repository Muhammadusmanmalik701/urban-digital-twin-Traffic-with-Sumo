import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { useLayerStore } from '../../store/layerStore'
import { useRiskStore } from '../../store/riskStore'

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


interface WindData  { speed: number; dir: number }
interface HoverInfo { x: number; y: number; temp: number; risk: string; areaName: string }

function diurnalOffset(targetHour: number): number {
  // Diurnal swing ±5°C relative to current measurement time; peak at 14:00, trough at 02:00
  const now  = 5 * Math.cos((new Date().getHours() - 14) * Math.PI / 12)
  const tgt  = 5 * Math.cos((targetHour           - 14) * Math.PI / 12)
  return +(tgt - now).toFixed(1)
}

function windDirName(deg: number): string {
  return ['N','NE','E','SE','S','SW','W','NW'][Math.round(deg / 45) % 8]
}

function SaveScenarioButton({ area, sliders, predictedTemp, onSave }: {
  area: string
  sliders: { tree_cover_pct: number; water_ha: number; green_roof_pct: number; cool_roof_pct: number }
  predictedTemp: number
  onSave: (s: any) => void
}) {
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')
  const [saved, setSaved] = useState(false)

  const handleSave = () => {
    if (!name.trim()) return
    onSave({ name: name.trim(), area, sliders, predictedTemp, savedAt: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) })
    setSaved(true); setNaming(false); setName('')
    setTimeout(() => setSaved(false), 2000)
  }

  if (saved) return <div className="mt-2 text-center text-[9px] text-green-400">✓ Saved to Scenarios panel</div>

  return (
    <div className="mt-2">
      {!naming ? (
        <button
          onClick={() => setNaming(true)}
          className="w-full text-[9px] py-1 rounded-lg border border-dashed border-blue-500/30 text-blue-400 hover:bg-blue-900/20 transition-all"
        >
          💾 Save as Scenario
        </button>
      ) : (
        <div className="flex gap-1">
          <input
            autoFocus
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setNaming(false) }}
            placeholder="Scenario name…"
            className="flex-1 bg-gray-800 border border-white/15 text-white text-[10px] px-2 py-1 rounded-lg focus:outline-none focus:border-blue-500/50 placeholder-gray-600"
          />
          <button onClick={handleSave} className="text-[10px] px-2 py-1 rounded-lg bg-blue-600/40 border border-blue-500/40 text-blue-300 hover:bg-blue-600/60 transition-all">✓</button>
          <button onClick={() => setNaming(false)} className="text-[10px] px-2 py-1 rounded-lg border border-white/10 text-gray-600 hover:text-white transition-all">✕</button>
        </div>
      )}
    </div>
  )
}

export function HeatWaveLayer({ viewer }: { viewer: any }) {
  const { showHeatWave, opacities, focusArea, globalTimeHour, saveScenario } = useLayerStore()
  const { setHeat } = useRiskStore()

  const canvasRef           = useRef<HTMLCanvasElement | null>(null)
  const rafRef              = useRef<number>(0)
  const selectedRef         = useRef<AreaData | null>(null)
  const areasRef            = useRef<AreaData[]>([])
  const windRef             = useRef<WindData>({ speed: 12, dir: 220 })
  const timeHourRef         = useRef<number>(new Date().getHours())
  const projectedSpotsRef   = useRef<{ x: number; y: number; temp: number; pxRad: number; areaName: string }[]>([])
  const polyEntRef          = useRef<any[]>([])
  const labelEntRef         = useRef<any[]>([])
  const intervalRef         = useRef<any>(null)

  const [areas, setAreas]           = useState<AreaData[]>([])
  const [selected, setSelected]     = useState<AreaData | null>(null)
  const [simMode, setSimMode]       = useState(false)
  const [simSliders, setSimSliders] = useState({ tree_cover_pct: 0, water_ha: 0, green_roof_pct: 0, cool_roof_pct: 0 })
  const [simResult, setSimResult]   = useState<SimResult | null>(null)
  const [lastUpdate, setLastUpdate] = useState('')
  const [wind, setWind]   = useState<WindData>({ speed: 12, dir: 220 })
  const [hover, setHover] = useState<HoverInfo | null>(null)

  // Keep refs in sync for RAF access
  useEffect(() => { selectedRef.current = selected }, [selected])
  useEffect(() => { windRef.current = wind }, [wind])
  useEffect(() => { timeHourRef.current = globalTimeHour }, [globalTimeHour])

  // Adjusted areas: base temps shifted by diurnal offset for selected hour
  const adjustedAreas = useMemo(() =>
    areas.map(a => ({ ...a, temp_c: +(a.temp_c + diurnalOffset(globalTimeHour)).toFixed(1) }))
  , [areas, globalTimeHour])
  useEffect(() => { areasRef.current = adjustedAreas }, [adjustedAreas])

  // Sync selected area data when temps change (diurnal slider)
  useEffect(() => {
    setSelected(prev => {
      if (!prev) return null
      return adjustedAreas.find(a => a.name === prev.name) ?? prev
    })
  }, [adjustedAreas])

  // Focus area from left panel — auto-select across layers
  useEffect(() => {
    if (!focusArea) { setSelected(null); return }
    const found = adjustedAreas.find(a => a.name === focusArea)
    if (found) { setSelected(found); setSimMode(false); setSimSliders({ tree_cover_pct: 0, water_ha: 0, green_roof_pct: 0, cool_roof_pct: 0 }) }
  }, [focusArea])  // intentionally omit adjustedAreas — focusArea change is the trigger

  // Publish highest heat risk to city risk store
  useEffect(() => {
    if (!areas.length) return
    const worst = areas.reduce((mx, a) => (a.temp_c > mx.temp_c ? a : mx), areas[0])
    setHeat(worst.risk as any, `${worst.name} ${worst.temp_c}°C`)
  }, [areas, setHeat])

  // ── Fetch areas ─────────────────────────────────────────────────────────────
  const fetchAreas = useCallback(async () => {
    // UHI deltas per area (matches backend climate_service.py AREAS config)
    const UHI: Record<string, number> = {
      'Bordeaux City': 4.0, 'Mérignac': 3.0, 'Pessac': 1.5, 'Talence': 1.0, 'Gradignan': 0.0,
    }

    const [climateRes, weatherRes] = await Promise.allSettled([
      fetch(`${API}/climate/heatwave`, { signal: AbortSignal.timeout(5000) }),
      fetch(
        'https://api.open-meteo.com/v1/forecast' +
        '?latitude=44.8378&longitude=-0.5792' +
        '&current=temperature_2m,relative_humidity_2m,windspeed_10m,winddirection_10m' +
        '&timezone=Europe%2FParis',
        { signal: AbortSignal.timeout(8000) }
      ),
    ])

    // ── 1. Backend is up → use its response ───────────────────────────────
    if (climateRes.status === 'fulfilled' && climateRes.value.ok) {
      const d = await climateRes.value.json()
      setAreas(d.areas?.length ? d.areas : FALLBACK_AREAS)
      setLastUpdate(new Date().toLocaleTimeString('fr-FR') + ' 🟢')

    // ── 2. Backend offline but Open-Meteo responded → compute live temps ──
    } else if (weatherRes.status === 'fulfilled' && weatherRes.value.ok) {
      const w = await weatherRes.value.json()
      const baseTemp: number = w.current?.temperature_2m ?? 28
      const humidity: number = w.current?.relative_humidity_2m ?? 55

      // Heat Index (Steadman) for feels_like
      const feelsLike = (temp: number) => {
        if (temp < 27) return temp
        const T = temp * 9/5 + 32, R = humidity
        const hi = -42.379 + 2.049*T + 10.143*R - 0.225*T*R - 0.00684*T*T
                 - 0.0548*R*R + 0.00123*T*T*R + 0.000853*T*R*R - 0.00000199*T*T*R*R
        return +((hi - 32) * 5/9).toFixed(1)
      }
      const risk = (t: number) =>
        t < 36 ? 'Normal' : t < 39 ? 'Caution' : t < 42 ? 'Danger' : t < 46 ? 'Extreme' : 'Emergency'
      const color = (t: number) =>
        t < 35 ? '#3b82f6' : t < 38 ? '#f59e0b' : t < 41 ? '#f97316' : t < 44 ? '#ef4444' : '#7c3aed'

      const liveAreas = FALLBACK_AREAS.map(a => {
        const temp = +(baseTemp + (UHI[a.name] ?? 0)).toFixed(1)
        return { ...a, temp_c: temp, feels_like_c: feelsLike(temp),
          humidity_pct: humidity, risk: risk(temp), color: color(temp),
          source: 'Open-Meteo (direct)' }
      })
      setAreas(liveAreas)
      setLastUpdate(new Date().toLocaleTimeString('fr-FR') + ' 🟡 live')

    // ── 3. Both failed → static fallback ──────────────────────────────────
    } else {
      setAreas(FALLBACK_AREAS)
      setLastUpdate(new Date().toLocaleTimeString('fr-FR') + ' ⚫ offline')
    }

    // Wind from Open-Meteo regardless of backend status
    if (weatherRes.status === 'fulfilled' && weatherRes.value.ok) {
      const w = await weatherRes.value.json()
      setWind({ speed: w.current?.windspeed_10m ?? 12, dir: w.current?.winddirection_10m ?? 220 })
    }
  }, [])

  useEffect(() => {
    if (!showHeatWave) { clearInterval(intervalRef.current); return }
    fetchAreas()
    intervalRef.current = setInterval(fetchAreas, 300_000)
    return () => clearInterval(intervalRef.current)
  }, [showHeatWave, fetchAreas])

  // ── Canvas heat animation ────────────────────────────────────────────────────
  useEffect(() => {
    if (!viewer || !showHeatWave) { cancelAnimationFrame(rafRef.current); return }
    const Cesium = (window as any).Cesium

    const draw = () => {
      const canvas = canvasRef.current
      const sel    = selectedRef.current
      if (!canvas) { rafRef.current = requestAnimationFrame(draw); return }

      const parent = canvas.parentElement
      if (parent) {
        if (canvas.width  !== parent.clientWidth)  canvas.width  = parent.clientWidth
        if (canvas.height !== parent.clientHeight) canvas.height = parent.clientHeight
      }

      const ctx = canvas.getContext('2d')!
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      const t = performance.now() / 1000
      const w = canvas.width, h = canvas.height
      const allAreas = areasRef.current

      // ── 1. Expanding risk rings — Extreme / Emergency (drawn first) ──────────
      const RING_RGB: Record<string, string> = { Extreme: '239,68,68', Emergency: '124,58,237' }
      allAreas.forEach(area => {
        if (!RING_RGB[area.risk]) return
        let ap: { x: number; y: number } | null = null
        try { ap = viewer.scene.cartesianToCanvasCoordinates(Cesium.Cartesian3.fromDegrees(area.lon, area.lat, 30)) }
        catch { return }
        if (!ap) return
        const rgb = RING_RGB[area.risk]
        for (let ri = 0; ri < 3; ri++) {
          const phase = ((t * 0.45 + ri * 0.333) % 1)
          ctx.beginPath()
          ctx.arc(ap.x, ap.y, 55 + phase * 175, 0, Math.PI * 2)
          ctx.strokeStyle = `rgba(${rgb},${((1 - phase) * 0.5).toFixed(3)})`
          ctx.lineWidth = 2.5 * (1 - phase * 0.8)
          ctx.stroke()
        }
      })

      // ── 2. Gaussian heatmap — screen blending for realistic heat glow ────────
      type ScreenSpot = { x: number; y: number; temp: number; pxRad: number; areaName: string }
      const screenSpots: ScreenSpot[] = []

      allAreas.forEach(area => {
        const spots = HEAT_SPOTS[area.name] ?? []
        let cp: { x: number; y: number } | null = null
        try { cp = viewer.scene.cartesianToCanvasCoordinates(Cesium.Cartesian3.fromDegrees(area.lon, area.lat, 30)) }
        catch {}
        if (cp && cp.x > -300 && cp.x < w + 300 && cp.y > -300 && cp.y < h + 300)
          screenSpots.push({ x: cp.x, y: cp.y, temp: area.temp_c, pxRad: 160, areaName: area.name })

        spots.forEach(s => {
          let sp: { x: number; y: number } | null = null
          try { sp = viewer.scene.cartesianToCanvasCoordinates(Cesium.Cartesian3.fromDegrees(s.lon, s.lat, 30)) }
          catch { return }
          if (!sp || sp.x < -200 || sp.x > w + 200 || sp.y < -200 || sp.y > h + 200) return
          screenSpots.push({ x: sp.x, y: sp.y, temp: area.temp_c + s.delta, pxRad: Math.abs(s.delta) * 14 + 55, areaName: area.name })
        })
      })

      projectedSpotsRef.current = screenSpots

      ctx.globalCompositeOperation = 'screen'
      ;[...screenSpots].sort((a, b) => a.temp - b.temp).forEach(spot => {
        const pulse  = 1 + 0.1 * Math.sin(t * 1.5 + spot.x * 0.031 + spot.y * 0.021)
        const r_px   = spot.pxRad * pulse
        const [r, g, b] = tempToColor(spot.temp)
        const isCenter  = spot.pxRad === 160
        const peakA     = isCenter ? 0.20 : Math.min(0.48, 0.28 + Math.abs(spot.temp - 40) * 0.05)
        const grad = ctx.createRadialGradient(spot.x, spot.y, 0, spot.x, spot.y, r_px)
        grad.addColorStop(0,    `rgba(${r},${g},${b},${peakA.toFixed(3)})`)
        grad.addColorStop(0.45, `rgba(${r},${g},${b},${(peakA * 0.4).toFixed(3)})`)
        grad.addColorStop(1,    `rgba(${r},${g},${b},0)`)
        ctx.fillStyle = grad
        ctx.fillRect(0, 0, w, h)
      })
      ctx.globalCompositeOperation = 'source-over'

      // ── 3. Wind arrows at area centers ──────────────────────────────────────
      const { speed: wSpeed, dir: wDir } = windRef.current
      if (wSpeed > 0.5 && allAreas.length > 0) {
        const toRad = ((wDir + 180) % 360) * Math.PI / 180
        const sinD = Math.sin(toRad), cosD = -Math.cos(toRad)
        allAreas.forEach(area => {
          let ap: { x: number; y: number } | null = null
          try { ap = viewer.scene.cartesianToCanvasCoordinates(Cesium.Cartesian3.fromDegrees(area.lon, area.lat, 80)) }
          catch { return }
          if (!ap) return
          const arrowLen = Math.min(55, wSpeed * 3.5)
          // Animated flowing dots along wind direction
          for (let i = 0; i < 4; i++) {
            const phase = ((t * 0.7 + i * 0.25) % 1)
            ctx.beginPath()
            ctx.arc(ap.x + sinD * arrowLen * phase, ap.y + cosD * arrowLen * phase, 2.5, 0, Math.PI * 2)
            ctx.fillStyle = `rgba(147,197,253,${(0.75 * (1 - phase)).toFixed(2)})`
            ctx.fill()
          }
          // Arrowhead at tip
          if (arrowLen > 8) {
            const ex = ap.x + sinD * arrowLen, ey = ap.y + cosD * arrowLen
            const hl = Math.min(10, arrowLen * 0.28)
            const px = cosD * hl * 0.5, py = -sinD * hl * 0.5
            ctx.beginPath()
            ctx.moveTo(ex, ey)
            ctx.lineTo(ex - sinD * hl + px, ey - cosD * hl + py)
            ctx.lineTo(ex - sinD * hl - px, ey - cosD * hl - py)
            ctx.closePath()
            ctx.fillStyle = 'rgba(147,197,253,0.75)'
            ctx.fill()
          }
        })
      }

      // ── 4. Selected-area detailed clipped animation ──────────────────────────
      if (!sel) { rafRef.current = requestAnimationFrame(draw); return }
      const poly = AREA_POLYGONS[sel.name]
      if (!poly) { rafRef.current = requestAnimationFrame(draw); return }

      const pts = poly.map(([lon, lat]) => {
        try { return viewer.scene.cartesianToCanvasCoordinates(Cesium.Cartesian3.fromDegrees(lon, lat, 30)) }
        catch { return null }
      }).filter(Boolean) as { x: number; y: number }[]
      if (pts.length < 3) { rafRef.current = requestAnimationFrame(draw); return }

      const [br, bg, bb] = hexToRgb(sel.color)
      ctx.save()
      ctx.beginPath()
      ctx.moveTo(pts[0].x, pts[0].y)
      pts.slice(1).forEach(p => ctx.lineTo(p.x, p.y))
      ctx.closePath()
      ctx.clip()

      ctx.fillStyle = `rgba(${br},${bg},${bb},0.14)`
      ctx.fillRect(0, 0, w, h)

      const bandH = h * 0.18
      const scroll = (t * 28) % (bandH * 2)
      for (let by = -bandH * 2 + scroll; by < h + bandH; by += bandH * 2) {
        const bAlpha = 0.07 + Math.sin(t * 0.9 + by * 0.005) * 0.025
        const bGrad = ctx.createLinearGradient(0, by, 0, by + bandH)
        bGrad.addColorStop(0,   'rgba(255,160,20,0)')
        bGrad.addColorStop(0.5, `rgba(255,160,20,${bAlpha.toFixed(3)})`)
        bGrad.addColorStop(1,   'rgba(255,160,20,0)')
        ctx.fillStyle = bGrad
        ctx.fillRect(0, by, w, bandH)
      }

      const spots = HEAT_SPOTS[sel.name] ?? []
      spots.forEach(spot => {
        let sp: { x: number; y: number } | null = null
        try { sp = viewer.scene.cartesianToCanvasCoordinates(Cesium.Cartesian3.fromDegrees(spot.lon, spot.lat, 30)) }
        catch { return }
        if (!sp) return
        const pulse = 1 + Math.sin(t * 1.3 + spot.lon * 7) * 0.13
        const pxRad = (Math.abs(spot.delta) * 32 + 85) * pulse
        const grad  = ctx.createRadialGradient(sp.x, sp.y, 0, sp.x, sp.y, pxRad)
        if (spot.delta >= 3.5) {
          grad.addColorStop(0,    'rgba(124,58,237,0.75)')
          grad.addColorStop(0.25, 'rgba(239,68,68,0.60)')
          grad.addColorStop(0.6,  'rgba(249,115,22,0.30)')
          grad.addColorStop(1,    'rgba(249,115,22,0)')
        } else if (spot.delta >= 2) {
          grad.addColorStop(0,   'rgba(239,68,68,0.65)')
          grad.addColorStop(0.4, 'rgba(249,115,22,0.40)')
          grad.addColorStop(0.8, 'rgba(250,204,21,0.15)')
          grad.addColorStop(1,   'rgba(250,204,21,0)')
        } else if (spot.delta > 0) {
          grad.addColorStop(0,   'rgba(249,115,22,0.50)')
          grad.addColorStop(0.5, 'rgba(250,204,21,0.25)')
          grad.addColorStop(1,   'rgba(250,204,21,0)')
        } else if (spot.delta <= -3) {
          grad.addColorStop(0,    'rgba(34,211,238,0.70)')
          grad.addColorStop(0.35, 'rgba(74,222,128,0.45)')
          grad.addColorStop(0.7,  'rgba(74,222,128,0.18)')
          grad.addColorStop(1,    'rgba(74,222,128,0)')
        } else {
          grad.addColorStop(0,   'rgba(74,222,128,0.55)')
          grad.addColorStop(0.5, 'rgba(34,211,238,0.25)')
          grad.addColorStop(1,   'rgba(34,211,238,0)')
        }
        ctx.fillStyle = grad
        ctx.fillRect(0, 0, w, h)
      })

      const waveAlpha = 0.04 + Math.sin(t * 0.7) * 0.02
      const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length
      const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length
      const maxR  = Math.max(...pts.map(p => Math.hypot(p.x - cx, p.y - cy))) * 1.2
      const wGrad = ctx.createRadialGradient(cx, cy, maxR * 0.2, cx, cy, maxR)
      wGrad.addColorStop(0,   `rgba(${br},${bg},${bb},0)`)
      wGrad.addColorStop(0.6, `rgba(${br},${bg},${bb},${waveAlpha.toFixed(3)})`)
      wGrad.addColorStop(1,   `rgba(${br},${bg},${bb},${(waveAlpha * 1.5).toFixed(3)})`)
      ctx.fillStyle = wGrad
      ctx.fillRect(0, 0, w, h)
      ctx.restore()

      const glow = 0.55 + Math.sin(t * 1.8) * 0.25
      const gHex = Math.round(glow * 255).toString(16).padStart(2, '0')
      ctx.save()
      ctx.beginPath()
      ctx.moveTo(pts[0].x, pts[0].y)
      pts.slice(1).forEach(p => ctx.lineTo(p.x, p.y))
      ctx.closePath()
      ctx.shadowColor = sel.color
      ctx.shadowBlur  = 18
      ctx.strokeStyle = `${sel.color}${gHex}`
      ctx.lineWidth   = 3
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

    if (!showHeatWave || !adjustedAreas.length) return

    adjustedAreas.forEach(area => {
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
  }, [viewer, showHeatWave, adjustedAreas])

  // ── Hover temperature probe ──────────────────────────────────────────────────
  useEffect(() => {
    if (!viewer || !showHeatWave) { setHover(null); return }
    const container = viewer.container as HTMLElement
    const onMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect()
      const mx = e.clientX - rect.left, my = e.clientY - rect.top
      const spots = projectedSpotsRef.current
      if (!spots.length) { setHover(null); return }
      let tempSum = 0, weightSum = 0, nearestArea = '', nearestD = Infinity
      spots.forEach(s => {
        const dx = mx - s.x, dy = my - s.y
        const sigma = s.pxRad * 0.5
        const w = Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma))
        tempSum += s.temp * w
        weightSum += w
        const d2 = dx * dx + dy * dy
        if (d2 < nearestD) { nearestD = d2; nearestArea = s.areaName }
      })
      if (weightSum < 0.002) { setHover(null); return }
      const temp = +(tempSum / weightSum).toFixed(1)
      setHover({ x: mx, y: my, temp, risk: getRisk(temp), areaName: nearestArea })
    }
    const onLeave = () => setHover(null)
    container.addEventListener('mousemove', onMove)
    container.addEventListener('mouseleave', onLeave)
    return () => { container.removeEventListener('mousemove', onMove); container.removeEventListener('mouseleave', onLeave) }
  }, [viewer, showHeatWave])

  // ── Full cleanup on layer off ────────────────────────────────────────────────
  useEffect(() => {
    if (!showHeatWave && viewer) {
      cancelAnimationFrame(rafRef.current)
      polyEntRef.current.forEach(e => viewer.entities.remove(e))
      labelEntRef.current.forEach(e => viewer.entities.remove(e))
      polyEntRef.current = []; labelEntRef.current = []
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
      {/* ── Full-screen canvas ── */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ zIndex: 10, opacity: opacities.showHeatWave / 100 }}
      />

      {/* ── Hover temperature tooltip ── */}
      {hover && (
        <div
          className="absolute z-30 pointer-events-none"
          style={{ left: hover.x + 14, top: hover.y - 20 }}
        >
          <div className="bg-gray-950/95 backdrop-blur-sm border border-white/15 rounded-xl px-3 py-2 shadow-2xl">
            <div className="text-[9px] text-gray-500 mb-0.5">{hover.areaName}</div>
            <div className="text-base font-black leading-none" style={{ color: RISK_COLORS[hover.risk] }}>
              {hover.temp}°C
            </div>
            <div className="text-[9px] font-bold mt-0.5" style={{ color: RISK_COLORS[hover.risk] }}>
              {hover.risk}
            </div>
          </div>
        </div>
      )}

      {/* ── Bottom area cards ── */}
      {!selected && (
        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-2">
          <div className="text-[10px] text-gray-500 text-center">Click area · hover map to probe · use panel for timeline</div>

          {/* Area cards — show adjusted temps */}
          <div className="flex gap-2">
            {adjustedAreas.map(a => (
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

          {/* Color legend + wind + last update */}
          <div className="flex items-center gap-1.5 bg-gray-950/85 backdrop-blur px-3 py-1.5 rounded-xl border border-white/10 flex-wrap justify-center">
            {([['#22d3ee','<38°C'],['#4ade80','39°C'],['#facc15','41°C'],['#f97316','42°C'],['#ef4444','44°C'],['#7c3aed','45+°C']] as const).map(([c,l]) => (
              <div key={l} className="flex items-center gap-1">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c }} />
                <span className="text-[9px] text-gray-500">{l}</span>
              </div>
            ))}
            {wind.speed > 0.5 && (
              <span className="text-[9px] text-blue-400 ml-1 border-l border-white/10 pl-1.5">
                💨 {wind.speed.toFixed(0)} km/h {windDirName(wind.dir)}
              </span>
            )}
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
                    <SaveScenarioButton
                      area={selected.name}
                      sliders={simSliders}
                      predictedTemp={simResult.predicted_temp_c}
                      onSave={saveScenario}
                    />
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
