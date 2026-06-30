/**
 * StreetHeatLayer — Georeferenced street-level thermal network
 * Full Bordeaux Métropole coverage: 5 communes, ~44 K road segments.
 *
 * Temperature per segment:
 *   1. Open-Meteo live air temp (20-pt IDW grid)
 *   2. Road-type surface delta  (motorway +8.2 °C → residential +3.0 °C)
 *   3. UHI zone correction      (city centre +4 °C, Gradignan 0 °C)
 *   4. Vegetation cooling       (park proximity, NDVI proxy from paper)
 *   5. Time-of-day factor       (peak 14:00, trough ~02:00)
 *   6. Seeded spatial noise     (±0.6 °C stable per-road variation)
 *
 * No floating UI — all stats/history written to streetHeatStore and displayed in RightPanel.
 */

import { useEffect, useRef, useCallback } from 'react'
import { useLayerStore } from '../../store/layerStore'
import { useMapControlStore } from '../../store/mapControlStore'
import { useStreetHeatStore } from '../../store/streetHeatStore'

// ── Open-Meteo 20-point grid ─────────────────────────────────────────────────
const GRID_LATS = [44.67, 44.73, 44.79, 44.85, 44.91]
const GRID_LONS = [-0.77, -0.66, -0.55, -0.44]
const GRID_PTS  = GRID_LATS.flatMap(lat => GRID_LONS.map(lon => ({ lat, lon })))

// Bordeaux city center for historical/forecast API calls
const BDX_LAT = 44.84, BDX_LON = -0.58

// ── Area display name → file key ──────────────────────────────────────────────
const AREA_MAP: Record<string, string> = {
  'Bordeaux City': 'bordeaux-city',
  'Mérignac':      'merignac',
  'Pessac':        'pessac',
  'Talence':       'talence',
  'Gradignan':     'gradignan',
}

const AREA_FILES: Record<string, string> = {
  'bordeaux-city': '/data/roads/bordeaux-city.geojson',
  'merignac':      '/data/roads/merignac.geojson',
  'pessac':        '/data/roads/pessac.geojson',
  'talence':       '/data/roads/talence.geojson',
  'gradignan':     '/data/roads/gradignan.geojson',
}

// ── Road types to render ──────────────────────────────────────────────────────
const RENDER_HW = new Set([
  'motorway', 'trunk', 'motorway_link', 'trunk_link',
  'primary',  'primary_link',
  'secondary','secondary_link',
  'tertiary', 'tertiary_link',
  'residential',
])

const ROAD_DELTA: Record<string, number> = {
  motorway: 8.2,  trunk: 7.6,  motorway_link: 7.0,  trunk_link: 6.4,
  primary: 6.2,   primary_link: 5.6,
  secondary: 5.1, secondary_link: 4.5,
  tertiary: 4.2,  tertiary_link: 3.7,
  residential: 3.0,
}
const FALLBACK_DELTA = 3.5

const ROAD_WIDTH: Record<string, number> = {
  motorway: 7.0,  trunk: 6.5,  motorway_link: 4.5,  trunk_link: 4.0,
  primary: 5.0,   primary_link: 3.5,
  secondary: 3.8, secondary_link: 3.2,
  tertiary: 2.8,  tertiary_link: 2.4,
  residential: 1.8,
}
const FALLBACK_WIDTH = 1.5

// ── Bordeaux parks — vegetation cooling ──────────────────────────────────────
const PARKS = [
  { lon: -0.5952, lat: 44.8434, cool: 2.8, rad: 0.009 },
  { lon: -0.5712, lat: 44.8267, cool: 2.2, rad: 0.006 },
  { lon: -0.5690, lat: 44.8190, cool: 1.8, rad: 0.004 },
  { lon: -0.5728, lat: 44.8325, cool: 1.5, rad: 0.005 },
  { lon: -0.5560, lat: 44.8455, cool: 1.6, rad: 0.006 },
  { lon: -0.5820, lat: 44.8150, cool: 1.5, rad: 0.007 },
  { lon: -0.6160, lat: 44.8060, cool: 2.5, rad: 0.013 },
  { lon: -0.6900, lat: 44.8330, cool: 2.0, rad: 0.011 },
  { lon: -0.6160, lat: 44.7720, cool: 3.2, rad: 0.020 },
  { lon: -0.5800, lat: 44.8480, cool: 1.3, rad: 0.005 },
]

// ── UHI zones ─────────────────────────────────────────────────────────────────
const UHI = [
  { cx: -0.5792, cy: 44.8378, d: 4.0, r: 0.038 },
  { cx: -0.6850, cy: 44.8330, d: 3.0, r: 0.028 },
  { cx: -0.6150, cy: 44.8060, d: 1.5, r: 0.022 },
  { cx: -0.5890, cy: 44.8080, d: 1.0, r: 0.020 },
  { cx: -0.6160, cy: 44.7720, d: 0.0, r: 0.020 },
]

