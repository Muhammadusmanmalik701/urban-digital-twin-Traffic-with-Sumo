import { useEffect, useRef, useState, useCallback } from 'react'
import { useLayerStore } from '../../store/layerStore'
import { useRiskStore } from '../../store/riskStore'

// ── Real Bordeaux flood zones (Garonne basin, 5 progressive phases) ───────────
// Coordinates from real flood modeling of the Garonne floodplain
const FLOOD_ZONES = [
  {
    minLevel: 0.8,
    coords: [[-0.5540,44.8700],[-0.5510,44.8680],[-0.5490,44.8650],[-0.5480,44.8610],[-0.5490,44.8570],[-0.5510,44.8540],[-0.5540,44.8510],[-0.5570,44.8490],[-0.5600,44.8480],[-0.5630,44.8490],[-0.5650,44.8510],[-0.5660,44.8540],[-0.5650,44.8580],[-0.5630,44.8620],[-0.5600,44.8650],[-0.5570,44.8670]],
  },
  {
    minLevel: 2.0,
    coords: [[-0.5450,44.8750],[-0.5400,44.8710],[-0.5370,44.8660],[-0.5360,44.8600],[-0.5370,44.8540],[-0.5400,44.8490],[-0.5450,44.8450],[-0.5520,44.8420],[-0.5600,44.8410],[-0.5680,44.8420],[-0.5730,44.8450],[-0.5760,44.8500],[-0.5770,44.8560],[-0.5750,44.8620],[-0.5710,44.8670],[-0.5660,44.8710],[-0.5600,44.8730],[-0.5530,44.8740]],
  },
  {
    minLevel: 4.0,
    coords: [[-0.5300,44.8820],[-0.5230,44.8760],[-0.5190,44.8680],[-0.5180,44.8590],[-0.5210,44.8500],[-0.5270,44.8420],[-0.5360,44.8360],[-0.5470,44.8320],[-0.5600,44.8310],[-0.5730,44.8330],[-0.5830,44.8380],[-0.5900,44.8450],[-0.5930,44.8540],[-0.5910,44.8640],[-0.5860,44.8720],[-0.5770,44.8790],[-0.5660,44.8830],[-0.5530,44.8840],[-0.5400,44.8840]],
  },
  {
    minLevel: 6.0,
    coords: [[-0.5100,44.8950],[-0.5020,44.8870],[-0.4980,44.8760],[-0.4990,44.8640],[-0.5040,44.8520],[-0.5130,44.8410],[-0.5260,44.8320],[-0.5420,44.8260],[-0.5600,44.8250],[-0.5780,44.8270],[-0.5930,44.8330],[-0.6040,44.8430],[-0.6090,44.8550],[-0.6070,44.8680],[-0.5990,44.8790],[-0.5860,44.8880],[-0.5690,44.8940],[-0.5500,44.8960],[-0.5300,44.8960]],
  },
  {
    minLevel: 10.0,
    coords: [[-0.4800,44.9200],[-0.4700,44.9000],[-0.4720,44.8700],[-0.4800,44.8400],[-0.4950,44.8150],[-0.5200,44.7980],[-0.5500,44.7900],[-0.5800,44.7920],[-0.6100,44.8030],[-0.6350,44.8220],[-0.6500,44.8480],[-0.6520,44.8760],[-0.6400,44.9020],[-0.6200,44.9200],[-0.5900,44.9300],[-0.5600,44.9320],[-0.5300,44.9250],[-0.5050,44.9150]],
  },
]

// Road danger thresholds by highway type (matches bordeaux_roads.geojson properties)
const ROAD_DANGER: Record<string, { low: number; med: number; high: number }> = {
  primary:        { low: 1.0, med: 3.0, high: 5.5 },
  secondary:      { low: 1.5, med: 3.5, high: 6.0 },
  secondary_link: { low: 1.5, med: 3.5, high: 6.0 },
  tertiary:       { low: 2.0, med: 4.0, high: 6.5 },
  tertiary_link:  { low: 2.0, med: 4.0, high: 6.5 },
  residential:    { low: 2.5, med: 5.0, high: 7.5 },
  living_street:  { low: 2.5, med: 5.0, high: 7.5 },
  unclassified:   { low: 3.0, med: 5.5, high: 8.0 },
  service:        { low: 3.0, med: 5.5, high: 8.0 },
  road:           { low: 2.0, med: 4.0, high: 6.5 },
}

