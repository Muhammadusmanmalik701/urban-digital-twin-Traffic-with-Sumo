import { useEffect, useRef, useState, useCallback } from 'react'
import {
  Viewer,
  Ion,
  Cartesian3,
  Cartesian2,
  Color,
  HeightReference,
  NearFarScalar,
  Math as CesiumMath,
  PolylineGlowMaterialProperty,
  VerticalOrigin,
  HorizontalOrigin,
  LabelStyle,
  createWorldTerrainAsync,
  createOsmBuildingsAsync,
  ConstantPositionProperty,
  ConstantProperty,
  CzmlDataSource,
  VelocityOrientationProperty,
  JulianDate,
  ClockRange,
  SceneMode,
  EllipsoidTerrainProvider,
  Transforms,
  HeadingPitchRoll,
} from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'
import { useSimulationStore } from '../../store/simulationStore'
import { useBuildingStore } from '../../store/buildingStore'
import { useLayerStore } from '../../store/layerStore'
import { useMapControlStore } from '../../store/mapControlStore'
import { api } from '../../services/api'

Ion.defaultAccessToken = import.meta.env.VITE_CESIUM_TOKEN || ''

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

async function fetchRoads(osmName: string) {
  const q = `[out:json][timeout:90];
area["name"="${osmName}"]["admin_level"=8]->.s;
(way["highway"](area.s);way["railway"="tram"](area.s);way["railway"="rail"](area.s););
out geom;`
  const r = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST', body: q, headers: { 'Content-Type': 'text/plain' },
  })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json()
}

const roadTypeMap = new WeakMap<object, RoadType>()

// ─── Static CZML sim state ─────────────────────────────────────────────────────
interface SimState {
  loaded: boolean; playing: boolean; speed: number; timeStr: string; is3D: boolean
}

// ─── Live SUMO state ───────────────────────────────────────────────────────────
type LiveState = 'idle' | 'connecting' | 'waiting' | 'running' | 'error' | 'stopped'

// Convert SUMO compass angle → Cesium orientation quaternion
// SUMO: clockwise from North (0=N, 90=E, 180=S, 270=W)
// Cesium heading: clockwise from East in local ENU frame
// Fix: subtract 90° to shift reference axis from North → East
function sumoAngleToOrientation(lon: number, lat: number, angleDeg: number) {
  const pos = Cartesian3.fromDegrees(lon, lat, 0)
  const hpr = new HeadingPitchRoll(CesiumMath.toRadians(angleDeg + 90.0), 0, 0)
  return Transforms.headingPitchRollQuaternion(pos, hpr)
}

export function CesiumViewer() {
  const viewerRef       = useRef<HTMLDivElement>(null)
  const cesiumViewer    = useRef<Viewer | null>(null)
  const vehicleEntities = useRef<Map<string, any>>(new Map())
  const roadEntities    = useRef<any[]>([])
  const osmBuildings    = useRef<any>(null)
  const areaMarkers     = useRef<Map<string, any>>(new Map())
  const sumoDS          = useRef<CzmlDataSource | null>(null)
  const clockTickOff    = useRef<() => void>()
  // Live sim refs
  const liveWS          = useRef<WebSocket | null>(null)
  const liveEntities    = useRef<Map<string, any>>(new Map())

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
    let lv: Viewer | null = null

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

      // OSM buildings
      try {
        const b = await createOsmBuildingsAsync()
        if (!cancelled) { osmBuildings.current = lv!.scene.primitives.add(b) } else b.destroy()
      } catch {}

      if (cancelled) return

      // Entity click
      lv.selectedEntityChanged.addEventListener((sel) => {
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
      }).catch(console.error)

      } catch (err) {
        // Outer safety net — prevents unhandled promise rejection crashing the app
        console.error('[Cesium] Init failed:', err)
      }
    })()

    return () => {
      cancelled = true
      clockTickOff.current?.()
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
    viewer.camera.flyTo({
      destination: Cartesian3.fromDegrees(area.lon, area.lat, area.height),
      orientation: { heading: 0, pitch: CesiumMath.toRadians(-42), roll: 0 },
      duration: 2.5,
    })
  }, [flyTarget])

  // ── Multi-area road loading ─────────────────────────────────────────────────
  useEffect(() => {
    if (!loadTrigger) return
    const viewer = cesiumViewer.current
    if (!viewer || !selectedAreas.length) return

    const load = async () => {
      setLoadingRoads(true); setRoadCount(0)
      roadEntities.current.forEach((e) => viewer.entities.remove(e))
      roadEntities.current = []
      let total = 0

      for (let i = 0; i < selectedAreas.length; i++) {
        const key = selectedAreas[i]
        const area = AREAS[key]
        if (!area) continue
        setLoadProgress(`Loading ${key} (${i + 1}/${selectedAreas.length})…`)
        try {
          const data = await fetchRoads(area.osmName)
          const filter = useMapControlStore.getState().roadFilter
          data.elements.forEach((el: any) => {
            if (el.type !== 'way' || !el.geometry || el.geometry.length < 2) return
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
            roadEntities.current.push(entity)
            total++
          })
          setRoadCount(total)
        } catch (e) { console.error(`Roads failed for ${key}:`, e) }
      }
      setLoadProgress(''); setLoadingRoads(false)
    }
    load()
  }, [loadTrigger])

  // ── Road filter visibility ──────────────────────────────────────────────────
  useEffect(() => {
    roadEntities.current.forEach((e) => {
      const rtype = roadTypeMap.get(e)
      if (e.polyline && rtype) e.polyline.show = roadFilter[rtype]
    })
  }, [roadFilter])

  // ── OSM buildings ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (osmBuildings.current) osmBuildings.current.show = showBuildings
  }, [showBuildings])

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

    // Add velocity-based orientation so trucks face the direction they travel
    ds.entities.values.forEach(entity => {
      if (entity.position) {
        entity.orientation = new VelocityOrientationProperty(entity.position)
      }
    })

    // Clock setup
    viewer.clock.shouldAnimate = false
    viewer.clock.multiplier = 1
    viewer.clock.clockRange = ClockRange.LOOP_STOP

    // Live time display
    const off = viewer.clock.onTick.addEventListener((clock) => {
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
        setLiveSimTime(data.simTime ?? 0)

        const v = cesiumViewer.current
        if (!v) return

        const activeIds = new Set<string>()
        ;(data.features ?? []).forEach((f: any) => {
          const id: string = String(f.id ?? f.properties?.id)
          const [lon, lat] = f.geometry.coordinates
          const angle: number = f.properties?.angle ?? 0
          activeIds.add(id)

          const pos = Cartesian3.fromDegrees(lon, lat, 0)
          const ori = new ConstantProperty(sumoAngleToOrientation(lon, lat, angle))

          if (liveEntities.current.has(id)) {
            const e = liveEntities.current.get(id)
            e.position = new ConstantPositionProperty(pos)
            e.orientation = ori
          } else {
            const e = v.entities.add({
              id: `live_${id}`,
              position: new ConstantPositionProperty(pos),
              orientation: ori,
              model: {
                uri: '/sumo/ferrari.glb',
                scale: 1.0,
                minimumPixelSize: 10,
                maximumScale: 20,
                heightReference: HeightReference.CLAMP_TO_GROUND,
              },
            })
            liveEntities.current.set(id, e)
          }
        })

        // Remove vehicles that left the simulation
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
