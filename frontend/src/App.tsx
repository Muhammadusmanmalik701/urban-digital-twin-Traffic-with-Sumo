import { useState, useEffect } from 'react'
import { CesiumViewer } from './components/CityViewer/CesiumViewer'
import { KPICards } from './components/Dashboard/KPICards'
import { AlertsFeed } from './components/Dashboard/AlertsFeed'
import { LayerTogglePanel } from './components/UI/LayerTogglePanel'
import { BuildingInfoPopup } from './components/BuildingLayer/BuildingInfoPopup'
import { ScenarioPanel } from './components/ScenarioEngine/ScenarioPanel'
import { RightPanel } from './components/MapControls/RightPanel'
import { useWebSocket } from './hooks/useWebSocket'
import { useSimulationStore } from './store/simulationStore'
import { useScenarioStore } from './store/scenarioStore'

// ── Glass style constants ─────────────────────────────────────────────────────
const GLASS = 'bg-gray-900/40 backdrop-blur-xl border-white/10'

function Header() {
  const { kpis, isConnected, lastUpdate } = useSimulationStore()
  const { activeScenarios } = useScenarioStore()
  const time = lastUpdate ? new Date(lastUpdate).toLocaleTimeString() : '--:--'

  return (
    <header className={`flex items-center justify-between px-5 py-2 ${GLASS} border-b z-30 relative`}>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-blue-500/20 border border-blue-400/40 flex items-center justify-center text-xs">
            🌆
          </div>
          <span className="text-sm font-bold text-white">UrbanTwin</span>
          <span className="text-xs text-gray-500">Bordeaux</span>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full border ${
          isConnected
            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
            : 'bg-red-500/10 text-red-400 border-red-500/30'
        }`}>
          {isConnected ? '● LIVE' : '○ Offline'}
        </span>
        {activeScenarios.length > 0 && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-400 border border-orange-500/30 animate-pulse">
            🔔 {activeScenarios.length} alerts
          </span>
        )}
      </div>

      <div className="flex items-center gap-5 text-xs">
        {kpis && (
          <>
            <StatChip icon="🚗" value={kpis.vehicle_count?.toLocaleString()} label="vehicles" />
            <StatChip icon="⚡" value={`${kpis.energy_mwh?.toFixed(0)} MWh`} />
            <StatChip icon="🌡️" value={`${kpis.outdoor_temp_c?.toFixed(1)}°C`} alert={(kpis.outdoor_temp_c ?? 0) > 42} />
            <StatChip icon="💨" value={`AQI ${kpis.aqi}`} alert={(kpis.aqi ?? 0) > 200} />
          </>
        )}
        <span className="text-gray-500">🕐 {time}</span>
        <div className="w-6 h-6 rounded-full bg-gray-700 border border-gray-600 flex items-center justify-center text-xs">
          👤
        </div>
      </div>
    </header>
  )
}

function StatChip({ icon, value, label, alert }: { icon: string; value?: string; label?: string; alert?: boolean }) {
  return (
    <div className={`flex items-center gap-1 px-2 py-1 rounded-lg ${alert ? 'text-red-400 bg-red-500/10' : 'text-gray-300'}`}>
      <span>{icon}</span>
      <span className="font-mono font-semibold">{value ?? '—'}</span>
      {label && <span className="text-gray-500">{label}</span>}
    </div>
  )
}

// ── Collapsible sidebar wrapper ───────────────────────────────────────────────
function LeftSidebar({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <aside
      className={`relative flex-shrink-0 flex flex-col transition-all duration-300 ease-in-out ${
        open ? 'w-64' : 'w-12'
      } ${GLASS} border-r z-20`}
    >
      {/* Toggle tab on right edge */}
      <button
        onClick={onToggle}
        className="absolute -right-3 top-6 z-30 w-6 h-10 rounded-r-lg bg-gray-800/90 border border-white/10 border-l-0 flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-700/90 transition-colors text-xs"
      >
        {open ? '‹' : '›'}
      </button>

      {open ? (
        // Expanded content
        <div className="flex-1 overflow-y-auto p-4 space-y-5 scrollbar-thin">
          {/* Section cards */}
          <SideCard>
            <KPICards />
          </SideCard>
          <SideCard>
            <AlertsFeed />
          </SideCard>
          <SideCard>
            <LayerTogglePanel />
          </SideCard>
        </div>
      ) : (
        // Collapsed: vertical icon strip
        <div className="flex flex-col items-center pt-4 gap-3">
          <IconPill label="KPI" icon="📊" onClick={onToggle} />
          <IconPill label="Alert" icon="🔔" onClick={onToggle} />
          <IconPill label="Layers" icon="🗂️" onClick={onToggle} />
        </div>
      )}
    </aside>
  )
}

function RightSidebar({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <aside
      className={`relative flex-shrink-0 flex flex-col transition-all duration-300 ease-in-out ${
        open ? 'w-72' : 'w-12'
      } ${GLASS} border-l z-20`}
    >
      {/* Toggle tab on left edge */}
      <button
        onClick={onToggle}
        className="absolute -left-3 top-6 z-30 w-6 h-10 rounded-l-lg bg-gray-800/90 border border-white/10 border-r-0 flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-700/90 transition-colors text-xs"
      >
        {open ? '›' : '‹'}
      </button>

      {open ? (
        <div className="flex-1 overflow-y-auto p-4 scrollbar-thin">
          <RightPanel />
        </div>
      ) : (
        <div className="flex flex-col items-center pt-4 gap-3">
          <IconPill label="Map" icon="📍" onClick={onToggle} />
          <IconPill label="Roads" icon="🛣️" onClick={onToggle} />
        </div>
      )}
    </aside>
  )
}

function SideCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white/5 border border-white/8 rounded-xl p-3">
      {children}
    </div>
  )
}

function IconPill({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={label}
      className="w-8 h-8 rounded-lg bg-white/5 border border-white/8 hover:bg-white/10 hover:border-white/20 flex items-center justify-center text-sm transition-all"
    >
      {icon}
    </button>
  )
}

// ── Bottom metrics bar ────────────────────────────────────────────────────────
function BottomBar() {
  const { kpis } = useSimulationStore()
  if (!kpis) return null

  const metrics = [
    { label: 'Vehicles',   value: kpis.vehicle_count?.toLocaleString() ?? '—' },
    { label: 'Energy',     value: `${kpis.energy_mwh?.toFixed(0) ?? '—'} MWh` },
    { label: 'Grid Load',  value: `${kpis.grid_load_pct?.toFixed(0) ?? '—'}%` },
    { label: 'Incidents',  value: kpis.active_incidents?.toString() ?? '0' },
    { label: 'CO₂',        value: `${kpis.co2_kg_hr?.toFixed(0) ?? '—'} kg/h` },
    { label: 'Scenarios',  value: kpis.active_scenarios?.toString() ?? '0' },
  ]

  return (
    <div className={`flex items-center justify-around px-6 py-1.5 ${GLASS} border-t`}>
      {metrics.map(({ label, value }) => (
        <div key={label} className="flex flex-col items-center">
          <span className="text-xs text-gray-500">{label}</span>
          <span className="text-xs font-mono font-semibold text-gray-200">{value}</span>
        </div>
      ))}
    </div>
  )
}

// ── App root ──────────────────────────────────────────────────────────────────
export default function App() {
  useWebSocket()
  const [leftOpen, setLeftOpen] = useState(true)
  const [rightOpen, setRightOpen] = useState(true)

  // Persist sidebar state in localStorage
  useEffect(() => {
    const left = localStorage.getItem('sidebar_left')
    const right = localStorage.getItem('sidebar_right')
    if (left !== null) setLeftOpen(left === '1')
    if (right !== null) setRightOpen(right === '1')
  }, [])

  const toggleLeft = () => {
    setLeftOpen((v) => { localStorage.setItem('sidebar_left', !v ? '1' : '0'); return !v })
  }
  const toggleRight = () => {
    setRightOpen((v) => { localStorage.setItem('sidebar_right', !v ? '1' : '0'); return !v })
  }

  return (
    <div className="flex flex-col h-screen bg-[#0a0f1a] text-white overflow-hidden">
      <Header />

      <div className="flex flex-1 overflow-hidden relative">
        <LeftSidebar open={leftOpen} onToggle={toggleLeft} />

        <main className="flex-1 relative overflow-hidden">
          <CesiumViewer />
          <BuildingInfoPopup />
          <ScenarioPanel />
        </main>

        <RightSidebar open={rightOpen} onToggle={toggleRight} />
      </div>

      <BottomBar />
    </div>
  )
}
