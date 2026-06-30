# Urban Digital Twin — Complete Dev Log
> Bordeaux Métropole | Built with Claude Code | Started: June 2026

---

## 📋 Project Overview

Full-stack AI-powered city intelligence platform for Bordeaux Métropole.
Built phase-by-phase from a 1620-line master specification.

**Stack:**
- Frontend: React 18 + TypeScript + Vite + TailwindCSS + CesiumJS + Zustand
- Backend: FastAPI (Python) on port 8000
- ML Service: FastAPI on port 8001
- Databases: PostGIS (port 5432) + TimescaleDB (port 5433) + Redis
- Infra: Docker Compose (12 services) + Nginx + Celery workers

**Start (local dev, no Docker):**
```bash
# Backend
cd backend && python -m uvicorn app.main:app --port 8000 --reload

# Frontend
cd frontend && npm run dev
```

---

## 🔑 Critical Config

### frontend/.env (MUST be in frontend/ folder, not root)
```
VITE_CESIUM_TOKEN=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJkZTMxZmY3OS0wMWZhLTQ2YzAtOTBkMC02ZjEwYWI5ZGQyMzEiLCJpZCI6NDI3MjQ2LCJzdWIiOiJtbXVzbWFhbjEiLCJpc3MiOiJodHRwczovL2lvbi5jZXNpdW0uY29tIiwiYXVkIjoiVGVzdGluZyIsImlhdCI6MTc3ODI3NDI3NX0.qwoxp2OonOF2YRPYZgztzWsMvGCnI-glzhfT4JP1jMg
VITE_API_URL=http://localhost:8000
VITE_WS_URL=ws://localhost:8000
VITE_ML_URL=http://localhost:8001
```
> ⚠️ Vite reads .env from its OWN folder (where vite.config.ts is), NOT from parent directory.
> If token = "1" in browser → .env is in wrong folder.

---

## 📁 File Structure (Key Files)

```
urban-digital-twin/
├── DEVLOG.md                          ← this file
├── docker-compose.yml                 ← 12 services
├── .env                               ← backend env vars only
│
├── frontend/
│   ├── .env                           ← ⚠️ CESIUM TOKEN HERE
│   ├── vite.config.ts
│   ├── src/
│   │   ├── App.tsx                    ← main layout (glass sidebars)
│   │   ├── main.tsx
│   │   ├── vite-env.d.ts              ← fixes import.meta.env TS errors
│   │   ├── components/
│   │   │   ├── CityViewer/
│   │   │   │   └── CesiumViewer.tsx   ← 3D globe (main map component)
│   │   │   ├── Dashboard/
│   │   │   │   ├── KPICards.tsx
│   │   │   │   ├── AlertsFeed.tsx
│   │   │   │   └── LiveMetrics.tsx
│   │   │   ├── MapControls/
│   │   │   │   └── RightPanel.tsx     ← area selector + road loader
│   │   │   ├── UI/
│   │   │   │   └── LayerTogglePanel.tsx
│   │   │   ├── ScenarioEngine/
│   │   │   │   └── ScenarioPanel.tsx  ← crown jewel UI
│   │   │   └── BuildingLayer/
│   │   │       └── BuildingInfoPopup.tsx
│   │   ├── store/
│   │   │   ├── simulationStore.ts
│   │   │   ├── scenarioStore.ts
│   │   │   ├── buildingStore.ts
│   │   │   ├── layerStore.ts
│   │   │   └── mapControlStore.ts     ← NEW: shared map state
│   │   ├── services/
│   │   │   ├── api.ts
│   │   │   └── websocket.ts
│   │   ├── hooks/
│   │   │   └── useWebSocket.ts
│   │   └── types/
│   │       └── simulation.ts
│
├── backend/
│   └── app/
│       ├── main.py                    ← FastAPI app, all routers
│       ├── routers/
│       │   ├── traffic.py
│       │   ├── scenarios.py
│       │   ├── buildings.py
│       │   ├── energy.py
│       │   └── ml.py
│       └── services/
│           ├── scenario_engine.py     ← solution ranking + simulation
│           ├── sumo_service.py        ← mock SUMO, 300 vehicles
│           └── ...
│
├── ml_service/
│   └── app/main.py
│
└── database/
    ├── 01_postgis_schema.sql          ← roads, intersections, incidents
    ├── 02_timescale_schema.sql        ← traffic_flow, energy, sensors
    ├── 03_bim_schema.sql              ← buildings (8 seeded Bordeaux)
    ├── 04_scenario_schema.sql         ← scenarios (2 seeded)
    └── 05_ml_features_schema.sql      ← ml_traffic_features, model_registry
```

---

## 🐛 Bugs Fixed (With Root Causes)

### Bug 1: `vite-plugin-cesium@^1.3.0` not found
- **Error:** `npm install` failed — no matching version
- **Fix:** Changed to `"vite-plugin-cesium": "^1.2.23"` in `frontend/package.json`

### Bug 2: TypeScript `import.meta.env` errors
- **Error:** `Property 'env' does not exist on type 'ImportMeta'`
- **Files affected:** CesiumViewer.tsx, api.ts, websocket.ts
- **Fix:** Created `frontend/src/vite-env.d.ts`:
```typescript
/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_API_URL: string
  readonly VITE_WS_URL: string
  readonly VITE_ML_URL: string
  readonly VITE_CESIUM_TOKEN: string
}
interface ImportMeta { readonly env: ImportMetaEnv }
```

### Bug 3: Cesium 401 Unauthorized (`access_token=1`)
- **Error:** `api.cesium.com returned 401, access_token=1`
- **Root cause:** `.env` was in root `urban-digital-twin/` but Vite reads `.env` from `frontend/` directory (same folder as `vite.config.ts`). `import.meta.env.VITE_CESIUM_TOKEN` was `undefined`, Cesium defaulted to `1`.
- **Fix:** Created `frontend/.env` with the token (root `.env` is only for backend/Docker)

