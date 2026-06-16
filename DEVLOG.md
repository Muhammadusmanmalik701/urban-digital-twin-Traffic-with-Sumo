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

## 📚 Reference

- **Original Bordeaux index.html repo:** https://github.com/Muhammadusmanmalik701/Cesium-Sumo-digital-twin-road-network
- **Bordeaux Open Data:** https://opendata.bordeaux-metropole.fr
- **Cesium Ion dashboard:** https://ion.cesium.com
- **Overpass API:** https://overpass-api.de

---

*Last updated: June 2026 | Author: UrbanTwin Dev*
