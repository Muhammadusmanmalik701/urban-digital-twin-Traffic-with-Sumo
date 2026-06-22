import { useEffect, useRef, useState, useCallback } from 'react'
// Cesium loaded via CDN (sync script in index.html head) — window.Cesium is defined before this module runs
const {
  Viewer,
  Ion,
  Cartesian3,
  Cartesian2,
  Color,
  ColorBlendMode,
  HeightReference,
  NearFarScalar,
  Math: CesiumMath,
  PolylineGlowMaterialProperty,
  PolylineDashMaterialProperty,
  VerticalOrigin,
  HorizontalOrigin,
  LabelStyle,
  createWorldTerrainAsync,
  Cesium3DTileset,
  ConstantPositionProperty,
  ConstantProperty,
  CzmlDataSource,
  SampledPositionProperty,
  LinearApproximation,
  ExtrapolationType,
  JulianDate,
  ClockRange,
  SceneMode,
  EllipsoidTerrainProvider,
  Transforms,
  HeadingPitchRoll,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  Cartographic,
  UrlTemplateImageryProvider,
} = (window as any).Cesium
import { useSimulationStore } from '../../store/simulationStore'
import { useBuildingStore } from '../../store/buildingStore'
import { useLayerStore } from '../../store/layerStore'
import { useMapControlStore } from '../../store/mapControlStore'
import { api } from '../../services/api'

export const AREAS: Record<string, { lon: number; lat: number; height: number; osmName: string; icon: string }> = {
  'Pessac':        { lon: -0.6150, lat: 44.8060, height: 1600, osmName: 'Pessac',    icon: '🏘️' },
  'Talence':       { lon: -0.5890, lat: 44.8080, height: 1600, osmName: 'Talence',   icon: '🎓' },
  'Mérignac':      { lon: -0.6850, lat: 44.8330, height: 1600, osmName: 'Mérignac',  icon: '✈️' },
  'Bordeaux City': { lon: -0.5792, lat: 44.8378, height: 2000, osmName: 'Bordeaux',  icon: '🏛️' },
  'Gradignan':     { lon: -0.6160, lat: 44.7720, height: 1600, osmName: 'Gradignan', icon: '🌲' },
}

type RoadType = 'major' | 'primary' | 'secondary' | 'local' | 'tram' | 'rail'

const ROAD_STYLES: Record<RoadType, { color: string; width: number; glow: number }> = {
  major:     { color: '#ef4444', width: 13,  glow: 0.2 },
  primary:   { color: '#f97316', width: 11,  glow: 0.2 },
  secondary: { color: '#eab308', width: 8.5, glow: 0.15 },
  local:     { color: '#9ca3af', width: 5.5, glow: 0.1 },
  tram:      { color: '#c026d3', width: 10,  glow: 0.2 },
  rail:      { color: '#1e40af', width: 8,   glow: 0.15 },
}

const VEHICLE_COLORS: Record<string, string> = {
  passenger_car: '#60a5fa', motorcycle: '#f472b6', bus: '#34d399',
  truck: '#fb923c', emergency: '#ef4444', autonomous_ev: '#a78bfa', bicycle: '#fbbf24',
}

function getRoadType(tags: Record<string, string>, railway?: string): RoadType {
  if (railway === 'tram') return 'tram'
  if (railway === 'rail') return 'rail'
  const hw = tags?.highway || ''
  if (['motorway', 'trunk'].includes(hw)) return 'major'
  if (hw === 'primary') return 'primary'
  if (['secondary', 'tertiary'].includes(hw)) return 'secondary'
  return 'local'
}

const OVERPASS_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
]

async function overpassFetch(query: string): Promise<any> {
  let lastErr: Error = new Error('No mirrors')
  for (const url of OVERPASS_MIRRORS) {
    try {
      const r = await fetch(url, {
        method: 'POST', body: query,
        headers: { 'Content-Type': 'text/plain' },
        signal: AbortSignal.timeout(60_000),
      })
      if (r.status === 429 || r.status === 504) { lastErr = new Error(`HTTP ${r.status} from ${url}`); continue }
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return r.json()
    } catch (e) {
      lastErr = e as Error
    }
  }
  throw lastErr
}

// Roads only — triggered by "Load Road Network" button
async function fetchAreaData(osmName: string) {
  return overpassFetch(`[out:json][timeout:55];
area["name"="${osmName}"]["admin_level"=8]->.s;
(
  way["highway"](area.s);
  way["railway"="tram"](area.s);
  way["railway"="rail"](area.s);
);
out geom;`)
}

// Admin boundary only — small Overpass query (just 1 relation)
async function fetchBoundary(osmName: string) {
  return overpassFetch(`[out:json][timeout:30];
relation["name"="${osmName}"]["admin_level"=8];
out geom;`)
}

// Buildings from pre-fetched local file, fallback to BDTOPO WFS
const AREA_BBOXES: Record<string, [number,number,number,number]> = {
  'Bordeaux':  [-0.600, 44.828, -0.558, 44.850],
  'Pessac':    [-0.636, 44.796, -0.596, 44.816],
  'Talence':   [-0.605, 44.798, -0.570, 44.820],
  'Mérignac':  [-0.706, 44.825, -0.666, 44.845],
  'Gradignan': [-0.634, 44.762, -0.594, 44.782],
}
const AREA_FILE: Record<string, string> = {
  'Bordeaux':  '/data/buildings/bordeaux-city.geojson',
  'Pessac':    '/data/buildings/pessac.geojson',
  'Talence':   '/data/buildings/talence.geojson',
  'Mérignac':  '/data/buildings/merignac.geojson',
  'Gradignan': '/data/buildings/gradignan.geojson',
}

async function fetchBuildings(osmName: string): Promise<any> {
  // 1) Try local pre-fetched file (fast, no timeouts)
  const localPath = AREA_FILE[osmName]
  if (localPath) {
    try {
      const r = await fetch(localPath)
      if (r.ok) return r.json()
    } catch { /* fall through to WFS */ }
  }
  // 2) Live BDTOPO WFS — French government, free, real heights, no API key
  const bbox = AREA_BBOXES[osmName]
  if (!bbox) throw new Error(`No bbox for ${osmName}`)
  const [west, south, east, north] = bbox
  const params = new URLSearchParams({
    SERVICE: 'WFS', VERSION: '2.0.0', REQUEST: 'GetFeature',
    TYPENAMES: 'BDTOPO_V3:batiment',
    BBOX: `${west},${south},${east},${north},EPSG:4326`,
    OUTPUTFORMAT: 'application/json',
    COUNT: '5000',
  })
  const r = await fetch(`https://data.geopf.fr/wfs/ows?${params}`, {
    signal: AbortSignal.timeout(60_000),
  })
  if (!r.ok) throw new Error(`BDTOPO HTTP ${r.status}`)
  return r.json()
}


const roadTypeMap    = new WeakMap<object, RoadType>()
const vehicleAngleMap = new WeakMap<object, number>()

// ─── Static CZML sim state ─────────────────────────────────────────────────────
interface SimState {
  loaded: boolean; playing: boolean; speed: number; timeStr: string; is3D: boolean
}

// ─── Live SUMO state ───────────────────────────────────────────────────────────
type LiveState = 'idle' | 'connecting' | 'waiting' | 'running' | 'error' | 'stopped'

// Fly to altitude where OSM 3D tile buildings become visible (LOD requires < ~2000m)
function flyToBuildingView(viewer: any) {
  if (!viewer) return
  const currentHeight = viewer.camera.positionCartographic?.height ?? 99999
  if (currentHeight <= 2000) return  // already close enough
  const pitchRad = CesiumMath.toRadians(-50)
  const targetLon = -0.5792
  const targetLat = 44.8378
  const targetHeight = 1200
  const latOffset = (targetHeight * Math.tan(Math.abs(pitchRad))) / 111320
  viewer.camera.flyTo({
    destination: Cartesian3.fromDegrees(targetLon, targetLat - latOffset, targetHeight),
    orientation: { heading: 0, pitch: pitchRad, roll: 0 },
    duration: 2.5,
  })
}

// SUMO angle → Cesium orientation (SUMO CW-from-North, Cesium CW-from-East → +90° offset)
function sumoAngleToOrientation(lon: number, lat: number, angleDeg: number) {
  const pos = Cartesian3.fromDegrees(lon, lat, 0)
  const hpr = new HeadingPitchRoll(CesiumMath.toRadians(angleDeg + 90.0), 0, 0)
  return Transforms.headingPitchRollQuaternion(pos, hpr)
}

interface VehicleModel { uri: string; scale: number; maxScale: number; color?: any; blendAmount?: number }

// Hash vehicle ID → stable integer (same vehicle always same appearance)
function idHash(id: string): number {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = (h * 16777619) >>> 0
  }
  return h
}

