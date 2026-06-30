/**
 * SatelliteLSTLayer — Live Land Surface Temperature for Bordeaux
 * Controls live in RightPanel via satelliteLSTStore. No floating UI here.
 */
import { useEffect, useRef, useCallback } from 'react'
import { useLayerStore } from '../../store/layerStore'
import { useSatelliteLSTStore } from '../../store/satelliteLSTStore'

const GRID_LATS = [44.67, 44.73, 44.79, 44.85, 44.91]
const GRID_LONS = [-0.77, -0.66, -0.55, -0.44]
const GRID_POINTS = GRID_LATS.flatMap(lat => GRID_LONS.map(lon => ({ lat, lon })))

const LST_RAMP: [number, [number,number,number]][] = [
  [10,[49,54,149]],[16,[69,117,180]],[20,[116,173,209]],[23,[171,217,233]],
  [26,[224,243,248]],[28,[255,255,191]],[30,[254,224,144]],[33,[253,174,97]],
  [36,[244,109,67]],[39,[215,48,39]],[42,[165,0,38]],[46,[103,0,31]],
]

function tempToRgb(t: number): [number,number,number] {
  for (let i = 1; i < LST_RAMP.length; i++) {
    const [t0,c0] = LST_RAMP[i-1], [t1,c1] = LST_RAMP[i]
    if (t <= t1) {
      const f = (t-t0)/(t1-t0)
      return [Math.round(c0[0]+(c1[0]-c0[0])*f), Math.round(c0[1]+(c1[1]-c0[1])*f), Math.round(c0[2]+(c1[2]-c0[2])*f)]
    }
  }
  return LST_RAMP[LST_RAMP.length-1][1]
}

const NDVI_RAMP: [number,[number,number,number]][] = [
  [-0.2,[120,60,30]],[0,[190,170,130]],[0.1,[220,210,170]],
  [0.2,[180,210,130]],[0.3,[100,180,80]],[0.5,[30,130,40]],[0.8,[0,80,20]],
]

function ndviToRgb(v: number): [number,number,number] {
  for (let i = 1; i < NDVI_RAMP.length; i++) {
    const [v0,c0] = NDVI_RAMP[i-1], [v1,c1] = NDVI_RAMP[i]
    if (v <= v1) {
      const f = (v-v0)/(v1-v0)
      return [Math.round(c0[0]+(c1[0]-c0[0])*f), Math.round(c0[1]+(c1[1]-c0[1])*f), Math.round(c0[2]+(c1[2]-c0[2])*f)]
    }
  }
  return NDVI_RAMP[NDVI_RAMP.length-1][1]
}

function lstToNdvi(t: number): number {
  return Math.max(-0.1, Math.min(0.55, 0.55-(t-20)*0.015))
}

interface GridPoint { lat: number; lon: number; temp: number; ndvi: number }

