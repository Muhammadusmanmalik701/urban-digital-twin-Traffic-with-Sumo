/**
 * Shared thermal computation utilities.
 * Used by StreetHeatLayer, BuildingThermalLayer, and RightPanel.
 */

export type ThermalGridPoint = { lat: number; lon: number; temp: number }

// UHI zones matching StreetHeatLayer
const UHI_ZONES = [
  { cx: -0.5792, cy: 44.8378, d: 4.0, r: 0.038 },
  { cx: -0.6850, cy: 44.8330, d: 3.0, r: 0.028 },
  { cx: -0.6150, cy: 44.8060, d: 1.5, r: 0.022 },
  { cx: -0.5890, cy: 44.8080, d: 1.0, r: 0.020 },
  { cx: -0.6160, cy: 44.7720, d: 0.0, r: 0.020 },
]

const PARK_ZONES = [
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

function dist2(lon: number, lat: number, cx: number, cy: number): number {
  const cos = Math.cos(lat * Math.PI / 180)
  return (lon - cx) * (lon - cx) * cos * cos + (lat - cy) * (lat - cy)
}

export function idwInterp(lon: number, lat: number, grid: ThermalGridPoint[]): number {
  let ws = 0, ts = 0
  for (const p of grid) {
    const d2 = dist2(lon, lat, p.lon, p.lat)
    if (d2 < 1e-9) return p.temp
    const w = 1 / d2; ws += w; ts += p.temp * w
  }
  return ws > 0 ? ts / ws : 28
}

export function getUHI(lon: number, lat: number): number {
  let best = 0
  for (const z of UHI_ZONES) {
    const d = Math.sqrt(dist2(lon, lat, z.cx, z.cy))
    if (d < z.r) best = Math.max(best, z.d * (1 - d / z.r))
  }
  return best
}

export function getParkCooling(lon: number, lat: number): number {
  let cool = 0
  for (const p of PARK_ZONES) {
    const d = Math.sqrt(dist2(lon, lat, p.lon, p.lat))
    if (d < p.rad) cool = Math.max(cool, p.cool * (1 - d / p.rad))
  }
  return cool
}

/** Local ambient air temp at a point: IDW(grid) + UHI - park_cooling */
export function computeLocalAirTemp(lon: number, lat: number, grid: ThermalGridPoint[]): number {
  if (grid.length === 0) return 28
  return +(idwInterp(lon, lat, grid) + getUHI(lon, lat) - getParkCooling(lon, lat)).toFixed(1)
}

/** 0 = cool (20°C), 1 = extreme heat (48°C+) */
export function tempToIntensity(temp: number, lo = 20, hi = 48): number {
  return Math.min(1, Math.max(0, (temp - lo) / (hi - lo)))
}

/** Dynamic energy class degraded by local air temperature */
export function dynamicEnergyClass(baseKwhPerM2: number, localAirTemp: number): {
  kwh: number; cls: string; color: string; penaltyPct: number
} {
  // +1.5% cooling demand per °C above 18°C baseline (realistic summer penalty)
  const penaltyPct = Math.round(Math.max(0, (localAirTemp - 18) * 1.5))
  const kwh = Math.round(baseKwhPerM2 * (1 + penaltyPct / 100))
  const ec = energyClass(kwh)
  return { kwh, cls: ec.cls, color: ec.color, penaltyPct }
}

export function energyClass(kWhM2: number): { cls: string; color: string } {
  if (kWhM2 < 50)  return { cls: 'A', color: '#16a34a' }
  if (kWhM2 < 90)  return { cls: 'B', color: '#65a30d' }
  if (kWhM2 < 150) return { cls: 'C', color: '#ca8a04' }
  if (kWhM2 < 200) return { cls: 'D', color: '#ea580c' }
  if (kWhM2 < 250) return { cls: 'E', color: '#dc2626' }
  if (kWhM2 < 300) return { cls: 'F', color: '#9f1239' }
  return { cls: 'G', color: '#6b21a8' }
}

/** Tint color (CSS rgb string) for buildings at a given thermal intensity */
export function tintForIntensity(intensity: number): string {
  const r = 255
  const g = Math.round(255 - intensity * 130)  // 255 → 125
  const b = Math.round(255 - intensity * 210)  // 255 → 45
  return `rgb(${r},${g},${b})`
}