### Bug 4: Camera not moving when selecting area from dropdown
- **Root cause:** React 18 StrictMode runs `useEffect` TWICE in development. Two Cesium viewers were being created on the same `<div>`. The second init's `cesiumViewer.current` pointed to the destroyed viewer from cleanup → `camera.flyTo()` was silently failing.
- **Fix:** Added `cancelled` flag to the async init IIFE:
```typescript
useEffect(() => {
  let cancelled = false
  let localViewer: Viewer | null = null
  ;(async () => {
    const terrain = await createWorldTerrainAsync()
    if (cancelled || !viewerRef.current) return  // ← catches StrictMode double-run
    localViewer = new Viewer(viewerRef.current, { ... })
    if (cancelled) { localViewer.destroy(); return }
    cesiumViewer.current = localViewer
  })()
  return () => {
    cancelled = true
    localViewer?.destroy()
    cesiumViewer.current = null
  }
}, [])
```

### Bug 5: Zoom/cursor distortion artifacts
- **Root cause:** Two viewers on same div (same as Bug 4 — visual symptom of double init)
- **Also:** `PolylineGlowMaterialProperty` with high `glowPower` causes overdraw artifacts during camera movement
- **Fix:** Single viewer (Bug 4 fix) + reduced `glowPower` to 0.15–0.2

### Bug 6: Road network auto-loading on area select
- **Problem:** `handleAreaChange` called `loadRoads()` which did BOTH camera fly AND Overpass API fetch
- **Fix:** Separated into:
  - Area select → only `camera.flyTo()`
  - Explicit "Load Road Network" button → `fetchRoads()`

### Bug 7: Wrong area heights (camera too high)
- **Problem:** Heights were 4500–7000m (too high, looked like satellite view)
- **Original repo** (reference): Pessac=1600, Talence=1600, Mérignac=1600, Bordeaux=2000, Gradignan=1600
- **Fix:** Matched reference repo heights exactly

---

## ✅ Features Built (Phase 1 Complete)

### Backend API (verified live with curl)
- `GET /health` → 200 OK
- `GET /api/kpis` → live city KPIs (vehicle_count, energy_mwh, outdoor_temp_c, aqi, co2_kg_hr)
- `GET /api/scenarios/active` → 2 active scenarios (Traffic Gridlock + Energy Spike)
- `GET /api/scenarios/{id}/solutions/{sol_id}/simulate` → before/after comparison
- `GET /api/buildings` → list of BIM buildings
- `GET /api/buildings/{id}` → building detail with health score, systems

### Frontend
- **CesiumViewer** — 3D globe with:
  - World terrain (`createWorldTerrainAsync`)
  - OSM 3D buildings (`createOsmBuildingsAsync`)
  - 5 area markers with emoji labels: 🏘️ Pessac, 🎓 Talence, ✈️ Mérignac, 🏛️ Bordeaux, 🌲 Gradignan
  - **Click label on map** → auto-selects in right panel + camera flies there
  - Selected markers turn amber/yellow
  - Vehicle dots (color by type: car=blue, bus=green, truck=orange, etc.)
  - BIM building markers (color by use: office=blue, hospital=red, etc.)
  - Road network via Overpass API (multi-area combined loading)
  - Road type filter: major/primary/secondary/local/tram/rail

- **Layout** — Glassmorphism UI:
  - **Left sidebar** (collapsible, toggles to 40px icon strip):
    - KPI cards (Vehicles, Energy, Temp, AQI) — red highlight when over threshold
    - Active Alerts (click to view scenario)
    - Layer toggles (Traffic, Buildings, Energy, Heat Wave, Air Quality, ML, Scenarios, Flood, Grid)
  - **Right sidebar** (collapsible, toggles to 40px icon strip):
    - Multi-area checkbox select (Pessac + Talence + Mérignac simultaneously)
    - Per-area detail cards (population, area km², type) expand when selected
    - Load Road Network button (loads ALL selected areas combined)
    - Progress: "Loading Talence (2/3)…"
    - Road type filter (appears after roads loaded)
  - Sidebar state persists in localStorage
  - **Header** — Live status badge, KPI strip, clock, user avatar
  - **Bottom bar** — Secondary metrics (vehicles, energy, grid load, CO₂, incidents, scenarios)

- **ScenarioPanel** — Crown jewel UI:
  - Active scenarios with severity badges
  - Ranked AI solutions (score = impact×0.40 + confidence×0.25 + speed×0.20 + cost_efficiency×0.15)
  - Simulate / Apply buttons
  - Before/after comparison

- **BuildingInfoPopup** — BIM popup on building click:
  - Health score, energy consumption, floor count, systems status, AI alerts

### WebSocket Real-time
- Backend broadcasts city updates every second
- Frontend receives: vehicle positions, KPIs, alerts, climate data
- Vehicles animate smoothly on map

---

## 🗺️ Area Definitions (Bordeaux Métropole)

```typescript
const AREAS = {
  'Pessac':        { lon: -0.6150, lat: 44.8060, height: 1600, osmName: 'Pessac'    },
  'Talence':       { lon: -0.5890, lat: 44.8080, height: 1600, osmName: 'Talence'   },
  'Mérignac':      { lon: -0.6850, lat: 44.8330, height: 1600, osmName: 'Mérignac'  },
  'Bordeaux City': { lon: -0.5792, lat: 44.8378, height: 2000, osmName: 'Bordeaux'  },
  'Gradignan':     { lon: -0.6160, lat: 44.7720, height: 1600, osmName: 'Gradignan' },
}
```

**Overpass API Query (road network):**
```
[out:json][timeout:90];
area["name"="Pessac"]["admin_level"=8]->.searchArea;
(way["highway"](area.searchArea);
 way["railway"="tram"](area.searchArea);
 way["railway"="rail"](area.searchArea););
out geom;
```

---

## 🧠 Solution Ranking Algorithm

```python
score = (impact × 0.40) + (confidence × 0.25) + (speed × 0.20) + (cost_efficiency × 0.15)
```

