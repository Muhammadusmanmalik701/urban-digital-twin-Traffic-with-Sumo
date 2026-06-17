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

*Last updated: June 2026 | Author: UrbanTwin Dev*
