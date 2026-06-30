import { useState } from 'react'
import { useMapControlStore } from '../../store/mapControlStore'
import { AREAS } from '../CityViewer/CesiumViewer'
import { useBuildingInspectorStore } from '../../store/buildingInspectorStore'
import { useLayerStore } from '../../store/layerStore'
import { useStreetHeatStore, HistoricalDay, ForecastDay } from '../../store/streetHeatStore'
import { useSatelliteLSTStore, LSTMode } from '../../store/satelliteLSTStore'
import { computeLocalAirTemp, dynamicEnergyClass, tempToIntensity } from '../../utils/thermalUtils'

// ── Street Heat colormap ──────────────────────────────────────────────────────
const RAMP: [number,[number,number,number]][] = [
  [22,[49,54,149]],[26,[69,117,180]],[29,[116,173,209]],[32,[171,217,233]],
  [35,[224,243,248]],[37,[255,255,191]],[39,[254,224,144]],[41,[253,174,97]],
  [43,[244,109,67]],[46,[215,48,39]],[50,[165,0,38]],[56,[103,0,31]],
]

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtKwh(k: number) {
  if (k >= 1_000_000) return `${(k/1_000_000).toFixed(2)} GWh`
  if (k >= 1_000)     return `${Math.round(k/1_000)} MWh`
  return `${k} kWh`
}

function wmoIcon(code: number): string {
  if (code <= 1) return '☀️'
  if (code <= 3) return '⛅'
  if (code <= 48) return '🌫️'
  if (code <= 57) return '🌦️'
  if (code <= 67) return '🌧️'
  if (code <= 77) return '❄️'
  if (code <= 82) return '🌦️'
  if (code <= 86) return '❄️'
  if (code >= 95) return '⛈️'
  return '🌤️'
}

function shortDay(s: string): string {
  return new Date(s+'T12:00:00').toLocaleDateString('fr-FR',{weekday:'short'}).replace('.','').slice(0,3)
}

// ── SVG sparkline ─────────────────────────────────────────────────────────────
function Sparkline({ data, w = 248, h = 52 }: { data: HistoricalDay[]; w?: number; h?: number }) {
  if (data.length < 2) return (
    <div className="h-14 flex items-center justify-center text-[9px] text-gray-700">Loading chart…</div>
  )
  const means = data.map(d => d.mean), maxs = data.map(d => d.max), mins = data.map(d => d.min)
  const lo = Math.min(...mins)-1, hi = Math.max(...maxs)+1, n = data.length
  const px = (i: number) => (i/(n-1))*w
  const py = (v: number) => h-((v-lo)/(hi-lo))*h
  const mp = means.map((v,i) => `${i===0?'M':'L'}${px(i).toFixed(1)},${py(v).toFixed(1)}`).join(' ')
  const rp = [
    ...maxs.map((v,i) => `${i===0?'M':'L'}${px(i).toFixed(1)},${py(v).toFixed(1)}`),
    ...mins.map((_,i) => `L${px(n-1-i).toFixed(1)},${py(mins[n-1-i]).toFixed(1)}`), 'Z',
  ].join(' ')
  const lastY = py(means[n-1]??0)
  return (
    <svg width={w} height={h} className="overflow-visible">
      <path d={rp} fill="rgba(253,174,97,0.10)" />
      <path d={mp} fill="none" stroke="#fdae61" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={px(n-1)} cy={lastY} r={2.5} fill="#fdae61" />
    </svg>
  )
}

// ── Collapsible section ───────────────────────────────────────────────────────
function Section({ icon, title, badge, color='#60a5fa', children, defaultOpen=true }: {
  icon: string; title: string; badge?: string; color?: string
  children: React.ReactNode; defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="rounded-xl border border-white/8 overflow-hidden" style={{background:'rgba(8,12,22,0.88)'}}>
      <button onClick={() => setOpen(v=>!v)}
        className="w-full flex items-center gap-2 px-3 py-2 border-b border-white/5 hover:bg-white/3 transition-colors text-left">
        <span className="text-sm leading-none">{icon}</span>
        <span className="text-[10px] font-bold tracking-wide flex-1" style={{color}}>{title}</span>
        {badge && (
          <span className="text-[7px] font-bold px-1.5 py-0.5 rounded border animate-pulse"
            style={{color, borderColor:`${color}50`, background:`${color}18`}}>{badge}</span>
        )}
        <span className="text-[9px] text-gray-700">{open?'▲':'▼'}</span>
      </button>
      {open && <div className="px-3 py-2.5 space-y-0">{children}</div>}
    </div>
  )
}