Solutions: SOL_T01 through SOL_C04 in `backend/app/services/scenario_engine.py`

---

## 🔮 Future Roadmap (Discussed)

### Tier 1 — Visual WOW (Mayor Demo Ready)
- [ ] **Traffic Congestion Heatmap** — Color-coded roads by congestion level (green→red), road width changes with congestion
- [ ] **Timeline Slider (City Rewind)** — Scrub through last 24h of city data, see historical state
- [ ] **Isochrone Map** — Click any point, see 15/30/45-min travel radius. Urban planning gold.

### Tier 2 — Power Tools (Investor Demo)
- [ ] **What-If Scenario Builder (Visual)** — Drag to close roads, add bus stops, draw solar zones → auto-predict impact
- [ ] **Comparative Analysis Panel** — Before/after side by side (map + numbers)
- [ ] **Real Bordeaux Open Data** — Connect to `opendata.bordeaux-metropole.fr` (real traffic, bus, air quality)

### Tier 3 — Advanced Intelligence
- [ ] **Agent-Based Simulation (full SUMO TraCI)** — Individual vehicle behaviors, specific conditions simulation
- [ ] **Energy Grid Flow Animation** — Animated current flow from substations to neighborhoods
- [ ] **Climate Risk / Urban Heat Island** — 3D temperature overlay, flood zones, tree-planting impact calculator
- [ ] **Digital Twin API** — REST endpoints for city planners to query from Excel/GIS tools

### Digital Twin Philosophy
A true digital twin has 3 layers:
1. **Mirror** — What is the city like RIGHT NOW? ✅ Done
2. **Memory** — What WAS it like? (historical replay) ❌ Missing
3. **Mind** — What WILL it be like? What if I do X? ⚠️ Partially done (scenario engine)

The biggest gap: **Memory layer** (Timeline Slider) — transforms it from "dashboard" to "decision tool"

---

---

## 🚗 Session 3 — Live SUMO Simulation + Smooth Vehicles (June 16 2026)

### What was built

#### Live SUMO Streaming (ported from VC Model project)
- **Source:** `C:\Users\UBordeaux\Desktop\VC Model\map-ui\sumo_files\sumo_live_server.py`
- **Copied to:** `simulations/sumo/sumo_live_server.py`
- **How it works:** Python WebSocket server (port 8765) watches `fcd.xml` as SUMO writes it in real-time. Browser sends `{"type":"start"}` → server launches `sumo-gui.exe` automatically → user presses ▶ Play in SUMO-GUI → vehicles stream to browser map.
- **No TraCI** — pure file-watching approach, no version mismatch issues.

#### Frontend Live Connection (`CesiumViewer.tsx`)
- `connectLive()` — connects to `ws://localhost:8765`, sends `{"type":"start"}` on open (triggers auto-launch of SUMO-GUI)
- `disconnectLive()` — sends stop, clears entities, resets epoch
- `liveState` — `'idle' | 'connecting' | 'waiting' | 'running' | 'error' | 'stopped'`
- Live status bar (top-right): pulsing red dot when running, shows vehicle count + sim time
- "Live SUMO" button (appears when idle, not loaded)

#### Ferrari 3D Car Model
- Downloaded from Three.js samples (`ferrari.glb`, 1.6 MB, Draco compressed)
- Saved to `frontend/public/sumo/ferrari.glb`
- Replaces generic CesiumMilkTruck for live vehicles
- Scale: `1.0` (real-world size)

### Bugs Fixed This Session

#### Bug 8: SUMO angle → Cesium heading wrong direction
- **Problem:** Cars moving but facing sideways/wrong direction on roads
- **Root cause:** SUMO angle = clockwise from North. Cesium heading = clockwise from East in local ENU frame. Reference axis differs by 90°.
- **Fix iterations:**
  1. Changed `angleDeg` → `angleDeg - 90` (cars still reversed)
  2. Changed to `angleDeg + 90` ✅ correct
- **Final formula:** `CesiumMath.toRadians(angleDeg + 90.0)`

#### Bug 9: Cars too large (passing through each other visually)
- **Problem:** `scale: 2.5` made Ferrari ~11m long (2.5× real size), cars overlapped on screen
- **Fix:** `scale: 1.0` → real-world size (~4.5m)

#### Bug 10: Jumpy/teleporting vehicle movement
- **Problem:** Each WebSocket frame set `ConstantPositionProperty` → instant position jump
- **Fix:** `SampledPositionProperty` + `VelocityOrientationProperty`
  - Cesium interpolates linearly between position samples
  - `VelocityOrientationProperty` derives heading from movement direction automatically (no manual angle needed for smooth turns)
  - Cesium clock advanced 1 step ahead so interpolated position is always in range
  - `ExtrapolationType.HOLD` — holds last position when no new data

### Key Code Patterns

#### Smooth vehicle interpolation
```typescript
// Create once per vehicle
const sampledPos = new SampledPositionProperty()
sampledPos.setInterpolationOptions({
  interpolationAlgorithm: LinearApproximation,
  interpolationDegree: 1,
})
sampledPos.forwardExtrapolationType = ExtrapolationType.HOLD

entity = viewer.entities.add({
  position: sampledPos,
  orientation: new VelocityOrientationProperty(sampledPos), // auto heading!
  model: { uri: '/sumo/ferrari.glb', scale: 1.0, ... }
})

// Each WebSocket frame — just add sample, Cesium handles the rest
const jt = JulianDate.addSeconds(liveEpoch, simTime, new JulianDate())
sampledPos.addSample(jt, Cartesian3.fromDegrees(lon, lat, 0))
viewer.clock.currentTime = JulianDate.addSeconds(jt, 1.0, new JulianDate())
```

#### Startup flow (3 terminals)
```
Terminal 1: cd simulations/sumo && python sumo_live_server.py
Terminal 2: cd frontend && npm run dev
Browser:    Click "Live SUMO" → SUMO-GUI auto-opens → press ▶ Play
```

### New Imports Added
```typescript
import {
  SampledPositionProperty,
  LinearApproximation,
  ExtrapolationType,
} from 'cesium'
```

