#!/usr/bin/env python3
"""
SUMO Live WebSocket Server  (FCD file-watch mode — no TraCI)
─────────────────────────────────────────────────────────────
Flow:
  1. Click "Run Simulation" in browser
     → sumo-gui opens with sim.sumocfg
  2. Press ▶ Play inside SUMO-GUI yourself
     → SUMO writes vehicle positions to fcd.xml in real-time
  3. This server watches fcd.xml and streams new positions
     → Browser map shows the same vehicles moving in sync

No TraCI, no version-mismatch issues.
User has full SUMO-GUI control (play / pause / speed slider).

Requirements:
  pip install websockets

Usage (from sumo_files/ folder):
  python sumo_live_server.py
  python sumo_live_server.py --delay 3     # 3-step broadcast delay
  python sumo_live_server.py --port 8765
"""

import asyncio
import json
import os
import re
import subprocess
import sys
from collections import deque
from pathlib import Path

try:
    import websockets
except ImportError:
    print("ERROR: Run   pip install websockets   first.")
    sys.exit(1)

# ── Settings ──────────────────────────────────────────────────────────────────
WS_PORT      = 8765
SUMOCFG      = "sim.sumocfg"
FCD_FILE     = "fcd.xml"        # written by SUMO during simulation
DELAY_STEPS  = 0                # buffer N steps before broadcasting (0 = instant)

# Regex to find a complete <timestep> block in the FCD file
_TS_RE = re.compile(
    r'<timestep\s+time="([^"]+)"[^>]*>(.*?)</timestep>',
    re.DOTALL,
)
_VEH_RE = re.compile(r'<vehicle\b([^/]*)/>')
_ATTR_RE = re.compile(r'(\w+)="([^"]*)"')

# ── Shared state ──────────────────────────────────────────────────────────────
CLIENTS: set = set()
sim_task     = None
sumo_proc    = None


# ── Find SUMO-GUI ─────────────────────────────────────────────────────────────

def find_sumo_gui() -> str:
    sumo_home = os.environ.get("SUMO_HOME", "")
    candidates = []
    if sumo_home:
        candidates.append(str(Path(sumo_home) / "bin" / "sumo-gui.exe"))
    candidates += [
        r"C:\Program Files (x86)\Eclipse\Sumo\bin\sumo-gui.exe",
        r"C:\Program Files\Eclipse\Sumo\bin\sumo-gui.exe",
        r"C:\sumo\bin\sumo-gui.exe",
        "sumo-gui",   # hope it's on PATH
    ]
    for c in candidates:
        if Path(c).exists() or c == "sumo-gui":
            return c
    return "sumo-gui"


# ── Broadcast ─────────────────────────────────────────────────────────────────

async def broadcast(payload: str) -> None:
    dead = set()
    for ws in CLIENTS:
        try:
            await ws.send(payload)
        except Exception:
            dead.add(ws)
    CLIENTS.difference_update(dead)


async def send_status(state: str, msg: str = "") -> None:
    print(f"[STATUS] {state}  {msg}")
    await broadcast(json.dumps({"type": "status", "state": state, "message": msg}))


# ── FCD file watcher ──────────────────────────────────────────────────────────

def parse_timestep(time_str: str, body: str) -> dict:
    """Parse one <timestep> block into a GeoJSON FeatureCollection dict."""
    features = []
    for vm in _VEH_RE.finditer(body):
        attrs = dict(_ATTR_RE.findall(vm.group(1)))
        try:
            # lane="edgeName_laneIndex" → extract road name
            lane = attrs.get("lane", "")
            road = lane.rsplit("_", 1)[0] if lane else "unknown"

            speed_ms  = float(attrs.get("speed", 0))
            speed_kmh = round(speed_ms * 3.6, 1)

            features.append({
                "type": "Feature",
                "id":   attrs.get("id", "?"),
                "geometry": {
                    "type":        "Point",
                    # fcd-output.geo=true → x=lon, y=lat
                    "coordinates": [float(attrs["x"]), float(attrs["y"]), 0],
                },
                "properties": {
                    "id":       attrs.get("id"),
                    "speed":    speed_kmh,       # km/h
                    "angle":    float(attrs.get("angle", 0)),
                    "road":     road,
                    "lane":     lane,
                    "type":     attrs.get("type", "car"),
                    "simTime":  float(time_str),
                },
            })
        except (KeyError, ValueError):
            pass
    return {
        "type":         "FeatureCollection",
        "simTime":      float(time_str),
        "vehicleCount": len(features),
        "features":     features,
    }


