import { useMapControlStore, RoadFilterType } from '../../store/mapControlStore'
import { AREAS } from '../CityViewer/CesiumViewer'

const AREA_DETAILS: Record<string, { population: string; type: string; km2: string }> = {
  'Pessac':        { population: '57,000',  type: 'Residential / University', km2: '44.1' },
  'Talence':       { population: '42,000',  type: 'Academic / Residential',   km2: '10.5' },
  'Mérignac':      { population: '70,000',  type: 'Commercial / Airport',      km2: '54.2' },
  'Bordeaux City': { population: '257,000', type: 'Urban Center (UNESCO)',     km2: '49.4' },
  'Gradignan':     { population: '25,000',  type: 'Suburban / Forest',         km2: '25.4' },
}

const ROAD_TYPES: { key: RoadFilterType; label: string; color: string }[] = [
  { key: 'major',     label: 'Motorway / Trunk',    color: '#ef4444' },
  { key: 'primary',   label: 'Primary Road',         color: '#f97316' },
  { key: 'secondary', label: 'Secondary / Tertiary', color: '#eab308' },
  { key: 'local',     label: 'Local Streets',        color: '#9ca3af' },
  { key: 'tram',      label: 'Tram Lines',           color: '#c026d3' },
  { key: 'rail',      label: 'Rail Lines',           color: '#1e40af' },
]

