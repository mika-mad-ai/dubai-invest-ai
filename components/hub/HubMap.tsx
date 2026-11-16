import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
// Voir Property3DMap : le worker doit être émis comme asset, sinon aucune tuile.
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { BUILDINGS_3D_FILTER, buildingsFilterWithout, dubaiMidnightStyle } from '../map3d/dubaiMidnightStyle';
import { resolveCoords, type ResolvedPoint } from '../map3d/geocode';
import {
  estimateViews,
  floorsFromHeight,
  circlePolygon,
  buildingParts,
  focusPolygon,
  idIsUniqueTo,
  inflateGeometry,
  pickBuilding,
  viewCone,
  type ViewInsight,
} from '../map3d/viewAnalysis';
import {
  CITY_POSE,
  cameraFor,
  floorSpan,
  levelForZoom,
  placeWithoutOverlap,
  type Box,
  type DistrictPoint,
  type HubLevel,
} from './zoomLevels';

/**
 * La carte de l'interface de résultats : une seule scène MapLibre, persistante,
 * dont la caméra voyage entre quatre niveaux (ville, quartier, immeuble,
 * appartement). Elle ne rend aucun panneau : elle signale le niveau courant et
 * ce qu'elle a trouvé sur le bien, l'interface autour décide quoi afficher.
 */

maplibregl.setWorkerUrl(maplibreWorkerUrl);

const GOLD = '#D4AF37';

export type HubSubject = {
  id: string;
  title: string;
  location: string;
  type?: string | null;
  lat?: number | null;
  lng?: number | null;
  /** Prix déjà formaté, affiché sur la balise. */
  priceLabel: string;
};

export type BuildingInfo = {
  heightM: number;
  /** Altitude du bas de la tour (au-dessus d'un podium), 0 le plus souvent. */
  baseM: number;
  floors: number;
  name?: string;
  /** Hauteurs (m) des immeubles dans un rayon de 300 m. */
  neighbours: number[];
};

export type SceneInfo = {
  /** 'pending' tant que la position du bien n'est pas résolue ; null = introuvable. */
  point: ResolvedPoint | null | 'pending';
  views: ViewInsight[];
  building: BuildingInfo | null;
  /** Vrai une fois l'immeuble cherché dans les tuiles (trouvé ou non). */
  buildingChecked: boolean;
};

export type CameraReadout = { zoom: number; pitch: number; bearing: number; lat: number; lng: number };

export type MapPadding = { top: number; right: number; bottom: number; left: number };

export type HubMapHandle = {
  /** Travelling vers un niveau. Sans bien localisé, seul « city » est possible. */
  goTo: (level: HubLevel) => void;
  flyToDistrict: (d: DistrictPoint) => void;
  zoomBy: (delta: number) => void;
};

type Props = {
  subject: HubSubject | null;
  districts: DistrictPoint[];
  activeDistrictKey?: string | null;
  /** Étage de l'appartement à montrer dans la tour (1 = premier niveau). */
  floor: number | null;
  /** Autres annonces localisées exactement : points cliquables sur la carte. */
  others: Array<{ id: string; lat: number; lng: number; label: string }>;
  padding: MapPadding;
  onLevel: (level: HubLevel) => void;
  onScene: (info: SceneInfo) => void;
  onCamera: (c: CameraReadout) => void;
  onDistrictClick: (d: DistrictPoint) => void;
  onPickListing: (id: string) => void;
  /** Le premier travelling vers le bien est terminé (ou a été interrompu). */
  onArrived: () => void;
};

const EMPTY_SCENE: SceneInfo = { point: 'pending', views: [], building: null, buildingChecked: false };

