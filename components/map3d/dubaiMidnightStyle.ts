import type { StyleSpecification } from 'maplibre-gl';

/**
 * Style carto « midnight » maison, aligné sur l'identité du site
 * (fond nuit, or en silence, cyan en ponctuation).
 *
 * Données : tuiles vectorielles OpenFreeMap (OpenStreetMap) — publiques,
 * sans clé API. https://openfreemap.org
 */
export function dubaiMidnightStyle(): StyleSpecification {
  return {
    version: 8,
    name: 'DubaiInvest Midnight',
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    light: { anchor: 'viewport', color: '#ffffff', intensity: 0.32, position: [1.2, 215, 32] },
    sources: {
      openmaptiles: { type: 'vector', url: 'https://tiles.openfreemap.org/planet' },
    },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': '#0a1020' } },
      {
        id: 'landcover-sand',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'landcover',
        filter: ['==', ['get', 'class'], 'sand'],
        paint: { 'fill-color': '#0d1527', 'fill-opacity': 0.8 },
      },
      {
        id: 'park',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'park',
        paint: { 'fill-color': '#0d1a22', 'fill-opacity': 0.9 },
      },
      {
        id: 'landuse-grass',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'landuse',
        filter: ['in', ['get', 'class'], ['literal', ['grass', 'golf_course', 'cemetery', 'recreation_ground']]],
        paint: { 'fill-color': '#0d1a22', 'fill-opacity': 0.85 },
      },
      {
        id: 'water',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'water',
        paint: { 'fill-color': '#0f1d38' },
      },
      {
        id: 'waterway',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'waterway',
        paint: { 'line-color': '#0f1d38', 'line-width': 1.4 },
      },
      {
        id: 'roads-minor',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'transportation',
        minzoom: 12,
        filter: ['in', ['get', 'class'], ['literal', ['minor', 'service', 'tertiary']]],
        paint: {
          'line-color': '#182341',
          'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 12, 0.4, 16, 2.2, 18, 5],
        },
      },
      {
        id: 'roads-major',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'transportation',
        filter: ['in', ['get', 'class'], ['literal', ['primary', 'secondary', 'trunk']]],
        paint: {
          'line-color': '#202e55',
          'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 10, 0.6, 14, 2.4, 17, 7],
        },
      },
      {
        id: 'roads-motorway',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'transportation',
        filter: ['==', ['get', 'class'], 'motorway'],
        paint: {
          'line-color': '#2b3a68',
          'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 9, 1, 13, 3.2, 17, 9],
        },
      },
      {
        // Empreintes 2D en zoom intermédiaire, avant la prise de relief.
        id: 'buildings-2d',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'building',
        minzoom: 12,
        maxzoom: 14.5,
        paint: { 'fill-color': '#141d36', 'fill-opacity': 0.75 },
      },
      {
        id: 'buildings-3d',
        type: 'fill-extrusion',
        source: 'openmaptiles',
        'source-layer': 'building',
        minzoom: 13.5,
        paint: {
          'fill-extrusion-color': [
            'interpolate',
            ['linear'],
            ['coalesce', ['get', 'render_height'], 8],
            0, '#16203c',
            60, '#223158',
            180, '#31436f',
            320, '#3f5484',
          ],
          'fill-extrusion-height': [
            'interpolate', ['linear'], ['zoom'],
            13.5, 0,
            14.6, ['coalesce', ['get', 'render_height'], 8],
          ],
          'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
          'fill-extrusion-opacity': 0.88,
        },
      },
      {
        id: 'place-labels',
        type: 'symbol',
        source: 'openmaptiles',
        'source-layer': 'place',
        filter: ['in', ['get', 'class'], ['literal', ['suburb', 'neighbourhood', 'quarter', 'town', 'city']]],
        layout: {
          'text-field': ['coalesce', ['get', 'name:latin'], ['get', 'name']],
          'text-font': ['Noto Sans Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 10, 10.5, 15, 12.5],
          'text-letter-spacing': 0.08,
          'text-transform': 'uppercase',
        },
        paint: {
          'text-color': 'rgba(240,235,224,0.52)',
          'text-halo-color': '#0a1020',
          'text-halo-width': 1.2,
        },
      },
    ],
  };
}
