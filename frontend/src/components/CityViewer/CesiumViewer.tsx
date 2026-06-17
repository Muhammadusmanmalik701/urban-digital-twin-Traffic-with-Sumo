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
  PolygonHierarchy,
  JulianDate,
  ClockRange,
  SceneMode,
  EllipsoidTerrainProvider,
  Transforms,
  HeadingPitchRoll,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
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


const roadTypeMap = new WeakMap<object, RoadType>()

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

interface VehicleModel { uri: string; scale: number; maxScale: number; color?: any }
function getVehicleModel(vtype: string): VehicleModel {
  const t = (vtype || '').toLowerCase()
  if (t.includes('bus') || t.includes('coach'))
    return { uri: '/sumo/truck.glb', scale: 2.2, maxScale: 45,
             color: Color.fromCssColorString('#34d399') }   // green bus
  if (t.includes('truck') || t.includes('trailer') || t.includes('heavy') || t.includes('delivery'))
    return { uri: '/sumo/truck.glb', scale: 1.4, maxScale: 28 }  // milk-truck colour
  if (t.includes('moto') || t.includes('bicycle') || t.includes('bike'))
    return { uri: '/sumo/ferrari.glb', scale: 0.55, maxScale: 11,
             color: Color.fromCssColorString('#fbbf24') }   // yellow moped
  return { uri: '/sumo/ferrari.glb', scale: 1.0, maxScale: 20 }  // red passenger car
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
  const buildingPolygons = useRef<any[]>([])
  // Per-area boundary + buildings (from area-select trigger)
  const areaEntities        = useRef<Map<string, any[]>>(new Map())
  // Hover boundary entities (pre-fetched, hidden by default)
  const hoverBoundaryCache  = useRef<Map<string, any[]>>(new Map())
  const hoveredAreaKey      = useRef<string | null>(null)
  const hoverHandlerRef     = useRef<any>(null)

  const [viewerReady, setViewerReady] = useState(false)
  const [sim, setSim] = useState<SimState>({
    loaded: false, playing: false, speed: 1, timeStr: '00:00', is3D: true,
  })
  const [liveState, setLiveState]   = useState<LiveState>('idle')
  const [liveCount, setLiveCount]   = useState(0)
  const [liveSimTime, setLiveSimTime] = useState(0)
  const [liveMsg, setLiveMsg]       = useState('')

  const { vehicles } = useSimulationStore()
  const { setSelectedBuilding } = useBuildingStore()
  const { showTraffic, showBuildings } = useLayerStore()
  const {
    flyTarget, loadTrigger, roadFilter, selectedAreas,
    toggleArea, flyToArea,
    setRoadCount, setLoadingRoads, setLoadProgress,
  } = useMapControlStore()

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
        if (sel.properties?.buildingId) {
          api.getBuilding(sel.properties.buildingId.getValue())
            .then((b: any) => setSelectedBuilding(b)).catch(console.error)
        }
      })

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

    const BLDG_COLOR   = new Color(147/255, 197/255, 253/255, 0.20)
    const BLDG_OUTLINE = new Color(59/255,  130/255, 246/255, 0.50)
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

        // ── 2. Buildings (local file → BDTOPO WFS fallback) ──────────────────
        try {
          const bldgData = await fetchBuildings(area.osmName)
          if (cancelled) break

          const isBDTOPO = !!bldgData.features  // GeoJSON FeatureCollection
          const feats = isBDTOPO
            ? bldgData.features
            : (bldgData.elements ?? []).filter((el: any) => el.type === 'way' && el.tags?.building)

          feats.forEach((feat: any) => {
            try {
              let coords: any[]
              let h: number

              if (isBDTOPO) {
                // GeoJSON from local file or BDTOPO WFS
                h = feat.properties?.height ?? 9.6
                const geom = feat.geometry
                if (!geom || !['Polygon','MultiPolygon'].includes(geom.type)) return
                const ring = geom.type === 'MultiPolygon'
                  ? geom.coordinates[0][0]
                  : geom.coordinates[0]
                if (!ring || ring.length < 3) return
                coords = ring.map(([lon, lat]: [number,number]) => Cartesian3.fromDegrees(lon, lat))
              } else {
                // Overpass fallback (should rarely trigger now)
                if (!feat.geometry || feat.geometry.length < 3) return
                const tags = feat.tags ?? {}
                const lvl = parseFloat(tags['building:levels'] ?? tags['levels'] ?? '3')
                h = isNaN(lvl) ? 9.6 : Math.max(lvl, 1) * 3.2
                coords = feat.geometry.map((n: any) => Cartesian3.fromDegrees(n.lon, n.lat))
              }

              const e = viewer.entities.add({
                polygon: {
                  hierarchy: new PolygonHierarchy(coords),
                  height: 0,
                  heightReference: HeightReference.CLAMP_TO_GROUND,
                  extrudedHeight: h,
                  extrudedHeightReference: HeightReference.RELATIVE_TO_GROUND,
                  material: BLDG_COLOR,
                  outline: true,
                  outlineColor: BLDG_OUTLINE,
                  outlineWidth: 1,
                },
              })
              list.push(e)
            } catch { /* skip malformed */ }
          })
        } catch (err) {
          console.warn(`[Buildings] Failed for ${key}:`, err)
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
    // BDTOPO polygon buildings
    buildingPolygons.current.forEach(e => { if (e.polygon) e.polygon.show = showBuildings })
  }, [showBuildings, viewerReady])

  // ── Road filter visibility ──────────────────────────────────────────────────
  useEffect(() => {
    roadEntities.current.forEach(list => list.forEach(e => {
      const rtype = roadTypeMap.get(e)
      if (e.polyline && rtype) e.polyline.show = roadFilter[rtype]
    }))
  }, [roadFilter])

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
          } else {
            const sampledPos = new SampledPositionProperty()
            sampledPos.setInterpolationOptions({ interpolationAlgorithm: LinearApproximation, interpolationDegree: 1 })
            sampledPos.forwardExtrapolationType = ExtrapolationType.HOLD
            sampledPos.backwardExtrapolationType = ExtrapolationType.HOLD
            sampledPos.addSample(jt, pos)
            const vm = getVehicleModel(vtype)
            const e = v.entities.add({
              id: `live_${id}`,
              position: sampledPos,
              orientation: new ConstantProperty(orient),
              model: {
                uri: vm.uri,
                scale: vm.scale,
                minimumPixelSize: 10,
                maximumScale: vm.maxScale,
                heightReference: HeightReference.CLAMP_TO_GROUND,
                ...(vm.color ? {
                  color: vm.color,
                  colorBlendMode: ColorBlendMode.MIX,
                  colorBlendAmount: 0.45,
                } : {}),
              },
            })
            liveEntities.current.set(id, e)
          }
        })

        liveEntities.current.forEach((e, id) => {
          if (!activeIds.has(id)) {
            v.entities.remove(e)
            liveEntities.current.delete(id)
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
    liveEpoch.current = null
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

      {/* ── Live 2D/3D toggle (when live is running) ── */}
      {liveState === 'running' && (
        <button
          onClick={toggle2D3D}
          className="absolute bottom-8 right-3 z-10 text-xs px-3 py-1.5 rounded-lg bg-gray-900/90 backdrop-blur border border-white/15 text-gray-300 hover:text-white hover:bg-white/10 transition-all font-semibold"
        >
          {sim.is3D ? '🗺️ 2D' : '🌐 3D'}
        </button>
      )}
    </div>
  )
}
