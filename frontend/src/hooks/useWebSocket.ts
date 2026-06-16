import { useEffect } from 'react'
import { cityWS } from '../services/websocket'
import { useSimulationStore } from '../store/simulationStore'
import { useScenarioStore } from '../store/scenarioStore'
import type { CityUpdate } from '../types/simulation'

export function useWebSocket() {
  const { setVehicles, setZoneCongestion, setKPIs, setClimate, setConnected, setLastUpdate } = useSimulationStore()
  const { setActiveScenarios } = useScenarioStore()

  useEffect(() => {
    cityWS.connect()
    setConnected(true)

    const unsub = cityWS.subscribe((data: CityUpdate) => {
      if (data.traffic) {
        setVehicles(data.traffic.vehicles || [])
        setZoneCongestion(data.traffic.zone_congestion || [])
      }
      if (data.kpis) setKPIs(data.kpis)
      if (data.climate) setClimate(data.climate)
      setLastUpdate(data.timestamp)
    })

    return () => {
      unsub()
    }
  }, [])
}
