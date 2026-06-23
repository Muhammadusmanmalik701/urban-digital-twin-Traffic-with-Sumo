# 🏙️ Urban Digital Twin — Bordeaux Métropole
> AI-powered city intelligence platform for real-time urban simulation, resilience analysis, and adaptive decision support.

Built phase-by-phase from a 1620-line master specification — integrating live SUMO/TraCI agent-based traffic simulation with a 3D CesiumJS geospatial interface, predictive congestion forecasting, and an AI-driven multi-criteria scenario engine.

---

## ✨ Key Features

### 🚗 Live SUMO/TraCI Traffic Simulation
- 300+ vehicles streaming in real-time via WebSocket
- Ego car (`f_0.0`) with full keyboard control — W/S/A/D/Space/R
- Traffic signal control via TraCI (force phase, hold duration)
- 16-config vehicle diversity system (Mini / Sedan / SUV / Van / Bus / Truck)
- Auto-rerouting with deadlock prevention on incident detection

### 🌍 3D Geospatial Visualization (CesiumJS)
- World terrain + OSM 3D buildings (Cesium Ion Asset 96188)
- Road network via Overpass API (4 road types + tram/rail)
- Multi-area selection: Pessac · Talence · Mérignac · Bordeaux · Gradignan
- Smooth vehicle interpolation (`SampledPositionProperty` + `VelocityOrientationProperty`)
- Ferrari GLB 3D car model (Draco compressed, real-world scale)

### 📷 Camera Follow System
| Mode | Behavior |
|---|---|
| ⬆ Top | 250m above, straight down, car centered |
| 🚗 Follow | 100m behind, 100m above, free-rotate |
| 🚘 Cockpit | First-person inside car, 1.5m above |

### 🔴 Incident Detection & Response
- Click vehicle → trigger Breakdown / Fire / Accident
- Edge blocking via `traci.edge.adaptTraveltime(1e9)`
- Cascading reroute: only vehicles with blocked edge in next 6 hops
- Alternate route visualization — cyan polylines with frequency weighting
- Incident vehicle position frozen on map (no ghost movement)

### 📈 Predictive Congestion Forecasting
- Rolling 8-reading speed history per edge
- Linear slope extrapolation 3 steps ahead
- Dashed orange/yellow polylines on will-jam edges
- Google Maps-style road heatmap — green → amber → orange → red → dark red

### 🧠 AI Scenario Engine
- Multi-criteria weighted solution ranking:
score = impact×0.40 + confidence×0.25 + speed×0.20 + cost_efficiency×0.15
- Active scenarios with severity badges (Traffic Gridlock, Energy Spike)
- Before/after simulation comparison panel

### 🗺️ Mapbox Isochrone API
- Click any point → 10 / 20 / 30 min travel radius polygons
- Profile: driving / walking / cycling

### 🥽 WebXR VR Support
- HTC Vive Cosmos Elite immersive city visualization
- Live VR HUD: vehicle count, sim time, incident badge, traffic legend
- SteamVR auto-detection polling

### 📊 Real-time Dashboard
- KPI cards: Vehicles · Energy · Temp · AQI · CO₂
- Active alerts feed with scenario linking
- Layer toggles: Traffic · Buildings · Energy · Heat Wave · Air Quality · ML · Flood · Grid
- Bottom bar: secondary metrics updated every second via WebSocket

---

## 🏗️ Architecture
Frontend (React 18 + TypeScript + CesiumJS)

↕ WebSocket (real-time positions, KPIs, alerts)
Backend API (FastAPI Python — port 8000)
↕ TraCI
SUMO Traffic Simulator
↕
ML Service (FastAPI Python — port 8001)
↕
PostGIS (port 5432) · TimescaleDB (port 5433) · Redis

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 · TypeScript · Vite · TailwindCSS · CesiumJS · Zustand |
| Backend | FastAPI (Python) · Uvicorn · Celery |
| Simulation | SUMO · TraCI · sumo-gui |
| Databases | PostGIS · TimescaleDB · Redis |
| Infrastructure | Docker Compose (12 services) · Nginx |
| Geospatial | Overpass API · Mapbox Isochrone API · Cesium Ion |
| XR | WebXR API · HTC Vive Cosmos Elite |
| 3D Assets | Ferrari GLB · Truck GLB · Draco Compression |

---

## 🗄️ Database Schema

| Schema | Purpose |
|---|---|
| `01_postgis_schema.sql` | Roads, intersections, incidents |
| `02_timescale_schema.sql` | Traffic flow, energy, sensors (time-series) |
| `03_bim_schema.sql` | Buildings — 8 seeded Bordeaux locations |
| `04_scenario_schema.sql` | Scenarios — 2 seeded active scenarios |
| `05_ml_features_schema.sql` | ML traffic features, model registry |

---

## 🚀 Quick Start

### Local Dev (no Docker)
```bash
# Terminal 1 — TraCI WebSocket server
cd simulations/sumo
python sumo_live_server.py

# Terminal 2 — Backend API
cd backend
python -m uvicorn app.main:app --port 8000 --reload

# Terminal 3 — Frontend
cd frontend
npm install
npm run dev
```

### Environment Variables
Create `frontend/.env`:

VITE_CESIUM_TOKEN=your_token_here
VITE_API_URL=http://localhost:8000
VITE_WS_URL=ws://localhost:8000
VITE_ML_URL=http://localhost:8001
VITE_MAPBOX_ISO_KEY=your_mapbox_key

> ⚠️ `.env` must be inside `frontend/` folder — NOT project root

### Docker (Full Stack)
```bash
docker-compose up --build
```

---

## 🗺️ Covered Areas — Bordeaux Métropole

| Area | Coordinates | Type |
|---|---|---|
| 🏘️ Pessac | 44.806°N, 0.615°W | Residential |
| 🎓 Talence | 44.808°N, 0.589°W | University |
| ✈️ Mérignac | 44.833°N, 0.685°W | Airport / Industrial |
| 🏛️ Bordeaux City | 44.837°N, 0.579°W | City Centre |
| 🌲 Gradignan | 44.772°N, 0.616°W | Suburban |

---

## 🔮 Roadmap

- [ ] Timeline Slider (City Rewind) — scrub through 24h historical data
- [ ] What-If Scenario Builder — drag to close roads, draw solar zones, predict impact
- [ ] Real Bordeaux Open Data — connect to `opendata.bordeaux-metropole.fr`
- [ ] Full SUMO TraCI Agent Simulation — individual vehicle behavior modeling
- [ ] Energy Grid Flow Animation — animated current from substations to neighborhoods
- [ ] Climate Risk / Urban Heat Island — 3D temperature overlay, flood zone integration
- [ ] Digital Twin API — REST endpoints for city planners and GIS tools

---

## 👤 Author
**Muhammad Usman Malik** — M.Sc. Complex Systems Engineering, University of Bordeaux  
GitHub: [@Muhammadusmanmalik701](https://github.com/Muhammadusmanmalik701)  
Email: muhammadusmanmalik701@gmail.com / mmusmaan1@hotmail.com

---

> Built with Claude Code · Bordeaux Métropole · June 2026