### GitHub Backup
- Repository: https://github.com/Muhammadusmanmalik701/urban-digital-twin-Traffic-with-Sumo
- First commit: `7aef05d` — 101 files, full project backup
- Git config: `user.email = imsintern26@gmail.com`, `user.name = UBordeaux`
- Future commits: `git add . && git commit -m "message" && git push`

---

## 🏗️ Session 4 — 3D Buildings, Camera Follow, Ego Car, TraCI Self-Drive (June 17 2026)

### What was built

#### 1. OSM 3D Buildings — CDN Migration
- **Problem:** Buildings showed in console (`[Buildings] OSM 3D buildings loaded`) but invisible on map — camera at 45,000m, LOD tiles don't render that far
- **Root cause of deeper issue:** `vite-plugin-cesium` was bundling Cesium incorrectly → switched to Cesium JS CDN
- **Fix:**
  - Added Cesium 1.117 CDN sync script to `frontend/index.html` (before React)
  - All Cesium symbols destructured from `(window as any).Cesium` at module level
  - Explicit `Cesium3DTileset.fromIonAssetId(96188)` (Cesium OSM Buildings asset)
  - `vite.config.ts`: removed cesium plugin, added as external
  - `flyToBuildingView()` helper: auto-flies to 1200m altitude when Buildings toggled on
  - New Cesium Ion token with "3d map data" audience
- **Key lesson:** OSM 3D Tile LOD requires camera < ~2000m altitude

#### 2. Layer Defaults + UI Cleanup
- All layer defaults → `false` in `layerStore.ts`
- Removed "3D Buildings" section from RightPanel (duplicate control removed)
- Buildings layer in left pane is now sole control
- Area deselect → roads + buildings for that area cleared (per-area `Map<string, Entity[]>` tracking)
- Removed blue BDTOPO polygon overlays (were rendering on top of OSM 3D buildings)

#### 3. Car Follow Camera System
Three modes implemented in `CesiumViewer.tsx`:

| Button | Mode | Behavior |
|---|---|---|
| ⬆ Top | `top` | 250m above, -90° straight down, car centered |
| 🚗 Follow | `front` | 100m behind, 100m above, -45° angle |
| 🚘 Drive | `cockpit` | Inside car, 1.5m above, 2m forward, -3° pitch |

**Critical bug fixed — black screen:**
- `camera.lookAt(pos, HeadingPitchRange)` locks Cesium's internal camera transform → tiles stop loading → black screen
- **Fix:** `camera.setView()` instead — repositions without locking
- `scene.postRender` instead of `scene.preRender`

**Free-rotate follow:**
- Top/Follow modes: only translate camera by car's delta movement each frame
- User can freely rotate/zoom while camera tracks car position
- Mode switch re-initializes angle via `startFollowRef`

**Cockpit mode:**
- `setView` every frame (locks inside car by design)
- Car model hidden in cockpit (`entity.model.show = false`)
- Restored on mode switch or Stop

**Click any car → auto-follow starts**

#### 4. Ego Car (f_0.0) Auto-Detection
- **ID:** `f_0.0`, **Type:** `EgoCar`, **Depart:** t=10s (route via Bordeaux center)
- When `f_0.0` appears in SUMO data → automatic camera follow + gold color + 1.3× scale
- **EGO CAR ACTIVE** banner at top center with amber pulse
- Ego car disappears → follow stops, banner clears
- `egoFollowedRef` prevents re-triggering on same simulation run

#### 5. TraCI Self-Drive — sumo_live_server.py Rewrite
**Complete rewrite** from FCD file-watch → TraCI thread:

```
Frontend keyboard → WebSocket → Python threading.Queue → TraCI → SUMO
SUMO positions → TraCI → asyncio.Queue → WebSocket → Frontend
```

**Architecture:**
- `_traci_thread()` runs in background thread, calls `traci.simulationStep()` in loop
- `_cmd_queue` (threading.Queue): WS handler → TraCI thread (control commands)
- `_pos_queue` (asyncio.Queue): TraCI thread → broadcaster coroutine
- `asyncio.run_coroutine_threadsafe()` bridges threads safely

**WebSocket protocol:**
- IN: `{type:'control', action:'set_speed', value:50}` | `brake` | `lane_left` | `lane_right` | `autopilot`
- OUT: GeoJSON FeatureCollection (positions) + `{type:'ego_state', speed, maxSpeed, lane, road}`

**Keyboard controls (active when ego car visible):**

| Key | Action |
|---|---|
| W / ↑ | +5 km/h |
| S / ↓ | Brake |
| A / ← | Lane change left |
| D / → | Lane change right |
| R | Release to SUMO autopilot |
| Space | Full stop (0 km/h) |

**Ego HUD** (top center when ego active): live speed, lane number, key hints

#### 6. Lane Change Bug Fix
- **Bug:** Lane change silently failing
- **Cause 1:** Junction roads (`:edgeID`) → `traci.edge.getLaneNumber()` throws → exception caught silently
- **Cause 2:** `changeLane(id, lane, 4.0)` — 4 second duration, too slow
- **Cause 3:** SUMO's auto lane-change was overriding TraCI commands
- **Fix:**
  - Added `if road.startswith(':': return` (skip junctions)
  - Duration `4.0` → `0` (immediate)
  - `setLaneChangeMode(EGO_ID, 0b00110000)` on ego spawn: TraCI overrides SUMO
  - `setLaneChangeMode(EGO_ID, 0b00001111)` on R: restore SUMO auto lane changes

#### 7. 16-Config Vehicle Diversity System
Hash vehicle ID → deterministic visual config (same vehicle always looks same):

```typescript
function idHash(id: string): number {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i); h = (h * 16777619) >>> 0
  }
  return h
}
```

