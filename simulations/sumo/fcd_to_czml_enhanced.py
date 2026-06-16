"""
Enhanced FCD → CZML converter
- Uses CesiumMilkTruck.glb 3D model
- Adds CLAMP_TO_GROUND so trucks sit on terrain
- Assigns a colour per vehicle for easy identification
- Reads the simulation start/end from the FCD file automatically
"""

import xml.etree.ElementTree as ET
import json
from datetime import datetime, timedelta, timezone

INPUT_FCD  = "fcd.xml"
OUTPUT     = "vehicles_enhanced.czml"
MODEL_URI  = "/sumo/CesiumMilkTruck.glb"   # served from frontend/public/sumo/

# Distinct colours (RGBA) cycled per vehicle
COLOURS = [
    [52,  211, 153, 255],   # emerald
    [96,  165, 250, 255],   # blue
    [251, 191,  36, 255],   # amber
    [248, 113, 113, 255],   # red
    [167, 139, 250, 255],   # violet
    [ 34, 211, 238, 255],   # cyan
    [249, 115,  22, 255],   # orange
    [236,  72, 153, 255],   # pink
    [163, 230,  53, 255],   # lime
    [250, 204,  21, 255],   # yellow
]

SIM_EPOCH = "2026-01-01T00:00:00Z"
SIM_END   = "2026-01-01T00:10:00Z"

# --------------------------------------------------------------------------- #

tree = ET.parse(INPUT_FCD)
root = tree.getroot()

vehicles: dict = {}

for timestep in root.findall("timestep"):
    t = float(timestep.get("time", 0))

    for v in timestep.findall("vehicle"):
        vid  = v.get("id")
        lon  = float(v.get("x"))
        lat  = float(v.get("y"))
        # altitude 0 — CLAMP_TO_GROUND will place the model on the terrain surface

        if vid not in vehicles:
            idx    = len(vehicles) % len(COLOURS)
            colour = COLOURS[idx]

            vehicles[vid] = {
                "id":           vid,
                "name":         f"Vehicle {vid}",
                "availability": f"{SIM_EPOCH}/{SIM_END}",

                # ── Time-sampled positions ──────────────────────────────────
                "position": {
                    "epoch": SIM_EPOCH,
                    "interpolationAlgorithm": "LINEAR",
                    "interpolationDegree":    1,
                    "cartographicDegrees":    []      # filled below
                },

                # ── 3-D model (the Cesium Milk Truck) ──────────────────────
                "model": {
                    "gltf":             MODEL_URI,
                    "scale":            2.0,          # visible at city scale
                    "minimumPixelSize": 16,           # never shrink below 16px
                    "maximumScale":     200,
                    "heightReference":  "CLAMP_TO_GROUND",
                    "color": {
                        "rgba": colour
                    },
                    "colorBlendMode":   "HIGHLIGHT",  # tint without hiding texture
                    "colorBlendAmount": 0.6,
                    "silhouetteColor": {
                        "rgba": [255, 255, 255, 128]
                    },
                    "silhouetteSize":   1.5
                }
            }

        vehicles[vid]["position"]["cartographicDegrees"].extend([t, lon, lat, 0])

# --------------------------------------------------------------------------- #

czml = [
    {
        "id":      "document",
        "version": "1.0",
        "name":    "SUMO Road Network Simulation — Bordeaux",
        "clock": {
            "interval":    f"{SIM_EPOCH}/{SIM_END}",
            "currentTime": SIM_EPOCH,
            "multiplier":  1,
            "range":       "LOOP_STOP",
            "step":        "SYSTEM_CLOCK_MULTIPLIER"
        }
    },
    *vehicles.values()
]

with open(OUTPUT, "w", encoding="utf-8") as f:
    json.dump(czml, f, separators=(",", ":"))   # compact — smaller file

print(f"OK  {len(vehicles)} vehicles -> {OUTPUT}")
print(f"    Model : {MODEL_URI}")
print(f"    Epoch : {SIM_EPOCH}")
