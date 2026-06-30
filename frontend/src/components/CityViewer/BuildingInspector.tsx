import { useEffect } from 'react'
import { useLayerStore } from '../../store/layerStore'
import { useBuildingInspectorStore } from '../../store/buildingInspectorStore'

// ── Seeded RNG ─────────────────────────────────────────────────────────────────
function seededRng(lon: number, lat: number) {
  let seed = ((Math.round(lon * 10000) * 73856093) ^ (Math.round(lat * 10000) * 19349663)) >>> 0
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 0xffffffff
  }
}

const TYPES = ['Residential', 'Commercial', 'Office', 'Mixed-Use', 'Industrial', 'Historic'] as const
type BuildingType = typeof TYPES[number]

const BASE_CONSUMPTION: Record<BuildingType, number> = {
  Residential: 120, Commercial: 220, Office: 200,
  'Mixed-Use': 180, Industrial: 280, Historic: 160,
}

const ENERGY_CLASS = (kWhM2: number) => {
  if (kWhM2 < 50)  return { cls: 'A', color: '#16a34a' }
  if (kWhM2 < 90)  return { cls: 'B', color: '#65a30d' }
  if (kWhM2 < 150) return { cls: 'C', color: '#ca8a04' }
  if (kWhM2 < 200) return { cls: 'D', color: '#ea580c' }
  if (kWhM2 < 250) return { cls: 'E', color: '#dc2626' }
  if (kWhM2 < 300) return { cls: 'F', color: '#9f1239' }
  return { cls: 'G', color: '#6b21a8' }
}

function guessDistrict(lon: number, lat: number): string {
  if (lon < -0.68) return 'Mérignac'
  if (lon < -0.61 && lat < 44.80) return 'Gradignan'
  if (lon < -0.60 && lat < 44.82) return 'Pessac'
  if (lat < 44.84 && lat > 44.80) return 'Talence'
  return 'Bordeaux City'
}

export function generateBuildingData(lon: number, lat: number) {
  const rng = seededRng(lon, lat)
  const type  = TYPES[Math.floor(rng() * TYPES.length)]
  const floors = 2 + Math.floor(rng() * 13)
  const yearBuilt = 1900 + Math.floor(rng() * 118)
  const footprintM2 = 60 + Math.floor(rng() * 880)

  const yearFactor = yearBuilt < 1970 ? 1.45 : yearBuilt < 1990 ? 1.2 : yearBuilt < 2005 ? 1.0 : 0.78
  const consumptionPerM2 = Math.round(BASE_CONSUMPTION[type] * yearFactor + rng() * 40 - 20)
  const totalM2   = footprintM2 * floors
  const totalKwh  = Math.round(consumptionPerM2 * totalM2)
  const co2Tonnes = Math.round(totalKwh * 0.00025 * 10) / 10
  const { cls: energyCls, color: energyColor } = ENERGY_CLASS(consumptionPerM2)

  const roofUsableM2   = Math.round(footprintM2 * (0.3 + rng() * 0.40))
  const solarKwhYear   = roofUsableM2 * (140 + Math.round(rng() * 50))
  const solarOffsetPct = Math.min(100, Math.round((solarKwhYear / totalKwh) * 100))
  const solarSavesCo2  = Math.round(solarKwhYear * 0.00025 * 10) / 10

  const uhiC            = Math.round((0.2 + rng() * 1.3) * 10) / 10
  const greenRoofReducC = Math.round((0.25 + rng() * 0.30) * 10) / 10
  const coolRoofReducC  = Math.round((0.35 + rng() * 0.45) * 10) / 10

  return {
    type, district: guessDistrict(lon, lat), floors, yearBuilt,
    footprintM2, totalM2, consumptionPerM2, totalKwh, co2Tonnes,
    energyCls, energyColor, roofUsableM2, solarKwhYear, solarOffsetPct, solarSavesCo2,
    uhiC, greenRoofReducC, coolRoofReducC, lon, lat,
  }
}

// ── Click handler only — visual panel lives in RightPanel ─────────────────────
export function BuildingInspector({ viewer }: { viewer: any }) {
  const { showBuildings } = useLayerStore()
  const setBuilding = useBuildingInspectorStore(s => s.setBuilding)

  useEffect(() => {
    if (!viewer || !showBuildings) { setBuilding(null); return }
    const Cesium = (window as any).Cesium

    const onClick = (e: MouseEvent) => {
      const container = viewer.container as HTMLElement
      const rect = container.getBoundingClientRect()
      const screenPos = new Cesium.Cartesian2(e.clientX - rect.left, e.clientY - rect.top)

      let cartesian: any = null
      try {
        const ray = viewer.camera.getPickRay(screenPos)
        if (ray) cartesian = viewer.scene.globe.pick(ray, viewer.scene)
      } catch { /* ignore */ }

      if (!cartesian || !Cesium.defined(cartesian)) {
        try { cartesian = viewer.scene.pickPosition(screenPos) } catch { /* ignore */ }
      }
      if (!cartesian || !Cesium.defined(cartesian)) return

      const carto = Cesium.Cartographic.fromCartesian(cartesian)
      const lon = Cesium.Math.toDegrees(carto.longitude)
      const lat = Cesium.Math.toDegrees(carto.latitude)
      if (!isFinite(lon) || !isFinite(lat)) return

      setBuilding(generateBuildingData(lon, lat))
    }

    const container = viewer.container as HTMLElement
    container.addEventListener('click', onClick)
    return () => container.removeEventListener('click', onClick)
  }, [viewer, showBuildings, setBuilding])

  useEffect(() => {
    if (!showBuildings) setBuilding(null)
  }, [showBuildings, setBuilding])

  return null
}