**16 configs across 4 categories:**
- **Mini** (ferrari.glb, 0.60×): red / orange / yellow / green
- **Sedan** Toyota/Honda/Tesla (ferrari.glb, 0.88×): pearl white / silver / black / navy
- **SUV/4×4** (truck.glb, 0.62×): dark / dark red / forest green / silver
- **Van/MPV** (CesiumMilkTruck.glb, 0.85×): white / yellow / purple / sky blue
- **Bus** → bus.glb, green
- **Truck** → truck.glb, orange, 1.55× scale
- **Motorcycle** → ferrari.glb, purple, 0.45× scale
- **Ego car** → ferrari.glb, gold, always

### Startup (3 terminals)
```bash
# Terminal 1 — TraCI server (replaces old FCD server)
cd simulations/sumo
python sumo_live_server.py   # requires SUMO_HOME + pip install traci

# Terminal 2 — Frontend
cd frontend && npm run dev

# Browser: Click Live SUMO → SUMO-GUI opens automatically → play starts
# Ego car f_0.0 appears → gold car → auto-camera follow → W/S/A/D to drive
```

### GitHub Commits This Session
```
d4cc379  feat: 16 distinct vehicle configs — mini/sedan/SUV/van with unique colors
c6d78b9  feat: cockpit/drive view — first-person camera inside ego car
1e69d62  chore: update SUMO scenario files with ego car route
7d0b83e  fix: ego car lane change — junction check, immediate duration, laneChangeMode
e542523  feat: TraCI self-drive — ego car keyboard control (W/S/A/D/R/Space)
cfd8dae  feat: ego car auto-detection and camera follow
20c3a36  feat: free-rotate camera follow — delta position only, orientation unlocked
cb38ad7  fix: follow camera 100m behind, 100m above
621da24  fix: follow camera pitch -47°
9b3edb1  fix: adjust follow camera distances
c1723b3  fix: car follow camera centering for top and follow views
8258b00  fix: car follow camera black screen (lookAt → setView + postRender)
```

---

## 📚 Reference

- **Original Bordeaux index.html repo:** https://github.com/Muhammadusmanmalik701/Cesium-Sumo-digital-twin-road-network
- **GitHub backup:** https://github.com/Muhammadusmanmalik701/urban-digital-twin-Traffic-with-Sumo
- **Bordeaux Open Data:** https://opendata.bordeaux-metropole.fr
- **Cesium Ion dashboard:** https://ion.cesium.com
- **Overpass API:** https://overpass-api.de

---

## 🚦 Session 5 — Traffic Signal Control + Congestion Heatmap (June 2026)

### What was built

#### 1. Traffic Signal Control via TraCI
- **Frontend:** TLS control panel — click intersection on map → select phase (green/yellow/red) → send to SUMO
- **Backend (`sumo_live_server.py`):** `_apply_tls_control(cmd)` function
  - `traci.trafficlight.setPhase(tls_id, phase_index)` — force phase
  - `traci.trafficlight.setPhaseDuration(tls_id, duration)` — hold duration
- **3D markers:** Traffic light markers added to map at intersection positions
- **WebSocket protocol:** `{type: "tls_control", tls_id, phase, duration}`

#### 2. Congestion Heatmap (Dot-based, v1)
- Edge-level speed/occupancy data from `traci.edge.getLastStepMeanSpeed()` / `getLastStepOccupancy()`
- Color scale: green (fast) → orange → red (slow/jammed)
- Point entities rendered at edge midpoints
- Before/after analytics panel: queue counter showing vehicles slowed per edge
- Satellite/streets map toggle added

### GitHub Commits
```
6dc1ac1  fix: move global declaration to top of _apply_control
e2a2cac  feat: traffic signal control via TraCI + 3D map markers
5a5ad24  feat: congestion heatmap + queue counter + before/after analytics
9fc83b5  fix: heatmap visibility + add streets/satellite map toggle
cbe59c4  fix: heatmap now uses point entities (reliable 2D/3D) + floor division fix
```

---

## 🚨 Session 6 — Incident System, Road Heatmap, Alt Routes, Forecasting, VR (June 23 2026)

### What was built