// ── Paper RdYlBu colormap ─────────────────────────────────────────────────────
const RAMP: [number, [number, number, number]][] = [
  [22, [49,  54, 149]], [26, [69, 117, 180]], [29, [116, 173, 209]],
  [32, [171, 217, 233]], [35, [224, 243, 248]], [37, [255, 255, 191]],
  [39, [254, 224, 144]], [41, [253, 174,  97]], [43, [244, 109,  67]],
  [46, [215,  48,  39]], [50, [165,   0,  38]], [56, [103,   0,  31]],
]

function tempToRgba(t: number, alpha = 0.93): [number, number, number, number] {
  for (let i = 1; i < RAMP.length; i++) {
    const [t0, [r0, g0, b0]] = RAMP[i - 1]
    const [t1, [r1, g1, b1]] = RAMP[i]
    if (t <= t1) {
      const f = Math.min(1, Math.max(0, (t - t0) / (t1 - t0)))
      return [(r0+(r1-r0)*f)/255, (g0+(g1-g0)*f)/255, (b0+(b1-b0)*f)/255, alpha]
    }
  }
  const [r, g, b] = RAMP[RAMP.length-1][1]
  return [r/255, g/255, b/255, alpha]
}

// ── Spatial helpers ───────────────────────────────────────────────────────────
function dist2(lon: number, lat: number, cx: number, cy: number): number {
  const cos = Math.cos(lat * Math.PI / 180)
  return (lon-cx)*(lon-cx)*cos*cos + (lat-cy)*(lat-cy)
}

function idwTemp(lon: number, lat: number, grid: {lat:number;lon:number;temp:number}[]): number {
  let ws = 0, ts = 0
  for (const p of grid) {
    const d2 = dist2(lon, lat, p.lon, p.lat)
    if (d2 < 1e-9) return p.temp
    const w = 1/d2; ws += w; ts += p.temp*w
  }
  return ws > 0 ? ts/ws : 28
}

function getUHI(lon: number, lat: number): number {
  let best = 0
  for (const z of UHI) {
    const d = Math.sqrt(dist2(lon, lat, z.cx, z.cy))
    if (d < z.r) best = Math.max(best, z.d*(1-d/z.r))
  }
  return best
}

function getParkCooling(lon: number, lat: number): number {
  let cool = 0
  for (const p of PARKS) {
    const d = Math.sqrt(dist2(lon, lat, p.lon, p.lat))
    if (d < p.rad) cool = Math.max(cool, p.cool*(1-d/p.rad))
  }
  return cool
}

function seededNoise(lon: number, lat: number): number {
  const x = Math.sin(lon*127.1 + lat*311.7)*43758.5453
  return (x-Math.floor(x))*1.2-0.6
}

function timeOfDayFactor(): number {
  const h = new Date().getHours() + new Date().getMinutes()/60
  return Math.max(0.12, 0.55+0.45*Math.cos((h-14)*2*Math.PI/24))
}

function computeRoadTemp(lon: number, lat: number, hw: string, grid: {lat:number;lon:number;temp:number}[]): number {
  const base  = idwTemp(lon, lat, grid)
  const delta = (ROAD_DELTA[hw] ?? FALLBACK_DELTA)*timeOfDayFactor()
  return +(base+delta+getUHI(lon,lat)-getParkCooling(lon,lat)+seededNoise(lon,lat)).toFixed(2)
}

// ── Parsed road record ────────────────────────────────────────────────────────
interface ParsedRoad {
  coords: [number,number][]
  midLon: number; midLat: number
  hw: string; width: number
}

const _areaCache: Record<string, ParsedRoad[]> = {}

async function loadAreaRoads(key: string): Promise<ParsedRoad[]> {
  if (_areaCache[key]) return _areaCache[key]
  const path = AREA_FILES[key]
  if (!path) return []
  const res = await fetch(path)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data: any = await res.json()
  const roads: ParsedRoad[] = []
  for (const feat of (data.features ?? [])) {
    const hw: string = feat?.properties?.highway ?? ''
    if (!RENDER_HW.has(hw)) continue
    const geom = feat?.geometry
    if (!geom) continue
    const sets: number[][][] =
      geom.type === 'LineString'      ? [geom.coordinates]  :
      geom.type === 'MultiLineString' ? geom.coordinates    : []
    for (const coords of sets) {
      if (coords.length < 2) continue
      const mid = coords[Math.floor(coords.length/2)]
      roads.push({ coords: coords as [number,number][], midLon: mid[0], midLat: mid[1], hw, width: ROAD_WIDTH[hw] ?? FALLBACK_WIDTH })
    }
  }
  _areaCache[key] = roads
  return roads
}

