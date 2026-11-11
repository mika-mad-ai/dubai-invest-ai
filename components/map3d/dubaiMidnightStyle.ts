import type { ExpressionSpecification, FilterSpecification, StyleSpecification } from 'maplibre-gl';

/**
 * Style carto « midnight » maison, aligné sur l'identité du site
 * (fond nuit, or en silence, cyan en ponctuation).
 *
 * Données : tuiles vectorielles OpenFreeMap (OpenStreetMap) — publiques,
 * sans clé API. https://openfreemap.org
 */
/**
 * OpenStreetMap décrit les tours complexes en plusieurs volumes
 * (`building:part`, chacun avec sa hauteur) et marque leur contour global
 * `hide_3d`. Extruder ce contour à pleine hauteur noie les volumes dans une
 * boîte : on l'écarte pour que les silhouettes réelles apparaissent (les
 * retraits du Burj Khalifa, les podiums, les tours jumelles).
 */
export const BUILDINGS_3D_FILTER: ExpressionSpecification = ['!=', ['get', 'hide_3d'], true];

/** Même filtre, en retirant en plus un immeuble (celui qu'on redessine en or). */
export function buildingsFilterWithout(id: number | string): FilterSpecification {
  return ['all', BUILDINGS_3D_FILTER, ['!=', ['id'], id]];
}

export function dubaiMidnightStyle(): StyleSpecification {
  return {
    version: 8,
    name: 'DubaiInvest Midnight',
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    light: { anchor: 'viewport', color: '#dfe8ff', intensity: 0.42, position: [1.3, 215, 38] },
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
        // Pistes et tarmacs (DXB, Al Maktoum) : repères immédiats vus du ciel.
        id: 'aeroway-area',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'aeroway',
        filter: ['==', ['geometry-type'], 'Polygon'],
        paint: { 'fill-color': '#141f3d', 'fill-opacity': 0.9 },
      },
      {
        id: 'aeroway-runway',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'aeroway',
        filter: ['all', ['==', ['geometry-type'], 'LineString'], ['in', ['get', 'class'], ['literal', ['runway', 'taxiway']]]],
        paint: {
          'line-color': '#2b3a68',
          'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 10, 1, 14, ['match', ['get', 'class'], 'runway', 14, 4]],
        },
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
        // Halo chaud sous les grands axes : la ville de nuit vue d'en haut
        // (Sheikh Zayed Road, Al Khail Road) se lit par ses lumières.
        id: 'roads-motorway-glow',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'transportation',
        filter: ['in', ['get', 'class'], ['literal', ['motorway', 'trunk']]],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#f2c46a',
          'line-opacity': ['interpolate', ['linear'], ['zoom'], 9, 0.1, 13, 0.16, 17, 0.1],
          'line-blur': ['interpolate', ['linear'], ['zoom'], 9, 2, 14, 7, 17, 14],
          'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 9, 3, 13, 10, 17, 26],
        },
      },
      {
        id: 'roads-motorway',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'transportation',
        filter: ['==', ['get', 'class'], 'motorway'],
        paint: {
          'line-color': '#3a4c80',
          'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 9, 1, 13, 3.2, 17, 9],
        },
      },
      {
        // Métro et tramway : fine ligne cyan en pointillé.
        id: 'rail-transit',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'transportation',
        minzoom: 10.5,
        filter: ['in', ['get', 'class'], ['literal', ['transit', 'rail']]],
        paint: {
          'line-color': '#48cae4',
          'line-opacity': 0.55,
          'line-width': ['interpolate', ['linear'], ['zoom'], 10.5, 0.8, 16, 2.2],
          'line-dasharray': [3, 2],
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
        filter: BUILDINGS_3D_FILTER,
        paint: { 'fill-color': '#141d36', 'fill-opacity': 0.75 },
      },
      {
        id: 'buildings-3d',
        type: 'fill-extrusion',
        source: 'openmaptiles',
        'source-layer': 'building',
        minzoom: 13.5,
        filter: BUILDINGS_3D_FILTER,
        paint: {
          'fill-extrusion-color': [
            'interpolate',
            ['linear'],
            ['coalesce', ['get', 'render_height'], 8],
            0, '#16203c',
            40, '#1f2c52',
            120, '#2c3d6b',
            250, '#3d5389',
            500, '#5670a8',
            830, '#7f97c8',
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
        id: 'road-labels',
        type: 'symbol',
        source: 'openmaptiles',
        'source-layer': 'transportation_name',
        minzoom: 14.5,
        layout: {
          'symbol-placement': 'line',
          'text-field': ['coalesce', ['get', 'name:latin'], ['get', 'name']],
          'text-font': ['Noto Sans Regular'],
          'text-size': 10.5,
          'text-letter-spacing': 0.04,
        },
        paint: { 'text-color': 'rgba(240,235,224,0.42)', 'text-halo-color': '#0a1020', 'text-halo-width': 1.1 },
      },
      {
        id: 'water-labels',
        type: 'symbol',
        source: 'openmaptiles',
        'source-layer': 'water_name',
        layout: {
          'text-field': ['coalesce', ['get', 'name:latin'], ['get', 'name']],
          'text-font': ['Noto Sans Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 9, 10, 14, 12],
          'text-letter-spacing': 0.18,
        },
        paint: { 'text-color': 'rgba(125,211,232,0.5)', 'text-halo-color': '#0f1d38', 'text-halo-width': 1 },
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
