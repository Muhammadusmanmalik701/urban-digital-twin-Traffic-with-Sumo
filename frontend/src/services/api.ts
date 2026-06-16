const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`)
  if (!res.ok) throw new Error(`API error ${res.status}: ${path}`)
  return res.json()
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`API error ${res.status}: ${path}`)
  return res.json()
}

export const api = {
  getKPIs: () => get('/api/kpis'),
  getVehicles: () => get('/api/traffic/vehicles'),
  getCongestion: () => get('/api/traffic/congestion'),
  getSignals: () => get('/api/traffic/signals'),
  getIncidents: () => get('/api/traffic/incidents'),
  optimizeSignals: (zone_id: number) => post(`/api/traffic/signals/optimize_zone?zone_id=${zone_id}`),

  getBuildings: () => get<{id: number, name: string, longitude: number, latitude: number, building_use: string, floors_above: number, height_m: number, structural_health_score: number}[]>('/api/buildings/'),
  getBuilding: (id: number) => get(`/api/buildings/${id}`),
  getBuildingEnergy: (id: number) => get(`/api/buildings/${id}/energy`),
  getBuildingSolar: (id: number) => get(`/api/buildings/${id}/solar_potential`),
  sendBmsCommand: (type: string, delta: number) => post(`/api/buildings/bms_command?command_type=${type}&delta=${delta}`),

  getGridSnapshot: () => get('/api/energy/grid'),
  getBuildingsEnergy: () => get('/api/energy/buildings'),
  getEnergyAnomalies: () => get('/api/energy/anomalies'),
  triggerDemandResponse: () => post('/api/energy/demand_response'),

  getClimate: () => get('/api/climate/current'),
  getHeatZones: () => get('/api/climate/heat_zones'),
  getAirQuality: () => get('/api/climate/air_quality'),
  getFloodRisk: () => get('/api/climate/flood_risk'),

  getScenarios: () => get('/api/scenarios/'),
  getActiveScenarios: () => get('/api/scenarios/active'),
  getScenario: (id: number) => get(`/api/scenarios/${id}`),
  getScenarioSolutions: (id: number) => get(`/api/scenarios/${id}/solutions`),
  simulateSolution: (scenarioId: number, solutionCode: string) =>
    post(`/api/scenarios/${scenarioId}/solutions/${solutionCode}/simulate`),
  applySolution: (scenarioId: number, solutionCode: string) =>
    post(`/api/scenarios/${scenarioId}/solutions/${solutionCode}/apply`),
  resolveScenario: (id: number) => post(`/api/scenarios/${id}/resolve`),

  getMLTraffic: (zone_id: number) => get(`/api/ml/predictions/traffic?zone_id=${zone_id}`),
  getMLEnergy: (building_id: number) => get(`/api/ml/predictions/energy?building_id=${building_id}`),
  getMLAnomalies: () => get('/api/ml/anomalies'),
}