// ── Date helpers ──────────────────────────────────────────────────────────────
function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function dateOffset(days: number): Date {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d
}

// ── Historical + forecast fetch ───────────────────────────────────────────────
async function fetchHistoricalAndForecast(store: ReturnType<typeof useStreetHeatStore.getState>) {
  const { setHistorical, setForecast, setAnomaly } = store

  // ── 1. Historical last 30 days ──
  const endDate   = fmtDate(dateOffset(-1))
  const startDate = fmtDate(dateOffset(-30))
  // Same window last year for anomaly
  const endLY   = fmtDate(new Date(new Date(endDate).setFullYear(new Date(endDate).getFullYear()-1)))
  const startLY = fmtDate(new Date(new Date(startDate).setFullYear(new Date(startDate).getFullYear()-1)))

  try {
    const [histRes, lyRes, fcRes] = await Promise.all([
      fetch(
        `https://archive-api.open-meteo.com/v1/archive?latitude=${BDX_LAT}&longitude=${BDX_LON}` +
        `&start_date=${startDate}&end_date=${endDate}` +
        `&daily=temperature_2m_max,temperature_2m_min,temperature_2m_mean&timezone=Europe%2FParis`,
        { signal: AbortSignal.timeout(15000) }
      ),
      fetch(
        `https://archive-api.open-meteo.com/v1/archive?latitude=${BDX_LAT}&longitude=${BDX_LON}` +
        `&start_date=${startLY}&end_date=${endLY}` +
        `&daily=temperature_2m_mean&timezone=Europe%2FParis`,
        { signal: AbortSignal.timeout(15000) }
      ),
      fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${BDX_LAT}&longitude=${BDX_LON}` +
        `&daily=temperature_2m_max,temperature_2m_min,weathercode&forecast_days=7&timezone=Europe%2FParis`,
        { signal: AbortSignal.timeout(12000) }
      ),
    ])

    if (histRes.ok) {
      const h = await histRes.json()
      const dates: string[] = h.daily?.time ?? []
      const means: number[] = h.daily?.temperature_2m_mean ?? []
      const maxs: number[]  = h.daily?.temperature_2m_max  ?? []
      const mins: number[]  = h.daily?.temperature_2m_min  ?? []
      setHistorical(dates.map((date, i) => ({
        date, mean: means[i] ?? 0, max: maxs[i] ?? 0, min: mins[i] ?? 0,
      })))

      // anomaly: this 7-day mean vs same period last year
      if (lyRes.ok) {
        const ly = await lyRes.json()
        const lyMeans: number[] = ly.daily?.temperature_2m_mean ?? []
        const recentMean = means.slice(-7).reduce((a, b) => a+b, 0) / Math.min(7, means.length)
        const lyMean     = lyMeans.slice(-7).reduce((a, b) => a+b, 0) / Math.min(7, lyMeans.length)
        setAnomaly(+(recentMean-lyMean).toFixed(1))
      }
    }

    if (fcRes.ok) {
      const fc = await fcRes.json()
      const dates: string[] = fc.daily?.time ?? []
      const maxs: number[]  = fc.daily?.temperature_2m_max  ?? []
      const mins: number[]  = fc.daily?.temperature_2m_min  ?? []
      const codes: number[] = fc.daily?.weathercode ?? []
      setForecast(dates.map((date, i) => ({
        date, max: maxs[i] ?? 0, min: mins[i] ?? 0, code: codes[i] ?? 0,
      })))
    }
  } catch (e) {
    console.warn('[StreetHeat] historical/forecast fetch failed:', e)
  }
}

// ── Component ─────────────────────────────────────────────────────────────────
export function StreetHeatLayer({ viewer }: { viewer: any }) {
  const { showStreetHeat } = useLayerStore()
  const { selectedAreas }  = useMapControlStore()
  const store              = useStreetHeatStore()

  const primitiveRef = useRef<any>(null)
  const gridRef      = useRef<{lat:number;lon:number;temp:number}[]>([])
  const roadsRef     = useRef<ParsedRoad[]>([])

  // ── Fetch live grid ──────────────────────────────────────────────────────────
  const fetchGrid = useCallback(async () => {
    try {
      const lats = GRID_PTS.map(p => p.lat).join(',')
      const lons = GRID_PTS.map(p => p.lon).join(',')
      const res  = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}` +
        `&current=temperature_2m&timezone=Europe%2FParis`,
        { signal: AbortSignal.timeout(12000) }
      )
      const data = await res.json()
      const arr  = Array.isArray(data) ? data : [data]
      gridRef.current = arr.map((d: any, i: number) => ({
        lat: GRID_PTS[i].lat, lon: GRID_PTS[i].lon,
        temp: d.current?.temperature_2m ?? 28,
      }))
      store.setStatus('live')
      store.setUpdatedAt(new Date().toLocaleTimeString('fr-FR', {hour:'2-digit', minute:'2-digit'}))
    } catch {
      gridRef.current = GRID_PTS.map(p => ({
        lat: p.lat, lon: p.lon,
        temp: 30+(44.87-p.lat)*5+(p.lon+0.61)*2.5,
      }))
      store.setStatus('offline')
    }
  }, [store])

  // ── Build GroundPolylinePrimitive ────────────────────────────────────────────
  const buildPrimitive = useCallback((alive: () => boolean) => {
    if (!viewer) return
    const Cesium = (window as any).Cesium
    const roads  = roadsRef.current
    if (roads.length === 0) return

    if (primitiveRef.current) {
      try { if (!primitiveRef.current.isDestroyed()) viewer.scene.primitives.remove(primitiveRef.current) } catch {}
      primitiveRef.current = null
    }

    if (!alive()) return
    store.setProgress('Building thermal network…')

    const instances: any[] = []
    let mn = 999, mx = -999, sm = 0

    for (const road of roads) {
      const t    = computeRoadTemp(road.midLon, road.midLat, road.hw, gridRef.current)
      const rgba = tempToRgba(t)
      instances.push(new Cesium.GeometryInstance({
        geometry: new Cesium.GroundPolylineGeometry({
          positions: road.coords.map(([ln,lt]) => Cesium.Cartesian3.fromDegrees(ln, lt)),
          width: road.width,
        }),
        attributes: { color: new Cesium.ColorGeometryInstanceAttribute(...rgba) },
      }))
      mn = Math.min(mn, t); mx = Math.max(mx, t); sm += t
    }

    if (!alive()) return

    try {
      const prim = new Cesium.GroundPolylinePrimitive({
        geometryInstances: instances,
        appearance: new Cesium.PolylineColorAppearance(),
        asynchronous: true,
      })
      viewer.scene.primitives.add(prim)
      primitiveRef.current = prim
    } catch (e) {
      console.error('[StreetHeat] Primitive creation failed:', e)
    }

    store.setProgress('')
    const count = roads.length
    store.setStats({ min: +mn.toFixed(1), max: +mx.toFixed(1), mean: +(sm/count).toFixed(1), count })
  }, [viewer, store])

  // ── Main effect ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!viewer || !showStreetHeat) {
      if (primitiveRef.current) {
        try { if (!primitiveRef.current.isDestroyed()) viewer?.scene?.primitives?.remove(primitiveRef.current) } catch {}
        primitiveRef.current = null
      }
      roadsRef.current = []
      store.setStats(null)
      store.setProgress('')
      store.setStatus('idle')
      return
    }

    store.setStatus('loading')
    store.setProgress('Loading road network…')

    let isAlive = true
    const alive = () => isAlive

    ;(async () => {
      // Fetch live grid
      await fetchGrid()
      if (!alive()) return

      // Load only selected areas
      const keys = selectedAreas
        .map(a => AREA_MAP[a])
        .filter(Boolean)
      if (keys.length === 0) {
        store.setProgress('No areas selected')
        return
      }

      store.setProgress(`Loading ${keys.length} area(s)…`)
      const results = await Promise.all(
        keys.map(k => loadAreaRoads(k).catch(e => { console.warn(`[StreetHeat] ${k}:`, e); return [] as ParsedRoad[] }))
      )
      if (!alive()) return

      roadsRef.current = results.flat()
      store.setProgress(`${roadsRef.current.length.toLocaleString()} roads — building GPU primitive…`)

      buildPrimitive(alive)

      // Fetch historical + forecast (non-blocking)
      fetchHistoricalAndForecast(useStreetHeatStore.getState())
    })()

    // Refresh temps every 30 min
    const iv = setInterval(async () => {
      if (!isAlive || roadsRef.current.length === 0) return
      await fetchGrid()
      buildPrimitive(alive)
    }, 30*60*1000)

    return () => {
      isAlive = false
      clearInterval(iv)
      if (primitiveRef.current) {
        try { if (!primitiveRef.current.isDestroyed()) viewer?.scene?.primitives?.remove(primitiveRef.current) } catch {}
        primitiveRef.current = null
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewer, showStreetHeat, selectedAreas.join(',')])

  return null
}
