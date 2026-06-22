#!/usr/bin/env python3
"""
SUMO TraCI Live WebSocket Server
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Runs SUMO via TraCI, streams all vehicle positions to browser,
and accepts real-time keyboard control commands for ego car (f_0.0).

Requirements:
  pip install websockets
  SUMO installed + SUMO_HOME env var set

WebSocket messages IN (from browser):
  { "type": "start" }
  { "type": "stop" }
  { "type": "control",     "action": "set_speed", "value": 50 }   # km/h
  { "type": "control",     "action": "brake" }
  { "type": "control",     "action": "lane_left" }
  { "type": "control",     "action": "lane_right" }
  { "type": "control",     "action": "autopilot" }                 # release to SUMO
  { "type": "tls_control", "tls_id": "n123", "action": "force_green"|"force_red"|"reset" }

WebSocket messages OUT (to browser):
  { "type": "status",          "state": "...", "message": "..." }
  { "type": "FeatureCollection", "simTime": ..., "features": [...] }
  { "type": "ego_state",       "speed": 45.2, "maxSpeed": 50, "lane": 1, "road": "..." }
  { "type": "tls_list",        "tls": [{"id": "n123", "lon": ..., "lat": ...}, ...] }
  { "type": "tls_states",      "tls": [{"id": "n123", "phase": "GGrr", "overridden": false}, ...] }

Usage:
  cd simulations/sumo
  python sumo_live_server.py
"""

import asyncio
import json
import os
import random
import queue
import sys
import threading
from pathlib import Path

try:
    import websockets
except ImportError:
    print("ERROR: pip install websockets")
    sys.exit(1)

# Add SUMO tools to Python path so traci can be imported
SUMO_HOME = os.environ.get("SUMO_HOME", "")
if SUMO_HOME:
    sys.path.insert(0, str(Path(SUMO_HOME) / "tools"))

try:
    import traci
    import traci.exceptions
except ImportError:
    print("ERROR: traci not found.")
    print("  Set SUMO_HOME environment variable to your SUMO install folder.")
    print(r"  Example (Windows): setx SUMO_HOME 'C:\Program Files (x86)\Eclipse\Sumo'")
    sys.exit(1)

# ── Config ────────────────────────────────────────────────────────────────────
WS_PORT = 8765
SUMOCFG = "sim.sumocfg"
EGO_ID  = "f_0.0"

# ── Shared state ──────────────────────────────────────────────────────────────
CLIENTS: set = set()
_main_loop:  asyncio.AbstractEventLoop | None = None
_pos_queue:  asyncio.Queue | None = None   # TraCI thread → WS broadcast
_cmd_queue:  queue.Queue = queue.Queue()   # WS handler  → TraCI thread
_sim_stop    = threading.Event()
_sim_thread: threading.Thread | None = None
_ego_free_roam  = True   # True = free roam (user drives), False = follow SUMO route (R pressed)
_tls_overrides: dict = {}  # { tls_id: forced_phase_string } — user-locked signals


# ── SUMO binary finder ────────────────────────────────────────────────────────

def find_sumo_gui() -> str:
    candidates = []
    if SUMO_HOME:
        candidates += [
            str(Path(SUMO_HOME) / "bin" / "sumo-gui.exe"),
            str(Path(SUMO_HOME) / "bin" / "sumo-gui"),
        ]
    candidates += [
        r"C:\Program Files (x86)\Eclipse\Sumo\bin\sumo-gui.exe",
        r"C:\Program Files\Eclipse\Sumo\bin\sumo-gui.exe",
        r"C:\sumo\bin\sumo-gui.exe",
        "sumo-gui",
    ]
    for c in candidates:
        if Path(c).exists() or c == "sumo-gui":
            return c
    return "sumo-gui"


# ── Broadcast helpers ─────────────────────────────────────────────────────────

async def broadcast(payload: str) -> None:
    dead = set()
    for ws in CLIENTS:
        try:
            await ws.send(payload)
        except Exception:
            dead.add(ws)
    CLIENTS.difference_update(dead)


def _push(payload: str) -> None:
    """Thread-safe: queue a message for async broadcast (called from TraCI thread)."""
    if _main_loop and _pos_queue:
        asyncio.run_coroutine_threadsafe(_pos_queue.put(payload), _main_loop)


