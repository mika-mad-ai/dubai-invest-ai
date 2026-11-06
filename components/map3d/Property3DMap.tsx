import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
// MapLibre v6 cherche son worker à côté de son propre module
// (`new URL('./maplibre-gl-worker.mjs', import.meta.url)`). Une fois bundlé par
// Vite, ce fichier voisin n'existe plus : sans URL explicite, aucune tuile ne
// se charge (« Worker failed to load »). `?url` fait émettre le worker comme
// asset, chargé seulement à l'ouverture de la carte.
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { dubaiMidnightStyle } from './dubaiMidnightStyle';
import { resolveCoords, type ResolvedPoint } from './geocode';
import {
  estimateViews,
  floorsFromHeight,
  circlePolygon,
  haversineKm,
  buildingParts,
  idIsUniqueTo,
  inflateGeometry,
  pickBuilding,
  viewCone,
  type ViewInsight,
} from './viewAnalysis';
import { checkPrice } from '../../api/lib/priceCheck';
import { DLD_BENCHMARK_AS_OF } from '../../api/lib/dldBenchmarks';

/**
 * Scène 3D d'une unité : où est l'immeuble, dans quel environnement, avec
 * quelle vue. MapLibre GL + tuiles vectorielles OpenFreeMap (OSM) — aucune
 * clé API, aucune dépendance payante.
 */

export type MapSubject = {
  title: string;
  location: string;
  /** Prix demandé en EUR. */
  price: number;
  beds?: number;
  sqm?: number;
  type?: string | null;
  lat?: number | null;
  lng?: number | null;
};

maplibregl.setWorkerUrl(maplibreWorkerUrl);

const GOLD = '#D4AF37';
const IVORY = '#f0ebe0';
const sans = '"Manrope",sans-serif';
const display = '"Sora",sans-serif';

const eur = (n: number) => `${Math.round(n).toLocaleString('fr-FR')} €`;

type BuildingInfo = { heightM: number; floors: number; name?: string };