// ── Area Selection ────────────────────────────────────────────────────────────
const AREA_KM2: Record<string,string> = {
  'Bordeaux City':'49.4','Mérignac':'54.2','Pessac':'44.1','Talence':'10.5','Gradignan':'25.4',
}

function AreaSelection() {
  const { selectedAreas, toggleArea, flyToArea } = useMapControlStore()
  return (
    <Section icon="📍" title="Select Areas" color="#f59e0b" defaultOpen>
      <div className="space-y-1.5">
        {Object.entries(AREAS).map(([key, area]) => {
          const isOn = selectedAreas.includes(key)
          return (
            <label key={key} className={`flex items-center gap-2.5 px-2.5 py-2 rounded-xl border cursor-pointer transition-all ${
              isOn ? 'bg-amber-500/10 border-amber-400/35' : 'bg-white/3 border-white/6 hover:bg-white/5'
            }`}>
              <input type="checkbox" checked={isOn}
                onChange={() => { toggleArea(key); if (!isOn) flyToArea(key) }}
                className="accent-amber-400 w-3 h-3 flex-shrink-0" />
              <span className="text-sm leading-none">{area.icon}</span>
              <span className={`text-[11px] font-semibold flex-1 ${isOn?'text-amber-300':'text-gray-300'}`}>{key}</span>
              <span className="text-[7px] text-gray-700 font-mono">{AREA_KM2[key]} km²</span>
              {isOn && (
                <button onClick={e=>{e.preventDefault();flyToArea(key)}}
                  className="text-sky-500 hover:text-sky-400 text-[10px] ml-0.5" title="Fly here">🎯</button>
              )}
            </label>
          )
        })}
      </div>
    </Section>
  )
}