async def _broadcaster() -> None:
    """Async task: drains _pos_queue and broadcasts to all WS clients."""
    while True:
        payload = await _pos_queue.get()
        await broadcast(payload)


# ── Ego car control ───────────────────────────────────────────────────────────

def _apply_control(cmd: dict) -> None:
    """Apply one control command to ego car via TraCI. Runs in TraCI thread."""
    global _ego_free_roam

    if EGO_ID not in traci.vehicle.getIDList():
        return

    action = cmd.get("action", "")
    value  = cmd.get("value", 0)

    try:
        if action == "set_speed":
            _ego_free_roam = True   # user took manual control
            ms = float(value) / 3.6 if float(value) >= 0 else -1.0
            traci.vehicle.setSpeed(EGO_ID, ms)

        elif action == "brake":
            _ego_free_roam = True
            cur = traci.vehicle.getSpeed(EGO_ID)
            traci.vehicle.setSpeed(EGO_ID, max(0.0, cur - 3.0))

        elif action == "lane_left":
            road = traci.vehicle.getRoadID(EGO_ID)
            if road.startswith(':'):  # on junction — skip
                return
            lane = traci.vehicle.getLaneIndex(EGO_ID)
            if lane > 0:
                traci.vehicle.changeLane(EGO_ID, lane - 1, 0)

        elif action == "lane_right":
            road = traci.vehicle.getRoadID(EGO_ID)
            if road.startswith(':'):  # on junction — skip
                return
            lane = traci.vehicle.getLaneIndex(EGO_ID)
            n    = traci.edge.getLaneNumber(road)
            if lane < n - 1:
                traci.vehicle.changeLane(EGO_ID, lane + 1, 0)

        elif action == "autopilot":
            _ego_free_roam = False
            traci.vehicle.setSpeed(EGO_ID, -1)              # release speed to SUMO
            traci.vehicle.setLaneChangeMode(EGO_ID, 0b00001111)  # restore SUMO auto LC

    except traci.exceptions.TraCIException:
        pass


# ── Traffic light control ────────────────────────────────────────────────────

def _apply_tls_control(cmd: dict) -> None:
    """Force or release a traffic signal phase. Runs in TraCI thread."""
    global _tls_overrides
    tls_id = cmd.get("tls_id", "")
    action  = cmd.get("action", "")
    if not tls_id:
        return
    try:
        if tls_id not in traci.trafficlight.getIDList():
            return
        if action == "force_green":
            n = len(traci.trafficlight.getRedYellowGreenState(tls_id))
            _tls_overrides[tls_id] = 'G' * n
        elif action == "force_red":
            n = len(traci.trafficlight.getRedYellowGreenState(tls_id))
            _tls_overrides[tls_id] = 'r' * n
        elif action == "reset":
            _tls_overrides.pop(tls_id, None)
    except traci.exceptions.TraCIException:
        pass


# ── TraCI simulation thread ───────────────────────────────────────────────────

