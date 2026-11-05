// Générateur de tuiles vectorielles SYNTHÉTIQUES (fixture de test) au schéma
// OpenMapTiles : building / water / transportation / place.
// Sert uniquement à tester le code de la carte quand OpenFreeMap est injoignable.
const geojsonvt = require('geojson-vt');
const vtpbf = require('vt-pbf');

const M_LAT = 1 / 111320;
const mLng = lat => 1 / (111320 * Math.cos((lat * Math.PI) / 180));

function rect(lat, lng, wM, hM, props) {
  const dLat = (hM / 2) * M_LAT, dLng = (wM / 2) * mLng(lat);
  return {
    type: 'Feature', id: props.id, properties: props,
    geometry: { type: 'Polygon', coordinates: [[
      [lng - dLng, lat - dLat], [lng + dLng, lat - dLat], [lng + dLng, lat + dLat], [lng - dLng, lat + dLat], [lng - dLng, lat - dLat],
    ]] },
  };
}

let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

function buildWorld(targets) {
  const buildings = [], roads = [], places = [];
  for (const t of targets) {
    // le « vrai » immeuble de l'annonce, exactement sous le point
    if (t.named) buildings.push(rect(t.lat, t.lng, 34, 30, { id: 9000 + targets.indexOf(t), render_height: t.h || 168, render_min_height: 0, name: t.named }));
    for (let i = -11; i <= 11; i++) for (let j = -11; j <= 11; j++) {
      if (i === 0 && j === 0) continue;
      if (rnd() < 0.28) continue;
      const lat = t.lat + i * 52 * M_LAT + (rnd() - 0.5) * 8 * M_LAT;
      const lng = t.lng + j * 52 * mLng(t.lat) + (rnd() - 0.5) * 8 * mLng(t.lat);
      const tall = rnd();
      const h = tall > 0.9 ? 140 + rnd() * 180 : tall > 0.6 ? 45 + rnd() * 80 : 8 + rnd() * 30;
      buildings.push(rect(lat, lng, 18 + rnd() * 18, 18 + rnd() * 18, { id: buildings.length + 1, render_height: Math.round(h), render_min_height: 0 }));
    }
    for (const k of [-6, 6]) {
      roads.push({ type: 'Feature', properties: { class: 'primary' }, geometry: { type: 'LineString', coordinates: [[t.lng - 0.012, t.lat + k * 52 * M_LAT * 1.0 + 26 * M_LAT], [t.lng + 0.012, t.lat + k * 52 * M_LAT + 26 * M_LAT]] } });
      roads.push({ type: 'Feature', properties: { class: 'minor' }, geometry: { type: 'LineString', coordinates: [[t.lng + k * 52 * mLng(t.lat) + 26 * mLng(t.lat), t.lat - 0.01], [t.lng + k * 52 * mLng(t.lat) + 26 * mLng(t.lat), t.lat + 0.01]] } });
    }
    places.push({ type: 'Feature', properties: { class: 'suburb', name: t.place }, geometry: { type: 'Point', coordinates: [t.lng + 0.004, t.lat + 0.004] } });
  }
  roads.push({ type: 'Feature', properties: { class: 'motorway' }, geometry: { type: 'LineString', coordinates: [[55.10, 25.03], [55.20, 25.11], [55.27, 25.19], [55.30, 25.24]] } });
  // Golfe : tout ce qui est au nord-ouest de la côte (approx.)
  const coast = [[54.99, 24.95], [55.08, 25.01], [55.125, 25.065], [55.145, 25.09], [55.185, 25.13], [55.225, 25.175], [55.255, 25.21], [55.29, 25.245], [55.32, 25.285]];
  const water = { type: 'Feature', properties: { class: 'ocean' }, geometry: { type: 'Polygon', coordinates: [[...coast, [55.32, 25.6], [54.6, 25.6], [54.6, 24.95], coast[0]]] } };
  const fc = features => ({ type: 'FeatureCollection', features });
  const opts = { maxZoom: 14, indexMaxZoom: 6, tolerance: 1, extent: 4096, buffer: 64 };
  return {
    building: geojsonvt(fc(buildings), opts),
    transportation: geojsonvt(fc(roads), opts),
    place: geojsonvt(fc(places), opts),
    water: geojsonvt(fc([water]), opts),
  };
}

function makeTileServer(targets) {
  const idx = buildWorld(targets);
  return (z, x, y) => {
    const layers = {};
    for (const [name, ix] of Object.entries(idx)) {
      const t = ix.getTile(z, x, y);
      if (t) layers[name] = t;
    }
    if (!Object.keys(layers).length) return Buffer.alloc(0);
    return Buffer.from(vtpbf.fromGeojsonVt(layers, { version: 2 }));
  };
}

module.exports = { makeTileServer };
