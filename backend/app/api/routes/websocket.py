"""
WebSocket endpoint — broadcasts real-time city data to all connected frontend clients.
"""
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import List
import asyncio
import json
from datetime import datetime, timezone
import random
from app.services.sumo_service import sumo_service
from app.services.energy_service import energy_service
from app.services.climate_service import climate_service

router = APIRouter(tags=["websocket"])

active_connections: List[WebSocket] = []


class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.active_connections.append(ws)

    def disconnect(self, ws: WebSocket):
        self.active_connections.remove(ws)

    async def broadcast(self, data: dict):
        dead = []
        for ws in self.active_connections:
            try:
                await ws.send_text(json.dumps(data))
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.active_connections.remove(ws)


manager = ConnectionManager()


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            vehicles = await sumo_service.get_vehicles()
            zone_cong = await sumo_service.get_zone_congestion()
            signals = await sumo_service.get_signals()
            climate = await climate_service.get_current_conditions()

            from app.api.routes.buildings import BUILDINGS
            energy_readings = []
            for b in BUILDINGS[:4]:
                r = await energy_service.get_live_reading(b)
                energy_readings.append({"building_id": b["id"], "longitude": b["longitude"], "latitude": b["latitude"], **r})

            total_mw = sum(r["kwh_total"] for r in energy_readings) / 1000
            grid_load = min(99, total_mw / 1.8 * 100 + random.uniform(-2, 5))

            payload = {
                "type": "city_update",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "traffic": {
                    "vehicle_count": len(vehicles),
                    "vehicles": vehicles[:50],
                    "signals": signals,
                    "zone_congestion": [
                        {"zone_id": zid, "congestion_index": cong, "status": "gridlock" if cong > 0.85 else "heavy" if cong > 0.65 else "free_flow"}
                        for zid, cong in zone_cong.items()
                    ],
                },
                "energy": {
                    "grid_load_pct": round(grid_load, 1),
                    "total_mw": round(total_mw * 1000, 1),
                    "buildings": energy_readings,
                },
                "climate": climate,
                "kpis": {
                    "vehicle_count": len(vehicles),
                    "energy_mwh": round(total_mw, 1),
                    "grid_load_pct": round(grid_load, 1),
                    "outdoor_temp_c": climate["outdoor_temp_c"],
                    "aqi": climate["aqi"],
                    "co2_kg_hr": round(total_mw * 600, 0),
                },
            }

            await manager.broadcast(payload)
            await asyncio.sleep(1)

    except WebSocketDisconnect:
        manager.disconnect(websocket)