const HubMap = forwardRef<HubMapHandle, Props>(function HubMap(props, ref) {
  const { subject, districts, activeDistrictKey, others, padding, floor } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [ready, setReady] = useState(false);
  const [point, setPoint] = useState<ResolvedPoint | null | 'pending'>('pending');

  // Les rappels et le padding changent à chaque rendu du parent : on les lit
  // par référence pour ne jamais recréer la carte.
  const cb = useRef(props);
  cb.current = props;
  const paddingRef = useRef(padding);
  paddingRef.current = padding;

  const orbitRef = useRef<number | null>(null);
  const orbitTimerRef = useRef<number | null>(null);
  /** Vrai pendant un travelling : l'orbite ne doit jamais l'interrompre. */
  const flyingRef = useRef(false);
  const interactedRef = useRef(false);
  const revealedRef = useRef(false);
  const pointRef = useRef<ResolvedPoint | null>(null);
  const viewBearingRef = useRef(24);
  const pillsRef = useRef<Array<{ d: DistrictPoint; el: HTMLButtonElement; w: number; h: number }>>([]);
  const activeKeyRef = useRef<string | null | undefined>(activeDistrictKey);
  const levelRef = useRef<HubLevel>('city');
  const buildingRef = useRef<BuildingInfo | null>(null);
  const floorRef = useRef<number | null>(floor);
  floorRef.current = floor;

  /** Altitude du milieu de l'étage montré, ou 0 si la tour n'est pas connue. */
  const floorAltitude = () => {
    const b = buildingRef.current;
    const f = floorRef.current;
    if (!b || !f) return 0;
    const span = floorSpan(f, b.floors, b.heightM, b.baseM);
    return (span.bottom + span.top) / 2;
  };

  /**
   * Au niveau « appartement », la tour dorée devient translucide pour laisser
   * voir l'étage de l'appartement, et la caméra vise cet étage (plus le sol).
   */
  const applyLevelLook = (level: HubLevel) => {
    const map = mapRef.current;
    if (!map) return;
    try {
      if (map.getLayer('unit-building-3d')) map.setPaintProperty('unit-building-3d', 'fill-extrusion-opacity', level === 'unit' ? 0.3 : 0.92);
    } catch {
      /* style en cours de chargement */
    }
  };

  const paintFloor = () => {
    const map = mapRef.current;
    const b = buildingRef.current;
    const f = floorRef.current;
    if (!map || !b || !f || !map.getLayer('unit-floor-3d')) return;
    const span = floorSpan(f, b.floors, b.heightM, b.baseM);
    map.setPaintProperty('unit-floor-3d', 'fill-extrusion-base', span.bottom);
    map.setPaintProperty('unit-floor-3d', 'fill-extrusion-height', span.top);
  };

  const reduced = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    []
  );

  const stopOrbit = () => {
    if (orbitTimerRef.current != null) clearTimeout(orbitTimerRef.current);
    orbitTimerRef.current = null;
    if (orbitRef.current) cancelAnimationFrame(orbitRef.current);
    orbitRef.current = null;
  };

  const elevRef = useRef<number | null>(null);
  /**
   * Fait monter ou descendre le point visé par la caméra (`flyTo` ne sait pas
   * animer l'altitude : on l'interpole image par image).
   */
  const aimAt = (altitude: number, ms: number, then?: () => void) => {
    const map = mapRef.current;
    if (!map) return;
    if (elevRef.current != null) cancelAnimationFrame(elevRef.current);
    const from = map.getCenterElevation() || 0;
    if (reduced || ms <= 0 || Math.abs(from - altitude) < 0.5) {
      map.setCenterElevation(altitude);
      elevRef.current = null;
      then?.();
      return;
    }
    const t0 = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / ms);
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      map.setCenterElevation(from + (altitude - from) * e);
      if (k < 1) elevRef.current = requestAnimationFrame(step);
      else {
        elevRef.current = null;
        then?.();
      }
    };
    elevRef.current = requestAnimationFrame(step);
  };

  const travel = (pose: { center: [number, number]; zoom: number; pitch: number; bearing: number }, duration: number, altitude = 0) => {
    const map = mapRef.current;
    if (!map) return;
    stopOrbit();
    if (reduced) {
      map.jumpTo({ ...pose, padding: paddingRef.current });
      map.setCenterElevation(altitude);
      return;
    }
    // La caméra revient d'abord viser le sol, vole, puis monte à l'étage.
    if ((map.getCenterElevation() || 0) > 0.5) {
      aimAt(0, 320, () => travel(pose, duration, altitude));
      return;
    }
    if (altitude > 0) map.once('moveend', () => { if (levelRef.current === 'unit') aimAt(altitude, 900); });
    // `setBearing` de l'orbite coupe net une animation en cours : on la tient
    // à l'écart jusqu'à la fin du vol (ou son interruption par le visiteur).
    flyingRef.current = true;
    map.once('moveend', () => {
      flyingRef.current = false;
    });
    map.flyTo({ ...pose, padding: paddingRef.current, duration, curve: 1.35, essential: true });
  };

  useImperativeHandle(ref, () => ({
    goTo(level) {
      const map = mapRef.current;
      if (!map) return;
      const p = pointRef.current;
      if (level !== 'city' && !p) return;
      const pose = cameraFor(level, p, viewBearingRef.current);
      // Durée proportionnelle au chemin : un saut ville → appartement est un
      // vrai travelling, un cran voisin reste vif.
      const dz = Math.abs(map.getZoom() - pose.zoom);
      travel(pose, Math.round(1400 + dz * 520), level === 'unit' ? floorAltitude() : 0);
    },
    flyToDistrict(d) {
      travel({ center: [d.lng, d.lat], zoom: 13.4, pitch: 50, bearing: -12 }, 3000);
    },
    zoomBy(delta) {
      const map = mapRef.current;
      if (!map) return;
      stopOrbit();
      map.easeTo({ zoom: map.getZoom() + delta, duration: reduced ? 0 : 450 });
    },
  }));

  // ── Carte (créée une seule fois) ─────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    const style = dubaiMidnightStyle();
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        ...style,
        // Ciel et brume d'horizon : en vue rasante, la ville se fond dans la
        // nuit au lieu de s'arrêter sur un bord net.
        sky: {
          'sky-color': '#060b18',
          'horizon-color': '#1a2b55',
          'fog-color': '#0c1630',
          'sky-horizon-blend': 0.6,
          'horizon-fog-blend': 0.7,
          'fog-ground-blend': 0.25,
          'atmosphere-blend': 0,
        },
      },
      ...CITY_POSE,
      maxPitch: 72,
      minZoom: 8.6,
      maxZoom: 18.6,
      maxBounds: [
        [54.4, 24.5],
        [56.1, 25.75],
      ],
      attributionControl: { compact: true, customAttribution: 'OpenFreeMap' },
    });
    mapRef.current = map;
    map.setPadding(paddingRef.current);
    // La caméra peut viser un point en hauteur (l'étage de l'appartement).
    map.setCenterClampedToGround(false);

    const container = map.getCanvasContainer();
    const onUserInput = () => {
      interactedRef.current = true;
      stopOrbit();
    };
    ['pointerdown', 'wheel', 'touchstart'].forEach(ev => container.addEventListener(ev, onUserInput, { passive: true }));

    // Niveau d'analyse + relevé caméra.
    let level: HubLevel = levelForZoom(map.getZoom());
    let camTimer: number | null = null;
    const report = () => {
      const z = map.getZoom();
      const next = levelForZoom(z);
      if (next !== level) {
        level = next;
        levelRef.current = next;
        applyLevelLook(next);
        // Le visiteur a quitté le niveau « appartement » à la molette : la
        // caméra ne doit pas rester pointée en l'air.
        if (next !== 'unit' && !flyingRef.current && (map.getCenterElevation() || 0) > 0.5) {
          requestAnimationFrame(() => aimAt(0, 300));
        }
        cb.current.onLevel(next);
      }
      if (camTimer == null) {
        camTimer = window.setTimeout(() => {
          camTimer = null;
          const c = map.getCenter();
          cb.current.onCamera({ zoom: map.getZoom(), pitch: map.getPitch(), bearing: map.getBearing(), lat: c.lat, lng: c.lng });
        }, 140);
      }
    };

    // Étiquettes de quartier : anti-chevauchement par ordre de priorité
    // (quartier du bien d'abord, puis volume de transactions).
    let pillFrame: number | null = null;
    const layoutPills = () => {
      pillFrame = null;
      const pills = pillsRef.current;
      if (!pills.length) return;
      const z = map.getZoom();
      const show = z < 14.3;
      const size = map.getCanvas().getBoundingClientRect();
      const order = pills
        .map((p, i) => i)
        .sort((a, b) => Number(pills[b].d.key === activeKeyRef.current) - Number(pills[a].d.key === activeKeyRef.current));
      const boxes: Array<Box | null> = order.map(i => {
        const p = pills[i];
        if (!show) return null;
        if (!p.w) {
          p.w = p.el.offsetWidth;
          p.h = p.el.offsetHeight;
        }
        const xy = map.project([p.d.lng, p.d.lat]);
        if (xy.x < -40 || xy.y < -40 || xy.x > size.width + 40 || xy.y > size.height + 40) return null;
        return { x: xy.x - p.w / 2, y: xy.y - p.h / 2, w: p.w, h: p.h };
      });
      const kept = placeWithoutOverlap(boxes, 6);
      order.forEach((i, pos) => pills[i].el.classList.toggle('off', !kept.has(pos)));
    };
    const schedulePills = () => {
      if (pillFrame == null) pillFrame = requestAnimationFrame(layoutPills);
    };
    (map as unknown as { __schedulePills?: () => void }).__schedulePills = schedulePills;

    map.on('move', () => {
      report();
      schedulePills();
    });
    map.on('load', () => {
      setReady(true);
      schedulePills();
    });

    const ro = new ResizeObserver(() => {
      map.resize();
      schedulePills();
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      stopOrbit();
      if (camTimer != null) clearTimeout(camTimer);
      if (pillFrame != null) cancelAnimationFrame(pillFrame);
      pillsRef.current = [];
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Étiquettes de quartier (médianes DLD) ────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const markers = districts.map(d => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'hub-pill off';
      el.setAttribute('aria-label', `${d.label} : médiane ${d.aedSqft} AED par pied carré`);
      el.innerHTML = `<b></b><i></i>`;
      (el.firstChild as HTMLElement).textContent = d.label;
      (el.lastChild as HTMLElement).textContent = d.aedSqft.toLocaleString('fr-FR');
      el.addEventListener('click', e => {
        e.stopPropagation();
        cb.current.onDistrictClick(d);
      });
      const marker = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([d.lng, d.lat]).addTo(map);
      return { d, el, marker, w: 0, h: 0 };
    });
    pillsRef.current = markers;
    markers.forEach(m => m.el.classList.toggle('active', m.d.key === activeKeyRef.current));
    (map as unknown as { __schedulePills?: () => void }).__schedulePills?.();
    return () => {
      markers.forEach(m => m.marker.remove());
      pillsRef.current = [];
    };
  }, [districts, ready]);

  useEffect(() => {
    activeKeyRef.current = activeDistrictKey;
    pillsRef.current.forEach(m => m.el.classList.toggle('active', m.d.key === activeDistrictKey));
    (mapRef.current as unknown as { __schedulePills?: () => void } | null)?.__schedulePills?.();
  }, [activeDistrictKey]);

  // ── Autres annonces localisées ───────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const markers = others.map(o => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'hub-dot';
      el.setAttribute('aria-label', `Voir ce bien : ${o.label}`);
      const tip = document.createElement('span');
      tip.textContent = o.label;
      el.appendChild(tip);
      el.addEventListener('click', e => {
        e.stopPropagation();
        cb.current.onPickListing(o.id);
      });
      return new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([o.lng, o.lat]).addTo(map);
    });
    return () => markers.forEach(m => m.remove());
  }, [others, ready]);

  // ── Position du bien ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!subject) {
      setPoint('pending');
      pointRef.current = null;
      return;
    }
    let alive = true;
    setPoint('pending');
    cb.current.onScene(EMPTY_SCENE);
    resolveCoords(subject).then(p => {
      if (!alive) return;
      setPoint(p);
      if (!p) cb.current.onScene({ ...EMPTY_SCENE, point: null });
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subject?.id]);

  // ── Scène du bien : balise, travelling, immeuble doré, cône de vue ───────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !subject || !point || point === 'pending') return;
    const { lat, lng } = point;
    pointRef.current = point;
    const views = estimateViews(lat, lng);
    const primaryView = views[0] ?? null;
    viewBearingRef.current = primaryView ? primaryView.bearing : 24;

    let cancelled = false;
    let dressed = false;
    let scene: SceneInfo = { point, views, building: null, buildingChecked: false };
    cb.current.onScene(scene);

    const el = document.createElement('div');
    el.className = 'hub-beacon';
    el.innerHTML = `<div class="hub-chip"></div><div class="hub-beam"></div><div class="hub-core"><span></span><span></span><i></i></div>`;
    (el.firstChild as HTMLElement).textContent = subject.priceLabel;
    const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([lng, lat]).addTo(map);

    // Ce qui ne dépend pas des tuiles se pose tout de suite.
    if (point.precision === 'approx') {
      map.addSource('unit-area', { type: 'geojson', data: circlePolygon(lat, lng, 0.45) });
      map.addLayer({ id: 'unit-area-fill', type: 'fill', source: 'unit-area', paint: { 'fill-color': GOLD, 'fill-opacity': 0.1 } });
      map.addLayer({
        id: 'unit-area-line',
        type: 'line',
        source: 'unit-area',
        paint: { 'line-color': GOLD, 'line-opacity': 0.75, 'line-width': 1.4, 'line-dasharray': [2, 2] },
      });
    }
    if (primaryView) {
      map.addSource('view-cone', { type: 'geojson', data: viewCone(lat, lng, primaryView.bearing) });
      map.addLayer(
        { id: 'view-cone-fill', type: 'fill', source: 'view-cone', minzoom: 13, paint: { 'fill-color': '#48cae4', 'fill-opacity': 0.09 } },
        'place-labels'
      );
    }

    const startOrbit = () => {
      if (reduced || cancelled || interactedRef.current || orbitRef.current || flyingRef.current) return;
      let last: number | null = null;
      const spin = (ts: number) => {
        if (cancelled || flyingRef.current) {
          orbitRef.current = null;
          return;
        }
        if (last !== null) map.setBearing(map.getBearing() + (ts - last) * 0.0009 * 60); // ≈ 0,9°/s
        last = ts;
        orbitRef.current = requestAnimationFrame(spin);
      };
      orbitRef.current = requestAnimationFrame(spin);
    };

    /**
     * Dore l'immeuble exact. Ne peut réussir que si les tuiles autour du bien
     * sont chargées à un zoom où le bâti existe : on réessaie à chaque repos
     * de la carte tant que ce n'est pas le cas.
     */
    const dress = () => {
      if (cancelled || dressed) return;
      if (point.precision !== 'exact') {
        dressed = true;
        return;
      }
      if (map.getZoom() < 14.6 || !map.getBounds().contains([lng, lat])) return;
      dressed = true;
      const feats = map.querySourceFeatures('openmaptiles', { sourceLayer: 'building' });
      const isApartment = !/villa|townhouse|maison/i.test(subject.type ?? '');
      const f = pickBuilding(feats, lat, lng, 0.035, { preferTower: isApartment });
      if (f && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon')) {
        const parts = buildingParts(feats, f);
        const polys = parts.flatMap(o =>
          o.geometry.type === 'Polygon' ? [o.geometry.coordinates] : o.geometry.type === 'MultiPolygon' ? o.geometry.coordinates : []
        );
        const geometry = focusPolygon(
          (polys.length > 1 ? { type: 'MultiPolygon', coordinates: polys } : f.geometry) as GeoJSON.Geometry,
          lng,
          lat
        );
        const h = Number(f.properties?.render_height) || 24;
        const polyCount = (g: GeoJSON.Geometry) => (g.type === 'MultiPolygon' ? g.coordinates.length : g.type === 'Polygon' ? 1 : 0);
        if (idIsUniqueTo(feats, parts) && polyCount(geometry as GeoJSON.Geometry) === polys.length) {
          map.setFilter('buildings-3d', buildingsFilterWithout(f.id as number));
        }
        map.setPaintProperty('buildings-3d', 'fill-extrusion-opacity-transition', { duration: reduced ? 0 : 900 });
        map.setPaintProperty('buildings-3d', 'fill-extrusion-opacity', 0.55);
        map.addSource('unit-building', {
          type: 'geojson',
          data: { type: 'Feature', properties: { h }, geometry: inflateGeometry(geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon) as GeoJSON.Geometry },
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
        // L'étage de l'appartement : une tranche claire, un peu plus large que
        // la tour pour rester lisible à travers elle.
        map.addSource('unit-floor', {
          type: 'geojson',
          data: { type: 'Feature', properties: {}, geometry: inflateGeometry(geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon, 1.1) as GeoJSON.Geometry },
        });
        map.addLayer({
          id: 'unit-floor-3d',
          type: 'fill-extrusion',
          source: 'unit-floor',
          paint: { 'fill-extrusion-color': '#fff6cf', 'fill-extrusion-height': 0, 'fill-extrusion-base': 0, 'fill-extrusion-opacity': 1, 'fill-extrusion-vertical-gradient': false },
        });
        // Hauteurs des immeubles voisins (300 m) : situe l'étage dans son environnement.
        const seen = new Set<unknown>();
        const neighbours: number[] = [];
        for (const o of feats) {
          if (o.properties?.hide_3d === true || o.id === f.id || seen.has(o.id)) continue;
          const g = o.geometry;
          const c = g.type === 'Polygon' ? g.coordinates[0]?.[0] : g.type === 'MultiPolygon' ? g.coordinates[0]?.[0]?.[0] : null;
          const oh = Number(o.properties?.render_height);
          if (!c || !(oh > 0)) continue;
          const dx = (c[0] - lng) * 111.32 * Math.cos((lat * Math.PI) / 180);
          const dy = (c[1] - lat) * 110.57;
          if (dx * dx + dy * dy > 0.09) continue;
          seen.add(o.id);
          neighbours.push(oh);
        }
        const info: BuildingInfo = {
          heightM: Math.round(h),
          baseM: Number(f.properties?.render_min_height) || 0,
          floors: floorsFromHeight(h - (Number(f.properties?.render_min_height) || 0)),
          name: typeof f.properties?.name === 'string' ? f.properties.name : undefined,
          neighbours,
        };
        buildingRef.current = info;
        paintFloor();
        applyLevelLook(levelRef.current);
        scene = { ...scene, building: info };
      }
      scene = { ...scene, buildingChecked: true };
      cb.current.onScene(scene);
    };

    let arrived = false;
    const arrive = () => {
      if (arrived || cancelled) return;
      arrived = true;
      cb.current.onArrived();
    };
    const onIdle = () => {
      dress();
      if (dressed && levelForZoom(map.getZoom()) !== 'city' && levelForZoom(map.getZoom()) !== 'district') {
        if (orbitTimerRef.current != null) clearTimeout(orbitTimerRef.current);
        orbitTimerRef.current = window.setTimeout(startOrbit, 900);
      }
    };
    map.on('idle', onIdle);

    // Travelling vers le bien. À la première révélation, on ne déplace pas la
    // caméra d'un visiteur qui explore déjà la carte : le bien apparaît en bas
    // et le niveau « Immeuble » l'y emmène quand il le décide.
    const first = !revealedRef.current;
    revealedRef.current = true;
    if (first && interactedRef.current) {
      arrive();
    } else {
      const pose = cameraFor('building', point, viewBearingRef.current);
      travel(pose, first ? 6200 : 4200);
      if (reduced) arrive();
      else map.once('moveend', arrive);
    }

    return () => {
      cancelled = true;
      stopOrbit();
      map.off('idle', onIdle);
      marker.remove();
      try {
        buildingRef.current = null;
        for (const id of ['unit-floor-3d', 'unit-building-3d', 'unit-area-fill', 'unit-area-line', 'view-cone-fill']) {
          if (map.getLayer(id)) map.removeLayer(id);
        }
        for (const id of ['unit-floor', 'unit-building', 'unit-area', 'view-cone']) {
          if (map.getSource(id)) map.removeSource(id);
        }
        if (map.getLayer('buildings-3d')) {
          map.setFilter('buildings-3d', BUILDINGS_3D_FILTER);
          map.setPaintProperty('buildings-3d', 'fill-extrusion-opacity', 0.88);
        }
      } catch {
        /* carte déjà détruite */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, point, subject?.id]);

  // L'étage choisi : la tranche se déplace dans la tour, et au niveau
  // « appartement » la caméra la suit.
  useEffect(() => {
    paintFloor();
    const map = mapRef.current;
    if (map && levelRef.current === 'unit' && buildingRef.current && floor) {
      stopOrbit();
      aimAt(floorAltitude(), 450);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [floor]);

  return <div ref={containerRef} className="hub-map" aria-label="Carte 3D de Dubaï" />;
});

export default HubMap;