// All passenger configs use ferrari.glb only — verified correct orientation
// Color variety via HIGHLIGHT blend (preserves tires + model detail)
// Scale variety simulates Mini / Sedan / SUV / Sports
const PASSENGER_CONFIGS: { scale: number; maxScale: number; hex: string }[] = [
  // ── Mini / city car ───────────────────────────────────────────────────────
  { scale: 0.58, maxScale: 12, hex: '#ef4444' }, // red mini
  { scale: 0.58, maxScale: 12, hex: '#f97316' }, // orange mini
  { scale: 0.58, maxScale: 12, hex: '#eab308' }, // yellow mini
  { scale: 0.58, maxScale: 12, hex: '#22c55e' }, // green mini

  // ── Sedan — Toyota / Honda / Tesla ───────────────────────────────────────
  { scale: 0.82, maxScale: 17, hex: '#f8fafc' }, // pearl white
  { scale: 0.82, maxScale: 17, hex: '#94a3b8' }, // silver
  { scale: 0.82, maxScale: 17, hex: '#0f172a' }, // midnight black
  { scale: 0.82, maxScale: 17, hex: '#1d4ed8' }, // navy blue

  // ── SUV / 4×4 — Land Rover / Chinese ────────────────────────────────────
  { scale: 1.05, maxScale: 22, hex: '#1e293b' }, // dark gunmetal
  { scale: 1.05, maxScale: 22, hex: '#7f1d1d' }, // deep red
  { scale: 1.05, maxScale: 22, hex: '#14532d' }, // forest green
  { scale: 1.05, maxScale: 22, hex: '#e2e8f0' }, // pearl SUV

  // ── Sports / coupe ────────────────────────────────────────────────────────
  { scale: 0.72, maxScale: 15, hex: '#dc2626' }, // racing red
  { scale: 0.72, maxScale: 15, hex: '#7c3aed' }, // purple sports
  { scale: 0.72, maxScale: 15, hex: '#0284c7' }, // sky blue sports
  { scale: 0.72, maxScale: 15, hex: '#d97706' }, // amber sports
]

function getVehicleModel(vtype: string, vehicleId: string): VehicleModel {
  const t = (vtype || '').toLowerCase()

  // Ego car — gold highlight
  if (vehicleId === 'f_0.0')
    return { uri: '/sumo/ferrari.glb', scale: 1.0, maxScale: 20,
             color: Color.fromCssColorString('#fbbf24'), blendAmount: 0.55 }

  // Motorcycle / bicycle — very small
  if (t.includes('moto') || t.includes('bicycle') || t.includes('bike') || t.includes('scooter'))
    return { uri: '/sumo/ferrari.glb', scale: 0.42, maxScale: 9,
             color: Color.fromCssColorString('#a78bfa'), blendAmount: 0.35 }

  // Bus / coach — use ferrari.glb large scale until bus.glb orientation verified
  if (t.includes('bus') || t.includes('coach') || t.includes('transit'))
    return { uri: '/sumo/ferrari.glb', scale: 1.8, maxScale: 40,
             color: Color.fromCssColorString('#34d399'), blendAmount: 0.40 }

  // Heavy truck
  if (t.includes('truck') || t.includes('trailer') || t.includes('heavy') || t.includes('delivery') || t.includes('hgv'))
    return { uri: '/sumo/ferrari.glb', scale: 1.5, maxScale: 32,
             color: Color.fromCssColorString('#f97316'), blendAmount: 0.40 }

  // All other passenger types — hash → consistent config
  const cfg = PASSENGER_CONFIGS[idHash(vehicleId) % PASSENGER_CONFIGS.length]
  return {
    uri:         '/sumo/ferrari.glb',
    scale:       cfg.scale,
    maxScale:    cfg.maxScale,
    color:       Color.fromCssColorString(cfg.hex),
    blendAmount: 0.35,   // HIGHLIGHT-friendly: low blend keeps tires + detail visible
  }
}

