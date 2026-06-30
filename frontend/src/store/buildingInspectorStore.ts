import { create } from 'zustand'

export interface InspectedBuilding {
  type: string; district: string; floors: number; yearBuilt: number
  footprintM2: number; totalM2: number
  consumptionPerM2: number; totalKwh: number; co2Tonnes: number
  energyCls: string; energyColor: string
  roofUsableM2: number; solarKwhYear: number; solarOffsetPct: number; solarSavesCo2: number
  uhiC: number; greenRoofReducC: number; coolRoofReducC: number
  lon: number; lat: number
}

interface InspectorState {
  building: InspectedBuilding | null
  setBuilding: (b: InspectedBuilding | null) => void
}

export const useBuildingInspectorStore = create<InspectorState>((set) => ({
  building: null,
  setBuilding: (building) => set({ building }),
}))
