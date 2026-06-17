"""
Fetch 3D building data from IGN France BDTOPO WFS (free, no API key, real heights).
Run once: python simulations/fetch_buildings.py
Output: frontend/public/data/buildings/{area}.geojson
"""
import json, os, sys, urllib.request, urllib.parse
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

WFS_BASE = 'https://data.geopf.fr/wfs/ows'

AREAS = {
    # tight city-centre bboxes (~2×2 km) — keeps files under 5 MB
    'bordeaux-city': (-0.600, 44.828, -0.558, 44.850),  # historic centre
    'pessac':        (-0.636, 44.796, -0.596, 44.816),  # campus / centre
    'talence':       (-0.605, 44.798, -0.570, 44.820),  # centre
    'merignac':      (-0.706, 44.825, -0.666, 44.845),  # centre-ville
    'gradignan':     (-0.634, 44.762, -0.594, 44.782),  # centre
}

OUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'frontend', 'public', 'data', 'buildings')
os.makedirs(OUT_DIR, exist_ok=True)

def fetch_wfs(west, south, east, north):
    all_feats = []
    page_size = 2000
    start = 0
    while True:
        params = {
            'SERVICE':      'WFS',
            'VERSION':      '2.0.0',
            'REQUEST':      'GetFeature',
            'TYPENAMES':    'BDTOPO_V3:batiment',
            'BBOX':         f'{west},{south},{east},{north},EPSG:4326',
            'OUTPUTFORMAT': 'application/json',
            'COUNT':        str(page_size),
            'STARTINDEX':   str(start),
        }
        url = WFS_BASE + '?' + urllib.parse.urlencode(params)
        req = urllib.request.Request(url, headers={'User-Agent': 'UrbanDigitalTwin/1.0'})
        with urllib.request.urlopen(req, timeout=90) as r:
            data = json.loads(r.read())
        feats = data.get('features', [])
        all_feats.extend(feats)
        print(f'    page {start//page_size+1}: {len(feats)} features (total {len(all_feats)})')
        if len(feats) < page_size:
            break
        start += page_size
    return {'features': all_feats}

def parse_height(props):
    h = props.get('hauteur')
    if h and float(h) > 1:
        return round(float(h), 1)
    etages = props.get('nombre_d_etages')
    if etages:
        return round(float(etages) * 3.2, 1)
    return 9.6

COLOUR_MAP = {
    'Residentiel':  [222, 196, 160, 0.80],
    'Commercial':   [178, 202, 225, 0.80],
    'Industriel':   [180, 180, 180, 0.80],
    'Enseignement': [198, 222, 178, 0.80],
    'Sante':        [255, 218, 218, 0.80],
    'Religieux':    [218, 198, 240, 0.80],
    'Sportif':      [170, 220, 200, 0.80],
}
DEFAULT_COLOUR = [210, 192, 160, 0.80]

for area_key, (west, south, east, north) in AREAS.items():
    print(f'\n[{area_key}] Fetching BDTOPO buildings...')
    try:
        raw = fetch_wfs(west, south, east, north)
    except Exception as e:
        print(f'  ERROR: {e}')
        continue

    features = raw.get('features', [])
    print(f'  Got {len(features)} raw features')

    out = []
    for f in features:
        geom  = f.get('geometry', {})
        props = f.get('properties', {})
        if not geom or geom.get('type') not in ('Polygon', 'MultiPolygon'):
            continue
        height = parse_height(props)
        usage  = props.get('usage_1', '')
        # Skip tiny structures (garden sheds, lean-tos, walls < 2.5m)
        if height < 2.5:
            continue
        out.append({
            'type': 'Feature',
            'properties': {
                'id':     props.get('cleabs', ''),
                'usage':  usage,
                'height': height,
                '_colour': COLOUR_MAP.get(usage, DEFAULT_COLOUR),
            },
            'geometry': geom,
        })

    # Cap at 3000 — prioritise tallest buildings for best visual impact
    MAX = 3000
    if len(out) > MAX:
        out.sort(key=lambda f: f['properties']['height'], reverse=True)
        out = out[:MAX]
        print(f'  Capped to {MAX} tallest buildings')

    out_path = os.path.join(OUT_DIR, f'{area_key}.geojson')
    with open(out_path, 'w', encoding='utf-8') as fp:
        json.dump({'type': 'FeatureCollection', 'features': out}, fp, separators=(',', ':'))
    kb = os.path.getsize(out_path) // 1024
    print(f'  Saved {len(out)} buildings → {out_path} ({kb} KB)')

print('\nDone! Run the frontend and select an area to see buildings.')