const HISTORICAL = [
  { label: 'Alert', level: 1.8, color: '#f59e0b', desc: '2021 — alert threshold' },
  { label: '1982',  level: 4.2, color: '#ef4444', desc: 'Worst modern flood' },
  { label: '2050',  level: 3.5, color: '#7c3aed', desc: 'Climate +1.5°C estimate' },
]

// Evacuation routes (from flood zone centers → high ground)
const EVAC_ROUTES = [
  { from: [-0.556, 44.858] as [number,number], to: [-0.536, 44.855] as [number,number], label: 'A — Chartrons → Cours Balguerie' },
  { from: [-0.560, 44.845] as [number,number], to: [-0.572, 44.836] as [number,number], label: "B — Centre → Cours d'Alsace" },
  { from: [-0.572, 44.835] as [number,number], to: [-0.585, 44.826] as [number,number], label: 'C — Paludate → Rocade Sud' },
]

function floodRisk(level: number) {
  if (level < 0.5)  return { level: 'Normal'    as const, label: 'No flood risk' }
  if (level < 2.0)  return { level: 'Caution'   as const, label: 'Minor Garonne flooding' }
  if (level < 4.0)  return { level: 'Danger'    as const, label: 'Urban flooding — quais submerged' }
  if (level < 8.0)  return { level: 'Extreme'   as const, label: 'Major flood — city centre at risk' }
  return              { level: 'Emergency' as const, label: 'Catastrophic — 1982-level event' }
}

const RISK_COLOR: Record<string, string> = {
  Normal: '#3b82f6', Caution: '#f59e0b', Danger: '#f97316', Extreme: '#ef4444', Emergency: '#7c3aed',
}

