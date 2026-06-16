import { useEffect, useState } from 'react'
import { useBuildingStore } from '../../store/buildingStore'
import { api } from '../../services/api'
import type { BuildingProfile } from '../../types/building'

const STATUS_COLORS = {
  operational: 'text-green-400',
  degraded: 'text-yellow-400',
  failed: 'text-red-400',
  maintenance: 'text-blue-400',
}

const HEALTH_COLORS = {
  Excellent: 'text-green-400',
  Good: 'text-green-300',
  Fair: 'text-yellow-400',
  Poor: 'text-orange-400',
  Critical: 'text-red-400',
}

function OccupancyBar({ pct }: { pct: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-700 rounded-full h-2">
        <div
          className={`h-2 rounded-full transition-all ${pct > 80 ? 'bg-red-500' : pct > 60 ? 'bg-yellow-500' : 'bg-green-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs font-mono w-8 text-right">{pct.toFixed(0)}%</span>
    </div>
  )
}

export function BuildingInfoPopup() {
  const { selectedBuilding, setSelectedBuilding } = useBuildingStore()
  const [loading, setLoading] = useState(false)
  const [profile, setProfile] = useState<BuildingProfile | null>(null)

  useEffect(() => {
    if (!selectedBuilding) {
      setProfile(null)
      return
    }
    setLoading(true)
    api.getBuilding(selectedBuilding.id)
      .then((data) => setProfile(data as BuildingProfile))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [selectedBuilding?.id])

  if (!selectedBuilding) return null

  const b = profile || selectedBuilding

  return (
    <div className="absolute top-16 left-4 w-80 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl z-50 overflow-hidden">
      <div className="flex items-start justify-between p-4 border-b border-gray-700">
        <div>
          <div className="text-sm font-bold text-white">{(b as BuildingProfile).name || 'Building'}</div>
          <div className="text-xs text-gray-400 mt-0.5">
            {(b as BuildingProfile).building_use?.replace('_', ' ')} · Class {(b as BuildingProfile).building_class} · Built {(b as BuildingProfile).year_built}
          </div>
        </div>
        <button onClick={() => setSelectedBuilding(null)} className="text-gray-400 hover:text-white text-lg leading-none">×</button>
      </div>

      {loading && <div className="p-4 text-center text-xs text-gray-400">Loading BIM data...</div>}

      {profile && (
        <div className="overflow-y-auto max-h-[70vh]">
          <section className="p-4 border-b border-gray-800">
            <div className="text-xs font-semibold text-gray-400 mb-2">OVERVIEW</div>
            <div className="text-xs text-gray-300 space-y-1">
              <div>Floors: {profile.floors_above} · Height: {profile.height_m}m · Area: {profile.footprint_area_m2?.toLocaleString()} m²</div>
              <div className="mt-2">
                <div className="flex justify-between mb-1">
                  <span>Occupancy: {profile.current_occupancy}/{profile.max_occupancy}</span>
                </div>
                <OccupancyBar pct={profile.occupancy_pct || 0} />
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span>Health:</span>
                <span className={`font-semibold ${HEALTH_COLORS[profile.health?.rating as keyof typeof HEALTH_COLORS] || 'text-gray-300'}`}>
                  {profile.health?.score?.toFixed(0)}/100 {profile.health?.rating}
                </span>
              </div>
            </div>
          </section>

          {profile.energy_today && (
            <section className="p-4 border-b border-gray-800">
              <div className="text-xs font-semibold text-yellow-400 mb-2">⚡ ENERGY (Today)</div>
              <div className="text-xs text-gray-300 space-y-1">
                <div>Consumption: <span className="text-white font-mono">{profile.energy_today.kwh_total?.toLocaleString()} kWh</span></div>
                <div>Peak Demand: <span className="text-white font-mono">{profile.energy_today.peak_demand_kw} kW</span> (at {profile.energy_today.peak_hour}:00)</div>
                <div>Cost: <span className="text-green-400">${profile.energy_today.cost_usd?.toFixed(2)}</span> · CO₂: <span className="text-orange-400">{profile.energy_today.co2_tons} tons</span></div>
                <div className={`${profile.energy_today.vs_yesterday_pct > 0 ? 'text-red-400' : 'text-green-400'}`}>
                  vs Yesterday: {profile.energy_today.vs_yesterday_pct > 0 ? '+' : ''}{profile.energy_today.vs_yesterday_pct?.toFixed(1)}%
                </div>
              </div>
            </section>
          )}

          {profile.systems?.length > 0 && (
            <section className="p-4 border-b border-gray-800">
              <div className="text-xs font-semibold text-blue-400 mb-2">🔧 SYSTEMS STATUS</div>
              <div className="space-y-1">
                {profile.systems.slice(0, 4).map((sys) => (
                  <div key={sys.id} className="flex items-center justify-between text-xs">
                    <span className="text-gray-400">{sys.system_type}:</span>
                    <span className={STATUS_COLORS[sys.status as keyof typeof STATUS_COLORS] || 'text-gray-300'}>
                      {sys.status === 'operational' ? '🟢' : sys.status === 'degraded' ? '🟡' : '🔴'} {sys.status}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {profile.ai_alerts?.length > 0 && (
            <section className="p-4 border-b border-gray-800">
              <div className="text-xs font-semibold text-purple-400 mb-2">🤖 AI ALERTS</div>
              <div className="space-y-1">
                {profile.ai_alerts.map((alert, i) => (
                  <div key={i} className="text-xs text-gray-300">• {alert}</div>
                ))}
              </div>
            </section>
          )}

          <div className="p-4 flex gap-2">
            <button className="flex-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-3 py-1.5 transition-colors">View BIM</button>
            <button className="flex-1 text-xs bg-gray-700 hover:bg-gray-600 text-white rounded-lg px-3 py-1.5 transition-colors">Energy</button>
            <button className="flex-1 text-xs bg-gray-700 hover:bg-gray-600 text-white rounded-lg px-3 py-1.5 transition-colors">Audit</button>
          </div>
        </div>
      )}
    </div>
  )
}
