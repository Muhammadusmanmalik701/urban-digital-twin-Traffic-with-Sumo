import { useEffect } from 'react'
import { useScenarioStore } from '../../store/scenarioStore'
import { api } from '../../services/api'

export function LiveMetrics() {
  const { activeScenarios, setActiveScenarios } = useScenarioStore()

  useEffect(() => {
    api.getActiveScenarios().then((data) => setActiveScenarios(data as any[])).catch(console.error)
    const interval = setInterval(() => {
      api.getActiveScenarios().then((data) => setActiveScenarios(data as any[])).catch(console.error)
    }, 15000)
    return () => clearInterval(interval)
  }, [])

  return null
}