async def watch_fcd(fcd_path: str, delay_steps: int) -> None:
    """
    Tail fcd_path as SUMO writes it.
    Buffer delay_steps timesteps before broadcasting so the browser
    always lags behind SUMO by that many steps.
    """
    fcd = Path(fcd_path)

    # Wait for SUMO to create / reset the file
    print(f"[FCD] Waiting for {fcd_path} …")
    prev_size = fcd.stat().st_size if fcd.exists() else -1

    # Give SUMO up to 30 s to start writing
    for _ in range(60):
        await asyncio.sleep(0.5)
        if fcd.exists():
            cur = fcd.stat().st_size
            if cur != prev_size:   # file was touched / reset by SUMO
                break
    else:
        await send_status("error",
            f"SUMO did not write to {fcd_path} within 30s. "
            "Make sure you pressed ▶ Play in SUMO-GUI.")
        return

    print(f"[FCD] {fcd_path} detected — streaming positions …")
    await send_status("running",
        "SUMO is running — web map is syncing in real-time.")

    file_pos  = 0
    text_buf  = ""
    step_buf: deque = deque()   # delay buffer

    while True:
        try:
            with open(fcd_path, "r", encoding="utf-8", errors="ignore") as f:
                # Detect if SUMO restarted (file shrunk → truncated)
                f.seek(0, 2)
                cur_size = f.tell()
                if cur_size < file_pos:
                    print("[FCD] File reset detected — rewinding.")
                    file_pos = 0
                    text_buf = ""
                    step_buf.clear()

                f.seek(file_pos)
                chunk = f.read()
                file_pos = f.tell()
        except OSError:
            await asyncio.sleep(0.2)
            continue

        if chunk:
            text_buf += chunk
            # Extract all complete <timestep> blocks
            while True:
                m = _TS_RE.search(text_buf)
                if not m:
                    break
                ts_data = parse_timestep(m.group(1), m.group(2))
                text_buf = text_buf[m.end():]

                step_buf.append(json.dumps(ts_data))

                # Once buffer is full, start draining the front
                if len(step_buf) > delay_steps:
                    await broadcast(step_buf.popleft())

        # Check if SUMO process ended
        if sumo_proc and sumo_proc.poll() is not None:
            # Flush remaining delay buffer
            while step_buf:
                await broadcast(step_buf.popleft())
                await asyncio.sleep(0.05)
            await send_status("finished", "Simulation complete.")
            print("[FCD] SUMO process ended.")
            return

        await asyncio.sleep(0.05)  # poll every 50 ms


# ── Simulation task ───────────────────────────────────────────────────────────

async def run_simulation(delay_steps: int) -> None:
    global sumo_proc

    binary  = find_sumo_gui()
    sumocfg = Path(SUMOCFG).resolve()
    fcd     = sumocfg.parent / FCD_FILE

    # Delete old fcd.xml so we can detect when SUMO creates the new one
    try:
        fcd.unlink(missing_ok=True)
    except Exception:
        pass

    cmd = [binary, "-c", str(sumocfg)]
    print(f"[SUMO] Launching: {' '.join(cmd)}")
    await send_status("starting",
        "SUMO-GUI is opening… press ▶ Play inside SUMO when ready.")

    try:
        sumo_proc = subprocess.Popen(cmd, cwd=str(sumocfg.parent))
    except FileNotFoundError:
        await send_status("error",
            f"'{binary}' not found. "
            "Set the SUMO_HOME environment variable to your SUMO install folder "
            r"(e.g. C:\Program Files (x86)\Eclipse\Sumo)  "
            "and restart the server.")
        sumo_proc = None
        return

    try:
        await watch_fcd(str(fcd), delay_steps)
    except asyncio.CancelledError:
        print("[SIM] Cancelled by user.")
    finally:
        if sumo_proc and sumo_proc.poll() is None:
            sumo_proc.terminate()
        sumo_proc = None

    await send_status("idle", "Simulation ended. Click Run Simulation to start again.")


# ── WebSocket handler ─────────────────────────────────────────────────────────

async def ws_handler(websocket) -> None:
    global sim_task, sumo_proc

    CLIENTS.add(websocket)
    print(f"[WS] Client connected  ({len(CLIENTS)} total)")

    # Sync state to new client
    state = "running" if (sim_task and not sim_task.done()) else "idle"
    await websocket.send(json.dumps({"type": "status", "state": state}))

    try:
        async for raw in websocket:
            try:
                cmd = json.loads(raw)
            except json.JSONDecodeError:
                continue

            ctype = cmd.get("type")

            if ctype == "start":
                if sim_task and not sim_task.done():
                    await websocket.send(json.dumps({
                        "type": "status", "state": "running",
                        "message": "Already running.",
                    }))
                else:
                    delay = int(cmd.get("delay", DELAY_STEPS))
                    print(f"[CMD] start  delay={delay} steps")
                    sim_task = asyncio.create_task(run_simulation(delay))

            elif ctype == "stop":
                print("[CMD] stop")
                if sim_task and not sim_task.done():
                    sim_task.cancel()
                if sumo_proc and sumo_proc.poll() is None:
                    sumo_proc.terminate()
                sumo_proc = None
                await broadcast(json.dumps({
                    "type": "status", "state": "idle",
                    "message": "Stopped by user.",
                }))

    except websockets.exceptions.ConnectionClosedError:
        pass
    finally:
        CLIENTS.discard(websocket)
        print(f"[WS] Client disconnected ({len(CLIENTS)} total)")


# ── Entry point ───────────────────────────────────────────────────────────────

async def main() -> None:
    import argparse
    p = argparse.ArgumentParser(description="SUMO Live WebSocket Server")
    p.add_argument("--port",  type=int, default=WS_PORT,     help="WebSocket port (default 8765)")
    p.add_argument("--delay", type=int, default=DELAY_STEPS, help="Broadcast delay in steps (default 0)")
    args = p.parse_args()

    binary = find_sumo_gui()

    print("=" * 60)
    print("  SUMO Live WebSocket Server  (file-watch mode)")
    print("=" * 60)
    print(f"  SUMO-GUI  : {binary}")
    print(f"  Config    : {SUMOCFG}")
    print(f"  FCD file  : {FCD_FILE}  (watched live)")
    print(f"  Delay     : {args.delay} steps")
    print(f"  WS URL    : ws://localhost:{args.port}")
    print("=" * 60)
    print()
    print("Steps:")
    print("  1. Open http://localhost:8080 in browser")
    print("  2. Click the 🚗 car icon → click  Run Simulation")
    print("  3. SUMO-GUI window opens")
    print("  4. Press ▶ Play inside SUMO-GUI")
    print("  5. Browser map shows the same vehicles in real-time")
    print()
    print("Press Ctrl+C to stop server.\n")

    async with websockets.serve(ws_handler, "localhost", args.port):
        await asyncio.Future()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n[Server] Stopped.")