export function RightPanel() {
  const {
    selectedAreas,
    toggleArea,
    flyToArea,
    triggerLoad,
    roadFilter,
    setRoadFilter,
    loadingRoads,
    loadProgress,
    roadCount,
    showOsmBuildings,
    toggleOsmBuildings,
    buildingsLoading,
  } = useMapControlStore()

  const handleAreaToggle = (area: string) => {
    const wasSelected = selectedAreas.includes(area)
    toggleArea(area)
    if (!wasSelected) flyToArea(area)
  }

  const handleFilterChange = (key: RoadFilterType, checked: boolean) => {
    setRoadFilter({ ...roadFilter, [key]: checked })
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto scrollbar-thin space-y-3 px-1">

      {/* ── Title ── */}
      <div className="text-xs font-bold text-sky-400 uppercase tracking-widest pt-1">
        📍 Map Controls
      </div>

      {/* ── Area selection ── */}
      <div>
        <div className="text-xs text-gray-400 font-semibold mb-2 uppercase tracking-wider">
          ① Select Areas
        </div>
        <div className="space-y-1.5">
          {Object.entries(AREAS).map(([key, area]) => {
            const isSelected = selectedAreas.includes(key)
            const details = AREA_DETAILS[key]
            return (
              <div
                key={key}
                className={`rounded-xl border transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-amber-500/15 border-amber-400/50 shadow-sm shadow-amber-500/10'
                    : 'bg-white/5 border-white/8 hover:bg-white/10'
                }`}
              >
                {/* Row */}
                <label className="flex items-center gap-2 px-3 py-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => handleAreaToggle(key)}
                    className="accent-amber-400 w-3.5 h-3.5 flex-shrink-0"
                  />
                  <span className="text-base leading-none">{area.icon}</span>
                  <span className={`text-xs font-semibold flex-1 ${isSelected ? 'text-amber-300' : 'text-gray-200'}`}>
                    {key}
                  </span>
                  {isSelected && (
                    <button
                      onClick={(e) => { e.preventDefault(); flyToArea(key) }}
                      className="text-sky-400 hover:text-sky-300 text-xs"
                      title="Fly camera here"
                    >
                      🎯
                    </button>
                  )}
                </label>

                {/* Expanded details when selected */}
                {isSelected && details && (
                  <div className="px-3 pb-2 pt-0 border-t border-amber-400/20 mt-0">
                    <div className="grid grid-cols-2 gap-x-2 mt-1.5">
                      <div className="text-xs text-gray-400">Population</div>
                      <div className="text-xs text-gray-200 font-mono">{details.population}</div>
                      <div className="text-xs text-gray-400">Area</div>
                      <div className="text-xs text-gray-200 font-mono">{details.km2} km²</div>
                      <div className="text-xs text-gray-400">Type</div>
                      <div className="text-xs text-gray-200 col-span-1 leading-tight mt-0.5">{details.type}</div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* ── 3D Buildings toggle ── */}
      <div>
        <div className="text-xs text-gray-400 font-semibold mb-2 uppercase tracking-wider">
          ② 3D Buildings
        </div>
        <button
          onClick={toggleOsmBuildings}
          disabled={buildingsLoading}
          className={`w-full flex items-center gap-3 rounded-xl px-3 py-2.5 border transition-all text-xs font-semibold ${
            showOsmBuildings
              ? 'bg-sky-500/20 border-sky-400/50 text-sky-300 shadow-lg shadow-sky-900/20'
              : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10'
          }`}
        >
          {/* checkbox visual */}
          <span className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
            showOsmBuildings ? 'bg-sky-400 border-sky-400' : 'border-gray-500'
          }`}>
            {showOsmBuildings && <span className="text-black text-[10px] font-bold leading-none">✓</span>}
          </span>
          <span className="flex-1 text-left">
            {buildingsLoading ? '⏳ Loading buildings…' : 'Show 3D Buildings'}
          </span>
          <span className="text-base">🏢</span>
        </button>
        {showOsmBuildings && !buildingsLoading && (
          <p className="text-xs text-gray-500 mt-1.5 text-center">
            Zooming to building view…
          </p>
        )}
      </div>

      {/* ── Load button ── */}
      <div>
        <div className="text-xs text-gray-400 font-semibold mb-2 uppercase tracking-wider">
          ③ Load Road Network
        </div>
        <button
          onClick={triggerLoad}
          disabled={!selectedAreas.length || loadingRoads}
          className={`w-full text-xs rounded-xl px-3 py-2.5 font-bold transition-all border ${
            !selectedAreas.length || loadingRoads
              ? 'bg-gray-800/50 text-gray-600 border-gray-700 cursor-not-allowed'
              : 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border-emerald-500/40 shadow-lg shadow-emerald-900/20'
          }`}
        >
          {loadingRoads
            ? '⏳ Loading…'
            : selectedAreas.length > 0
              ? `🛣️ Load ${selectedAreas.length > 1 ? `${selectedAreas.length} Areas` : selectedAreas[0]}`
              : '🛣️ Load Road Network'}
        </button>

        {loadProgress && (
          <div className="text-xs text-yellow-400 text-center mt-1.5 animate-pulse">{loadProgress}</div>
        )}
        {roadCount > 0 && !loadingRoads && (
          <div className="text-xs text-emerald-400 text-center mt-1.5 font-medium">
            ✓ {roadCount.toLocaleString()} road segments
          </div>
        )}
      </div>

      {/* ── Road type filter ── */}
      {roadCount > 0 && (
        <div>
          <div className="text-xs text-gray-400 font-semibold mb-2 uppercase tracking-wider">
            ④ Road Type Filter
          </div>
          <div className="bg-white/5 rounded-xl border border-white/8 p-2 space-y-1.5">
            {ROAD_TYPES.map(({ key, label, color }) => (
              <label
                key={key}
                className="flex items-center gap-2 cursor-pointer hover:text-white group"
              >
                <input
                  type="checkbox"
                  checked={roadFilter[key]}
                  onChange={(e) => handleFilterChange(key, e.target.checked)}
                  className="accent-blue-500 w-3.5 h-3.5 flex-shrink-0"
                />
                <span className="w-5 h-1.5 rounded-sm flex-shrink-0" style={{ background: color }} />
                <span className="text-xs text-gray-300 group-hover:text-white transition-colors">
                  {label}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* ── Tip ── */}
      {!selectedAreas.length && (
        <div className="text-xs text-gray-600 text-center py-2 leading-relaxed">
          Click area labels on the map<br />or check boxes above to select
        </div>
      )}
    </div>
  )
}