const Property3DMap: React.FC<{ subject: MapSubject }> = ({ subject }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const orbitRef = useRef<number | null>(null);

  const [point, setPoint] = useState<ResolvedPoint | null | 'pending'>('pending');
  const [building, setBuilding] = useState<BuildingInfo | null>(null);
  /** Vrai une fois la recherche de l'immeuble dans les tuiles terminée. */
  const [buildingChecked, setBuildingChecked] = useState(false);

  const reduced = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    []
  );

  const views: ViewInsight[] = useMemo(
    () => (point && point !== 'pending' ? estimateViews(point.lat, point.lng) : []),
    [point]
  );

  // Même verdict que la carte du bien et la sélection du conseiller
  // (médiane DLD de zone corrigée par nombre de chambres).
  const price = useMemo(
    () => checkPrice(subject.price, subject.sqm ?? 0, subject.location, null, { beds: subject.beds, type: subject.type }),
    [subject]
  );

  // ── Résolution de la position ────────────────────────────────────────────
  useEffect(() => {
    let alive = true;
    resolveCoords(subject).then(p => alive && setPoint(p));
    return () => {
      alive = false;
    };
  }, [subject]);

  // ── Scène ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!point || point === 'pending' || !containerRef.current) return;
    const { lat, lng } = point;
    const primaryView = estimateViews(lat, lng)[0] ?? null;
    const finalBearing = primaryView ? primaryView.bearing : 24;
    const finalZoom = point.precision === 'exact' ? 16.35 : 14.1;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: dubaiMidnightStyle(),
      center: reduced ? [lng, lat] : [55.29, 25.1],
      zoom: reduced ? finalZoom : 9.6,
      pitch: reduced ? 58 : 18,
      bearing: reduced ? finalBearing : -12,
      maxPitch: 72,
      attributionControl: { compact: true, customAttribution: 'OpenFreeMap' },
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-left');

    // Balise de l'unité : halo pulsé + faisceau vertical + étiquette prix.
    const el = document.createElement('div');
    el.className = 'm3d-beacon';
    el.innerHTML = `
      <div class="m3d-chip">${eur(subject.price)}</div>
      <div class="m3d-beam"></div>
      <div class="m3d-core"><span></span><span></span><i></i></div>
    `;
    new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([lng, lat]).addTo(map);

    let cancelled = false;

    const stopOrbit = () => {
      if (orbitRef.current) cancelAnimationFrame(orbitRef.current);
      orbitRef.current = null;
    };

    const startOrbit = () => {
      if (reduced || cancelled) return;
      let last: number | null = null;
      const spin = (ts: number) => {
        if (cancelled) return;
        if (last !== null) {
          map.setBearing(map.getBearing() + (ts - last) * 0.0009 * 60); // ≈ 0,9°/s
        }
        last = ts;
        orbitRef.current = requestAnimationFrame(spin);
      };
      orbitRef.current = requestAnimationFrame(spin);
      ['pointerdown', 'wheel', 'touchstart'].forEach(ev =>
        map.getCanvasContainer().addEventListener(ev, stopOrbit, { once: true, passive: true })
      );
    };

    const dressScene = () => {
      if (cancelled) return;

      // L'immeuble exact, extrait des tuiles OSM, re-extrudé en or.
      if (point.precision === 'exact') {
        // Test géométrique sur les empreintes (pas le pixel écran : en vue
        // inclinée, une tour au premier plan masquerait la cible).
        const feats = map.querySourceFeatures('openmaptiles', { sourceLayer: 'building' });
        const f = pickBuilding(feats, lat, lng);
        setBuildingChecked(true);
        if (f && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon')) {
          // Un immeuble à cheval sur deux tuiles arrive en morceaux : on les
          // regroupe par identifiant pour dorer l'empreinte entière.
          const parts = buildingParts(feats, f);
          const polys = parts.flatMap(o =>
            o.geometry.type === 'Polygon'
              ? [o.geometry.coordinates]
              : o.geometry.type === 'MultiPolygon'
                ? o.geometry.coordinates
                : []
          );
          const geometry: GeoJSON.Geometry =
            polys.length > 1 ? { type: 'MultiPolygon', coordinates: polys } : f.geometry;
          const h = Number(f.properties?.render_height) || 24;
          setBuilding({
            heightM: Math.round(h),
            floors: floorsFromHeight(h),
            name: typeof f.properties?.name === 'string' ? f.properties.name : undefined,
          });
          // Retire la tour d'origine de la couche de base : deux extrusions
          // identiques se disputent la profondeur (rayures « z-fighting »).
          if (idIsUniqueTo(feats, parts)) map.setFilter('buildings-3d', ['!=', ['id'], f.id as number]);
          // « Rayon X » : le bâti voisin s'efface à moitié pour que la tour
          // dorée reste visible même derrière plus haut qu'elle.
          map.setPaintProperty('buildings-3d', 'fill-extrusion-opacity-transition', { duration: reduced ? 0 : 900 });
          map.setPaintProperty('buildings-3d', 'fill-extrusion-opacity', 0.55);
          if (!map.getSource('unit-building')) {
            map.addSource('unit-building', {
              type: 'geojson',
              data: { type: 'Feature', properties: { h }, geometry: inflateGeometry(geometry) },
            });
            map.addLayer({
              id: 'unit-building-3d',
              type: 'fill-extrusion',
              source: 'unit-building',
              paint: {
                'fill-extrusion-color': GOLD,
                'fill-extrusion-height': h,
                'fill-extrusion-base': Number(f.properties?.render_min_height) || 0,
                'fill-extrusion-opacity': 0.92,
              },
            });
          }
        }
      } else if (!map.getSource('unit-area')) {
        // Précision quartier : un halo doux plutôt qu'un faux immeuble.
        map.addSource('unit-area', {
          type: 'geojson',
          data: circlePolygon(lat, lng, 0.45),
        });
        map.addLayer({
          id: 'unit-area-fill',
          type: 'fill',
          source: 'unit-area',
          paint: { 'fill-color': GOLD, 'fill-opacity': 0.1 },
        });
        // Contour pointillé : on lit tout de suite « zone », pas « immeuble ».
        map.addLayer({
          id: 'unit-area-line',
          type: 'line',
          source: 'unit-area',
          paint: { 'line-color': GOLD, 'line-opacity': 0.75, 'line-width': 1.4, 'line-dasharray': [2, 2] },
        });
      }

      // Le cône de vue : vers quoi regarde (probablement) l'unité.
      if (primaryView && !map.getSource('view-cone')) {
        map.addSource('view-cone', {
          type: 'geojson',
          data: viewCone(lat, lng, primaryView.bearing),
        });
        map.addLayer(
          {
            id: 'view-cone-fill',
            type: 'fill',
            source: 'view-cone',
            paint: { 'fill-color': '#48cae4', 'fill-opacity': 0.0 },
          },
          'place-labels'
        );
        map.setPaintProperty('view-cone-fill', 'fill-opacity-transition', { duration: 900 });
        map.setPaintProperty('view-cone-fill', 'fill-opacity', 0.09);
      }

      window.setTimeout(startOrbit, 700);
    };

    map.on('load', () => {
      if (cancelled) return;
      if (reduced) {
        map.once('idle', dressScene);
        return;
      }
      map.flyTo({
        center: [lng, lat],
        zoom: finalZoom,
        pitch: 64,
        bearing: finalBearing,
        duration: 5200,
        curve: 1.55,
        essential: false,
      });
      map.once('moveend', () => map.once('idle', dressScene));
    });

    return () => {
      cancelled = true;
      stopOrbit();
      map.remove();
      mapRef.current = null;
    };
  }, [point, reduced, subject.price]);

  // ── États hors nominal ───────────────────────────────────────────────────
  if (point === 'pending') {
    return (
      <div className="m3d-wait">
        <div className="m3d-radar" aria-hidden />
        <p style={{ fontFamily: sans, fontSize: '0.8rem', color: 'rgba(240,235,224,0.65)' }}>
          Localisation de l’immeuble sur les données OpenStreetMap…
        </p>
      </div>
    );
  }
  if (!point) {
    return (
      <div className="m3d-wait">
        <p style={{ fontFamily: sans, fontSize: '0.82rem', color: 'rgba(240,235,224,0.65)', maxWidth: 360, textAlign: 'center', lineHeight: 1.6 }}>
          Impossible de localiser cette annonce avec les seules sources publiques
          (OpenStreetMap). L’annonce source reste consultable via son lien.
        </p>
      </div>
    );
  }

  const seaView = views.find(v => v.kind === 'sea');
  const landmarks: Array<[string, number]> = [
    ['Burj Khalifa', haversineKm(point.lat, point.lng, 25.1972, 55.2744)],
    ['Aéroport DXB', haversineKm(point.lat, point.lng, 25.2532, 55.3657)],
  ];

  return (
    <div className="m3d-root">
      <div ref={containerRef} className="m3d-map" aria-label="Carte 3D de l’immeuble" />

      {/* Panneau d'analyse : ce que la carte montre, dit en chiffres. */}
      <aside className="m3d-panel">
        <p style={{ fontFamily: sans, fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: GOLD, margin: 0 }}>
          Localisation {point.precision === 'exact' ? 'de l’immeuble' : 'du quartier'}
        </p>
        <h4 style={{ fontFamily: display, fontSize: '0.98rem', fontWeight: 700, color: IVORY, lineHeight: 1.3, margin: '4px 0 0' }}>
          {building?.name ?? subject.title}
        </h4>
        <p style={{ fontFamily: sans, fontSize: '0.7rem', color: 'rgba(240,235,224,0.66)', margin: '2px 0 0' }}>
          {subject.location}
        </p>

        {point.precision === 'approx' && (
          <p className="m3d-note">
            Immeuble non identifié dans OpenStreetMap — position au centre du
            quartier, à affiner avec l’annonce source.
          </p>
        )}

        {point.precision === 'exact' && buildingChecked && !building && (
          <p className="m3d-note">
            Adresse localisée, mais la tour n’est pas encore dessinée dans
            OpenStreetMap (souvent un immeuble récent) : hauteur et étages
            indisponibles.
          </p>
        )}

        {building && (
          <div className="m3d-row">
            <span className="m3d-k">Tour (OSM)</span>
            <span className="m3d-v">≈ {building.heightM} m · ~{building.floors} étages</span>
          </div>
        )}

        {views.length > 0 && (
          <>
            <p style={{ fontFamily: sans, fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(240,235,224,0.62)', margin: '14px 0 6px' }}>
              Vues selon étage et orientation
            </p>
            <div className="m3d-chips">
              {views.map(v => (
                <span key={v.label} className={`m3d-view ${v.likelihood}`}>
                  {v.label}
                  <em>{v.direction} · {v.distanceKm} km{v.likelihood === 'possible' ? ' · possible' : ''}</em>
                </span>
              ))}
            </div>
          </>
        )}

        <div style={{ marginTop: 14 }}>
          {landmarks.map(([label, km]) => (
            <div className="m3d-row" key={label}>
              <span className="m3d-k">{label}</span>
              <span className="m3d-v">{km < 10 ? km.toFixed(1) : Math.round(km)} km</span>
            </div>
          ))}
          {seaView && (
            <div className="m3d-row">
              <span className="m3d-k">Mer</span>
              <span className="m3d-v">{seaView.distanceKm} km ({seaView.direction})</span>
            </div>
          )}
          {price.askingAedSqft && price.benchmarkAedSqft && price.deltaPct != null && (
            <div className="m3d-row">
              <span className="m3d-k">Demandé / médiane DLD</span>
              <span className="m3d-v">
                {Math.round(price.askingAedSqft).toLocaleString('fr-FR')} / {price.benchmarkAedSqft.toLocaleString('fr-FR')} AED·sqft
                <em style={{ display: 'block', fontStyle: 'normal', fontWeight: 600, color: price.deltaPct <= -4 ? '#6ee7b7' : price.deltaPct >= 4 ? '#fcd34d' : 'rgba(240,235,224,0.7)' }}>
                  {price.deltaPct > 0 ? '+' : '−'}{Math.abs(Math.round(price.deltaPct))} %
                </em>
              </span>
            </div>
          )}
        </div>

        <p style={{ fontFamily: sans, fontSize: '0.6rem', color: 'rgba(240,235,224,0.62)', lineHeight: 1.6, margin: '12px 0 0' }}>
          {price.zone ? `Zone DLD « ${price.zone} » · ` : ''}médiane revente 12 mois au {DLD_BENCHMARK_AS_OF}.
          Bâti et hauteurs : OpenStreetMap.
        </p>
      </aside>

      <style>{`
        .m3d-root { position: relative; width: 100%; height: 100%; background: #0a1020; }
        .m3d-map { position: absolute; inset: 0; }
        .m3d-wait { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; width: 100%; height: 100%; background: #0a1020; }
        .m3d-radar { width: 44px; height: 44px; border-radius: 50%; border: 1px solid rgba(212,175,55,0.35); position: relative; overflow: hidden; }
        .m3d-radar::after { content: ''; position: absolute; inset: 0; background: conic-gradient(from 0deg, rgba(212,175,55,0.55), transparent 110deg); animation: m3d-sweep 1.6s linear infinite; }
        @keyframes m3d-sweep { to { transform: rotate(360deg); } }

        .m3d-panel {
          position: absolute; top: 58px; right: 14px; width: 300px; max-height: calc(100% - 72px);
          overflow-y: auto; padding: 16px 16px 14px; border-radius: 16px;
          background: rgba(10,16,32,0.86); border: 1px solid rgba(255,255,255,0.09);
          backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
        }
        @media (max-width: 720px) {
          .m3d-panel { top: auto; right: 8px; left: 8px; bottom: 34px; width: auto; max-height: 46%; }
        }

        .m3d-note { font-family: ${sans}; font-size: 0.66rem; color: rgba(251,191,36,0.85); background: rgba(251,191,36,0.08); border: 1px solid rgba(251,191,36,0.22); border-radius: 8px; padding: 6px 9px; line-height: 1.5; margin: 10px 0 0; }
        .m3d-row { display: flex; justify-content: space-between; gap: 10px; padding: 5px 0; border-bottom: 1px solid rgba(255,255,255,0.055); }
        .m3d-row:last-child { border-bottom: none; }
        .m3d-k { font-family: ${sans}; font-size: 0.68rem; color: rgba(240,235,224,0.66); }
        .m3d-v { font-family: ${sans}; font-size: 0.7rem; font-weight: 700; color: ${IVORY}; text-align: right; }

        .m3d-chips { display: flex; flex-wrap: wrap; gap: 6px; }
        .m3d-view { display: inline-flex; flex-direction: column; gap: 1px; padding: 5px 9px; border-radius: 9px; font-family: ${sans}; font-size: 0.68rem; font-weight: 700; }
        .m3d-view em { font-style: normal; font-weight: 600; font-size: 0.6rem; opacity: 0.72; }
        .m3d-view.probable { color: ${GOLD}; background: rgba(212,175,55,0.1); border: 1px solid rgba(212,175,55,0.3); }
        .m3d-view.possible { color: rgba(240,235,224,0.78); background: rgba(255,255,255,0.045); border: 1px solid rgba(255,255,255,0.1); }

        .m3d-beacon { display: flex; flex-direction: column; align-items: center; pointer-events: none; }
        .m3d-chip {
          font-family: ${display}; font-size: 0.72rem; font-weight: 700; color: #0a1020;
          background: ${GOLD}; padding: 3px 9px; border-radius: 999px; white-space: nowrap;
          box-shadow: 0 2px 14px rgba(212,175,55,0.45); margin-bottom: 4px;
        }
        .m3d-beam { width: 2px; height: 46px; background: linear-gradient(to bottom, rgba(212,175,55,0), rgba(212,175,55,0.9)); }
        .m3d-core { position: relative; width: 14px; height: 14px; }
        .m3d-core i { position: absolute; inset: 3px; border-radius: 50%; background: ${GOLD}; box-shadow: 0 0 12px rgba(212,175,55,0.9); }
        .m3d-core span { position: absolute; inset: 0; border-radius: 50%; border: 1.5px solid rgba(212,175,55,0.8); animation: m3d-pulse 2.4s cubic-bezier(0.16,1,0.3,1) infinite; }
        .m3d-core span:nth-child(2) { animation-delay: 1.2s; }
        @keyframes m3d-pulse { 0% { transform: scale(1); opacity: 0.9; } 100% { transform: scale(3.4); opacity: 0; } }

        .m3d-root .maplibregl-ctrl-group { background: rgba(16,24,44,0.92); border: 1px solid rgba(255,255,255,0.1); box-shadow: none; }
        .m3d-root .maplibregl-ctrl-group button + button { border-top: 1px solid rgba(255,255,255,0.08); }
        .m3d-root .maplibregl-ctrl button .maplibregl-ctrl-icon { filter: invert(0.88); }
        .m3d-root .maplibregl-ctrl-attrib { background: rgba(10,16,32,0.72); font-family: ${sans}; }
        .m3d-root .maplibregl-ctrl-attrib a { color: rgba(240,235,224,0.6); }

        @media (prefers-reduced-motion: reduce) {
          .m3d-core span, .m3d-radar::after { animation: none; }
        }
      `}</style>
    </div>
  );
};

export default Property3DMap;