#### 1. Google Maps-Style Road Heatmap (v2 — replaces dot heatmap)
- **Old:** point entities at edge midpoints (inaccurate, doesn't follow roads)
- **New:** colored polylines drawn directly ON road segments
- **Colors:** green ≥40 km/h | amber 25–40 | orange 10–25 | red <10 | dark red = blocked
- **Width:** varies 5–10px by congestion severity
- **Key fix — embedded coords:** `pts` coordinates embedded in every `road_metrics` message (instead of relying on one-time `edge_shapes` message that might be missed)
- **Cesium bug:** `PolylineGlowMaterialProperty` + `clampToGround` = invisible → use plain `Color` instead

#### 2. Vehicle Incident Scenarios
**Frontend:** click vehicle → incident panel appears with 3 buttons:
- 🔴 Breakdown — engine failure, vehicle stops
- 🔥 Fire — vehicle on fire, immediate stop
- 💥 Accident — collision, vehicle stops

**Backend (`_apply_incident`):**
```python
traci.vehicle.setSpeed(veh_id, 0.0)
traci.vehicle.setMaxSpeed(veh_id, 0.0)
traci.edge.adaptTraveltime(edge_id, 1e9)  # block edge
```

**Key bugs fixed:**
- `live_` prefix mismatch: Cesium entity IDs are `live_f_0.0` but SUMO uses `f_0.0` → strip with `.replace(/^live_/, '')`
- Incident vehicle kept moving visually: added `incident: true` flag in FeatureCollection → frontend skips `addSample` for incident vehicles (position frozen)
- `adaptTraveltime(1e9)` reset by SUMO silently → re-apply every simulation step inside `if _incident_edges:` block

#### 3. Auto-Rerouting with Deadlock Prevention
- SUMO startup flags: `--device.rerouting.period 30 --device.rerouting.adaptation-interval 10`
- `currentTravelTimes=False` in `rerouteTraveltime()` — uses stored `adaptTraveltime` values (not live speeds) → guaranteed to avoid blocked edge
- Only reroute vehicles with blocked edge in next 6 edges ahead (prevents mass rerouting deadlock)
- Every 10 steps: re-check vehicles approaching incident edge

#### 4. Alternate Route Visualization (AI/ML Route Recommendation)
**Before/after route diff algorithm:**
```python
# Snapshot routes BEFORE rerouting
affected_before = {vid: set(route) for vid in live_ids if edge_id in route}
# Reroute
traci.vehicle.rerouteTraveltime(vid, currentTravelTimes=False)
# Diff → find detour edges
detour_freq = Counter(eid for vid, old in affected_before.items()
                      for eid in new_route if eid not in old)
```
**Frontend:** cyan polylines on detour roads (width/alpha proportional to usage frequency), dark red on blocked edge. Toggle button to show/hide.

#### 5. Predictive Congestion Forecasting
- Rolling 8-reading speed history per edge
- Linear slope extrapolation 3 steps ahead: `predicted = last + slope × 3`
- Orange dashed lines = will-jam edges, yellow dashed = slowing edges
- `PolylineDashMaterialProperty` for dashed rendering
- Toggle button to show/hide forecast layer

#### 6. Digital Twin Impact Analysis Panel
Floating panel (bottom-left) showing after incident:
- Affected vehicles count
- Rerouted vehicles count
- Alternate corridors found
- Blocked edge ID
- Layer toggles for Alt Routes / Forecast

#### 7. Mapbox Isochrone API
- ORS API login failed (HeiGIT session transfer error) → switched to Mapbox
- `GET /isochrone/v1/mapbox/{profile}/{lon},{lat}?contours_minutes=10,20,30&polygons=true`
- Key stored in `frontend/.env` as `VITE_MAPBOX_ISO_KEY`
- Click map → shows 10/20/30 min travel radius polygons
- Bug fix: `isoClickHandler` scope error → fixed with `isoClickHandlerRef = useRef<any>(null)`

#### 8. WebXR VR Support (HTC Vive Cosmos Elite)
- WebXR support detection: polls `navigator.xr.isSessionSupported('immersive-vr')` every 5s
- Handles SteamVR starting after browser loads
- `navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'] })`
- `viewer.scene.useWebVR = true` + `xrSession` assignment
- VR button: 3 states — "detecting…" / "VR Mode" (violet border) / "Exit VR" (violet glow)
- VR HUD overlay: vehicle count, sim time, incident badge, traffic legend, Exit button
- `(navigator as any).xr` cast fixes TypeScript error

**Hardware note:** Cosmos Elite requires DisplayPort + USB + DC power (wired) OR VIVE Wireless Adapter (~$300) for wireless. Laptop HDMI → need Active DisplayPort to HDMI adapter (~$15-20).

### Key Refs Added (`CesiumViewer.tsx`)
```typescript
const edgeShapes          = useRef<Map<string, number[][]>>(new Map())
const roadMetricEntities  = useRef<Map<string, any>>(new Map())
const incidentEntities    = useRef<Map<string, any>>(new Map())
const altRouteEntities    = useRef<any[]>([])
const forecastEntities    = useRef<Map<string, any>>(new Map())
const isoClickHandlerRef  = useRef<any>(null)
```

### Shared State (`sumo_live_server.py`)
```python
_broken_vehicles: dict = {}   # { veh_id: incident_type, veh_id+"_edge": edge_id }
_incident_edges:  set  = set()  # edge IDs blocked by incidents
_edge_shapes:     dict = {}   # { edge_id: [[lon, lat], ...] }
_speed_history:   dict = {}   # { edge_id: [spd1, spd2, ...] } rolling window
```

### GitHub Commits
```
[Session 6 commits — pushed June 23 2026]
```

---

## 🌧 Session 7 — Area-Specific Rain Simulation + SUMO ego_car Fix (June 24 2026)

### Goals
- Fix SUMO duplicate vehicle ID error (`f_0.0`)
- Add realistic rain effect with mm/hr controller for flood simulation
- Rain drops, lightning, daylight reduction effects
- Rain in layers panel (left sidebar toggle)
- Area-specific rain simulation per Bordeaux zone

---

### SUMO Duplicate Vehicle ID Fix

**Error**: `Another vehicle with the id 'f_0.0' exists. Quitting (on error)`

**Root Cause**: `flow id="f_0"` auto-generates vehicles named `f_0.0`, `f_0.1`... and `routes.rou.xml` also had `trip id="f_0.0"` → name collision.

**Fix**:
- `simulations/sumo/routes.rou.xml`: renamed `trip id="f_0.0"` → `trip id="ego_car"`
- `simulations/sumo/sumo_live_server.py`: `EGO_ID = "ego_car"`

---

### Rain Simulation System

#### Architecture
- **Layer toggle**: `showRain` added to `layerStore.ts` + `LayerTogglePanel.tsx`
- **PostProcessStage GLSL shader** (CesiumJS 1.117 / WebGL2 / GLSL ES 3.0):
  - Streak rain effect with 3 parallax layers
  - Fog/tint overlay scaling with intensity
  - `gl_FragCoord.xy / czm_viewport.zw` for UV (not `v_textureCoordinates`)
  - `texture()` instead of `texture2D()`, `out_FragColor` instead of `gl_FragColor`
- **Canvas animated drops**: `requestAnimationFrame` loop, lean angle `Math.PI/10`, wraps off-screen
- **Lightning flash**: white overlay div, double-flash via `setTimeout`, triggers at ≥50mm
- **Light dimming**: `viewer.scene.light.intensity = Math.max(0.25, 1.0 - mm/220)`
- **Accumulation counter**: `setInterval` increments `mm/3600` per second

#### GLSL Errors Fixed (3 iterations)
| Error | Cause | Fix |
|-------|-------|-----|
| `'varying' : Illegal use of reserved word` | GLSL ES 3.0 — `varying` removed | Delete `varying` declaration entirely |
| `v_textureCoordinates undeclared` | CesiumJS 1.117 doesn't inject it in WebGL2 | Use `gl_FragCoord.xy / czm_viewport.zw` |
| `texture2D not found`, `gl_FragColor undeclared` | GLSL ES 3.0 deprecations | Use `texture()` and `out_FragColor` |

#### Area-Specific Rain (Mode: Global / By Area)
- `RAIN_AREA_BBOXES` — lon/lat bounding boxes for 5 areas (Pessac, Talence, Mérignac, Bordeaux City, Gradignan)
- Canvas drops clipped to screen-projected polygon via `scene.cartesianToCanvasCoordinates()` + `ctx.clip()`
- `rainMode` state: `'global' | 'area'`
- `areaRain` state: `Record<string, number>` per-area mm/hr
- Refs mirror state for RAF loop access without stale closures

#### Rain Panel UI (right sidebar, shown when Rain layer ON)
- **Mode toggle**: 🌍 Global / 📍 By Area
- **Global mode**: single 1-200mm/hr slider, 4 quick presets (Drizzle/Rain/Storm/Flood)
- **Area mode**: per-area slider with individual flood risk badges (Watch/Warning/Emergency)
- **Quick actions**: "All Rain" (set all to 30mm) / "Clear All"
- **Effects badges**: Drops / Fog / Dim / Lightning — light up based on effective mm
- **Flood warnings**: Watch (>60mm), Warning (>100mm), Emergency (>150mm)
- **Accumulation counter** + reset button

---

### GitHub Commits
```
af40141 feat: area-specific rain simulation + SUMO ego_car fix
4851da6 Merge branch 'main' of github.com:... (README additions from remote)
```

---

## 🌡️ Session 8 — Street Heat Thermal Network + Satellite LST + UI Overhaul (June 30 2026)

### Goals
- Georeferenced street-level heat map (not screen overlay — proper world-space)
- Real historical + forecast temperature data from authenticated open sources
- Anomaly detection vs previous year
- All layer-specific controls moved to Right Panel (no more floating overlays)
- Area filtering: layer data shows only for selected communes
- Default "Bordeaux City" selected on startup
- Reduced panel opacity so 3D map shows through

---

### 1. Street Thermal Network (`StreetHeatLayer.tsx`)

**Why GroundPolylinePrimitive instead of canvas:**
Canvas overlays are screen-space (fixed to pixels, not geographic coordinates). When the camera moves, the heatmap stays glued to the screen instead of following the map. `GroundPolylinePrimitive` is world-space — it drapes onto terrain and moves correctly with the 3D globe.

**Architecture:**
```
Open-Meteo API (20-point grid, live) → IDW interpolation → per-road temperature
OSM GeoJSON (5 area files, ~44K roads) → RENDER_HW filter → ~10-12K roads
Temperature → RdYlBu colormap → ColorGeometryInstanceAttribute
One GroundPolylinePrimitive (all roads in single GPU call)
Stats + historical + forecast → streetHeatStore (read by RightPanel)
```

**Temperature formula per road segment (Falda et al. 2025 methodology):**
```
T_road = IDW(air_temp) + road_delta × ToD_factor + UHI_zone - park_cooling + seeded_noise
```
- `road_delta`: motorway +8.2°C → residential +3.0°C (paper Table values)
- `ToD_factor`: `max(0.12, 0.55 + 0.45 × cos((h-14) × 2π/24))` — peaks 14:00, troughs ~02:00
- `UHI_zone`: Bordeaux City +4°C, Mérignac +3°C, Pessac +1.5°C, Talence +1.0°C, Gradignan 0°C
- `park_cooling`: Parc Bordelais −2.8°C, Jardin Public −2.2°C, etc. (NDVI proxy)
- `seeded_noise`: `sin(lon×127.1 + lat×311.7) × 43758.5453` → ±0.6°C stable per-road variation

**RdYlBu colormap:** 22°C (deep blue) → 37°C (yellow) → 56°C (dark red) — same scale as QGIS/Landsat LST maps in paper.

**Area filtering:**
```typescript
const AREA_MAP: Record<string, string> = {
  'Bordeaux City': 'bordeaux-city',
  'Mérignac':      'merignac',
  // ...
}
// Only load files for selectedAreas from mapControlStore
const keys = selectedAreas.map(a => AREA_MAP[a]).filter(Boolean)
```

**Module-level cache:** `_areaCache: Record<string, ParsedRoad[]>` — each area's GeoJSON parsed once per browser session. `Promise.all` loads all selected areas in parallel.

---

### 2. OSM Road GeoJSON Download (`scripts/download_roads.py`)

Downloaded real OpenStreetMap road network for 5 Bordeaux communes via Overpass API:

| Area | File | Roads |
|------|------|-------|
| Bordeaux City | `bordeaux-city.geojson` (4.7 MB) | 18,628 |
| Mérignac | `merignac.geojson` (2.6 MB) | 9,585 |
| Pessac | `pessac.geojson` (2.2 MB) | 8,490 |
| Talence | `talence.geojson` (961 KB) | 3,776 |
| Gradignan | `gradignan.geojson` (964 KB) | 3,654 |
| **Total** | | **44,133 roads** |

**Script features:**
- 3 Overpass mirrors (tries next on HTTP 429 rate limit)
- Re-run safe (skips existing files >10 KB)
- 3s polite pause between requests
- UTF-8 forced stdout (fixes Windows cp1252 encoding errors)
- Only stores needed tags: `highway`, `name`, `maxspeed`, `lanes`, `railway`, `surface`, `lit`

**RENDER_HW filter:** Only renders motorway/trunk/primary/secondary/tertiary/residential — reduces 44K to ~10-12K roads, keeps GPU build time under 4 seconds.

---

### 3. Historical Data + Forecast + Anomaly

**API: Open-Meteo Archive** (`archive-api.open-meteo.com/v1/archive`):
- ERA5 reanalysis, hourly from 1940-present, free, no auth
- Fetches 30 days of daily `temperature_2m_max/min/mean` for Bordeaux center (44.84°N, -0.58°E)
- Also fetches same 30-day window for **previous year** (for anomaly calculation)

**API: Open-Meteo Forecast** (`api.open-meteo.com/v1/forecast`):
- 7-day ahead daily forecast: max/min temp + WMO weather code

**Anomaly calculation:**
```typescript
const recentMean = means.slice(-7).reduce((a,b)=>a+b,0) / 7  // this week
const lyMean     = lyMeans.slice(-7).reduce((a,b)=>a+b,0) / 7  // same week last year
setAnomaly(+(recentMean - lyMean).toFixed(1))  // e.g. +2.3°C or -1.1°C
```

All three fetches (`historical`, `lastYear`, `forecast`) are fired in parallel with `Promise.all`.

---

### 4. Satellite LST Layer (`SatelliteLSTLayer.tsx`)

**Modes:** LST (surface temp) / NDVI (vegetation index) / NDBI (built-up index)

**Data:** Open-Meteo batch API, 20-point 5×4 grid (44.67–44.91°N, -0.77–-0.44°E)
- `surface_temperature` (if available) or `temperature_2m` + UHI correction

**Canvas rendering:** Gaussian-weighted interpolation (σ=120px) from 20 grid points onto every 4th pixel — matches paper's spatial continuity.

**NASA GIBS overlay:** `WebMapServiceImageryProvider` on Cesium globe:
- LST mode: `MODIS_Terra_Land_Surface_Temp_Day` (daily, 1 km)
- NDVI mode: `MODIS_Terra_Vegetation_Indices_NDVI_Monthly`
- Toggle ON/OFF — may have cloud gaps

**Interventions (Falda et al. 2025):**
- Green roofs: −0.7°C applied to surface_temperature before canvas render
- Cool asphalt: −1.9°C applied to surface_temperature

---

### 5. Store Architecture Refactor

**New stores:**

`streetHeatStore.ts` — written by StreetHeatLayer, read by RightPanel:
```typescript
{ status, updatedAt, progress, stats, historical, forecast, anomaly }
```

`satelliteLSTStore.ts` — written by RightPanel (user controls), read by SatelliteLSTLayer:
```typescript
{ mode, opacity, greenRoofs, coolAsphalt, gibs, fetchTime, loading, stats }
```

**Why separate stores instead of component props:**
StreetHeatLayer and SatelliteLSTLayer are mounted in CesiumViewer (deep in DOM). RightPanel is a sibling in App. Passing data up+down through props would require drilling through 3 layers. Zustand stores let both components communicate directly without prop drilling.

---

### 6. RightPanel — Complete Rewrite

Old RightPanel: area checkboxes + road type filter + building inspector.

New RightPanel: all active layer properties, collapsible sections:

```
┌─────────────────────────────┐
│ 📍 Select Areas             │  (always visible, compact)
├─────────────────────────────┤
│ 🌡️ Street Heat   [LIVE]    │  (only when showStreetHeat ON)
│   MIN/MEAN/MAX chips        │
│   RdYlBu legend             │
│   🔥 +2.3°C vs last year   │  ← anomaly badge
│   30-day SVG sparkline      │
│   7-day forecast tiles      │
├─────────────────────────────┤
│ 🛰️ Satellite LST           │  (only when showSatelliteLST ON)
│   [LST] [NDVI] [NDBI]      │
│   Opacity slider            │
│   Interventions             │
│   NASA GIBS toggle          │
├─────────────────────────────┤
│ 🏢 Building Inspector       │  (only when building clicked)
└─────────────────────────────┘
```

**SVG sparkline component:**
- Path through 30 daily mean temperatures
- Shaded range area (min to max) under line
- Orange dot at most recent point
- Drawn with raw SVG — no chart library dependency

---

### 7. UI / Layout Improvements

- **Panel opacity:** `bg-gray-900/40` → `bg-gray-900/28` with `backdrop-blur-2xl` — map much more visible through glass
- **LayerTogglePanel:** removed redundant "Focus Area" dropdown (area control now centralized in RightPanel)
- **Default area:** `selectedAreas: ['Bordeaux City']` was already the default in `mapControlStore.ts` ✓
- **Collapsible sections in RightPanel:** each section has open/close toggle (▲/▼), opens by default

### TypeScript + Build
```
npx tsc --noEmit → 0 errors
npm run build → ✓ built in 9.51s (328 KB JS gzip: 99 KB)
```

### New Files
```
frontend/src/store/streetHeatStore.ts      ← shared street heat state
frontend/src/store/satelliteLSTStore.ts    ← shared satellite LST controls
frontend/src/components/CityViewer/StreetHeatLayer.tsx   ← full rewrite
frontend/src/components/CityViewer/SatelliteLSTLayer.tsx ← removed floating panel
frontend/public/data/roads/bordeaux-city.geojson (4.7 MB)
frontend/public/data/roads/merignac.geojson    (2.6 MB)
frontend/public/data/roads/pessac.geojson      (2.2 MB)
frontend/public/data/roads/talence.geojson     (961 KB)
frontend/public/data/roads/gradignan.geojson   (964 KB)
scripts/download_roads.py
```

### Modified Files
```
frontend/src/components/MapControls/RightPanel.tsx   ← full rewrite
frontend/src/components/UI/LayerTogglePanel.tsx      ← removed Focus Area dropdown
frontend/src/store/layerStore.ts                     ← showSatelliteLST + showStreetHeat
frontend/src/App.tsx                                 ← opacity reduced
```

### Key Library/API References
- **Open-Meteo Forecast:** `api.open-meteo.com/v1/forecast` — free, no auth, batch lat/lon support
- **Open-Meteo Archive:** `archive-api.open-meteo.com/v1/archive` — ERA5, free, no auth
- **NASA GIBS:** `gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi` — free, no auth
- **Overpass API:** `overpass-api.de/api/interpreter` — free (polite use)
- **Falda et al. 2025:** Sustainability 17(24):10906 — Thessaloniki LST, methodology applied to Bordeaux

---

*Last updated: June 30 2026 | Author: UrbanTwin Dev*
