/**
 * BuildingThermalLayer — connects heat wave / street heat to 3D building visuals
 *
 * Effect A — OSM Tileset thermal tint:
 *   When Street Heat or Heat Wave is active, shifts all building colors from white
 *   toward orange-red based on mean road surface temperature (Cesium3DTileStyle).
 *   White tint = no change. Orange-red tint = extreme heat.
 *
 * Effect B — Per-building thermal aura:
 *   When a building is inspected (clicked), renders a colored ellipse at ground level.
 *   Color = local air temperature computed via IDW from live Open-Meteo grid.
 *   Cool area → blue aura. Hot city-center street → red-orange aura.
 */

import { useEffect, useRef } from 'react'
import { useLayerStore } from '../../store/layerStore'
import { useStreetHeatStore } from '../../store/streetHeatStore'
import { useBuildingInspectorStore } from '../../store/buildingInspectorStore'
import {
  computeLocalAirTemp,
  tempToIntensity,
  tintForIntensity,
} from '../../utils/thermalUtils'

interface Props {
  viewer: any
  osmBuildingsRef: React.MutableRefObject<any>
}

export function BuildingThermalLayer({ viewer, osmBuildingsRef }: Props) {
  const { showBuildings, showStreetHeat, showHeatWave } = useLayerStore()
  const { liveGrid, stats } = useStreetHeatStore()
  const building = useBuildingInspectorStore(s => s.building)

  const auraRef = useRef<any>(null)

  // ── A: OSM Tileset thermal tint ─────────────────────────────────────────────
  useEffect(() => {
    const Cesium  = (window as any).Cesium
    const tileset = osmBuildingsRef.current
    if (!tileset || tileset.isDestroyed?.()) return

    const heatActive = showBuildings && (showStreetHeat || showHeatWave)

    if (!heatActive || !stats) {
      try {
        tileset.style = new Cesium.Cesium3DTileStyle({ color: "color('white')" })
      } catch { /* tileset not ready yet */ }
      return
    }

    // intensity: 0 at 28°C mean, 1 at 48°C mean
    const intensity = tempToIntensity(stats.mean, 28, 48)
    const tint      = tintForIntensity(intensity)

    try {
      tileset.style = new Cesium.Cesium3DTileStyle({ color: `color('${tint}')` })
    } catch (e) {
      console.warn('[BuildingThermal] Style failed:', e)
    }
  }, [osmBuildingsRef, showBuildings, showStreetHeat, showHeatWave, stats])

  // Reset tint when buildings hidden
  useEffect(() => {
    if (showBuildings) return
    const Cesium  = (window as any).Cesium
    const tileset = osmBuildingsRef.current
    if (!tileset || tileset.isDestroyed?.()) return
    try { tileset.style = new Cesium.Cesium3DTileStyle({ color: "color('white')" }) } catch {}
  }, [showBuildings, osmBuildingsRef])

  // ── B: Per-building thermal aura ─────────────────────────────────────────────
  useEffect(() => {
    if (!viewer) return
    const Cesium = (window as any).Cesium

    // Remove previous aura
    if (auraRef.current) {
      try { viewer.entities.remove(auraRef.current) } catch {}
      auraRef.current = null
    }

    if (!building || !showBuildings) return

    // Compute local air temp for this building (IDW from live grid + UHI - parks)
    const localTemp  = computeLocalAirTemp(building.lon, building.lat, liveGrid)
    const intensity  = tempToIntensity(localTemp, 20, 45)

    // Color: sky-blue (cool) → amber → red (hot)
    const cr = 0.25 + intensity * 0.75   // 0.25 → 1.0
    const cg = 0.55 - intensity * 0.50   // 0.55 → 0.05
    const cb = 0.95 - intensity * 0.85   // 0.95 → 0.10

    auraRef.current = viewer.entities.add({
      name:     '_building_thermal_aura',
      position: Cesium.Cartesian3.fromDegrees(building.lon, building.lat, 1),
      ellipse:  {
        semiMajorAxis:   90,
        semiMinorAxis:   90,
        material:        new Cesium.ColorMaterialProperty(new Cesium.Color(cr, cg, cb, 0.28)),
        outline:         true,
        outlineColor:    new Cesium.Color(cr, cg, cb, 0.85),
        outlineWidth:    2.5,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        zIndex:          1,
      },
    })

    // Pulsing outer ring for high heat (intensity > 0.6)
    if (intensity > 0.6) {
      const ring = viewer.entities.add({
        name:     '_building_thermal_ring',
        position: Cesium.Cartesian3.fromDegrees(building.lon, building.lat, 1),
        ellipse:  {
          semiMajorAxis:   150,
          semiMinorAxis:   150,
          material:        new Cesium.ColorMaterialProperty(new Cesium.Color(1.0, 0.3, 0.05, 0.10)),
          outline:         true,
          outlineColor:    new Cesium.Color(1.0, 0.4, 0.1, 0.45),
          outlineWidth:    1.5,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        },
      })
      // Store both under auraRef as array for cleanup
      const inner = auraRef.current
      auraRef.current = { _isMulti: true, inner, ring }
    }
  }, [viewer, building, showBuildings, liveGrid])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (!viewer || !auraRef.current) return
      const ref = auraRef.current
      try {
        if (ref._isMulti) {
          viewer.entities.remove(ref.inner)
          viewer.entities.remove(ref.ring)
        } else {
          viewer.entities.remove(ref)
        }
      } catch {}
    }
  }, [viewer])

  return null
}