// ── Street Heat Panel ─────────────────────────────────────────────────────────
function StreetHeatPanel() {
  const { showStreetHeat } = useLayerStore()
  const { status, updatedAt, progress, stats, historical, forecast, anomaly } = useStreetHeatStore()
  if (!showStreetHeat) return null

  const isLoading = status === 'loading' || progress !== ''
  const gradBg = 'linear-gradient(to right,' +
    RAMP.map(([,[r,g,b]],i,a)=>`rgb(${r},${g},${b}) ${Math.round(i/(a.length-1)*100)}%`).join(',')+')'

  return (
    <Section icon="🌡️" title="Street Heat" badge={status==='live'?'LIVE':undefined} color="#fb923c" defaultOpen>
      {/* Status */}
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
          isLoading?'bg-amber-400 animate-pulse':status==='live'?'bg-emerald-400':'bg-gray-600'
        }`}/>
        <span className="text-[9px] text-gray-500">{isLoading ? progress : status==='live' ? `Live · ${updatedAt}` : 'Offline'}</span>
      </div>

      {/* Stats */}
      {stats && (
        <>
          <div className="grid grid-cols-3 gap-1.5 mb-1.5">
            {[{l:'MIN',v:`${stats.min}°C`,c:'#74add1',bg:'rgba(116,173,209,0.07)'},
              {l:'MEAN',v:`${stats.mean}°C`,c:'#fdae61',bg:'rgba(253,174,97,0.07)'},
              {l:'MAX',v:`${stats.max}°C`,c:'#d73027',bg:'rgba(215,48,39,0.07)'}].map(s=>(
              <div key={s.l} className="rounded-lg border border-white/5 py-1.5 text-center" style={{background:s.bg}}>
                <div className="text-[6px] text-gray-700 font-mono uppercase tracking-widest">{s.l}</div>
                <div className="text-[13px] font-black font-mono leading-snug" style={{color:s.c}}>{s.v}</div>
              </div>
            ))}
          </div>
          <div className="text-[7px] text-gray-700 font-mono text-right mb-2">{stats.count.toLocaleString()} segments</div>
        </>
      )}

      {/* Colormap */}
      <div className="mb-2.5">
        <div className="h-2 rounded overflow-hidden mb-0.5" style={{background:gradBg}}/>
        <div className="flex justify-between px-0.5">
          {['22','29','35','39','46','56+'].map(l=>(
            <span key={l} className="text-[6px] text-gray-700 font-mono">{l}°</span>
          ))}
        </div>
      </div>

      {/* Anomaly */}
      {anomaly !== null && (
        <div className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 mb-2.5 ${
          anomaly>0?'border-orange-500/25 bg-orange-900/12':'border-sky-500/25 bg-sky-900/12'
        }`}>
          <span>{anomaly>0?'🔥':'❄️'}</span>
          <div>
            <div className="text-[9px] font-bold" style={{color:anomaly>0?'#fb923c':'#38bdf8'}}>
              {anomaly>0?'+':''}{anomaly}°C vs last year
            </div>
            <div className="text-[7px] text-gray-600">7-day running mean anomaly</div>
          </div>
        </div>
      )}

      {/* 30-day chart */}
      {historical.length > 0 && (
        <div className="mb-2.5">
          <div className="text-[8px] text-gray-600 mb-1 font-semibold uppercase tracking-wider">30-Day History</div>
          <div className="rounded-lg bg-white/3 border border-white/5 px-2 pt-2 pb-1">
            <Sparkline data={historical}/>
            <div className="flex justify-between mt-0.5 px-0.5">
              <span className="text-[6px] text-gray-700 font-mono">{historical[0]?.date?.slice(5)}</span>
              <span className="text-[6px] text-gray-700 font-mono">{historical[historical.length-1]?.date?.slice(5)}</span>
            </div>
          </div>
        </div>
      )}

      {/* 7-day forecast */}
      {forecast.length > 0 && (
        <div>
          <div className="text-[8px] text-gray-600 mb-1 font-semibold uppercase tracking-wider">7-Day Forecast</div>
          <div className="grid grid-cols-7 gap-0.5">
            {forecast.slice(0,7).map((d: ForecastDay, i: number) => (
              <div key={i} className="flex flex-col items-center gap-0.5 rounded-lg bg-white/3 border border-white/5 px-0.5 py-1.5">
                <span className="text-[6px] text-gray-600 font-mono">{shortDay(d.date)}</span>
                <span className="text-[11px] leading-none">{wmoIcon(d.code)}</span>
                <span className="text-[7px] font-bold text-orange-400 font-mono">{Math.round(d.max)}°</span>
                <span className="text-[6px] text-sky-400 font-mono">{Math.round(d.min)}°</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Section>
  )
}

// ── Satellite LST Panel ───────────────────────────────────────────────────────
function SatelliteLSTPanel() {
  const { showSatelliteLST } = useLayerStore()
  const {
    mode, opacity, greenRoofs, coolAsphalt, gibs, fetchTime,
    setMode, setOpacity, setGreenRoofs, setCoolAsphalt, setGibs,
  } = useSatelliteLSTStore()
  if (!showSatelliteLST) return null

  return (
    <Section icon="🛰️" title="Satellite LST" color="#22d3ee" defaultOpen>
      {/* Mode */}
      <div className="flex gap-1 mb-3">
        {(['LST','NDVI','NDBI'] as LSTMode[]).map(m => (
          <button key={m} onClick={()=>setMode(m)}
            className={`flex-1 py-1.5 rounded-lg text-[9px] font-bold border transition-all ${
              mode===m
                ? m==='LST'  ?'bg-red-500/20 border-red-400/35 text-red-300'
                : m==='NDVI' ?'bg-green-500/20 border-green-400/35 text-green-300'
                :              'bg-gray-500/20 border-gray-400/35 text-gray-300'
                : 'bg-white/3 border-white/6 text-gray-600 hover:text-gray-400'
            }`}>
            {m==='LST'?'🌡️ LST':m==='NDVI'?'🌿 NDVI':'🏙️ NDBI'}
          </button>
        ))}
      </div>

      {/* Legend */}
      <div className="mb-3">
        <div className="h-2 rounded overflow-hidden mb-0.5" style={{
          background: mode==='NDVI'
            ? 'linear-gradient(to right,#783c1e,#bea882,#b4d282,#64b450,#1e8228,#005014)'
            : 'linear-gradient(to right,#313695,#4575b4,#74add1,#abd9e9,#ffffbf,#fee090,#fdae61,#f46d43,#d73027,#a50026)',
        }}/>
        <div className="flex justify-between px-0.5 text-[6px] text-gray-600">
          {mode==='NDVI'
            ? ['−0.2','0','0.3','0.8'].map(v=><span key={v}>{v}</span>)
            : ['10°','20°','28°','36°','46°'].map(v=><span key={v}>{v}</span>)}
        </div>
      </div>

      {/* Opacity */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[8px] text-gray-500 w-10 flex-shrink-0">Opacity</span>
        <input type="range" min={20} max={100} value={opacity} onChange={e=>setOpacity(+e.target.value)}
          className="flex-1 h-1 rounded-full appearance-none cursor-pointer"
          style={{background:`linear-gradient(to right,#06b6d4 ${opacity}%,#1e293b ${opacity}%)`}}/>
        <span className="text-[8px] text-gray-400 w-7 text-right font-mono">{opacity}%</span>
      </div>

      {/* Interventions */}
      {mode==='LST' && (
        <div className="border-t border-white/5 pt-2 mb-2.5">
          <div className="text-[7px] text-gray-600 mb-1.5 font-semibold uppercase tracking-wider">Falda 2025 Interventions</div>
          <div className="space-y-1.5">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={greenRoofs} onChange={e=>setGreenRoofs(e.target.checked)} className="accent-green-400 w-3 h-3"/>
              <span className="text-[9px] text-green-400">🌿 Green roofs −0.7°C</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={coolAsphalt} onChange={e=>setCoolAsphalt(e.target.checked)} className="accent-sky-400 w-3 h-3"/>
              <span className="text-[9px] text-sky-400">🛣️ Cool asphalt −1.9°C</span>
            </label>
          </div>
          {(greenRoofs||coolAsphalt) && (
            <div className="mt-1.5 text-[8px] text-amber-400 bg-amber-900/15 border border-amber-500/20 rounded px-2 py-1">
              −{((greenRoofs?0.7:0)+(coolAsphalt?1.9:0)).toFixed(1)}°C simulated across Bordeaux
            </div>
          )}
        </div>
      )}

      {/* GIBS */}
      <div className="flex items-center justify-between border-t border-white/5 pt-2">
        <div>
          <div className="text-[9px] text-gray-300 font-semibold">🛰️ NASA GIBS</div>
          <div className="text-[7px] text-gray-600">MODIS Terra · 1 km daily</div>
        </div>
        <button onClick={()=>setGibs(!gibs)}
          className={`px-2 py-1 rounded-lg text-[9px] font-bold border transition-all ${
            gibs?'bg-cyan-500/20 border-cyan-400/35 text-cyan-300':'bg-white/3 border-white/6 text-gray-600 hover:text-gray-400'
          }`}>{gibs?'ON':'OFF'}</button>
      </div>
      <div className="text-[7px] text-gray-700 text-right mt-1.5">{fetchTime}</div>
    </Section>
  )
}

// ── Building Inspector ────────────────────────────────────────────────────────
function BuildingInspectorPanel() {
  const building    = useBuildingInspectorStore(s => s.building)
  const setBuilding = useBuildingInspectorStore(s => s.setBuilding)
  const { showBuildings, showStreetHeat, showHeatWave } = useLayerStore()
  const { liveGrid } = useStreetHeatStore()

  if (!building || !showBuildings) return null
  const b = building
  const netGreen = Math.max(0, Math.round((b.uhiC-b.greenRoofReducC)*10)/10)
  const netCool  = Math.max(0, Math.round((b.uhiC-b.coolRoofReducC)*10)/10)

  // Dynamic energy class — computed from local air temp when heat data is active
  const heatActive   = (showStreetHeat || showHeatWave) && liveGrid.length > 0
  const localAirTemp = heatActive ? computeLocalAirTemp(b.lon, b.lat, liveGrid) : null
  const dynEc        = localAirTemp !== null
    ? dynamicEnergyClass(b.consumptionPerM2, localAirTemp)
    : null
  const thermalIntensity = localAirTemp !== null ? tempToIntensity(localAirTemp, 20, 45) : 0

  // Thermal stress label
  const stressLabel =
    thermalIntensity > 0.75 ? { text: 'Extreme Heat Stress', color: '#ef4444' } :
    thermalIntensity > 0.50 ? { text: 'High Heat Stress',    color: '#f97316' } :
    thermalIntensity > 0.25 ? { text: 'Moderate Thermal Load', color: '#eab308' } :
                              { text: 'Low Thermal Load',    color: '#34d399' }

  return (
    <Section icon="🏢" title="Building Inspector" color="#60a5fa" defaultOpen>
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <div className="text-[10px] font-bold text-white">{b.type}</div>
          <div className="text-[8px] text-gray-500">{b.district} · {b.floors}F · ~{b.yearBuilt}</div>
        </div>
        <button onClick={()=>setBuilding(null)}
          className="w-5 h-5 rounded bg-white/6 hover:bg-white/15 text-gray-500 hover:text-white text-[10px] flex items-center justify-center transition-all">✕</button>
      </div>

      {/* Thermal stress banner (only when heat active) */}
      {localAirTemp !== null && (
        <div className="rounded-lg border px-2.5 py-1.5 mb-2.5 flex items-center gap-2.5"
          style={{borderColor:`${stressLabel.color}40`, background:`${stressLabel.color}12`}}>
          <div className="flex-1">
            <div className="text-[9px] font-bold" style={{color:stressLabel.color}}>{stressLabel.text}</div>
            <div className="text-[7px] text-gray-500 mt-0.5">Local air temp: <span className="font-bold text-white">{localAirTemp}°C</span></div>
          </div>
          {/* Thermal intensity bar */}
          <div className="w-12 h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full rounded-full transition-all duration-500"
              style={{width:`${thermalIntensity*100}%`, background:`linear-gradient(to right,#22d3ee,${stressLabel.color})`}}/>
          </div>
        </div>
      )}

      {/* Energy class — static vs dynamic side by side when heat active */}
      <div className={`flex gap-2 mb-2 ${dynEc ? '' : ''}`}>
        {/* Static (rated) class */}
        <div className="flex-1 rounded-lg border border-white/6 bg-white/3 px-2 py-1.5">
          <div className="text-[6px] text-gray-600 mb-1 uppercase tracking-wider">Rated</div>
          <div className="flex items-center gap-1.5">
            <div className="w-5 h-5 rounded flex items-center justify-center text-[9px] font-black flex-shrink-0"
              style={{background:`${b.energyColor}22`,color:b.energyColor,border:`1.5px solid ${b.energyColor}44`}}>
              {b.energyCls}
            </div>
            <div>
              <div className="text-[10px] font-black text-white">{b.consumptionPerM2}</div>
              <div className="text-[6px] text-gray-600">kWh/m²/yr</div>
            </div>
          </div>
        </div>

        {/* Dynamic (heat-adjusted) class */}
        {dynEc && (
          <div className="flex-1 rounded-lg border px-2 py-1.5"
            style={{borderColor:`${dynEc.color}40`, background:`${dynEc.color}10`}}>
            <div className="flex items-center justify-between mb-1">
              <div className="text-[6px] uppercase tracking-wider" style={{color:dynEc.color}}>Heat Adjusted</div>
              {dynEc.cls !== b.energyCls && (
                <span className="text-[6px] font-bold text-orange-400 animate-pulse">▲ degraded</span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-5 h-5 rounded flex items-center justify-center text-[9px] font-black flex-shrink-0"
                style={{background:`${dynEc.color}22`,color:dynEc.color,border:`1.5px solid ${dynEc.color}44`}}>
                {dynEc.cls}
              </div>
              <div>
                <div className="text-[10px] font-black" style={{color:dynEc.color}}>{dynEc.kwh}</div>
                <div className="text-[6px] text-gray-600">+{dynEc.penaltyPct}% penalty</div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="text-[7px] text-gray-600 mb-2.5">{fmtKwh(b.totalKwh)}/yr · {b.co2Tonnes}t CO₂ · {b.footprintM2.toLocaleString()} m²</div>

      {/* UHI + interventions */}
      <div className="flex items-end gap-3 mb-2">
        <div>
          <div className="text-[6px] text-gray-600">UHI contrib.</div>
          <div className="text-base font-black text-orange-400">+{b.uhiC}°C</div>
        </div>
        <div className="flex-1 space-y-0.5">
          <div className="flex justify-between text-[7px]">
            <span className="text-green-400">Green roof</span>
            <span className="text-white">+{netGreen}°C <span className="text-green-400">(-{b.greenRoofReducC})</span></span>
          </div>
          <div className="flex justify-between text-[7px]">
            <span className="text-sky-400">Cool roof</span>
            <span className="text-white">+{netCool}°C <span className="text-sky-400">(-{b.coolRoofReducC})</span></span>
          </div>
        </div>
      </div>

      {/* Solar bar */}
      <div className="h-1 rounded-full bg-white/8 overflow-hidden">
        <div className="h-full rounded-full" style={{width:`${b.solarOffsetPct}%`,background:b.solarOffsetPct>50?'#22c55e':'#f97316'}}/>
      </div>
      <div className="text-[7px] text-right mt-0.5" style={{color:b.solarOffsetPct>50?'#4ade80':'#fb923c'}}>
        {b.solarOffsetPct}% solar offset · {fmtKwh(b.solarKwhYear)}/yr
      </div>
    </Section>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export function RightPanel() {
  return (
    <div className="flex flex-col gap-2.5 pb-2">
      <AreaSelection />
      <StreetHeatPanel />
      <SatelliteLSTPanel />
      <BuildingInspectorPanel />
    </div>
  )
}
