#!/usr/bin/env python3
"""
Download OSM road network GeoJSON for all Bordeaux Métropole districts.
Output: frontend/public/data/roads/<area>.geojson

Run from project root:
    python scripts/download_roads.py

Requires only Python stdlib — no pip installs needed.
"""

import sys
import io
# Force UTF-8 stdout on Windows
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

import json
import os
import time
import urllib.request
import urllib.parse
import urllib.error

# ── Target areas ──────────────────────────────────────────────────────────────
AREAS = [
    ('bordeaux-city', 'Bordeaux'),
    ('merignac',      'Mérignac'),
    ('pessac',        'Pessac'),
    ('talence',       'Talence'),
    ('gradignan',     'Gradignan'),
]

# ── Overpass mirrors (tried in order, first success wins) ────────────────────
MIRRORS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
]

OUT_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    'frontend', 'public', 'data', 'roads'
)

# Only keep properties actually needed for StreetHeatLayer temperature logic
KEEP_TAGS = {'highway', 'name', 'maxspeed', 'lanes', 'railway', 'surface', 'lit'}


def overpass_query(osm_name: str) -> str:
    return f"""[out:json][timeout:90];
area["name"="{osm_name}"]["admin_level"=8]->.s;
(
  way["highway"](area.s);
  way["railway"="tram"](area.s);
);
out geom;"""


def fetch_overpass(query: str) -> dict:
    encoded = urllib.parse.urlencode({'data': query}).encode('utf-8')
    last_err = None
    for mirror in MIRRORS:
        try:
            print(f'    → {mirror}', end=' ', flush=True)
            req = urllib.request.Request(
                mirror, data=encoded,
                headers={'Content-Type': 'application/x-www-form-urlencoded',
                         'User-Agent': 'BordeauxDigitalTwin/1.0 (student project)'}
            )
            with urllib.request.urlopen(req, timeout=120) as resp:
                raw = resp.read().decode('utf-8')
                print('✓')
                return json.loads(raw)
        except urllib.error.HTTPError as e:
            print(f'HTTP {e.code}')
            if e.code in (429, 504):
                print('    rate limited — waiting 8s…')
                time.sleep(8)
            last_err = e
            continue
        except Exception as e:
            print(f'error: {e}')
            last_err = e
            continue
    raise RuntimeError(f'All mirrors failed. Last: {last_err}')


def elements_to_geojson(elements: list) -> dict:
    features = []
    for el in elements:
        if el.get('type') != 'way':
            continue
        geom = el.get('geometry')
        if not geom or len(geom) < 2:
            continue

        coords = [
            [round(g['lon'], 6), round(g['lat'], 6)]
            for g in geom
        ]

        tags = el.get('tags') or {}
        props = {k: v for k, v in tags.items() if k in KEEP_TAGS}

        features.append({
            'type': 'Feature',
            'geometry': {
                'type': 'LineString',
                'coordinates': coords,
            },
            'properties': props,
        })
    return {'type': 'FeatureCollection', 'features': features}


def download_area(file_key: str, osm_name: str) -> None:
    out_path = os.path.join(OUT_DIR, f'{file_key}.geojson')

    # Skip if already downloaded (re-run safe)
    if os.path.exists(out_path) and os.path.getsize(out_path) > 10_000:
        kb = os.path.getsize(out_path) // 1024
        print(f'  ⏭  already exists ({kb} KB) — skipping. Delete file to re-download.')
        return

    print(f'  Querying Overpass…')
    data    = fetch_overpass(overpass_query(osm_name))
    geojson = elements_to_geojson(data.get('elements', []))

    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(geojson, f, separators=(',', ':'), ensure_ascii=False)

    kb    = os.path.getsize(out_path) // 1024
    count = len(geojson['features'])
    print(f'  ✓  {count:,} roads  ·  {kb} KB  →  {out_path}')


def main() -> None:
    print(f'\n🗺  Bordeaux Métropole — Road Network Downloader')
    print(f'   Output: {OUT_DIR}\n')
    os.makedirs(OUT_DIR, exist_ok=True)

    failed = []
    for file_key, osm_name in AREAS:
        print(f'▶  {osm_name}')
        try:
            download_area(file_key, osm_name)
        except Exception as e:
            print(f'  ✗  FAILED: {e}', file=sys.stderr)
            failed.append(osm_name)
        # Polite pause between requests (Overpass rate limits)
        time.sleep(3)

    print('\n' + '─' * 50)
    if failed:
        print(f'⚠  {len(failed)} area(s) failed: {", ".join(failed)}')
        print('   Re-run the script — failed areas will retry (existing files are skipped).')
        sys.exit(1)
    else:
        total_kb = sum(
            os.path.getsize(os.path.join(OUT_DIR, f'{k}.geojson')) // 1024
            for k, _ in AREAS
            if os.path.exists(os.path.join(OUT_DIR, f'{k}.geojson'))
        )
        print(f'✅  All {len(AREAS)} areas downloaded — {total_kb} KB total')
        print('   StreetHeatLayer will now show full Bordeaux Métropole coverage.')


if __name__ == '__main__':
    main()
