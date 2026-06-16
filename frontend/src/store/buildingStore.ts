import { create } from 'zustand'
import type { BuildingProfile } from '../types/building'

interface BuildingState {
  selectedBuilding: BuildingProfile | null
  buildingsList: BuildingProfile[]
  isLoading: boolean
  setSelectedBuilding: (b: BuildingProfile | null) => void
  setBuildingsList: (b: BuildingProfile[]) => void
  setLoading: (v: boolean) => void
}

export const useBuildingStore = create<BuildingState>((set) => ({
  selectedBuilding: null,
  buildingsList: [],
  isLoading: false,
  setSelectedBuilding: (selectedBuilding) => set({ selectedBuilding }),
  setBuildingsList: (buildingsList) => set({ buildingsList }),
  setLoading: (isLoading) => set({ isLoading }),
}))