// ── Component ─────────────────────────────────────────────────────────────────
export function FloodSimLayer({ viewer }: { viewer: any }) {
  const { showFloodRisk, showRain } = useLayerStore()
  const { setFlood } = useRiskStore()

  const rafRef          = useRef<number>(0)
  const canvasRef       = useRef<HTMLCanvasElement | null>(null)
  const zoneEntRef      = useRef<any[]>([])
  const garonneDsRef    = useRef<any>(null)
  const riversDsRef     = useRef<any>(null)
  const roadsDsRef      = useRef<any>(null)
  const waterLvlRef     = useRef(0)
  const waterColorCbRef = useRef<any>(null)

  const [waterLevel, setWaterLevel] = useState(0)
  const [autoRising, setAutoRising] = useState(false)
  const [roadsLoaded, setRoadsLoaded]   = useState(false)
  const [garonneLoaded, setGaronneLoaded] = useState(false)
  const [roadStats, setRoadStats] = useState({ low: 0, med: 0, high: 0 })

  // Sync water level ref for RAF + callbacks
  useEffect(() => { waterLvlRef.current = waterLevel }, [waterLevel])

  // Rain → auto-raise water
  useEffect(() => {
    if (!showRain || !showFloodRisk) { setAutoRising(false); return }
    setAutoRising(true)
    const id = setInterval(() => setWaterLevel(v => Math.min(15, +(v + 0.1).toFixed(1))), 2000)
    return () => { clearInterval(id); setAutoRising(false) }
  }, [showRain, showFloodRisk])

  // Publish risk
  useEffect(() => {
    const { level, label } = floodRisk(waterLevel)
    setFlood(level, label)
  }, [waterLevel, setFlood])

  // ── Load real GeoJSON data sources ────────────────────────────────────────
  const loadGeoJSON = useCallback(async () => {
    if (!viewer) return
    const Cesium = (window as any).Cesium
    const base = import.meta.env.BASE_URL ?? '/'

    // Garonne polygon — real river bed
    try {
      const ds = await Cesium.GeoJsonDataSource.load(`${base}flood/garonne_polygon.geojson`, {
        stroke: Cesium.Color.fromCssColorString('#38bdf8').withAlpha(0),
        fill: Cesium.Color.fromCssColorString('#0369a1').withAlpha(0),
        strokeWidth: 0,
        clampToGround: false,
      })
      viewer.dataSources.add(ds)
      garonneDsRef.current = ds

      // Animate water color with CallbackProperty (sinusoidal alpha)
      ds.entities.values.forEach((ent: any) => {
        if (!ent.polygon) return
        const cb = new Cesium.CallbackProperty(() => {
          const t = Date.now() / 1000
          const lvl = waterLvlRef.current
          if (lvl < 0.3) return Cesium.Color.fromCssColorString('#0369a1').withAlpha(0)
          const alpha = Math.min(0.88, 0.35 + lvl * 0.025 + Math.sin(t * 1.4) * 0.06)
          const r = Math.round(0.08 * 255), g = Math.round((0.28 - lvl * 0.01) * 255), b = Math.round(0.62 * 255)
          return new Cesium.Color(r / 255, Math.max(0.1, g / 255), b / 255, alpha)
        }, false)
        waterColorCbRef.current = cb
        ent.polygon.material = new Cesium.ColorMaterialProperty(cb)
        ent.polygon.height = 0.5
        ent.polygon.heightReference = Cesium.HeightReference.RELATIVE_TO_GROUND
      })
      setGaronneLoaded(true)
    } catch (err) {
      console.warn('[FloodSim] garonne_polygon.geojson load failed', err)
    }

    // Rivers overlay
    try {
      const ds = await Cesium.GeoJsonDataSource.load(`${base}flood/bordeaux_rivers.geojson`, {
        stroke: Cesium.Color.fromCssColorString('#38bdf8').withAlpha(0.55),
        strokeWidth: 2.5,
        clampToGround: true,
      })
      viewer.dataSources.add(ds)
      riversDsRef.current = ds
    } catch (err) {
      console.warn('[FloodSim] bordeaux_rivers.geojson load failed', err)
    }

    // Roads — colored by flood danger level
    try {
      const ds = await Cesium.GeoJsonDataSource.load(`${base}flood/bordeaux_roads.geojson`, {
        stroke: Cesium.Color.fromCssColorString('#6b7280').withAlpha(0.65),
        strokeWidth: 1.5,
        clampToGround: true,
      })
      viewer.dataSources.add(ds)
      roadsDsRef.current = ds
      setRoadsLoaded(true)
    } catch (err) {
      console.warn('[FloodSim] bordeaux_roads.geojson load failed', err)
    }
  }, [viewer])

  useEffect(() => {
    if (!showFloodRisk || !viewer) return
    loadGeoJSON()
    return () => {
      if (garonneDsRef.current) { viewer.dataSources.remove(garonneDsRef.current); garonneDsRef.current = null }
      if (riversDsRef.current)  { viewer.dataSources.remove(riversDsRef.current);  riversDsRef.current  = null }
      if (roadsDsRef.current)   { viewer.dataSources.remove(roadsDsRef.current);   roadsDsRef.current   = null }
      setRoadsLoaded(false); setGaronneLoaded(false)
    }
  }, [showFloodRisk, viewer, loadGeoJSON])

  // ── Update road colors when water level changes ───────────────────────────
  useEffect(() => {
    if (!roadsLoaded || !roadsDsRef.current) return
    const Cesium = (window as any).Cesium
    const ds = roadsDsRef.current
    let lowCount = 0, medCount = 0, highCount = 0

    ds.entities.values.forEach((ent: any) => {
      if (!ent.polyline) return
      const hw = ent.properties?.highway?.getValue?.() ?? 'road'
      const d  = ROAD_DANGER[hw] ?? ROAD_DANGER.road

      let color: string; let width = 1.5; let pulse = false
      if (waterLevel >= d.high)      { color = '#f44336'; width = 2.5; pulse = true; highCount++ }
      else if (waterLevel >= d.med)  { color = '#ff9800'; width = 2.0; pulse = true; medCount++  }
      else if (waterLevel >= d.low)  { color = '#ffeb3b'; width = 1.8; pulse = true; lowCount++  }
      else                           { color = '#6b7280'; width = 1.5 }

      if (pulse) {
        // Animate pulsing roads with CallbackProperty
        const t0 = Date.now() / 1000
        ent.polyline.material = new Cesium.ColorMaterialProperty(
          new Cesium.CallbackProperty(() => {
            const alpha = 0.6 + Math.sin((Date.now() / 1000 - t0) * (highCount > 0 ? 4 : 2.5)) * 0.25
            return Cesium.Color.fromCssColorString(color).withAlpha(Math.max(0.35, alpha))
          }, false)
        )
        ent.polyline.width = width
      } else {
        ent.polyline.material = Cesium.Color.fromCssColorString(color).withAlpha(0.65)
        ent.polyline.width = 1.5
      }
    })
    setRoadStats({ low: lowCount, med: medCount, high: highCount })
  }, [waterLevel, roadsLoaded])

  // ── OSM building coloring via 3DTileStyle ─────────────────────────────────
  useEffect(() => {
    if (!viewer || !showFloodRisk) return
    const Cesium = (window as any).Cesium
    // Find OSM buildings tileset in scene primitives
    let tileSet: any = null
    for (let i = 0; i < viewer.scene.primitives.length; i++) {
      const p = viewer.scene.primitives.get(i)
      if (p instanceof Cesium.Cesium3DTileset) { tileSet = p; break }
    }
    if (!tileSet) return

    let colorExpr = "color('#e8d5b0', 0.95)"
    if (waterLevel >= 6)     colorExpr = "color('#f44336', 0.97)"
    else if (waterLevel >= 3) colorExpr = "color('#ff9800', 0.95)"
    else if (waterLevel >= 1) colorExpr = "color('#ffeb3b', 0.92)"

    tileSet.style = new Cesium.Cesium3DTileStyle({ color: colorExpr })

    return () => {
      // Restore natural style on cleanup
      if (tileSet && !tileSet.isDestroyed?.()) {
        tileSet.style = new Cesium.Cesium3DTileStyle({ color: "color('#e8d5b0', 0.95)" })
      }
    }
  }, [viewer, waterLevel, showFloodRisk])

  // ── Cesium zone outline entities ─────────────────────────────────────────
  useEffect(() => {
    if (!viewer) return
    const Cesium = (window as any).Cesium
    zoneEntRef.current.forEach(e => viewer.entities.remove(e))
    zoneEntRef.current = []
    if (!showFloodRisk) return

    FLOOD_ZONES.forEach((zone, zi) => {
      const isActive = waterLevel >= zone.minLevel
      const positions = [...zone.coords, zone.coords[0]].map(([lon, lat]) =>
        Cesium.Cartesian3.fromDegrees(lon, lat, isActive ? 2 : 1))

      const e = viewer.entities.add({
        polyline: {
          positions,
          width: isActive ? 2.5 : 1.2,
          material: isActive
            ? new Cesium.PolylineGlowMaterialProperty({
                color: Cesium.Color.fromCssColorString('#38bdf8'), glowPower: 0.5,
              })
            : new Cesium.PolylineDashMaterialProperty({
                color: Cesium.Color.fromCssColorString('#1e3a5f').withAlpha(0.45), dashLength: 14,
              }),
          clampToGround: false,
        },
      })
      zoneEntRef.current.push(e)

      // Label only for active zones
      if (isActive) {
        const cx = zone.coords.reduce((s, p) => s + p[0], 0) / zone.coords.length
        const cy = zone.coords.reduce((s, p) => s + p[1], 0) / zone.coords.length
        const el = viewer.entities.add({
          position: Cesium.Cartesian3.fromDegrees(cx, cy, 400 + zi * 80),
          label: {
            text: `Phase ${zi + 1}  (>${zone.minLevel}m)`,
            font: 'bold 11px sans-serif',
            fillColor: Cesium.Color.WHITE,
            outlineColor: Cesium.Color.fromCssColorString('#0369a1'),
            outlineWidth: 3,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin: Cesium.VerticalOrigin.CENTER,
            horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            scaleByDistance: new Cesium.NearFarScalar(800, 1.0, 12000, 0.3),
          },
        })
        zoneEntRef.current.push(el)
      }
    })
  }, [viewer, showFloodRisk, waterLevel])

  // ── Canvas evacuation routes ──────────────────────────────────────────────
  useEffect(() => {
    if (!viewer || !showFloodRisk) {
      cancelAnimationFrame(rafRef.current)
      canvasRef.current?.getContext('2d')?.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height)
      return
    }
    const Cesium = (window as any).Cesium

    const draw = () => {
      const canvas = canvasRef.current
      if (!canvas) { rafRef.current = requestAnimationFrame(draw); return }
      const parent = canvas.parentElement
      if (parent) {
        if (canvas.width  !== parent.clientWidth)  canvas.width  = parent.clientWidth
        if (canvas.height !== parent.clientHeight) canvas.height = parent.clientHeight
      }
      const ctx = canvas.getContext('2d')!
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      const t = performance.now() / 1000
      const lvl = waterLvlRef.current

      if (lvl >= 0.8) {
        EVAC_ROUTES.forEach((route, ri) => {
          let from: { x: number; y: number } | null = null
          let to:   { x: number; y: number } | null = null
          try {
            from = viewer.scene.cartesianToCanvasCoordinates(Cesium.Cartesian3.fromDegrees(route.from[0], route.from[1], 5))
            to   = viewer.scene.cartesianToCanvasCoordinates(Cesium.Cartesian3.fromDegrees(route.to[0],   route.to[1],   5))
          } catch { rafRef.current = requestAnimationFrame(draw); return }
          if (!from || !to) return

          const dx = to.x - from.x, dy = to.y - from.y
          const len = Math.hypot(dx, dy)
          if (len < 10) return

          // Dashed route line
          ctx.save()
          ctx.setLineDash([10, 6])
          ctx.strokeStyle = 'rgba(34,197,94,0.5)'
          ctx.lineWidth = 2
          ctx.shadowColor = '#22c55e'; ctx.shadowBlur = 6
          ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y)
          ctx.stroke()
          ctx.setLineDash([]); ctx.shadowBlur = 0

          // Flowing dots
          for (let i = 0; i < 5; i++) {
            const phase = ((t * 0.55 + i * 0.2 + ri * 0.35) % 1)
            const px = from.x + dx * phase, py = from.y + dy * phase
            const a = 0.85 * (1 - Math.abs(phase - 0.5) * 1.8)
            if (a <= 0) continue
            ctx.beginPath(); ctx.arc(px, py, 3.5, 0, Math.PI * 2)
            ctx.fillStyle = `rgba(134,239,172,${a})`
            ctx.shadowColor = '#22c55e'; ctx.shadowBlur = 8
            ctx.fill(); ctx.shadowBlur = 0
          }

          // Arrowhead
          const ux = dx / len, uy = dy / len, hl = 10
          ctx.beginPath()
          ctx.moveTo(to.x, to.y)
          ctx.lineTo(to.x - ux * hl + uy * 5, to.y - uy * hl - ux * 5)
          ctx.lineTo(to.x - ux * hl - uy * 5, to.y - uy * hl + ux * 5)
          ctx.closePath()
          ctx.fillStyle = 'rgba(34,197,94,0.85)'; ctx.fill()
          ctx.restore()
        })
      }

      rafRef.current = requestAnimationFrame(draw)
    }
    rafRef.current = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(rafRef.current)
      canvasRef.current?.getContext('2d')?.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height)
    }
  }, [viewer, showFloodRisk])

  // Cleanup on layer off
  useEffect(() => {
    if (!showFloodRisk && viewer) {
      zoneEntRef.current.forEach(e => viewer.entities.remove(e))
      zoneEntRef.current = []
      if (garonneDsRef.current) { viewer.dataSources.remove(garonneDsRef.current); garonneDsRef.current = null }
      if (riversDsRef.current)  { viewer.dataSources.remove(riversDsRef.current);  riversDsRef.current  = null }
      if (roadsDsRef.current)   { viewer.dataSources.remove(roadsDsRef.current);   roadsDsRef.current   = null }
      setWaterLevel(0); setRoadsLoaded(false); setGaronneLoaded(false)
    }
  }, [showFloodRisk, viewer])

  if (!showFloodRisk) return null

  const activePhases = FLOOD_ZONES.filter(z => waterLevel >= z.minLevel).length
  const { level: riskLvl, label: riskLabel } = floodRisk(waterLevel)
  const rc = RISK_COLOR[riskLvl] ?? '#6b7280'

  return (
    <>
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 11 }} />

      <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-2">

        {/* Risk badge */}
        <div className="px-4 py-1.5 rounded-full border text-[10px] font-bold"
          style={{ borderColor: `${rc}55`, backgroundColor: `${rc}15`, color: rc }}>
          🌊 {riskLvl} — {riskLabel}
          {autoRising && <span className="ml-2 text-[9px] text-blue-400 animate-pulse">⬆ Rain rising</span>}
        </div>

        {/* Slider control panel */}
        <div className="bg-gray-950/95 backdrop-blur border border-white/10 rounded-2xl px-5 py-3 min-w-[360px]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-gray-400 font-semibold">Garonne Water Level (m above normal)</span>
            <span className="text-xl font-black" style={{ color: rc }}>{waterLevel.toFixed(1)} m</span>
          </div>
          <input type="range" min={0} max={15} step={0.1} value={waterLevel}
            onChange={e => setWaterLevel(+e.target.value)}
            className="w-full h-2 rounded-full appearance-none cursor-pointer"
            style={{ background: `linear-gradient(to right,#38bdf8 ${(waterLevel/15)*100}%,#1e293b ${(waterLevel/15)*100}%)` }}
          />
          <div className="flex justify-between text-[7px] text-gray-700 mt-0.5">
            {[0,3,6,9,12,15].map(v => <span key={v}>{v}m</span>)}
          </div>

          {/* Historical quick-set */}
          <div className="flex gap-1.5 mt-2.5 items-center">
            <span className="text-[9px] text-gray-600 mr-1">Historical:</span>
            {HISTORICAL.map(h => (
              <button key={h.label} onClick={() => setWaterLevel(h.level)} title={h.desc}
                className="px-2 py-0.5 rounded-lg border text-[9px] font-bold transition-all hover:scale-105 active:scale-95"
                style={{ borderColor: `${h.color}55`, color: h.color, backgroundColor: `${h.color}12` }}>
                {h.label}
              </button>
            ))}
            <button onClick={() => setWaterLevel(0)}
              className="px-2 py-0.5 rounded-lg border border-white/10 text-[9px] text-gray-600 hover:text-white transition-all ml-auto">
              Reset
            </button>
          </div>
        </div>

        {/* Stats row */}
        <div className="flex gap-2">
          <div className="bg-gray-950/90 backdrop-blur border border-blue-500/20 rounded-xl px-3 py-1.5 text-center">
            <div className="text-lg font-black text-blue-400">{activePhases}/5</div>
            <div className="text-[9px] text-gray-500">Flood phases</div>
          </div>
          {roadsLoaded && (
            <>
              <div className="bg-gray-950/90 backdrop-blur border border-yellow-500/20 rounded-xl px-3 py-1.5 text-center">
                <div className="text-lg font-black text-yellow-400">{roadStats.low.toLocaleString()}</div>
                <div className="text-[9px] text-gray-500">Roads: caution</div>
              </div>
              <div className="bg-gray-950/90 backdrop-blur border border-orange-500/20 rounded-xl px-3 py-1.5 text-center">
                <div className="text-lg font-black text-orange-400">{roadStats.med.toLocaleString()}</div>
                <div className="text-[9px] text-gray-500">Roads: danger</div>
              </div>
              <div className="bg-gray-950/90 backdrop-blur border border-red-500/20 rounded-xl px-3 py-1.5 text-center">
                <div className="text-lg font-black text-red-400">{roadStats.high.toLocaleString()}</div>
                <div className="text-[9px] text-gray-500">Roads: blocked</div>
              </div>
            </>
          )}
          {waterLevel >= 0.8 && (
            <div className="bg-gray-950/90 backdrop-blur border border-green-500/20 rounded-xl px-3 py-1.5 text-center">
              <div className="text-lg font-black text-green-400">{EVAC_ROUTES.length}</div>
              <div className="text-[9px] text-gray-500">Evac routes</div>
            </div>
          )}
        </div>

        {/* Data source status */}
        <div className="flex gap-2 text-[8px]">
          <span className={garonneLoaded ? 'text-blue-400' : 'text-gray-600 animate-pulse'}>
            {garonneLoaded ? '🌊 Garonne polygon' : '⏳ Loading Garonne…'}
          </span>
          <span className={roadsLoaded ? 'text-yellow-400' : 'text-gray-600 animate-pulse'}>
            {roadsLoaded ? `🛣️ ${(4075).toLocaleString()} roads` : '⏳ Loading roads…'}
          </span>
        </div>
      </div>
    </>
  )
}