def _traci_thread() -> None:
    """
    Runs in background thread.
    Steps simulation, reads positions, pushes GeoJSON + ego_state to broadcast queue.
    Drains control commands between each step.
    """
    binary = find_sumo_gui()
    cfg    = str(Path(SUMOCFG).resolve())

    _push(json.dumps({
        "type": "status", "state": "starting",
        "message": "SUMO-GUI opening… simulation will start automatically.",
    }))

    try:
        traci.start([binary, "-c", cfg, "--start"])
    except Exception as e:
        _push(json.dumps({
            "type": "status", "state": "error",
            "message": f"SUMO failed to start: {e}. Check SUMO_HOME.",
        }))
        return

    _push(json.dumps({
        "type": "status", "state": "running",
        "message": f"Simulation running. Ego car '{EGO_ID}' will appear at its depart time.",
    }))

    # Send initial traffic light list (positions for map markers)
    tls_ids = list(traci.trafficlight.getIDList())
    tls_list = []
    for tls_id in tls_ids:
        try:
            x, y = traci.junction.getPosition(tls_id)
            lon, lat = traci.simulation.convertGeo(x, y)
            tls_list.append({"id": tls_id, "lon": round(lon, 6), "lat": round(lat, 6)})
        except Exception:
            pass
    if tls_list:
        _push(json.dumps({"type": "tls_list", "tls": tls_list}))

    ego_seen  = False
    step_count = 0

    try:
        while not _sim_stop.is_set() and traci.simulation.getMinExpectedNumber() > 0:

            # Process pending control commands before stepping
            while not _cmd_queue.empty():
                try:
                    cmd = _cmd_queue.get_nowait()
                    if cmd.get("type") == "tls_control":
                        _apply_tls_control(cmd)
                    else:
                        _apply_control(cmd)
                except Exception:
                    pass

            # Apply user-forced signal states
            for tls_id, forced_state in list(_tls_overrides.items()):
                try:
                    traci.trafficlight.setRedYellowGreenState(tls_id, forced_state)
                except Exception:
                    pass

            traci.simulationStep()
            step_count += 1

            vehicle_ids = traci.vehicle.getIDList()
            sim_time    = traci.simulation.getTime()

            # When ego car first spawns: disable SUMO auto lane changes so TraCI controls
            if EGO_ID in vehicle_ids and not ego_seen:
                ego_seen = True
                try:
                    traci.vehicle.setLaneChangeMode(EGO_ID, 0b00110000)
                except Exception:
                    pass

            # Free roam: when ego near end of route, pick random new destination
            if EGO_ID in vehicle_ids and _ego_free_roam:
                try:
                    route = traci.vehicle.getRoute(EGO_ID)
                    idx   = traci.vehicle.getRouteIndex(EGO_ID)
                    if route and idx >= max(0, len(route) - 3):
                        road_edges = [e for e in traci.edge.getIDList()
                                      if not e.startswith(':')]
                        if road_edges:
                            traci.vehicle.changeTarget(EGO_ID, random.choice(road_edges))
                except Exception:
                    pass

            # Build GeoJSON FeatureCollection
            features = []
            for vid in vehicle_ids:
                try:
                    x, y     = traci.vehicle.getPosition(vid)
                    lon, lat = traci.simulation.convertGeo(x, y)
                    features.append({
                        "type": "Feature",
                        "id":   vid,
                        "geometry": {
                            "type":        "Point",
                            "coordinates": [lon, lat, 0],
                        },
                        "properties": {
                            "id":      vid,
                            "speed":   round(traci.vehicle.getSpeed(vid) * 3.6, 1),
                            "angle":   traci.vehicle.getAngle(vid),
                            "type":    traci.vehicle.getTypeID(vid),
                            "simTime": sim_time,
                        },
                    })
                except Exception:
                    pass

            _push(json.dumps({
                "type":         "FeatureCollection",
                "simTime":      sim_time,
                "vehicleCount": len(features),
                "features":     features,
            }))

            # Broadcast traffic light states + queue lengths every 5 steps
            if step_count % 5 == 0 and tls_ids:
                tls_states = []
                for tls_id in tls_ids:
                    try:
                        phase = traci.trafficlight.getRedYellowGreenState(tls_id)
                        controlled_lanes = set(traci.trafficlight.getControlledLanes(tls_id))
                        queue = sum(
                            traci.lane.getLastStepHaltingNumber(lane)
                            for lane in controlled_lanes
                        )
                        tls_states.append({
                            "id":         tls_id,
                            "phase":      phase,
                            "overridden": tls_id in _tls_overrides,
                            "queue":      queue,
                        })
                    except Exception:
                        pass
                if tls_states:
                    _push(json.dumps({"type": "tls_states", "tls": tls_states}))

            # Heatmap + traffic stats every 10 steps
            if step_count % 10 == 0 and features:
                cell_size = 0.001
                cells: dict = {}
                speeds_all: list = []
                stopped = 0
                for f in features:
                    lon_f, lat_f = f["geometry"]["coordinates"][:2]
                    spd = f["properties"]["speed"]
                    speeds_all.append(spd)
                    if spd < 3.6:
                        stopped += 1
                    col = int(lon_f // cell_size)   # floor division — correct for negative lon
                    row = int(lat_f // cell_size)
                    cells[(col, row)] = cells.get((col, row), 0) + 1

                cap = min(max(cells.values(), default=1), 10)
                hm_cells = [
                    {
                        "lon":     round((c + 0.5) * cell_size, 6),
                        "lat":     round((r + 0.5) * cell_size, 6),
                        "count":   cnt,
                        "density": round(min(cnt / cap, 1.0), 3),
                    }
                    for (c, r), cnt in cells.items()
                ]
                _push(json.dumps({"type": "heatmap", "cells": hm_cells}))

                avg_spd = round(sum(speeds_all) / len(speeds_all), 1) if speeds_all else 0.0
                _push(json.dumps({
                    "type":          "traffic_stats",
                    "avg_speed":     avg_spd,
                    "stopped_count": stopped,
                    "vehicle_count": len(features),
                    "sim_time":      sim_time,
                }))

            # Ego car live state (speed, lane, road)
            if EGO_ID in vehicle_ids:
                try:
                    _push(json.dumps({
                        "type":     "ego_state",
                        "speed":    round(traci.vehicle.getSpeed(EGO_ID) * 3.6, 1),
                        "maxSpeed": round(traci.vehicle.getMaxSpeed(EGO_ID) * 3.6, 1),
                        "lane":     traci.vehicle.getLaneIndex(EGO_ID),
                        "road":     traci.vehicle.getRoadID(EGO_ID),
                    }))
                except Exception:
                    pass

    except Exception as e:
        _push(json.dumps({
            "type": "status", "state": "error",
            "message": f"Simulation error: {e}",
        }))
    finally:
        try:
            traci.close()
        except Exception:
            pass
        _push(json.dumps({
            "type": "status", "state": "idle",
            "message": "Simulation ended. Click Run Simulation to start again.",
        }))


# ── WebSocket handler ─────────────────────────────────────────────────────────

async def ws_handler(websocket) -> None:
    global _sim_thread
    CLIENTS.add(websocket)
    print(f"[WS] Client connected  ({len(CLIENTS)} total)")

    # Sync state to newly connected client
    state = "running" if (_sim_thread and _sim_thread.is_alive()) else "idle"
    await websocket.send(json.dumps({"type": "status", "state": state}))

    try:
        async for raw in websocket:
            try:
                cmd = json.loads(raw)
            except json.JSONDecodeError:
                continue

            ctype = cmd.get("type")

            if ctype == "start":
                if _sim_thread and _sim_thread.is_alive():
                    await websocket.send(json.dumps({
                        "type": "status", "state": "running",
                        "message": "Already running.",
                    }))
                else:
                    _sim_stop.clear()
                    _sim_thread = threading.Thread(target=_traci_thread, daemon=True)
                    _sim_thread.start()

            elif ctype == "stop":
                _sim_stop.set()
                try:
                    traci.close()
                except Exception:
                    pass
                await broadcast(json.dumps({
                    "type": "status", "state": "idle",
                    "message": "Stopped by user.",
                }))

            elif ctype == "control":
                _cmd_queue.put(cmd)

            elif ctype == "tls_control":
                _cmd_queue.put(cmd)

    except websockets.exceptions.ConnectionClosedError:
        pass
    finally:
        CLIENTS.discard(websocket)
        print(f"[WS] Client disconnected ({len(CLIENTS)} total)")


# ── Entry point ───────────────────────────────────────────────────────────────

async def main() -> None:
    global _main_loop, _pos_queue
    _main_loop = asyncio.get_running_loop()
    _pos_queue = asyncio.Queue()

    asyncio.create_task(_broadcaster())

    binary = find_sumo_gui()
    print("=" * 60)
    print("  SUMO TraCI Live WebSocket Server")
    print("=" * 60)
    print(f"  SUMO-GUI : {binary}")
    print(f"  Config   : {SUMOCFG}")
    print(f"  Ego car  : {EGO_ID}")
    print(f"  WS URL   : ws://localhost:{WS_PORT}")
    print("=" * 60)
    print("  Keyboard controls (when ego car is active in browser):")
    print("    W / ↑  Accelerate (+5 km/h)")
    print("    S / ↓  Brake")
    print("    A / ←  Lane change left")
    print("    D / →  Lane change right")
    print("    R      Release to SUMO autopilot")
    print("=" * 60)
    print()

    async with websockets.serve(ws_handler, "localhost", WS_PORT):
        await asyncio.Future()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n[Server] Stopped.")