export function CesiumViewer() {
  const viewerRef       = useRef<HTMLDivElement>(null)
  const cesiumViewer    = useRef<any>(null)
  const vehicleEntities = useRef<Map<string, any>>(new Map())
  const roadEntities    = useRef<Map<string, any[]>>(new Map())
  const osmBuildings    = useRef<any>(null)
  const areaMarkers     = useRef<Map<string, any>>(new Map())
  const sumoDS          = useRef<any>(null)
  const clockTickOff    = useRef<() => void>()
  // Live sim refs
  const liveWS          = useRef<WebSocket | null>(null)
  const liveEntities    = useRef<Map<string, any>>(new Map())
  const liveEpoch       = useRef<any>(null)
  // OSM building polygon entities (from road-load trigger)
  // Per-area boundary + buildings (from area-select trigger)
  const areaEntities        = useRef<Map<string, any[]>>(new Map())
  // Hover boundary entities (pre-fetched, hidden by default)
  const hoverBoundaryCache  = useRef<Map<string, any[]>>(new Map())
  const hoveredAreaKey      = useRef<string | null>(null)
  const hoverHandlerRef     = useRef<any>(null)
  // Car follow camera
  const followEntityRef     = useRef<any>(null)
  const followModeRef       = useRef<'top' | 'front' | 'cockpit'>('top')
  const preRenderListenerRef = useRef<any>(null)
  const startFollowRef      = useRef<(entity: any, mode: 'top' | 'front' | 'cockpit') => void>()
  const lastCarPosRef       = useRef<any>(null)
  const egoFollowedRef      = useRef(false)
  const tlsEntities         = useRef<Map<string, any>>(new Map())
  const tlsOverrides        = useRef<Set<string>>(new Set())
  const tlsQueues           = useRef<Map<string, number>>(new Map())
  const heatmapEntities     = useRef<Map<string, any>>(new Map())
  const showHeatmapRef      = useRef(true)
  const satelliteLayerRef   = useRef<any>(null)
  const streetsLayerRef     = useRef<any>(null)

  const [viewerReady, setViewerReady] = useState(false)
  const [sim, setSim] = useState<SimState>({
    loaded: false, playing: false, speed: 1, timeStr: '00:00', is3D: true,
  })
  const [liveState, setLiveState]   = useState<LiveState>('idle')
  const [liveCount, setLiveCount]   = useState(0)
  const [liveSimTime, setLiveSimTime] = useState(0)
  const [liveMsg, setLiveMsg]       = useState('')
  const [followInfo, setFollowInfo] = useState<{ active: boolean; mode: 'top' | 'front' | 'cockpit' }>({ active: false, mode: 'top' })
  const [egoActive, setEgoActive]   = useState(false)
  const [egoState, setEgoState]     = useState<{ speed: number; maxSpeed: number; lane: number; autopilot: boolean }>({ speed: 0, maxSpeed: 50, lane: 0, autopilot: true })
  const egoDesiredSpeedRef          = useRef<number>(0)
  const [tlsSelected, setTlsSelected]           = useState<string | null>(null)
  const [tlsOverrideCount, setTlsOverrideCount] = useState(0)
  const setTlsSelectedRef = useRef<(id: string | null) => void>(() => {})
  const [mapStyle, setMapStyle]         = useState<'satellite' | 'streets'>('satellite')
  const [showHeatmap, setShowHeatmap]   = useState(true)
  const [trafficStats, setTrafficStats] = useState<{ avg_speed: number; stopped_count: number; vehicle_count: number } | null>(null)
  const [baseline, setBaseline]         = useState<{ avg_speed: number; stopped_count: number } | null>(null)

  const { vehicles } = useSimulationStore()
  const { setSelectedBuilding } = useBuildingStore()
  const { showTraffic, showBuildings } = useLayerStore()
  const {
    flyTarget, loadTrigger, roadFilter, selectedAreas,
    toggleArea, flyToArea,
    setRoadCount, setLoadingRoads, setLoadProgress,
  } = useMapControlStore()

  // ── Car follow camera ────────────────────────────────────────────────────────
  const stopFollow = useCallback(() => {
    const viewer = cesiumViewer.current
    if (preRenderListenerRef.current && viewer) {
      viewer.scene.postRender.removeEventListener(preRenderListenerRef.current)
    }
    preRenderListenerRef.current = null
    // Restore car visibility if it was hidden in cockpit mode
    if (followEntityRef.current?.model) {
      ;(followEntityRef.current.model as any).show = new ConstantProperty(true)
    }
    followEntityRef.current = null
    setFollowInfo({ active: false, mode: 'top' })
  }, [])

  const startFollow = useCallback((entity: any, mode: 'top' | 'front' | 'cockpit') => {
    const viewer = cesiumViewer.current
    if (!viewer || !entity) return

    if (preRenderListenerRef.current)
      viewer.scene.postRender.removeEventListener(preRenderListenerRef.current)

    // Restore previous ego car visibility before switching modes
    if (followEntityRef.current && followEntityRef.current.model) {
      ;(followEntityRef.current.model as any).show = new ConstantProperty(true)
    }

    followEntityRef.current = entity
    followModeRef.current = mode

    // Hide ego car model in cockpit mode (camera is inside — no need to see it)
    if (entity.model) {
      ;(entity.model as any).show = new ConstantProperty(mode !== 'cockpit')
    }

    // Initial camera placement
    const initPos = entity.position?.getValue(viewer.clock.currentTime)
    if (initPos) {
      const carto = Cartographic.fromCartesian(initPos)
      if (carto) {
        const lon = CesiumMath.toDegrees(carto.longitude)
        const lat = CesiumMath.toDegrees(carto.latitude)
        const alt = carto.height ?? 0
        const angleDeg = vehicleAngleMap.get(entity) ?? 0
        const heading = CesiumMath.toRadians(angleDeg + 90)

        if (mode === 'top') {
          viewer.camera.setView({
            destination: Cartesian3.fromDegrees(lon, lat, alt + 250),
            orientation: { heading, pitch: CesiumMath.toRadians(-90), roll: 0 },
          })
        } else if (mode === 'front') {
          const behindDist = 0.00090
          const behindLon = lon - Math.sin(CesiumMath.toRadians(angleDeg)) * behindDist
          const behindLat = lat - Math.cos(CesiumMath.toRadians(angleDeg)) * behindDist
          viewer.camera.setView({
            destination: Cartesian3.fromDegrees(behindLon, behindLat, alt + 100),
            orientation: { heading, pitch: CesiumMath.toRadians(-45), roll: 0 },
          })
        } else {
          // Cockpit: driver eye level, 2m forward, looking ahead
          const fwdDist = 0.000018
          const fwdLon = lon + Math.sin(CesiumMath.toRadians(angleDeg)) * fwdDist
          const fwdLat = lat + Math.cos(CesiumMath.toRadians(angleDeg)) * fwdDist
          viewer.camera.setView({
            destination: Cartesian3.fromDegrees(fwdLon, fwdLat, alt + 1.5),
            orientation: { heading, pitch: CesiumMath.toRadians(-3), roll: 0 },
          })
        }
        lastCarPosRef.current = new Cartesian3(initPos.x, initPos.y, initPos.z)
      }
    } else {
      lastCarPosRef.current = null
    }

    // Per-frame listener
    const listener = () => {
      const v = cesiumViewer.current
      const ent = followEntityRef.current
      if (!v || !ent) return
      const pos = ent.position?.getValue(v.clock.currentTime)
      if (!pos) return

      if (followModeRef.current === 'cockpit') {
        // Cockpit: full setView every frame — camera stays locked inside car
        const carto = Cartographic.fromCartesian(pos)
        if (!carto) return
        const lon = CesiumMath.toDegrees(carto.longitude)
        const lat = CesiumMath.toDegrees(carto.latitude)
        const alt = carto.height ?? 0
        const angleDeg = vehicleAngleMap.get(ent) ?? 0
        const heading = CesiumMath.toRadians(angleDeg + 90)
        const fwdDist = 0.000018
        const fwdLon = lon + Math.sin(CesiumMath.toRadians(angleDeg)) * fwdDist
        const fwdLat = lat + Math.cos(CesiumMath.toRadians(angleDeg)) * fwdDist
        v.camera.setView({
          destination: Cartesian3.fromDegrees(fwdLon, fwdLat, alt + 1.5),
          orientation: { heading, pitch: CesiumMath.toRadians(-3), roll: 0 },
        })
      } else {
        // Top / Follow: delta-only tracking — user can freely rotate/zoom
        const prev = lastCarPosRef.current
        lastCarPosRef.current = new Cartesian3(pos.x, pos.y, pos.z)
        if (!prev) return
        v.camera.position.x += pos.x - prev.x
        v.camera.position.y += pos.y - prev.y
        v.camera.position.z += pos.z - prev.z
      }
    }

    viewer.scene.postRender.addEventListener(listener)
    preRenderListenerRef.current = listener
    setFollowInfo({ active: true, mode })
  }, [])

  // Keep refs in sync so init-effect handlers can call latest state setters
  startFollowRef.current    = startFollow
  setTlsSelectedRef.current = setTlsSelected
  showHeatmapRef.current    = showHeatmap

  // ── Traffic signal control ─────────────────────────────────────────────────
  const sendTlsControl = useCallback((tlsId: string, action: string) => {
    const ws = liveWS.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    ws.send(JSON.stringify({ type: 'tls_control', tls_id: tlsId, action }))
    if (action === 'reset') {
      tlsOverrides.current.delete(tlsId)
    } else {
      tlsOverrides.current.add(tlsId)
    }
    setTlsOverrideCount(tlsOverrides.current.size)
  }, [])

  // ── Ego car keyboard controls ─────────────────────────────────────────────
  useEffect(() => {
    if (!egoActive) return

    const sendControl = (action: string, value?: number) => {
      const ws = liveWS.current
      if (!ws || ws.readyState !== WebSocket.OPEN) return
      ws.send(JSON.stringify({ type: 'control', action, ...(value !== undefined ? { value } : {}) }))
    }

    const onKeyDown = (e: KeyboardEvent) => {
      // Don't capture when typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      switch (e.key) {
        case 'w': case 'W': case 'ArrowUp': {
          const newSpeed = Math.min(egoDesiredSpeedRef.current + 5, egoState.maxSpeed)
          egoDesiredSpeedRef.current = newSpeed
          sendControl('set_speed', newSpeed)
          break
        }
        case 's': case 'S': case 'ArrowDown':
          egoDesiredSpeedRef.current = Math.max(0, egoDesiredSpeedRef.current - 5)
          sendControl('brake')
          break
        case 'a': case 'A': case 'ArrowLeft':
          sendControl('lane_left')
          break
        case 'd': case 'D': case 'ArrowRight':
          sendControl('lane_right')
          break
        case 'r': case 'R':
          egoDesiredSpeedRef.current = -1
          sendControl('autopilot')
          break
        case ' ':
          e.preventDefault()
          egoDesiredSpeedRef.current = 0
          sendControl('set_speed', 0)
          break
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [egoActive, egoState.maxSpeed])

  // ── Init Cesium (cancelled flag → no React StrictMode double-init) ─────────
  useEffect(() => {
    if (!viewerRef.current) return
    let cancelled = false
    let lv: any = null

    ;(async () => {
      try {
      Ion.defaultAccessToken = import.meta.env.VITE_CESIUM_TOKEN || ''

      // World terrain from Cesium Ion — fallback to flat ellipsoid if offline/blocked
      let terrain: any
      try {
        terrain = await createWorldTerrainAsync()
      } catch {
        console.warn('[Cesium] Ion terrain unavailable — using flat ellipsoid')
        terrain = new EllipsoidTerrainProvider()
      }
      if (cancelled || !viewerRef.current) return

      lv = new Viewer(viewerRef.current, {
        terrainProvider: terrain,
        baseLayerPicker: false,
        navigationHelpButton: false,
        homeButton: false,
        sceneModePicker: false,
        geocoder: false,
        fullscreenButton: false,
        animation: false,
        timeline: false,
        infoBox: false,
        selectionIndicator: false,
        shadows: false,
      })

      if (cancelled) { lv.destroy(); lv = null; return }

      lv.scene.globe.enableLighting = false
      lv.scene.fog.enabled = false
      if (lv.scene.skyAtmosphere) lv.scene.skyAtmosphere.show = false
      lv.scene.globe.showGroundAtmosphere = false
      lv.scene.globe.depthTestAgainstTerrain = false  // allow entities below terrain to show

      lv.camera.flyTo({ destination: Cartesian3.fromDegrees(-0.58, 44.85, 45000), duration: 3 })

      // Area markers
      Object.entries(AREAS).forEach(([key, area]) => {
        const e = lv!.entities.add({
          name: key,
          position: Cartesian3.fromDegrees(area.lon, area.lat, 50),
          point: {
            pixelSize: 14,
            color: Color.fromCssColorString('#38bdf8').withAlpha(0.9),
            outlineColor: Color.WHITE, outlineWidth: 2,
            heightReference: HeightReference.RELATIVE_TO_GROUND,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          label: {
            text: `${area.icon} ${key}`,
            font: 'bold 14px Arial, sans-serif',
            fillColor: Color.WHITE,
            outlineColor: Color.fromCssColorString('#0f172a'), outlineWidth: 3,
            style: LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin: VerticalOrigin.BOTTOM,
            horizontalOrigin: HorizontalOrigin.CENTER,
            pixelOffset: new Cartesian2(0, -20),
            heightReference: HeightReference.RELATIVE_TO_GROUND,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            scaleByDistance: new NearFarScalar(1500, 0, 3000, 1.1),
          },
          properties: { markerType: 'area', areaKey: key },
        })
        areaMarkers.current.set(key, e)
      })

      // OSM 3D buildings are loaded on-demand via the "Show 3D Buildings" toggle in the panel

      if (cancelled) return

      // Entity click
      lv.selectedEntityChanged.addEventListener((sel: any) => {
        if (!sel) return
        const mtype = sel.properties?.markerType?.getValue?.()
        if (mtype === 'area') {
          const key = sel.properties.areaKey.getValue()
          const store = useMapControlStore.getState()
          if (!store.selectedAreas.includes(key)) store.toggleArea(key)
          store.flyToArea(key)
          lv!.selectedEntity = undefined
          return
        }
        // Traffic signal click
        if (mtype === 'tls') {
          const tlsId = sel.properties.tlsId.getValue()
          setTlsSelectedRef.current(tlsId)
          lv!.selectedEntity = undefined
          return
        }
        // Car click (live SUMO vehicles have a model)
        if (sel.model) {
          startFollowRef.current?.(sel, 'top')
          lv!.selectedEntity = undefined
          return
        }
        if (sel.properties?.buildingId) {
          api.getBuilding(sel.properties.buildingId.getValue())
            .then((b: any) => setSelectedBuilding(b)).catch(console.error)
        }
      })

      // Save satellite layer ref + add CartoDB Voyager streets layer (hidden initially)
      satelliteLayerRef.current = lv.imageryLayers.get(0)
      const streetsProvider = new UrlTemplateImageryProvider({
        url: 'https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
        credit: '© OpenStreetMap contributors © CARTO',
        maximumLevel: 19,
      })
      const streetsLayer = lv.imageryLayers.addImageryProvider(streetsProvider)
      streetsLayer.show = false
      streetsLayerRef.current = streetsLayer

      cesiumViewer.current = lv
      setViewerReady(true)

      // ── Pre-load OSM 3D buildings at startup (hidden) ──────────────────────
      Cesium3DTileset.fromIonAssetId(96188).then((b: any) => {
        if (cancelled || !cesiumViewer.current || cesiumViewer.current.isDestroyed()) {
          b.destroy(); return
        }
        b.show = false
        osmBuildings.current = cesiumViewer.current.scene.primitives.add(b)
        console.log('[Buildings] OSM pre-loaded OK (asset 96188)')
      }).catch((e: any) => console.error('[Buildings] Pre-load FAILED:', e))

      // ── Pre-fetch all area boundaries for instant hover display ──────────
      Promise.all(
        Object.entries(AREAS).map(([key, area]) =>
          fetchBoundary(area.osmName)
            .then(data => ({ key, data }))
            .catch(() => null)
        )
      ).then(results => {
        if (cancelled || !lv || lv.isDestroyed()) return
        results.forEach(r => {
          if (!r) return
          const { key, data } = r
          const list: any[] = []
          ;(data.elements ?? []).forEach((el: any) => {
            if (el.type !== 'relation') return
            ;(el.members ?? []).forEach((m: any) => {
              if (m.role !== 'outer' || !m.geometry?.length) return
              const pts = m.geometry.map((n: any) =>
                Cartesian3.fromDegrees(n.lon, n.lat, 40)
              )
              const e = lv!.entities.add({
                show: false,
                polyline: {
                  positions: pts,
                  width: 3,
                  material: new PolylineGlowMaterialProperty({
                    color: Color.fromCssColorString('#f59e0b'),
                    glowPower: 0.3,
                  }),
                  clampToGround: false,
                },
              })
              list.push(e)
            })
          })
          hoverBoundaryCache.current.set(key, list)
        })
      })

      // ── Mouse-move hover handler ──────────────────────────────────────────
      const hoverHandler = new ScreenSpaceEventHandler(lv.canvas)
      hoverHandler.setInputAction((mv: any) => {
        const v = cesiumViewer.current
        if (!v) return
        const picked = v.scene.pick(mv.endPosition)
        const newKey: string | null =
          picked?.id?.properties?.markerType?.getValue() === 'area'
            ? picked.id.properties.areaKey.getValue()
            : null

        if (newKey === hoveredAreaKey.current) return  // nothing changed

        // Hide previous hover boundary
        if (hoveredAreaKey.current) {
          hoverBoundaryCache.current.get(hoveredAreaKey.current)
            ?.forEach(e => { e.show = false })
        }
        // Show new hover boundary
        if (newKey) {
          hoverBoundaryCache.current.get(newKey)
            ?.forEach(e => { e.show = true })
          lv!.canvas.style.cursor = 'pointer'
        } else {
          lv!.canvas.style.cursor = ''
        }
        hoveredAreaKey.current = newKey
      }, ScreenSpaceEventType.MOUSE_MOVE)
      hoverHandlerRef.current = hoverHandler

      api.getBuildings().then((bldgs: any[]) => {
        if (cancelled || !cesiumViewer.current) return
        bldgs.forEach((b) => {
          cesiumViewer.current!.entities.add({
            name: b.name,
            position: Cartesian3.fromDegrees(b.longitude, b.latitude, (b.height_m || 20) + 5),
            point: {
              pixelSize: 10,
              color: Color.fromCssColorString(
                b.building_use === 'office' ? '#60a5fa' : b.building_use === 'hospital' ? '#f87171' :
                b.building_use === 'retail' ? '#fbbf24' : b.building_use === 'industrial' ? '#94a3b8' : '#a78bfa'
              ),
              outlineColor: Color.WHITE.withAlpha(0.6), outlineWidth: 1,
              heightReference: HeightReference.RELATIVE_TO_GROUND,
              scaleByDistance: new NearFarScalar(200, 1.5, 5000, 0),
            },
            label: {
              text: b.name.split(' ').slice(0, 2).join(' '),
              font: '10px Arial',
              fillColor: Color.WHITE.withAlpha(0.9),
              outlineColor: Color.BLACK, outlineWidth: 2,
              style: LabelStyle.FILL_AND_OUTLINE,
              verticalOrigin: VerticalOrigin.BOTTOM,
              pixelOffset: new Cartesian2(0, -14),
              scaleByDistance: new NearFarScalar(200, 1, 3000, 0),
            },
            properties: { buildingId: b.id },
          })
        })
      }).catch(() => { /* backend not running — skip analytics markers */ })

      } catch (err) {
        // Outer safety net — prevents unhandled promise rejection crashing the app
        console.error('[Cesium] Init failed:', err)
      }
    })()

    return () => {
      cancelled = true
      clockTickOff.current?.()
      hoverHandlerRef.current?.destroy()
      hoverHandlerRef.current = null
      if (preRenderListenerRef.current && lv) {
        lv.scene.postRender.removeEventListener(preRenderListenerRef.current)
        preRenderListenerRef.current = null
      }
      if (lv) { lv.destroy(); lv = null }
      cesiumViewer.current = null
    }
  }, [])

  // ── Camera fly ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const viewer = cesiumViewer.current
    if (!flyTarget || !viewer) return
    const area = AREAS[flyTarget.area]
    if (!area) return

    // Place camera SOUTH of target so the blue dot appears in the screen center.
    // Camera at (lon, lat − offset, height) looking North at −50° pitch.
    // Ground intersection = camera_lat + height × tan(50°) / 111320° = area.lat  ✓
    const pitchRad = CesiumMath.toRadians(-50)
    const latOffset = (area.height * Math.tan(Math.abs(pitchRad))) / 111320

    viewer.camera.flyTo({
      destination: Cartesian3.fromDegrees(area.lon, area.lat - latOffset, area.height),
      orientation: { heading: CesiumMath.toRadians(0), pitch: pitchRad, roll: 0 },
      duration: 2.5,
    })
  }, [flyTarget])

  // ── Road loading (triggered by "Load Road Network" button) ────────────────────
  useEffect(() => {
    if (!loadTrigger) return
    const viewer = cesiumViewer.current
    if (!viewer || !selectedAreas.length) return

    const load = async () => {
      setLoadingRoads(true); setRoadCount(0)
      // Clear all existing road entities
      roadEntities.current.forEach(list => list.forEach(e => viewer.entities.remove(e)))
      roadEntities.current.clear()
      let total = 0

      for (let i = 0; i < selectedAreas.length; i++) {
        const key = selectedAreas[i]
        const area = AREAS[key]
        if (!area) continue
        setLoadProgress(`Loading ${key} roads (${i + 1}/${selectedAreas.length})…`)
        try {
          const data = await fetchAreaData(area.osmName)
          const filter = useMapControlStore.getState().roadFilter
          const areaRoads: any[] = []
          data.elements.forEach((el: any) => {
            if (el.type !== 'way' || !el.geometry?.length || el.geometry.length < 2) return
            const tags = el.tags || {}
            const rtype = getRoadType(tags, tags.railway)
            const style = ROAD_STYLES[rtype]
            const entity = viewer.entities.add({
              polyline: {
                positions: el.geometry.map((g: any) => Cartesian3.fromDegrees(g.lon, g.lat, 8)),
                width: style.width,
                material: new PolylineGlowMaterialProperty({
                  color: Color.fromCssColorString(style.color), glowPower: style.glow,
                }),
                clampToGround: true,
                show: filter[rtype],
              },
            })
            roadTypeMap.set(entity, rtype)
            areaRoads.push(entity)
            total++
          })
          roadEntities.current.set(key, areaRoads)
          setRoadCount(total)
        } catch (e) { console.error(`[Roads] Failed for ${key}:`, e) }
      }
      setLoadProgress(''); setLoadingRoads(false)

      // Fly to the first selected area so roads are visible (not stuck at 45 km overview)
      const firstArea = AREAS[selectedAreas[0]]
      if (firstArea && viewer) {
        const pitchRad  = CesiumMath.toRadians(-50)
        const latOffset = (firstArea.height * Math.tan(Math.abs(pitchRad))) / 111320
        viewer.camera.flyTo({
          destination: Cartesian3.fromDegrees(firstArea.lon, firstArea.lat - latOffset, firstArea.height),
          orientation: { heading: CesiumMath.toRadians(0), pitch: pitchRad, roll: 0 },
          duration: 2,
        })
      }
    }
    load()
  }, [loadTrigger])

  // ── Area boundary + buildings (triggered by area selection) ────────────────────
  useEffect(() => {
    const viewer = cesiumViewer.current
    if (!viewer) return

    // Remove entities only for areas no longer selected
    areaEntities.current.forEach((list, key) => {
      if (!selectedAreas.includes(key)) {
        list.forEach(e => viewer.entities.remove(e))
        areaEntities.current.delete(key)
      }
    })
    // Remove road entities for deselected areas
    roadEntities.current.forEach((list, key) => {
      if (!selectedAreas.includes(key)) {
        list.forEach(e => viewer.entities.remove(e))
        roadEntities.current.delete(key)
      }
    })
    const remaining = Array.from(roadEntities.current.values()).reduce((s, l) => s + l.length, 0)
    setRoadCount(remaining)
    if (!selectedAreas.length) return

    const DASH_COLOR   = Color.fromCssColorString('#ef4444')

    let cancelled = false
    ;(async () => {
      for (const key of selectedAreas) {
        if (cancelled) break
        const area = AREAS[key]
        if (!area) continue
        const list: any[] = []

        // ── 1. Admin boundary (Overpass, small query) ─────────────────────────
        try {
          const boundaryData = await fetchBoundary(area.osmName)
          if (cancelled) break
          ;(boundaryData.elements ?? []).forEach((el: any) => {
            if (el.type !== 'relation') return
            ;(el.members ?? []).forEach((m: any) => {
              if (m.role !== 'outer' || !m.geometry?.length) return
              const pts = m.geometry.map((n: any) => Cartesian3.fromDegrees(n.lon, n.lat, 30))
              const e = viewer.entities.add({
                polyline: {
                  positions: pts,
                  width: 2.5,
                  material: new PolylineDashMaterialProperty({ color: DASH_COLOR, dashLength: 18 }),
                  clampToGround: false,
                },
              })
              list.push(e)
            })
          })
        } catch (err) {
          console.warn(`[Boundary] Failed for ${key}:`, err)
        }

        areaEntities.current.set(key, list)
      }
    })()
    return () => { cancelled = true }
  }, [selectedAreas.join(','), viewerReady])

  // ── OSM 3D Buildings (driven by left panel "Buildings" layer toggle) ──────────
  useEffect(() => {
    const viewer = cesiumViewer.current
    if (!viewer || !viewerReady) return

    if (osmBuildings.current && !osmBuildings.current.isDestroyed()) {
      osmBuildings.current.show = showBuildings
      if (showBuildings) flyToBuildingView(viewer)
    } else if (showBuildings) {
      // Pre-load not yet done — load now
      Cesium3DTileset.fromIonAssetId(96188)
        .then((b: any) => {
          if (!cesiumViewer.current || cesiumViewer.current.isDestroyed()) { b.destroy(); return }
          osmBuildings.current = cesiumViewer.current.scene.primitives.add(b)
          flyToBuildingView(cesiumViewer.current)
        })
        .catch((e: any) => console.error('[Buildings] Load failed:', e))
    }
  }, [showBuildings, viewerReady])

  // ── Road filter visibility ──────────────────────────────────────────────────
  useEffect(() => {
    roadEntities.current.forEach(list => list.forEach(e => {
      const rtype = roadTypeMap.get(e)
      if (e.polyline && rtype) e.polyline.show = roadFilter[rtype]
    }))
  }, [roadFilter])

  // ── Heatmap visibility toggle ────────────────────────────────────────────────
  useEffect(() => {
    heatmapEntities.current.forEach(e => {
      if (e.polygon) e.polygon.show = showHeatmap
    })
  }, [showHeatmap])

  // ── Map style switch (satellite ↔ streets) ───────────────────────────────────
  useEffect(() => {
    if (!satelliteLayerRef.current || !streetsLayerRef.current) return
    satelliteLayerRef.current.show = mapStyle === 'satellite'
    streetsLayerRef.current.show   = mapStyle === 'streets'
  }, [mapStyle])

  // ── Area marker highlight ───────────────────────────────────────────────────
  useEffect(() => {
    areaMarkers.current.forEach((entity, key) => {
      const sel = selectedAreas.includes(key)
      if (entity.point) {
        entity.point.color = sel
          ? Color.fromCssColorString('#f59e0b').withAlpha(1)
          : Color.fromCssColorString('#38bdf8').withAlpha(0.9)
        entity.point.pixelSize = sel ? 18 : 14
      }
    })
  }, [selectedAreas])

  // ── WebSocket vehicles (mock) ───────────────────────────────────────────────
  useEffect(() => {
    const viewer = cesiumViewer.current
    if (!viewer) return
    const currentIds = new Set(vehicles.map((v) => v.id))
    vehicleEntities.current.forEach((entity, vid) => {
      if (!currentIds.has(vid)) { viewer.entities.remove(entity); vehicleEntities.current.delete(vid) }
    })
    if (showTraffic) {
      vehicles.forEach((v) => {
        const pos = Cartesian3.fromDegrees(v.longitude, v.latitude, 2)
        if (vehicleEntities.current.has(v.id)) {
          vehicleEntities.current.get(v.id).position = new ConstantPositionProperty(pos)
        } else {
          vehicleEntities.current.set(v.id, viewer.entities.add({
            position: pos,
            point: {
              pixelSize: v.vehicle_type === 'bus' || v.vehicle_type === 'truck' ? 7 : 5,
              color: Color.fromCssColorString(VEHICLE_COLORS[v.vehicle_type] || '#60a5fa'),
              outlineColor: Color.BLACK.withAlpha(0.4), outlineWidth: 1,
              heightReference: HeightReference.RELATIVE_TO_GROUND,
            },
          }))
        }
      })
    }
  }, [vehicles, showTraffic])

  // ── SUMO simulation ─────────────────────────────────────────────────────────
  const loadSumo = useCallback(async () => {
    const viewer = cesiumViewer.current
    if (!viewer) return

    // Remove old SUMO data
    if (sumoDS.current) {
      viewer.dataSources.remove(sumoDS.current, true)
      sumoDS.current = null
    }
    clockTickOff.current?.()

    setSim(s => ({ ...s, loaded: false, playing: false, timeStr: '00:00' }))

    const ds = await CzmlDataSource.load('/sumo/vehicles_enhanced.czml')
    if (!cesiumViewer.current) return   // viewer destroyed while loading

    viewer.dataSources.add(ds)
    sumoDS.current = ds

    // Clock setup
    viewer.clock.shouldAnimate = false
    viewer.clock.multiplier = 1
    viewer.clock.clockRange = ClockRange.LOOP_STOP

    // Live time display
    const off = viewer.clock.onTick.addEventListener((clock: any) => {
      const secs = JulianDate.secondsDifference(clock.currentTime, clock.startTime)
      const m = Math.floor(secs / 60).toString().padStart(2, '0')
      const s = Math.floor(secs % 60).toString().padStart(2, '0')
      setSim(prev => ({ ...prev, timeStr: `${m}:${s}` }))
    })
    clockTickOff.current = off

    // Fly to the SUMO simulation area (Pessac/Talence border)
    viewer.camera.flyTo({
      destination: Cartesian3.fromDegrees(-0.558, 44.829, 2500),
      orientation: { heading: 0, pitch: CesiumMath.toRadians(-45), roll: 0 },
      duration: 2.5,
    })

    setSim(s => ({ ...s, loaded: true, playing: false }))
  }, [])

  const togglePlay = useCallback(() => {
    const viewer = cesiumViewer.current
    if (!viewer) return
    viewer.clock.shouldAnimate = !viewer.clock.shouldAnimate
    setSim(s => ({ ...s, playing: viewer.clock.shouldAnimate }))
  }, [])

  const setSpeed = useCallback((speed: number) => {
    const viewer = cesiumViewer.current
    if (!viewer) return
    viewer.clock.multiplier = speed
    setSim(s => ({ ...s, speed }))
  }, [])

  const resetSumo = useCallback(() => {
    const viewer = cesiumViewer.current
    if (!viewer || !sumoDS.current) return
    viewer.clock.shouldAnimate = false
    viewer.clock.currentTime = viewer.clock.startTime.clone()
    setSim(s => ({ ...s, playing: false, timeStr: '00:00' }))
  }, [])

  const toggle2D3D = useCallback(() => {
    const viewer = cesiumViewer.current
    if (!viewer) return
    if (sim.is3D) {
      viewer.scene.morphTo2D(1.0)
    } else {
      viewer.scene.morphTo3D(1.0)
    }
    setSim(s => ({ ...s, is3D: !s.is3D }))
  }, [sim.is3D])

  const stopSumo = useCallback(() => {
    const viewer = cesiumViewer.current
    if (!viewer) return
    if (sumoDS.current) { viewer.dataSources.remove(sumoDS.current, true); sumoDS.current = null }
    clockTickOff.current?.()
    viewer.clock.shouldAnimate = false
    setSim({ loaded: false, playing: false, speed: 1, timeStr: '00:00', is3D: sim.is3D })
  }, [sim.is3D])

  // ── LIVE SUMO: connect to sumo_live_server.py (ws://localhost:8765) ──────────
  const connectLive = useCallback(() => {
    const viewer = cesiumViewer.current
    if (!viewer) return

    // Gentle zoom-out effect — stay at current location, rise 50m
    const cam = viewer.camera
    const pos = cam.positionCartographic
    if (pos) {
      viewer.camera.flyTo({
        destination: Cartesian3.fromDegrees(
          CesiumMath.toDegrees(pos.longitude),
          CesiumMath.toDegrees(pos.latitude),
          pos.height + 50
        ),
        orientation: { heading: cam.heading, pitch: cam.pitch, roll: cam.roll },
        duration: 1.0,
      })
    }

    setLiveState('connecting')
    setLiveMsg('Connecting to SUMO live server…')

    const ws = new WebSocket('ws://localhost:8765')
    liveWS.current = ws

    ws.onopen = () => {
      setLiveState('waiting')
      setLiveMsg('Server connected — SUMO-GUI opening, press ▶ Play inside SUMO')
      ws.send(JSON.stringify({ type: 'start' }))
      // Fly to simulation area
      viewer.camera.flyTo({
        destination: Cartesian3.fromDegrees(-0.558, 44.829, 2500),
        orientation: { heading: 0, pitch: CesiumMath.toRadians(-45), roll: 0 },
        duration: 2,
      })
    }

    ws.onmessage = (evt) => {
      let data: any
      try { data = JSON.parse(evt.data) } catch { return }

      // Status messages from server
      if (data.type === 'status') {
        setLiveMsg(data.message || '')
        if (data.state === 'running')  setLiveState('running')
        if (data.state === 'idle')     setLiveState('waiting')
        if (data.state === 'finished') setLiveState('stopped')
        if (data.state === 'error')    { setLiveState('error'); setLiveMsg(data.message || '') }
        return
      }

      // Ego car state update from TraCI
      if (data.type === 'ego_state') {
        setEgoState({
          speed:     data.speed    ?? 0,
          maxSpeed:  data.maxSpeed ?? 50,
          lane:      data.lane     ?? 0,
          autopilot: egoDesiredSpeedRef.current < 0,
        })
        return
      }

      // Traffic light list — create signal marker entities on map
      if (data.type === 'tls_list') {
        const v = cesiumViewer.current
        if (!v) return
        tlsEntities.current.forEach((e) => v.entities.remove(e))
        tlsEntities.current.clear()
        ;(data.tls ?? []).forEach((t: any) => {
          const e = v.entities.add({
            id: `tls_${t.id}`,
            position: Cartesian3.fromDegrees(t.lon, t.lat, 3),
            point: {
              pixelSize: 10,
              color: Color.fromCssColorString('#22c55e'),
              outlineColor: Color.BLACK.withAlpha(0.5),
              outlineWidth: 1.5,
              heightReference: HeightReference.CLAMP_TO_GROUND,
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
              scaleByDistance: new NearFarScalar(50, 2.0, 1500, 0.5),
            },
            properties: { markerType: 'tls', tlsId: t.id },
          })
          tlsEntities.current.set(t.id, e)
        })
        return
      }

      // Traffic light state updates — recolor signal markers + queue size
      if (data.type === 'tls_states') {
        ;(data.tls ?? []).forEach((t: any) => {
          const e = tlsEntities.current.get(t.id)
          if (!e?.point) return
          const phase = t.phase ?? ''
          const g = (phase.match(/[Gg]/g) || []).length
          const r = (phase.match(/[rR]/g) || []).length
          const y = (phase.match(/[yY]/g) || []).length
          const col =
            y > 0 && y >= g && y >= r ? Color.fromCssColorString('#eab308') :
            g >= r                     ? Color.fromCssColorString('#22c55e') :
                                         Color.fromCssColorString('#ef4444')
          ;(e.point as any).color        = new ConstantProperty(col)
          ;(e.point as any).outlineColor = new ConstantProperty(
            t.overridden ? Color.WHITE : Color.BLACK.withAlpha(0.5)
          )
          ;(e.point as any).outlineWidth = new ConstantProperty(t.overridden ? 3 : 1.5)
          // Scale point by queue length (visual congestion indicator)
          const q = t.queue ?? 0
          ;(e.point as any).pixelSize = new ConstantProperty(q > 6 ? 16 : q > 2 ? 13 : 10)
          tlsQueues.current.set(t.id, q)
        })
        return
      }

      // Heatmap — large colored point blobs showing vehicle density
      // Points work reliably in both 2D and 3D mode (unlike polygon entities)
      if (data.type === 'heatmap') {
        const v = cesiumViewer.current
        if (!v) return
        heatmapEntities.current.forEach(e => v.entities.remove(e))
        heatmapEntities.current.clear()
        if (!showHeatmapRef.current) return
        ;(data.cells ?? []).forEach((c: any) => {
          const col =
            c.density < 0.3 ? Color.fromCssColorString('#22c55e').withAlpha(0.55) :
            c.density < 0.6 ? Color.fromCssColorString('#f59e0b').withAlpha(0.70) :
                               Color.fromCssColorString('#ef4444').withAlpha(0.85)
          const key = `${c.lon}_${c.lat}`
          const e = v.entities.add({
            position: Cartesian3.fromDegrees(c.lon, c.lat, 5),
            point: {
              pixelSize: 68,
              color: col,
              heightReference: HeightReference.NONE,
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
              scaleByDistance: new NearFarScalar(80, 3.0, 3000, 0.5),
            },
          })
          heatmapEntities.current.set(key, e)
        })
        return
      }

      // Traffic stats — avg speed, stopped vehicles
      if (data.type === 'traffic_stats') {
        setTrafficStats({
          avg_speed:     data.avg_speed     ?? 0,
          stopped_count: data.stopped_count ?? 0,
          vehicle_count: data.vehicle_count ?? 0,
        })
        return
      }

      // Vehicle position update: GeoJSON FeatureCollection
      if (data.type === 'FeatureCollection') {
        setLiveState('running')
        setLiveCount(data.vehicleCount ?? 0)
        const simTime: number = data.simTime ?? 0
        setLiveSimTime(simTime)

        const v = cesiumViewer.current
        if (!v) return

        // Anchor wall-clock epoch on first frame
        if (!liveEpoch.current) {
          liveEpoch.current = JulianDate.now()
          v.clock.shouldAnimate = true
          v.clock.clockRange = ClockRange.UNBOUNDED
        }
        const jt = JulianDate.addSeconds(liveEpoch.current, simTime, new JulianDate())
        v.clock.currentTime = JulianDate.addSeconds(jt, 1.0, new JulianDate())

        const activeIds = new Set<string>()
        ;(data.features ?? []).forEach((f: any) => {
          const id: string  = String(f.id ?? f.properties?.id)
          const [lon, lat]  = f.geometry.coordinates
          const angle       = f.properties?.angle  ?? 0
          const vtype       = f.properties?.type   ?? 'passenger'
          activeIds.add(id)

          const pos    = Cartesian3.fromDegrees(lon, lat, 0)
          const orient = sumoAngleToOrientation(lon, lat, angle)

          if (liveEntities.current.has(id)) {
            const ent = liveEntities.current.get(id)
            ;(ent.position as any).addSample(jt, pos)
            ent.orientation = new ConstantProperty(orient)
            vehicleAngleMap.set(ent, angle)
          } else {
            const sampledPos = new SampledPositionProperty()
            sampledPos.setInterpolationOptions({ interpolationAlgorithm: LinearApproximation, interpolationDegree: 1 })
            sampledPos.forwardExtrapolationType = ExtrapolationType.HOLD
            sampledPos.backwardExtrapolationType = ExtrapolationType.HOLD
            sampledPos.addSample(jt, pos)
            const isEgo = id === 'f_0.0'
            const vm = getVehicleModel(vtype, id)
            const e = v.entities.add({
              id: `live_${id}`,
              position: sampledPos,
              orientation: new ConstantProperty(orient),
              model: {
                uri: vm.uri,
                scale: isEgo ? vm.scale * 1.3 : vm.scale,
                minimumPixelSize: isEgo ? 16 : 10,
                maximumScale: vm.maxScale,
                heightReference: HeightReference.CLAMP_TO_GROUND,
                color: isEgo
                  ? Color.fromCssColorString('#fbbf24')
                  : (vm.color ?? Color.WHITE),
                colorBlendMode: ColorBlendMode.HIGHLIGHT,
                colorBlendAmount: vm.blendAmount ?? 0.35,
              },
            })
            vehicleAngleMap.set(e, angle)
            liveEntities.current.set(id, e)
            // Auto-follow ego car when it first appears
            if (isEgo && !egoFollowedRef.current) {
              egoFollowedRef.current = true
              setEgoActive(true)
              startFollowRef.current?.(e, 'top')
            }
          }
        })

        liveEntities.current.forEach((e, id) => {
          if (!activeIds.has(id)) {
            v.entities.remove(e)
            liveEntities.current.delete(id)
            if (id === 'f_0.0') {
              egoFollowedRef.current = false
              setEgoActive(false)
              stopFollow()
            }
          }
        })
      }
    }

    ws.onerror = () => {
      setLiveState('error')
      setLiveMsg('Cannot connect — is sumo_live_server.py running? (python sumo_live_server.py)')
    }
    ws.onclose = () => {
      if (liveState !== 'error') setLiveState('stopped')
      liveWS.current = null
    }
  }, [])

  const disconnectLive = useCallback(() => {
    liveWS.current?.send(JSON.stringify({ type: 'stop' }))
    liveWS.current?.close()
    liveWS.current = null
    liveEntities.current.forEach((e) => cesiumViewer.current?.entities.remove(e))
    liveEntities.current.clear()
    tlsEntities.current.forEach((e) => cesiumViewer.current?.entities.remove(e))
    tlsEntities.current.clear()
    tlsOverrides.current.clear()
    tlsQueues.current.clear()
    heatmapEntities.current.forEach((e) => cesiumViewer.current?.entities.remove(e))
    heatmapEntities.current.clear()
    liveEpoch.current = null
    egoFollowedRef.current = false
    setEgoActive(false)
    stopFollow()
    setTlsSelected(null)
    setTlsOverrideCount(0)
    setTrafficStats(null)
    setBaseline(null)
    setLiveState('idle')
    setLiveCount(0)
    setLiveSimTime(0)
    setLiveMsg('')
  }, [])

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="relative w-full h-full">
      <div ref={viewerRef} className="w-full h-full" />

      {/* ── SUMO launch button (top-right of map) ── */}
      {!sim.loaded && liveState === 'idle' && (
        <button
          onClick={loadSumo}
          className="absolute top-3 right-3 z-10 flex items-center gap-2 bg-gray-900/90 backdrop-blur border border-emerald-500/50 text-emerald-400 text-xs font-semibold rounded-xl px-3 py-2 hover:bg-emerald-900/30 hover:border-emerald-400 transition-all shadow-lg"
        >
          <span className="text-sm">🚗</span>
          Start SUMO Simulation
        </button>
      )}

      {/* ── Simulation control bar (bottom-center) ── */}
      {sim.loaded && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 flex items-center gap-3 bg-gray-950/95 backdrop-blur-xl border border-white/15 rounded-2xl px-5 py-3 shadow-2xl select-none">

          {/* Time */}
          <div className="flex flex-col items-center min-w-[52px]">
            <span className="text-xs text-gray-500 leading-none mb-0.5">TIME</span>
            <span className="text-sm font-mono font-bold text-white">{sim.timeStr}</span>
            <span className="text-xs text-gray-600">/10:00</span>
          </div>

          <div className="w-px h-8 bg-white/10" />

          {/* Rewind */}
          <button
            onClick={resetSumo}
            className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white flex items-center justify-center transition-all"
            title="Reset to start"
          >⏮</button>

          {/* Play/Pause */}
          <button
            onClick={togglePlay}
            className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg font-bold transition-all ${
              sim.playing
                ? 'bg-amber-500/20 border border-amber-400/50 text-amber-400 hover:bg-amber-500/30'
                : 'bg-emerald-500/20 border border-emerald-400/50 text-emerald-400 hover:bg-emerald-500/30'
            }`}
          >
            {sim.playing ? '⏸' : '▶'}
          </button>

          <div className="w-px h-8 bg-white/10" />

          {/* Speed buttons */}
          <div className="flex items-center gap-1">
            <span className="text-xs text-gray-500 mr-1">Speed</span>
            {[1, 5, 10, 25].map(s => (
              <button
                key={s}
                onClick={() => setSpeed(s)}
                className={`text-xs px-2.5 py-1 rounded-lg font-mono transition-all ${
                  sim.speed === s
                    ? 'bg-blue-500/30 border border-blue-400/60 text-blue-300'
                    : 'bg-white/5 border border-white/10 text-gray-400 hover:text-white hover:bg-white/10'
                }`}
              >
                {s}×
              </button>
            ))}
          </div>

          <div className="w-px h-8 bg-white/10" />

          {/* 2D/3D toggle */}
          <button
            onClick={toggle2D3D}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-gray-300 hover:text-white hover:bg-white/10 transition-all font-semibold"
            title="Toggle 2D / 3D view"
          >
            {sim.is3D ? '🗺️ 2D' : '🌐 3D'}
          </button>

          {/* Stop */}
          <button
            onClick={stopSumo}
            className="w-8 h-8 rounded-lg bg-white/5 hover:bg-red-900/30 hover:border-red-500/40 border border-white/10 text-gray-500 hover:text-red-400 flex items-center justify-center transition-all"
            title="Stop simulation"
          >✕</button>
        </div>
      )}

      {/* ── Static CZML: vehicle count badge ── */}
      {sim.loaded && (
        <div className="absolute top-3 right-3 z-10 bg-gray-950/90 backdrop-blur border border-white/10 rounded-xl px-3 py-2 text-xs text-gray-300">
          <span className="text-emerald-400 font-bold">52</span> SUMO vehicles — recorded
          <div className="text-gray-500 mt-0.5">Pessac / Talence area</div>
        </div>
      )}

      {/* ── LIVE SUMO button (top-right, shown when static not active) ── */}
      {!sim.loaded && liveState === 'idle' && (
        <button
          onClick={connectLive}
          className="absolute top-12 right-3 z-10 flex items-center gap-2 bg-gray-900/90 backdrop-blur border border-red-500/50 text-red-400 text-xs font-semibold rounded-xl px-3 py-2 hover:bg-red-900/20 hover:border-red-400 transition-all shadow-lg"
        >
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          Live SUMO
        </button>
      )}

      {/* ── Live status bar ── */}
      {liveState !== 'idle' && (
        <div className={`absolute top-3 right-3 z-10 flex items-center gap-3 backdrop-blur-xl border rounded-xl px-4 py-2.5 shadow-2xl text-xs max-w-xs ${
          liveState === 'running' ? 'bg-gray-950/95 border-red-500/40' :
          liveState === 'error'   ? 'bg-red-950/90 border-red-500/60' :
          'bg-gray-950/90 border-white/15'
        }`}>
          {/* Status dot */}
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
            liveState === 'running'    ? 'bg-red-500 animate-pulse' :
            liveState === 'connecting' ? 'bg-yellow-500 animate-pulse' :
            liveState === 'waiting'    ? 'bg-blue-500 animate-pulse' :
            liveState === 'error'      ? 'bg-red-600' : 'bg-gray-500'
          }`} />

          <div className="flex-1 min-w-0">
            {liveState === 'running' ? (
              <>
                <div className="text-red-400 font-bold">LIVE — {liveCount} vehicles</div>
                <div className="text-gray-400 font-mono">T = {liveSimTime.toFixed(0)}s</div>
              </>
            ) : (
              <div className={`leading-snug ${liveState === 'error' ? 'text-red-300' : 'text-gray-300'}`}>
                {liveMsg || (
                  liveState === 'connecting' ? 'Connecting…' :
                  liveState === 'waiting'    ? 'Press ▶ Play in SUMO-GUI' :
                  liveState === 'stopped'    ? 'Simulation ended' : ''
                )}
              </div>
            )}
          </div>

          <button
            onClick={disconnectLive}
            className="flex-shrink-0 w-6 h-6 rounded-lg bg-white/5 hover:bg-red-900/40 text-gray-500 hover:text-red-400 flex items-center justify-center transition-all"
          >✕</button>
        </div>
      )}

      {/* ── Live 2D/3D + map style toggles (bottom-right when live) ── */}
      {liveState === 'running' && (
        <div className="absolute bottom-8 right-3 z-10 flex flex-col gap-1.5">
          <button
            onClick={() => setMapStyle(s => s === 'satellite' ? 'streets' : 'satellite')}
            className={`text-xs px-3 py-1.5 rounded-lg backdrop-blur border font-semibold transition-all ${
              mapStyle === 'streets'
                ? 'bg-blue-500/25 border-blue-400/60 text-blue-300'
                : 'bg-gray-900/90 border-white/15 text-gray-300 hover:text-white hover:bg-white/10'
            }`}
          >
            {mapStyle === 'satellite' ? '🗺️ Streets' : '🛰️ Satellite'}
          </button>
          <button
            onClick={toggle2D3D}
            className="text-xs px-3 py-1.5 rounded-lg bg-gray-900/90 backdrop-blur border border-white/15 text-gray-300 hover:text-white hover:bg-white/10 transition-all font-semibold"
          >
            {sim.is3D ? '🗺️ 2D' : '🌐 3D'}
          </button>
        </div>
      )}

      {/* ── Ego car HUD ── */}
      {egoActive && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-2">
          {/* Status badge */}
          <div className="flex items-center gap-2 bg-amber-500/20 backdrop-blur-xl border border-amber-400/50 rounded-2xl px-4 py-2 shadow-2xl">
            <span className="text-amber-300 text-xs font-bold tracking-wide">🚗 EGO CAR</span>
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-white text-sm font-bold font-mono">{egoState.speed.toFixed(0)}</span>
            <span className="text-gray-400 text-xs">km/h</span>
            <span className="text-gray-500 text-xs mx-1">|</span>
            <span className="text-gray-400 text-xs">Lane {egoState.lane + 1}</span>
          </div>
          {/* Keyboard controls hint */}
          <div className="flex items-center gap-1.5 bg-gray-950/80 backdrop-blur border border-white/10 rounded-xl px-3 py-1.5">
            {[
              { key: 'W', label: '▲ Accel' },
              { key: 'S', label: '▼ Brake' },
              { key: 'A', label: '◄ Left' },
              { key: 'D', label: '► Right' },
              { key: 'R', label: 'Auto' },
              { key: '␣', label: 'Stop' },
            ].map(({ key, label }) => (
              <div key={key} className="flex items-center gap-1">
                <span className="bg-white/10 border border-white/20 rounded px-1.5 py-0.5 text-white text-xs font-mono font-bold">{key}</span>
                <span className="text-gray-500 text-xs">{label}</span>
                <span className="text-gray-700 text-xs mx-0.5">·</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Traffic analytics panel (bottom-left) ── */}
      {liveState === 'running' && trafficStats && (
        <div className="absolute bottom-4 left-4 z-20 bg-gray-950/95 backdrop-blur-xl border border-white/15 rounded-2xl px-4 py-3 shadow-2xl min-w-[260px]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-gray-300 tracking-wide">📊 Traffic Analytics</span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setBaseline({ avg_speed: trafficStats.avg_speed, stopped_count: trafficStats.stopped_count })}
                className="text-xs px-2 py-0.5 rounded-lg bg-blue-500/20 border border-blue-500/40 text-blue-400 hover:bg-blue-500/30 transition-all"
                title="Save current stats as baseline"
              >📸 Snapshot</button>
              {baseline && (
                <button
                  onClick={() => setBaseline(null)}
                  className="w-5 h-5 rounded text-gray-600 hover:text-red-400 transition-all text-xs"
                >✕</button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center">
            {/* Avg Speed */}
            <div className="bg-white/5 rounded-xl px-2 py-2">
              <div className="text-gray-500 text-[10px] mb-0.5">AVG SPEED</div>
              <div className="text-white font-bold text-sm font-mono">{trafficStats.avg_speed.toFixed(0)}</div>
              <div className="text-gray-600 text-[10px]">km/h</div>
              {baseline && (() => {
                const d = trafficStats.avg_speed - baseline.avg_speed
                return d !== 0 ? (
                  <div className={`text-[10px] font-bold mt-0.5 ${d > 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {d > 0 ? '▲' : '▼'} {Math.abs(d).toFixed(1)}
                  </div>
                ) : null
              })()}
            </div>

            {/* Stopped */}
            <div className="bg-white/5 rounded-xl px-2 py-2">
              <div className="text-gray-500 text-[10px] mb-0.5">STOPPED</div>
              <div className={`font-bold text-sm font-mono ${trafficStats.stopped_count > 10 ? 'text-red-400' : trafficStats.stopped_count > 3 ? 'text-amber-400' : 'text-green-400'}`}>
                {trafficStats.stopped_count}
              </div>
              <div className="text-gray-600 text-[10px]">vehicles</div>
              {baseline && (() => {
                const d = trafficStats.stopped_count - baseline.stopped_count
                return d !== 0 ? (
                  <div className={`text-[10px] font-bold mt-0.5 ${d < 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {d > 0 ? '▲' : '▼'} {Math.abs(d)}
                  </div>
                ) : null
              })()}
            </div>

            {/* Total */}
            <div className="bg-white/5 rounded-xl px-2 py-2">
              <div className="text-gray-500 text-[10px] mb-0.5">TOTAL</div>
              <div className="text-white font-bold text-sm font-mono">{trafficStats.vehicle_count}</div>
              <div className="text-gray-600 text-[10px]">vehicles</div>
            </div>
          </div>

          {/* Heatmap toggle */}
          <button
            onClick={() => setShowHeatmap(h => !h)}
            className={`mt-2 w-full text-xs py-1.5 rounded-lg font-semibold border transition-all flex items-center justify-center gap-1.5 ${
              showHeatmap
                ? 'bg-red-500/15 border-red-500/40 text-red-400 hover:bg-red-500/25'
                : 'bg-white/5 border-white/15 text-gray-400 hover:bg-white/10 hover:text-white'
            }`}
          >
            🌡 Congestion Heatmap {showHeatmap ? 'ON' : 'OFF'}
          </button>
        </div>
      )}

      {/* ── Traffic signal override badge ── */}
      {liveState === 'running' && tlsOverrideCount > 0 && (
        <div className="absolute top-16 right-3 z-10 flex items-center gap-2 bg-amber-950/90 backdrop-blur border border-amber-500/40 rounded-xl px-3 py-1.5 text-xs">
          <span className="text-amber-400 font-bold">
            🚦 {tlsOverrideCount} signal{tlsOverrideCount > 1 ? 's' : ''} overridden
          </span>
          <button
            onClick={() => {
              const ids = [...tlsOverrides.current]
              ids.forEach(id => sendTlsControl(id, 'reset'))
            }}
            className="text-gray-500 hover:text-red-400 transition-all font-bold"
            title="Reset all to auto"
          >↺</button>
        </div>
      )}

      {/* ── Traffic signal control popup ── */}
      {tlsSelected && liveState === 'running' && (
        <div className="absolute bottom-28 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 bg-gray-950/95 backdrop-blur-xl border border-white/20 rounded-2xl px-4 py-2.5 shadow-2xl">
          <span className="text-base">🚦</span>
          <span className="text-xs text-gray-400 font-mono max-w-[100px] truncate">{tlsSelected}</span>
          {(tlsQueues.current.get(tlsSelected) ?? 0) > 0 && (
            <span className="text-xs font-bold text-red-400 bg-red-500/15 border border-red-500/30 rounded-lg px-1.5 py-0.5">
              {tlsQueues.current.get(tlsSelected)} waiting
            </span>
          )}
          <div className="w-px h-5 bg-white/10" />
          <button
            onClick={() => sendTlsControl(tlsSelected, 'force_green')}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-green-500/20 border border-green-500/40 text-green-400 hover:bg-green-500/35 transition-all"
          >🟢 Green</button>
          <button
            onClick={() => sendTlsControl(tlsSelected, 'force_red')}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-red-500/20 border border-red-500/40 text-red-400 hover:bg-red-500/35 transition-all"
          >🔴 Red</button>
          <button
            onClick={() => sendTlsControl(tlsSelected, 'reset')}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-white/8 border border-white/20 text-gray-300 hover:bg-white/15 hover:text-white transition-all"
          >↺ Auto</button>
          <button
            onClick={() => setTlsSelected(null)}
            className="w-6 h-6 rounded-lg bg-white/5 hover:bg-white/15 text-gray-500 hover:text-white flex items-center justify-center transition-all"
          >✕</button>
        </div>
      )}

      {/* ── Car follow camera UI ── */}
      {followInfo.active && (
        <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 bg-gray-950/95 backdrop-blur-xl border border-white/15 rounded-2xl px-4 py-2.5 shadow-2xl">
          <span className={`text-xs font-semibold mr-1 ${egoActive ? 'text-amber-400' : 'text-sky-400'}`}>
            {egoActive ? '🚗 Ego Car' : '🎯 Following car'}
          </span>
          <button
            onClick={() => startFollowRef.current?.(followEntityRef.current, 'top')}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
              followInfo.mode === 'top'
                ? 'bg-sky-500 text-white shadow-lg shadow-sky-900/30'
                : 'bg-white/8 text-gray-400 hover:bg-white/15 hover:text-white'
            }`}
          >
            ⬆ Top
          </button>
          <button
            onClick={() => startFollowRef.current?.(followEntityRef.current, 'front')}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
              followInfo.mode === 'front'
                ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-900/30'
                : 'bg-white/8 text-gray-400 hover:bg-white/15 hover:text-white'
            }`}
          >
            🚗 Follow
          </button>
          <button
            onClick={() => startFollowRef.current?.(followEntityRef.current, 'cockpit')}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
              followInfo.mode === 'cockpit'
                ? 'bg-amber-500 text-white shadow-lg shadow-amber-900/30'
                : 'bg-white/8 text-gray-400 hover:bg-white/15 hover:text-white'
            }`}
          >
            🚘 Drive
          </button>
          <button
            onClick={stopFollow}
            className="px-3 py-1 rounded-lg text-xs font-semibold bg-red-500/20 text-red-400 hover:bg-red-500/35 hover:text-red-300 transition-all border border-red-500/30"
          >
            ✕ Stop
          </button>
        </div>
      )}
    </div>
  )
}