export function SatelliteLSTLayer({ viewer }: { viewer: any }) {
  const { showSatelliteLST } = useLayerStore()
  const { mode, opacity, greenRoofs, coolAsphalt, gibs, setFetchTime, setLoading, setStats } = useSatelliteLSTStore()

  const canvasRef   = useRef<HTMLCanvasElement | null>(null)
  const rafRef      = useRef<number>(0)
  const imageryRef  = useRef<any>(null)
  const gridDataRef = useRef<GridPoint[]>([])

  const fetchGrid = useCallback(async () => {
    setLoading(true)
    try {
      const lats = GRID_POINTS.map(p => p.lat).join(',')
      const lons = GRID_POINTS.map(p => p.lon).join(',')
      const res  = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}` +
        `&current=surface_temperature,temperature_2m&timezone=Europe%2FParis`,
        { signal: AbortSignal.timeout(12000) }
      )
      const data = await res.json()
      const arr: any[] = Array.isArray(data) ? data : [data]
      const pts: GridPoint[] = arr.map((d: any, i: number) => {
        const raw = d.current?.surface_temperature ?? d.current?.temperature_2m ?? 28
        let t = raw
        if (greenRoofs)  t -= 0.7
        if (coolAsphalt) t -= 1.9
        return { lat: GRID_POINTS[i].lat, lon: GRID_POINTS[i].lon, temp: +t.toFixed(2), ndvi: lstToNdvi(raw) }
      })
      gridDataRef.current = pts
      const temps = pts.map(p => p.temp)
      setStats({ min: +Math.min(...temps).toFixed(1), max: +Math.max(...temps).toFixed(1), mean: +(temps.reduce((a,b)=>a+b,0)/temps.length).toFixed(1) })
      setFetchTime(new Date().toLocaleTimeString('fr-FR', {hour:'2-digit',minute:'2-digit'}))
    } catch {
      setFetchTime('offline')
    } finally {
      setLoading(false)
    }
  }, [greenRoofs, coolAsphalt, setLoading, setStats, setFetchTime])

  // NASA GIBS overlay
  useEffect(() => {
    if (!viewer) return
    const Cesium = (window as any).Cesium
    if (imageryRef.current) { viewer.imageryLayers.remove(imageryRef.current, true); imageryRef.current = null }
    if (!showSatelliteLST || !gibs) return
    const today = new Date().toISOString().slice(0, 10)
    const layerName = mode === 'NDVI' ? 'MODIS_Terra_Vegetation_Indices_NDVI_Monthly' : 'MODIS_Terra_Land_Surface_Temp_Day'
    try {
      const provider = new Cesium.WebMapServiceImageryProvider({
        url: 'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi',
        layers: layerName,
        parameters: { FORMAT: 'image/png', TRANSPARENT: 'true', VERSION: '1.1.1', TIME: today },
        tilingScheme: new Cesium.GeographicTilingScheme(),
        tileWidth: 512, tileHeight: 512, credit: 'NASA GIBS / MODIS Terra',
      })
      const layer = viewer.imageryLayers.addImageryProvider(provider)
      layer.alpha = opacity/100
      imageryRef.current = layer
    } catch (e) { console.warn('[LST] GIBS failed:', e) }
    return () => { if (imageryRef.current) { viewer.imageryLayers.remove(imageryRef.current, true); imageryRef.current = null } }
  }, [viewer, showSatelliteLST, gibs, mode, opacity])

  // Fetch on activate + every 30 min
  useEffect(() => {
    if (!showSatelliteLST) return
    fetchGrid()
    const id = setInterval(fetchGrid, 30*60*1000)
    return () => clearInterval(id)
  }, [showSatelliteLST, fetchGrid])

  // Canvas render loop
  useEffect(() => {
    if (!viewer || !showSatelliteLST) {
      cancelAnimationFrame(rafRef.current)
      canvasRef.current?.getContext('2d')?.clearRect(0, 0, 9999, 9999)
      return
    }
    const Cesium = (window as any).Cesium
    const draw = () => {
      const canvas = canvasRef.current
      if (!canvas) { rafRef.current = requestAnimationFrame(draw); return }
      const parent = canvas.parentElement
      if (parent) {
        if (canvas.width !== parent.clientWidth)   canvas.width  = parent.clientWidth
        if (canvas.height !== parent.clientHeight) canvas.height = parent.clientHeight
      }
      const ctx = canvas.getContext('2d')!
      const w = canvas.width, h = canvas.height
      ctx.clearRect(0, 0, w, h)
      const pts = gridDataRef.current
      if (pts.length === 0) { rafRef.current = requestAnimationFrame(draw); return }
      type SP = {sx:number;sy:number;val:number}
      const screenPts: SP[] = []
      for (const pt of pts) {
        let sc: {x:number;y:number}|undefined
        try { sc = viewer.scene.cartesianToCanvasCoordinates(Cesium.Cartesian3.fromDegrees(pt.lon, pt.lat, 0)) } catch { continue }
        if (!sc) continue
        screenPts.push({sx:sc.x, sy:sc.y, val: mode==='NDVI' ? pt.ndvi : pt.temp})
      }
      if (screenPts.length === 0) { rafRef.current = requestAnimationFrame(draw); return }
      const xs = screenPts.map(p=>p.sx), ys = screenPts.map(p=>p.sy)
      const x0=Math.max(0,Math.min(...xs)-80), y0=Math.max(0,Math.min(...ys)-80)
      const x1=Math.min(w,Math.max(...xs)+80), y1=Math.min(h,Math.max(...ys)+80)
      if (x1-x0<=0||y1-y0<=0) { rafRef.current = requestAnimationFrame(draw); return }
      const step=4, alpha=(opacity/100)*0.82, sigma=120
      for (let py=y0; py<y1; py+=step) {
        for (let px=x0; px<x1; px+=step) {
          let wSum=0, vSum=0
          for (const sp of screenPts) {
            const dx=px-sp.sx, dy=py-sp.sy
            const w2=Math.exp(-(dx*dx+dy*dy)/(2*sigma*sigma))
            wSum+=w2; vSum+=sp.val*w2
          }
          if (wSum<0.001) continue
          const val=vSum/wSum
          const [r,g,b]=mode==='NDVI' ? ndviToRgb(val) : tempToRgb(val)
          ctx.fillStyle=`rgba(${r},${g},${b},${alpha})`
          ctx.fillRect(px, py, step, step)
        }
      }
      rafRef.current = requestAnimationFrame(draw)
    }
    rafRef.current = requestAnimationFrame(draw)
    return () => { cancelAnimationFrame(rafRef.current); canvasRef.current?.getContext('2d')?.clearRect(0,0,9999,9999) }
  }, [viewer, showSatelliteLST, mode, opacity])

  if (!showSatelliteLST) return null

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ zIndex: 13 }}
    />
  )
}
