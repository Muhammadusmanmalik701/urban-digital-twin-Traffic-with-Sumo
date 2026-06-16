import xml.etree.ElementTree as ET
import json

input_file = "fcd.xml"
output_file = "vehicles.czml"

tree = ET.parse(input_file)
root = tree.getroot()

# ===================== CZML DOCUMENT =====================
czml = [{
    "id": "document",
    "version": "1.0",
    "name": "SUMO_FCD_RealTime",
    "clock": {
        "interval": "2026-01-01T00:00:00Z/2026-01-01T00:10:00Z",
        "currentTime": "2026-01-01T00:00:00Z",
        "multiplier": 1
    }
}]

vehicles = {}

# ===================== PARSE TIMESTEPS =====================
for timestep in root.findall("timestep"):

    t = float(timestep.get("time"))

    for v in timestep.findall("vehicle"):

        vid = v.get("id")

        # SUMO FCD (x=lon, y=lat)
        lon = float(v.get("x"))
        lat = float(v.get("y"))

        # ===================== CREATE VEHICLE =====================
        if vid not in vehicles:
            vehicles[vid] = {
                "id": vid,
                "name": vid,
                "availability": "2026-01-01T00:00:00Z/2026-01-01T00:10:00Z",

                "position": {
                    "epoch": "2026-01-01T00:00:00Z",
                    "cartographicDegrees": []
                },

                # 🔥 CESIUM VISUAL (IMPORTANT FIX)
                "point": {
                    "pixelSize": 12,
                    "color": {
                        "rgba": [255, 0, 0, 255]
                    },
                    "outlineColor": {
                        "rgba": [255, 255, 0, 255]
                    },
                    "outlineWidth": 2
                }
            }

            czml.append(vehicles[vid])

        # ===================== POSITION DATA =====================
        vehicles[vid]["position"]["cartographicDegrees"].extend([
            t,
            lon,
            lat,
            0
        ])

# ===================== SAVE CZML =====================
with open(output_file, "w") as f:
    json.dump(czml, f, indent=2)

print("✅ CZML generated successfully for Cesium!")