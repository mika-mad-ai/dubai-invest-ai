import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  CashflowDataPoint,
  ChartDataPoint,
  CostDataPoint,
  Message,
  Property,
  SimulationParams,
  UserProfile,
} from '../../types';
import type { AgentMeta, MatchedListing } from '../../services/agentService';
import { useI18n } from '../../i18n';
import { checkPrice, netYield, EUR_TO_AED, type PriceVerdictCode } from '../../api/lib/priceCheck';
import { DLD_BENCHMARK_AS_OF } from '../../api/lib/dldBenchmarks';
import { haversineKm } from '../map3d/viewAnalysis';
import { buildRationale, matchPercent } from '../AITopPick';
import {
  HUB_LEVELS,
  districtOf,
  districtPoints,
  pricePercentile,
  type DistrictPoint,
  type HubLevel,
} from './zoomLevels';
import type { CameraReadout, HubMapHandle, HubSubject, MapPadding, SceneInfo } from './HubMap';

// MapLibre (~300 kB gz) et les graphiques ne bloquent pas l'affichage de
// l'interface : chacun arrive dans son propre morceau.
const HubMap = lazy(() => import('./HubMap'));
const InvestmentDecisionCharts = lazy(() => import('../charts/InvestmentDecisionCharts'));
const GrowthVisualizer = lazy(() => import('../GrowthVisualizer'));
const FiscalitySimulator = lazy(() => import('../FiscalitySimulator'));
const StrategyComparison = lazy(() => import('../StrategyComparison'));
const CashflowChart = lazy(() => import('../charts/CashflowChart'));
const CostBreakdownChart = lazy(() => import('../charts/CostBreakdownChart'));
const ChatInterface = lazy(() => import('../ChatInterface'));
const MatchedListings = lazy(() => import('../MatchedListings'));

/**
 * Interface de résultats : une seule scène plein écran. La carte 3D de Dubaï
 * est le décor et le moyen de navigation ; les analyses s'affichent par-dessus
 * et changent avec le niveau de zoom (ville → quartier → immeuble →
 * appartement). Un seul bien est listé : le mieux classé pour le profil, qui
 * sort de la carte en bas de l'écran.
 */

export type HubCalc = {
  chartData: ChartDataPoint[];
  cashflowData: CashflowDataPoint[];
  costData: CostDataPoint[];
  propertyPrice: number;
  annualRent: number;
  selectedProperty?: Property;
};

export type ResultsHubProps = {
  profile: UserProfile;
  /** Annonces triées par score décroissant. */
  ranked: Property[];
  featured: Property | null;
  scoreOf: (p: Property) => number;
  onFeature: (p: Property) => void;
  onContact: (p: Property) => void;
  listingsLoading: boolean;
  listingsStatus: string;
  simParams: SimulationParams;
  setSimParams: (p: SimulationParams) => void;
  calc: HubCalc;
  messages: Message[];
  onSendMessage: (text: string) => void;
  isChatLoading: boolean;
  groundingSources: unknown[];
  matchedListings: MatchedListing[];
  advisorMeta: AgentMeta | null;
};

const GOLD = '#D4AF37';
const SQM_TO_SQFT = 10.7639;

const VERDICT: Record<PriceVerdictCode, { text: string; tone: 'good' | 'neutral' | 'warn' | 'bad' | 'mute' }> = {
  well_below: { text: 'Nettement sous la médiane DLD', tone: 'good' },
  below: { text: 'Sous la médiane DLD', tone: 'good' },
  fair: { text: 'Aligné sur la médiane DLD', tone: 'neutral' },
  above: { text: 'Au-dessus de la médiane DLD', tone: 'warn' },
  well_above: { text: 'Surévalué face à la médiane DLD', tone: 'bad' },
  unknown: { text: 'Prix non vérifiable', tone: 'mute' },
};

const OBJECTIVES: Record<string, string> = {
  rental_income: 'Revenus locatifs',
  capital_gains: 'Plus-value',
  secondary_residence: 'Résidence secondaire',
  golden_visa: 'Golden Visa',
  diversification: 'Diversification',
};

const TABS: Record<HubLevel, Array<{ id: string; label: string }>> = {
  city: [
    { id: 'marche', label: 'Marché' },
    { id: 'projection', label: 'Projection' },
    { id: 'fiscalite', label: 'Fiscalité' },
  ],
  district: [
    { id: 'prix', label: 'Prix DLD' },
    { id: 'location', label: 'Location' },
  ],
  building: [{ id: 'immeuble', label: 'Immeuble & vues' }],
  unit: [
    { id: 'bien', label: 'Le bien' },
    { id: 'tresorerie', label: 'Trésorerie' },
    { id: 'frais', label: 'Frais' },
  ],
};

const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(Math.round(n))} %`;
const nf = (n: number) => Math.round(n).toLocaleString('fr-FR');

class MapBoundary extends React.Component<{ onFail: () => void; children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.warn('[hub] carte indisponible', error);
    this.props.onFail();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

const Readout: React.FC<{ feed: React.MutableRefObject<((c: CameraReadout) => void) | null> }> = ({ feed }) => {
  const [camera, setCamera] = useState<CameraReadout | null>(null);
  useEffect(() => {
    feed.current = setCamera;
    return () => {
      feed.current = null;
    };
  }, [feed]);
  return (
    <p className="hub-readout" aria-hidden>
      {camera
        ? `${camera.lat.toFixed(4)}° N · ${camera.lng.toFixed(4)}° E · zoom ${camera.zoom.toFixed(1)} · cap ${Math.round(((camera.bearing % 360) + 360) % 360)}°`
        : 'Zoomez, ou choisissez un niveau'}
    </p>
  );
};

const Loading: React.FC<{ h?: number }> = ({ h = 220 }) => <div className="hub-skel" style={{ height: h }} aria-hidden />;

const Row: React.FC<{ k: string; children: React.ReactNode }> = ({ k, children }) => (
  <div className="hub-row">
    <span className="hub-k">{k}</span>
    <span className="hub-v">{children}</span>
  </div>
);

const ResultsHub: React.FC<ResultsHubProps> = props => {
  const { profile, ranked, featured, scoreOf, onFeature, onContact, simParams, setSimParams, calc } = props;
  const { money, t } = useI18n();
  const mapRef = useRef<HubMapHandle>(null);

  const [level, setLevel] = useState<HubLevel>('city');
  const [scene, setScene] = useState<SceneInfo>({ point: 'pending', views: [], building: null, buildingChecked: false });
  // Le relevé caméra change plusieurs fois par seconde : il vit dans son
  // propre composant pour ne pas re-rendre toute l'interface.
  const readoutRef = useRef<((c: CameraReadout) => void) | null>(null);
  const [arrived, setArrived] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);
  const [focusDistrict, setFocusDistrict] = useState<DistrictPoint | null>(null);
  const [tabs, setTabs] = useState<Record<HubLevel, string>>({ city: 'marche', district: 'prix', building: 'immeuble', unit: 'bien' });

  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 900);
  const [panelOpen, setPanelOpen] = useState(true);
  const [dockOpen, setDockOpen] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 1500);
  const [dockTab, setDockTab] = useState<'chat' | 'selection'>('chat');
  const [sheet, setSheet] = useState<'peek' | 'analyses' | 'advisor'>('peek');

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 899px)');
    const on = () => setIsMobile(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  // ── Données dérivées ─────────────────────────────────────────────────────
  const districts = useMemo(() => districtPoints(), []);
  const propDistrict = useMemo(
    () => (featured ? districtOf(featured.location, featured.type, districts) : null),
    [featured, districts]
  );
  const district = focusDistrict ?? propDistrict;
  const districtIsProperty = !!district && !!propDistrict && district.key === propDistrict.key;

  const price = useMemo(
    () => (featured ? checkPrice(featured.price, featured.sqm, featured.location, null, { beds: featured.beds, type: featured.type }) : null),
    [featured]
  );
  const verdict = price ? VERDICT[price.code] : null;
  const rank = featured ? ranked.findIndex(p => p.id === featured.id) : -1;
  const score = featured ? matchPercent(scoreOf(featured)) : 0;
  const reasons = useMemo(
    () => (featured ? buildRationale(featured, profile, money, t.topPick) : []),
    [featured, profile, money, t]
  );
  const net = featured
    ? netYield({ priceEur: featured.price, grossYieldPct: featured.yield, sqm: featured.sqm, serviceChargesSqft: featured.serviceChargesSqft ?? 15 })
    : null;

  const subject: HubSubject | null = useMemo(
    () =>
      featured
        ? { id: featured.id, title: featured.title, location: featured.location, type: featured.type, lat: featured.lat, lng: featured.lng, priceLabel: money(featured.price) }
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [featured?.id, money]
  );

  const others = useMemo(
    () =>
      ranked
        .filter(p => p.lat && p.lng && p.id !== featured?.id)
        .slice(0, 30)
        .map(p => ({ id: p.id, lat: p.lat as number, lng: p.lng as number, label: `${money(p.price)} · ${p.title}` })),
    [ranked, featured?.id, money]
  );

  // Un nouveau bien repart de son propre quartier et rejoue sa sortie de carte.
  useEffect(() => {
    setFocusDistrict(null);
    setArrived(false);
    if (!featured) return;
    // Filet de sécurité : si la carte ne signale jamais l'arrivée (WebGL absent,
    // tuiles injoignables), le bien s'affiche quand même.
    const timer = window.setTimeout(() => setArrived(true), 9000);
    return () => clearTimeout(timer);
  }, [featured?.id]);

  const located = !!scene.point && scene.point !== 'pending';
  const point = located ? (scene.point as Exclude<SceneInfo['point'], null | 'pending'>) : null;

  const padding: MapPadding = useMemo(
    () =>
      isMobile
        ? { top: 118, right: 0, bottom: 290, left: 0 }
        : { top: 150, right: dockOpen ? 412 : 20, bottom: 210, left: panelOpen ? 462 : 20 },
    [isMobile, dockOpen, panelOpen]
  );

  const goTo = useCallback(
    (l: HubLevel) => {
      if (mapFailed) setLevel(l);
      else mapRef.current?.goTo(l);
    },
    [mapFailed]
  );

  const pickDistrict = useCallback((d: DistrictPoint) => {
    setFocusDistrict(d);
    setTabs(prev => ({ ...prev, district: 'prix' }));
    mapRef.current?.flyToDistrict(d);
  }, []);

  const step = (dir: 1 | -1) => {
    if (rank < 0 || !ranked.length) return;
    onFeature(ranked[(rank + dir + ranked.length) % ranked.length]);
  };

  const tab = tabs[level];
  const setTab = (id: string) => setTabs(prev => ({ ...prev, [level]: id }));
  const levelMeta = HUB_LEVELS.find(l => l.id === level)!;

  // ── Contenu des panneaux, par niveau ─────────────────────────────────────
  const cityBody = () => {
    if (tab === 'projection') {
      return (
        <>
          <p className="hub-lead">Votre patrimoine à Dubaï face au même capital placé en France, année après année.</p>
          <div className="hub-box">
            <div className="hub-between">
              <span className="hub-k">{t.app.s2Slider}</span>
              <b style={{ color: GOLD }}>{simParams.duration} ans</b>
            </div>
            <input
              type="range"
              min={5}
              max={30}
              step={1}
              value={simParams.duration}
              onChange={e => setSimParams({ ...simParams, duration: parseInt(e.target.value) })}
              className="modern-slider slider-gold"
              aria-label="Horizon de projection en années"
            />
          </div>
          <div style={{ height: 340 }}>
            <GrowthVisualizer data={calc.chartData} duration={simParams.duration} />
          </div>
        </>
      );
    }
    if (tab === 'fiscalite') {
      return (
        <>
          <p className="hub-lead">Ce que vous gardez de vos loyers selon votre pays de résidence fiscale.</p>
          <FiscalitySimulator params={simParams} onChange={res => setSimParams({ ...simParams, taxResidence: res })} annualRent={calc.annualRent} />
        </>
      );
    }
    const m = props.advisorMeta?.market;
    return (
      <>
        <div className="hub-chips">
          <span className="hub-tag">Budget {money(parseFloat(profile.totalBudget) || 0)}</span>
          <span className="hub-tag">Horizon {profile.duration} ans</span>
          {profile.objective && OBJECTIVES[profile.objective] && <span className="hub-tag">{OBJECTIVES[profile.objective]}</span>}
        </div>
        {m?.avgPriceSqft ? (
          <Row k="Référence marché (DLD)">
            {nf(m.avgPriceSqft)} AED/sqft{m.volume ? ` · ${nf(m.volume)} transactions` : ''}
          </Row>
        ) : null}
        <p className="hub-lead">
          Chaque étiquette de la carte donne la médiane de revente d’un quartier, en AED par pied carré. Cliquez sur un
          quartier pour y descendre.
        </p>
        <InvestmentDecisionCharts profile={profile} />
      </>
    );
  };

  const districtBody = () => {
    if (tab === 'location') {
      return (
        <>
          <div className="hub-seg" role="group" aria-label="Type de location">
            {(['long_term', 'short_term'] as const).map(s => (
              <button key={s} type="button" className={simParams.strategy === s ? 'on' : ''} onClick={() => setSimParams({ ...simParams, strategy: s })}>
                {s === 'long_term' ? t.app.s3LongTerm : t.app.s3ShortTerm}
              </button>
            ))}
          </div>
          <div className="hub-kpis">
            <div>
              <span className="hub-k">{t.app.s3NetRent}</span>
              <b>{money(calc.annualRent / 12)}</b>
            </div>
            <div>
              <span className="hub-k">{t.app.s3NetYield}</span>
              <b style={{ color: '#6ee7b7' }}>{((calc.annualRent / calc.propertyPrice) * 100).toFixed(2)} %</b>
            </div>
          </div>
          <div style={{ minHeight: 340 }}>
            <StrategyComparison property={calc.selectedProperty} params={simParams} totalBudget={parseFloat(profile.totalBudget || '0')} />
          </div>
        </>
      );
    }
    if (!district) {
      return <p className="hub-lead">Quartier non reconnu dans la grille DLD. Cliquez sur une étiquette de la carte pour voir ses prix.</p>;
    }
    const pct = pricePercentile(district, districts);
    const eurM2 = (district.aedSqft * SQM_TO_SQFT) / EUR_TO_AED;
    const byPrice = [...districts].sort((a, b) => a.aedSqft - b.aedSqft);
    const idx = byPrice.findIndex(d => d.key === district.key);
    const from = Math.max(0, Math.min(byPrice.length - 7, idx - 3));
    const around = byPrice.slice(from, from + 7);
    const max = Math.max(...around.map(d => d.aedSqft));
    return (
      <>
        <div className="hub-kpis">
          <div>
            <span className="hub-k">Médiane de revente</span>
            <b>{nf(district.aedSqft)} AED/sqft</b>
            <small>≈ {money(eurM2)} / m²</small>
          </div>
          <div>
            <span className="hub-k">Transactions, 12 mois</span>
            <b>{nf(district.volume12m)}</b>
            <small>{district.volume12m < 100 ? 'échantillon mince' : 'marché liquide'}</small>
          </div>
        </div>
        <Row k="Niveau de prix">
          {pct >= 50 ? `plus cher que ${pct} % des quartiers suivis` : `moins cher que ${100 - pct} % des quartiers suivis`}
        </Row>
        <div className="hub-bars" aria-label="Quartiers de prix voisin">
          {around.map(d => (
            <button key={d.key} type="button" className={d.key === district.key ? 'on' : ''} onClick={() => pickDistrict(d)}>
              <span>{d.label}</span>
              <i>
                <em style={{ width: `${(d.aedSqft / max) * 100}%` }} />
              </i>
              <b>{nf(d.aedSqft)}</b>
            </button>
          ))}
        </div>
        {districtIsProperty && featured && price?.askingAedSqft && price.benchmarkAedSqft && price.deltaPct != null && verdict && (
          <div className={`hub-verdict ${verdict.tone}`}>
            <b>
              {verdict.text} · {signed(price.deltaPct)}
            </b>
            <span>
              Le bien est demandé {nf(price.askingAedSqft)} AED/sqft, pour une médiane de {nf(price.benchmarkAedSqft)} à nombre de
              chambres égal.
            </span>
          </div>
        )}
        {!districtIsProperty && propDistrict && (
          <button type="button" className="hub-link" onClick={() => pickDistrict(propDistrict)}>
            ← Revenir au quartier du bien ({propDistrict.label})
          </button>
        )}
        <p className="hub-src">
          Zone DLD « {district.zone} » · médiane revente appartements, 12 mois, au {DLD_BENCHMARK_AS_OF}.
        </p>
      </>
    );
  };

  const buildingBody = () => {
    if (!featured) return <p className="hub-lead">Aucun bien sélectionné pour l’instant.</p>;
    if (!point) return <p className="hub-lead">{scene.point === null ? 'Impossible de localiser cette annonce avec les sources publiques (OpenStreetMap).' : 'Localisation de l’immeuble…'}</p>;
    const sea = scene.views.find(v => v.kind === 'sea');
    const marks: Array<[string, number]> = [
      ['Burj Khalifa', haversineKm(point.lat, point.lng, 25.1972, 55.2744)],
      ['Aéroport DXB', haversineKm(point.lat, point.lng, 25.2532, 55.3657)],
    ];
    return (
      <>
        {point.precision === 'approx' && (
          <p className="hub-note">Immeuble non identifié dans OpenStreetMap : position au centre du quartier, à affiner avec l’annonce source.</p>
        )}
        {point.precision === 'exact' && scene.buildingChecked && !scene.building && (
          <p className="hub-note">Adresse localisée, mais la tour n’est pas encore dessinée dans OpenStreetMap (souvent un immeuble récent) : hauteur et étages indisponibles.</p>
        )}
        {scene.building && (
          <Row k="Tour (OpenStreetMap)">
            ≈ {scene.building.heightM} m · ~{scene.building.floors} étages
          </Row>
        )}
        {scene.views.length > 0 && (
          <>
            <p className="hub-eyebrow">Vues selon étage et orientation</p>
            <div className="hub-chips">
              {scene.views.map(v => (
                <span key={v.label} className={`hub-view ${v.likelihood}`}>
                  {v.label}
                  <em>
                    {v.direction} · {v.distanceKm} km{v.likelihood === 'possible' ? ' · possible' : ''}
                  </em>
                </span>
              ))}
            </div>
            <p className="hub-src">Le faisceau bleu sur la carte pointe vers la vue la plus probable.</p>
          </>
        )}
        <p className="hub-eyebrow">Distances</p>
        {marks.map(([label, km]) => (
          <Row key={label} k={label}>
            {km < 10 ? km.toFixed(1) : Math.round(km)} km
          </Row>
        ))}
        {sea && (
          <Row k="Mer">
            {sea.distanceKm} km ({sea.direction})
          </Row>
        )}
        <p className="hub-src">Bâti et hauteurs : OpenStreetMap. Les vues sont estimées, jamais garanties.</p>
      </>
    );
  };

  const unitBody = () => {
    if (!featured) return <p className="hub-lead">Aucun bien sélectionné pour l’instant.</p>;
    if (tab === 'tresorerie') {
      return (
        <>
          <div className="hub-kpis">
            <div>
              <span className="hub-k">{t.app.s3NetRent}</span>
              <b>{money(calc.annualRent / 12)}</b>
            </div>
            <div>
              <span className="hub-k">{t.app.s3NetYield}</span>
              <b style={{ color: '#6ee7b7' }}>{((calc.annualRent / calc.propertyPrice) * 100).toFixed(2)} %</b>
            </div>
          </div>
          <div style={{ height: 360 }}>
            <CashflowChart data={calc.cashflowData} />
          </div>
        </>
      );
    }
    if (tab === 'frais') {
      return (
        <>
          <CostBreakdownChart data={calc.costData} />
          <div className="hub-box">
            <b>{t.app.s4DldTitle}</b>
            <p className="hub-src" style={{ marginTop: 4 }}>{t.app.s4DldDesc}</p>
          </div>
        </>
      );
    }
    const eurM2 = featured.sqm ? featured.price / featured.sqm : null;
    return (
      <>
        {verdict && price && (
          <div className={`hub-verdict ${verdict.tone}`}>
            <b>
              {verdict.text}
              {price.deltaPct != null ? ` · ${signed(price.deltaPct)}` : ''}
            </b>
            {price.askingAedSqft && price.benchmarkAedSqft ? (
              <span>
                Demandé {nf(price.askingAedSqft)} AED/sqft · médiane {nf(price.benchmarkAedSqft)} ({price.zone ?? 'Dubaï'}, au {price.asOf})
              </span>
            ) : null}
          </div>
        )}
        <Row k="Prix demandé">{money(featured.price)}</Row>
        <Row k="Surface">{featured.sqm ? `${featured.sqm} m²` : '—'}{eurM2 ? ` · ${money(eurM2)} / m²` : ''}</Row>
        <Row k="Chambres">{featured.beds === 0 ? 'Studio' : featured.beds}</Row>
        <Row k="Rendement brut annoncé">{featured.yield} %</Row>
        {net != null && <Row k="Rendement net estimé">{net} %</Row>}
        <Row k="Livraison">{featured.completion || '—'}</Row>
        <p className="hub-eyebrow">Adéquation à votre profil : {score} / 100</p>
        {reasons.length > 0 && (
          <ul className="hub-why">
            {reasons.map(r => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        )}
        <div className="hub-actions">
          <button type="button" className="hub-btn gold" onClick={() => onContact(featured)}>
            Être contacté pour ce bien
          </button>
          {featured.sourceUrl && (
            <a className="hub-btn" href={featured.sourceUrl} target="_blank" rel="noopener noreferrer">
              Annonce source ↗
            </a>
          )}
        </div>
        <p className="hub-src">Rendement net : après charges de copropriété, vacance et gestion locative.</p>
      </>
    );
  };

  const panelTitle =
    level === 'city'
      ? 'Dubaï'
      : level === 'district'
        ? district?.label ?? 'Quartier'
        : level === 'building'
          ? scene.building?.name ?? featured?.title ?? 'Immeuble'
          : featured?.title ?? 'Appartement';

  const panel = (
    <>
      <header className="hub-head">
        <p className="hub-eyebrow" style={{ margin: 0 }}>
          Niveau {HUB_LEVELS.findIndex(l => l.id === level) + 1} / 4 · {levelMeta.label}
        </p>
        <h2>{panelTitle}</h2>
        <p className="hub-hint">{levelMeta.hint}</p>
        {TABS[level].length > 1 && (
          <div className="hub-tabs" role="tablist">
            {TABS[level].map(x => (
              <button key={x.id} type="button" role="tab" aria-selected={tab === x.id} className={tab === x.id ? 'on' : ''} onClick={() => setTab(x.id)}>
                {x.label}
              </button>
            ))}
          </div>
        )}
      </header>
      <div className="hub-body" key={`${level}-${tab}`}>
        <Suspense fallback={<Loading />}>
          {level === 'city' ? cityBody() : level === 'district' ? districtBody() : level === 'building' ? buildingBody() : unitBody()}
        </Suspense>
      </div>
    </>
  );

  const advisor = (
    <>
      <div className="hub-tabs dock" role="tablist">
        <button type="button" role="tab" aria-selected={dockTab === 'chat'} className={dockTab === 'chat' ? 'on' : ''} onClick={() => setDockTab('chat')}>
          Conseiller
        </button>
        <button type="button" role="tab" aria-selected={dockTab === 'selection'} className={dockTab === 'selection' ? 'on' : ''} onClick={() => setDockTab('selection')}>
          Sa sélection{props.matchedListings.length ? ` (${props.matchedListings.length})` : ''}
        </button>
      </div>
      <div className="hub-dock-body">
        <Suspense fallback={<Loading h={320} />}>
          {dockTab === 'chat' ? (
            <ChatInterface
              messages={props.messages}
              onSendMessage={props.onSendMessage}
              isStreaming={props.isChatLoading}
              groundingSources={props.groundingSources as never}
            />
          ) : (
            <div className="hub-scroll">
              <MatchedListings
                listings={props.matchedListings}
                market={props.advisorMeta?.market}
                advisorName={props.advisorMeta?.advisor?.name}
                isLoading={props.isChatLoading}
              />
              {!props.isChatLoading && !props.matchedListings.length && (
                <p className="hub-lead">Le conseiller n’a pas encore retenu de biens pour ce dossier.</p>
              )}
            </div>
          )}
        </Suspense>
      </div>
    </>
  );

  // ── Le bien, sorti de la carte ───────────────────────────────────────────
  const card = featured ? (
    <article className={`hub-card ${arrived ? 'in' : ''}`} aria-label="Bien le plus pertinent pour votre profil">
      <span className="hub-stem" aria-hidden />
      <div className="hub-photo">
        {featured.image ? <img src={featured.image} alt="" loading="lazy" onError={e => ((e.currentTarget.style.display = 'none'))} /> : null}
        <span className="hub-score">{score}</span>
      </div>
      <div className="hub-card-main">
        <p className="hub-eyebrow" style={{ margin: 0 }}>
          {rank === 0 ? 'N° 1 pour votre profil' : `Choix n° ${rank + 1}`} · {ranked.length} biens analysés
        </p>
        <h3>{featured.title}</h3>
        <p className="hub-loc">{featured.location}</p>
        <div className="hub-facts">
          <b>{money(featured.price)}</b>
          <span>{featured.yield} % brut</span>
          <span>{featured.beds === 0 ? 'Studio' : `${featured.beds} ch.`}</span>
          {featured.sqm ? <span>{featured.sqm} m²</span> : null}
          {verdict && price?.deltaPct != null && <span className={`hub-badge ${verdict.tone}`}>{signed(price.deltaPct)} vs DLD</span>}
        </div>
        <div className="hub-card-actions">
          <button type="button" className="hub-btn gold" onClick={() => goTo('unit')} disabled={!located && !mapFailed}>
            Voir sur la carte
          </button>
          <button type="button" className="hub-btn" onClick={() => onContact(featured)}>
            Être contacté
          </button>
          {ranked.length > 1 && (
            <span className="hub-pager">
              <button type="button" onClick={() => step(-1)} aria-label="Bien précédent">‹</button>
              <em>
                {rank + 1} / {ranked.length}
              </em>
              <button type="button" onClick={() => step(1)} aria-label="Bien suivant">›</button>
            </span>
          )}
        </div>
      </div>
    </article>
  ) : (
    <div className="hub-card in empty" role="status">
      {props.listingsLoading ? (
        <>
          <span className="hub-radar" aria-hidden />
          <p>Collecte des annonces en direct et classement pour votre profil…</p>
        </>
      ) : (
        <p>{props.listingsStatus || t.app.s6Empty}</p>
      )}
    </div>
  );

  const stepper = (
    <nav className="hub-stepper" aria-label="Niveau d’analyse">
      {HUB_LEVELS.map((l, i) => {
        const disabled = l.id !== 'city' && !located && !mapFailed;
        return (
          <button
            key={l.id}
            type="button"
            className={level === l.id ? 'on' : ''}
            aria-current={level === l.id ? 'step' : undefined}
            disabled={disabled}
            onClick={() => goTo(l.id)}
          >
            <i>{i + 1}</i>
            {l.label}
          </button>
        );
      })}
      {!mapFailed && (
        <span className="hub-zoom">
          <button type="button" onClick={() => mapRef.current?.zoomBy(-1)} aria-label="Dézoomer">−</button>
          <button type="button" onClick={() => mapRef.current?.zoomBy(1)} aria-label="Zoomer">+</button>
        </span>
      )}
    </nav>
  );

  return (
    <section className={`hub-stage ${isMobile ? 'mobile' : 'desktop'}`} data-level={level} aria-label="Votre analyse sur la carte de Dubaï">
      {!mapFailed ? (
        <MapBoundary onFail={() => setMapFailed(true)}>
          <Suspense fallback={<div className="hub-map hub-wait"><span className="hub-radar" aria-hidden /></div>}>
            <HubMap
              ref={mapRef}
              subject={subject}
              districts={districts}
              activeDistrictKey={district?.key}
              others={others}
              padding={padding}
              onLevel={setLevel}
              onScene={setScene}
              onCamera={c => readoutRef.current?.(c)}
              onDistrictClick={pickDistrict}
              onPickListing={id => {
                const p = ranked.find(x => x.id === id);
                if (p) onFeature(p);
              }}
              onArrived={() => setArrived(true)}
            />
          </Suspense>
        </MapBoundary>
      ) : (
        <div className="hub-map hub-wait">
          <p>La carte 3D n’a pas pu démarrer (connexion ou carte graphique non prise en charge). Les analyses restent accessibles par niveau.</p>
        </div>
      )}
      <div className="hub-vignette" aria-hidden />

      <div className="hub-free" style={isMobile ? undefined : { left: padding.left, right: padding.right }}>
        <div className="hub-top">
          {stepper}
          <Readout feed={readoutRef} />
        </div>
        {!isMobile && card}
      </div>

      {!isMobile && (
        <>
          {panelOpen ? (
            <aside className="hub-panel" aria-label="Analyses du niveau courant">
              <button type="button" className="hub-fold" onClick={() => setPanelOpen(false)} aria-label="Masquer les analyses">‹</button>
              {panel}
            </aside>
          ) : (
            <button type="button" className="hub-reopen left" onClick={() => setPanelOpen(true)}>
              Analyses ›
            </button>
          )}
          {dockOpen ? (
            <aside className="hub-dock" aria-label="Votre conseiller">
              <button type="button" className="hub-fold right" onClick={() => setDockOpen(false)} aria-label="Masquer le conseiller">›</button>
              {advisor}
            </aside>
          ) : (
            <button type="button" className="hub-reopen right" onClick={() => setDockOpen(true)}>
              ‹ Conseiller{props.isChatLoading ? ' …' : ''}
            </button>
          )}
        </>
      )}

      {isMobile && (
        <div className={`hub-sheet ${sheet}`}>
          <div className="hub-sheet-bar">
            <button type="button" className={sheet === 'analyses' ? 'on' : ''} onClick={() => setSheet(sheet === 'analyses' ? 'peek' : 'analyses')}>
              Analyses · {levelMeta.label}
            </button>
            <button type="button" className={sheet === 'advisor' ? 'on' : ''} onClick={() => setSheet(sheet === 'advisor' ? 'peek' : 'advisor')}>
              Conseiller
            </button>
          </div>
          {sheet === 'peek' && card}
          {sheet === 'analyses' && <div className="hub-sheet-body">{panel}</div>}
          {sheet === 'advisor' && <div className="hub-sheet-body advisor">{advisor}</div>}
        </div>
      )}

      <style>{HUB_CSS}</style>
    </section>
  );
};

const sans = '"Manrope",sans-serif';
const display = '"Sora",sans-serif';
const mono = 'ui-monospace,"SF Mono",Menlo,monospace';
const IVORY = '#f0ebe0';

const HUB_CSS = `
.hub-stage { position: relative; height: 100dvh; min-height: 640px; overflow: hidden; background: #0a1020; color: ${IVORY}; font-family: ${sans}; isolation: isolate; }
.hub-map { position: absolute; inset: 0; }
.hub-wait { display: flex; align-items: center; justify-content: center; padding: 24px; text-align: center; }
.hub-wait p { max-width: 380px; font-size: 0.85rem; line-height: 1.6; color: rgba(240,235,224,0.78); }
.hub-vignette { position: absolute; inset: 0; pointer-events: none; z-index: 1;
  background: linear-gradient(to bottom, rgba(5,8,16,0.9) 0, rgba(5,8,16,0.35) 130px, transparent 230px),
              linear-gradient(to top, rgba(5,8,16,0.75) 0, transparent 240px),
              radial-gradient(ellipse at center, transparent 55%, rgba(5,8,16,0.55) 100%); }

.hub-free { position: absolute; top: 0; bottom: 0; left: 0; right: 0; z-index: 3; pointer-events: none; display: flex; flex-direction: column; align-items: center; justify-content: space-between; padding: 84px 12px 22px; transition: left 0.35s ease, right 0.35s ease; }
.hub-free > * { pointer-events: auto; }
.hub-top { display: flex; flex-direction: column; align-items: center; gap: 8px; max-width: 100%; }

.hub-stepper { display: flex; align-items: center; gap: 4px; padding: 5px; border-radius: 999px; background: rgba(10,16,32,0.82); border: 1px solid rgba(255,255,255,0.1); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); max-width: 100%; overflow-x: auto; scrollbar-width: none; }
.hub-stepper::-webkit-scrollbar { display: none; }
.hub-stepper button { display: inline-flex; align-items: center; gap: 7px; padding: 8px 14px 8px 8px; border: 0; border-radius: 999px; background: transparent; color: rgba(240,235,224,0.72); font: 700 0.74rem ${sans}; letter-spacing: 0.02em; white-space: nowrap; cursor: pointer; transition: background 0.25s, color 0.25s; }
.hub-stepper button i { display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; border-radius: 50%; border: 1px solid rgba(240,235,224,0.3); font: 700 0.62rem ${mono}; font-style: normal; }
.hub-stepper button:hover:not(:disabled) { color: ${IVORY}; background: rgba(255,255,255,0.06); }
.hub-stepper button.on { background: ${GOLD}; color: #0a1020; }
.hub-stepper button.on i { border-color: rgba(10,16,32,0.5); }
.hub-stepper button:disabled { opacity: 0.38; cursor: default; }
.hub-zoom { display: inline-flex; margin-left: 4px; padding-left: 6px; border-left: 1px solid rgba(255,255,255,0.12); }
.hub-zoom button { padding: 8px 10px; font-size: 0.95rem; line-height: 1; }
.hub-readout { margin: 0; font: 500 0.62rem ${mono}; letter-spacing: 0.06em; color: rgba(240,235,224,0.62); text-shadow: 0 1px 6px #050810; }

.hub-panel, .hub-dock { position: absolute; top: 84px; bottom: 22px; z-index: 4; display: flex; flex-direction: column; border-radius: 20px; background: rgba(9,14,28,0.86); border: 1px solid rgba(255,255,255,0.09); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); box-shadow: 0 24px 70px rgba(0,0,0,0.55); animation: hub-in 0.5s cubic-bezier(0.16,1,0.3,1) both; }
.hub-panel { left: 16px; width: 430px; }
.hub-dock { right: 16px; width: 380px; }
.hub-panel::before, .hub-dock::before { content: ''; position: absolute; top: -1px; left: 22px; width: 64px; height: 2px; background: ${GOLD}; border-radius: 2px; }
.hub-fold { position: absolute; top: 14px; right: 12px; z-index: 2; width: 28px; height: 28px; border-radius: 50%; border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.04); color: rgba(240,235,224,0.75); font-size: 1rem; line-height: 1; cursor: pointer; }
.hub-fold:hover { color: ${IVORY}; border-color: rgba(212,175,55,0.5); }
.hub-reopen { position: absolute; top: 84px; z-index: 4; padding: 10px 14px; border-radius: 999px; border: 1px solid rgba(212,175,55,0.4); background: rgba(10,16,32,0.86); color: ${GOLD}; font: 700 0.72rem ${sans}; cursor: pointer; backdrop-filter: blur(12px); }
.hub-reopen.left { left: 16px; }
.hub-reopen.right { right: 16px; }

.hub-head { padding: 18px 48px 0 20px; }
.hub-head h2 { margin: 4px 0 0; font: 700 1.3rem/1.25 ${display}; color: ${IVORY}; overflow-wrap: anywhere; }
.hub-hint { margin: 4px 0 0; font-size: 0.74rem; color: rgba(240,235,224,0.66); }
.hub-eyebrow { margin: 16px 0 6px; font: 800 0.6rem ${sans}; letter-spacing: 0.14em; text-transform: uppercase; color: ${GOLD}; }
.hub-tabs { display: flex; gap: 4px; margin: 14px -28px 0 0; padding: 3px; border-radius: 12px; background: rgba(255,255,255,0.045); }
.hub-tabs button { flex: 1; padding: 8px 6px; border: 0; border-radius: 9px; background: transparent; color: rgba(240,235,224,0.7); font: 700 0.72rem ${sans}; cursor: pointer; white-space: nowrap; }
.hub-tabs button.on { background: rgba(212,175,55,0.16); color: ${GOLD}; box-shadow: inset 0 0 0 1px rgba(212,175,55,0.35); }
.hub-tabs.dock { margin: 14px 48px 0 14px; }
.hub-body { flex: 1; min-height: 0; overflow-y: auto; padding: 14px 20px 20px; animation: hub-fade 0.45s ease both; scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.15) transparent; }
.hub-body > * + * { margin-top: 12px; }
/* Les composants d'analyse ont été conçus pour une page large : dans le
   panneau, leurs grilles passent sur une colonne. */
.hub-body [class*="grid-cols-"] { grid-template-columns: minmax(0, 1fr) !important; }
.hub-dock-body { flex: 1; min-height: 0; padding: 12px; display: flex; flex-direction: column; }
.hub-dock-body > * { flex: 1; min-height: 0; }
.hub-scroll { overflow-y: auto; }

.hub-lead { margin: 0; font-size: 0.8rem; line-height: 1.6; color: rgba(240,235,224,0.78); }
.hub-src { margin: 0; font-size: 0.66rem; line-height: 1.6; color: rgba(240,235,224,0.6); }
.hub-note { margin: 0; padding: 7px 10px; border-radius: 9px; font-size: 0.7rem; line-height: 1.5; color: rgba(251,191,36,0.9); background: rgba(251,191,36,0.08); border: 1px solid rgba(251,191,36,0.22); }
.hub-row { display: flex; justify-content: space-between; gap: 12px; padding: 7px 0; border-bottom: 1px solid rgba(255,255,255,0.06); margin-top: 0 !important; }
.hub-k { font-size: 0.72rem; color: rgba(240,235,224,0.66); }
.hub-v { font-size: 0.76rem; font-weight: 700; color: ${IVORY}; text-align: right; }
.hub-between { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; margin-bottom: 10px; }
.hub-box { padding: 12px 14px; border-radius: 14px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.07); font-size: 0.78rem; }
.hub-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.hub-tag { padding: 5px 10px; border-radius: 999px; font-size: 0.68rem; font-weight: 700; color: rgba(240,235,224,0.85); background: rgba(255,255,255,0.055); border: 1px solid rgba(255,255,255,0.1); }
.hub-view { display: inline-flex; flex-direction: column; gap: 1px; padding: 6px 10px; border-radius: 10px; font-size: 0.7rem; font-weight: 700; }
.hub-view em { font-style: normal; font-weight: 600; font-size: 0.62rem; opacity: 0.75; }
.hub-view.probable { color: ${GOLD}; background: rgba(212,175,55,0.1); border: 1px solid rgba(212,175,55,0.3); }
.hub-view.possible { color: rgba(240,235,224,0.8); background: rgba(255,255,255,0.045); border: 1px solid rgba(255,255,255,0.1); }
.hub-kpis { display: grid; grid-template-columns: 1fr 1fr !important; gap: 10px; }
.hub-kpis > div { display: flex; flex-direction: column; gap: 3px; padding: 12px; border-radius: 14px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.07); }
.hub-kpis b { font: 700 1.05rem ${display}; color: ${IVORY}; }
.hub-kpis small { font-size: 0.64rem; color: rgba(240,235,224,0.6); }
.hub-seg { display: flex; gap: 4px; padding: 3px; border-radius: 12px; background: rgba(255,255,255,0.045); }
.hub-seg button { flex: 1; padding: 9px 6px; border: 0; border-radius: 9px; background: transparent; color: rgba(240,235,224,0.7); font: 700 0.72rem ${sans}; cursor: pointer; }
.hub-seg button.on { background: rgba(212,175,55,0.16); color: ${GOLD}; }
.hub-bars { display: flex; flex-direction: column; gap: 2px; }
.hub-bars button { display: grid; grid-template-columns: 108px 1fr 44px !important; align-items: center; gap: 8px; padding: 5px 6px; border: 0; border-radius: 8px; background: transparent; color: rgba(240,235,224,0.72); font: 600 0.68rem ${sans}; text-align: left; cursor: pointer; }
.hub-bars button:hover { background: rgba(255,255,255,0.05); }
.hub-bars span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hub-bars i { height: 6px; border-radius: 3px; background: rgba(255,255,255,0.07); overflow: hidden; }
.hub-bars em { display: block; height: 100%; border-radius: 3px; background: rgba(125,211,232,0.55); }
.hub-bars b { font: 600 0.66rem ${mono}; text-align: right; }
.hub-bars button.on { color: ${GOLD}; }
.hub-bars button.on em { background: ${GOLD}; }
.hub-verdict { display: flex; flex-direction: column; gap: 4px; padding: 11px 13px; border-radius: 14px; font-size: 0.72rem; line-height: 1.5; border: 1px solid; }
.hub-verdict b { font-size: 0.8rem; }
.hub-verdict span { color: rgba(240,235,224,0.75); }
.hub-verdict.good, .hub-badge.good { color: #6ee7b7; background: rgba(16,185,129,0.1); border-color: rgba(16,185,129,0.35); }
.hub-verdict.neutral, .hub-badge.neutral { color: ${IVORY}; background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.14); }
.hub-verdict.warn, .hub-badge.warn { color: #fcd34d; background: rgba(251,191,36,0.09); border-color: rgba(251,191,36,0.32); }
.hub-verdict.bad, .hub-badge.bad { color: #fca5a5; background: rgba(239,68,68,0.1); border-color: rgba(239,68,68,0.35); }
.hub-verdict.mute, .hub-badge.mute { color: rgba(240,235,224,0.7); background: rgba(255,255,255,0.04); border-color: rgba(255,255,255,0.1); }
.hub-why { margin: 0; padding: 0 0 0 16px; font-size: 0.76rem; line-height: 1.6; color: rgba(240,235,224,0.82); }
.hub-link { padding: 0; border: 0; background: none; color: ${GOLD}; font: 700 0.72rem ${sans}; cursor: pointer; text-align: left; }
.hub-actions, .hub-card-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.hub-btn { display: inline-flex; align-items: center; justify-content: center; padding: 9px 14px; border-radius: 999px; border: 1px solid rgba(255,255,255,0.16); background: rgba(255,255,255,0.05); color: ${IVORY}; font: 700 0.72rem ${sans}; text-decoration: none; cursor: pointer; white-space: nowrap; transition: border-color 0.2s, background 0.2s; }
.hub-btn:hover:not(:disabled) { border-color: rgba(212,175,55,0.55); }
.hub-btn.gold { background: ${GOLD}; border-color: ${GOLD}; color: #0a1020; }
.hub-btn:disabled { opacity: 0.45; cursor: default; }
.hub-skel { border-radius: 14px; background: linear-gradient(90deg, rgba(255,255,255,0.03), rgba(255,255,255,0.07), rgba(255,255,255,0.03)); background-size: 200% 100%; animation: hub-shine 1.4s linear infinite; }

/* Le bien sort de la carte : tige dorée depuis la balise, puis la fiche. */
.hub-card { position: relative; display: flex; gap: 14px; width: min(640px, 100%); padding: 12px; border-radius: 20px; background: rgba(9,14,28,0.9); border: 1px solid rgba(212,175,55,0.32); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); box-shadow: 0 24px 70px rgba(0,0,0,0.6), 0 0 0 1px rgba(212,175,55,0.06); opacity: 0; transform: translateY(-46px) scale(0.86); transform-origin: 50% 0; transition: opacity 0.6s ease, transform 0.9s cubic-bezier(0.16,1,0.3,1); }
.hub-card.in { opacity: 1; transform: none; }
.hub-stem { position: absolute; left: 50%; bottom: 100%; width: 2px; height: 0; background: linear-gradient(to bottom, rgba(212,175,55,0), ${GOLD}); transition: height 0.7s ease 0.15s; }
.hub-card.in .hub-stem { height: 54px; }
.hub-card.empty { align-items: center; justify-content: center; gap: 12px; padding: 18px 22px; border-color: rgba(255,255,255,0.1); font-size: 0.8rem; color: rgba(240,235,224,0.78); }
.hub-card.empty p { margin: 0; }
.hub-photo { position: relative; flex: 0 0 132px; height: 132px; border-radius: 14px; overflow: hidden; background: linear-gradient(135deg, #1a2b55, #0d1527 60%, #2a2110); }
.hub-photo img { width: 100%; height: 100%; object-fit: cover; }
.hub-score { position: absolute; left: 8px; top: 8px; min-width: 34px; padding: 4px 7px; border-radius: 999px; background: ${GOLD}; color: #0a1020; font: 800 0.74rem ${mono}; text-align: center; }
.hub-card-main { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 4px; }
.hub-card-main h3 { margin: 2px 0 0; font: 700 1rem/1.25 ${display}; color: ${IVORY}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hub-loc { margin: 0; font-size: 0.72rem; color: rgba(240,235,224,0.66); }
.hub-facts { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; margin: 4px 0 6px; font-size: 0.74rem; color: rgba(240,235,224,0.8); }
.hub-facts b { font: 700 0.98rem ${display}; color: ${GOLD}; }
.hub-badge { padding: 3px 8px; border-radius: 999px; border: 1px solid; font-size: 0.66rem; font-weight: 800; }
.hub-pager { display: inline-flex; align-items: center; gap: 6px; margin-left: auto; font: 600 0.66rem ${mono}; color: rgba(240,235,224,0.7); }
.hub-pager em { font-style: normal; }
.hub-pager button { width: 28px; height: 28px; border-radius: 50%; border: 1px solid rgba(255,255,255,0.16); background: rgba(255,255,255,0.05); color: ${IVORY}; font-size: 1rem; line-height: 1; cursor: pointer; }
.hub-pager button:hover { border-color: rgba(212,175,55,0.55); }

.hub-radar { display: inline-block; flex: 0 0 auto; width: 34px; height: 34px; border-radius: 50%; border: 1px solid rgba(212,175,55,0.35); position: relative; overflow: hidden; }
.hub-radar::after { content: ''; position: absolute; inset: 0; background: conic-gradient(from 0deg, rgba(212,175,55,0.55), transparent 110deg); animation: hub-sweep 1.6s linear infinite; }

/* Marqueurs posés dans la carte */
.hub-pill { display: inline-flex; align-items: center; gap: 7px; padding: 4px 9px 4px 10px; border-radius: 999px; border: 1px solid rgba(255,255,255,0.14); background: rgba(10,16,32,0.84); color: ${IVORY}; font: 700 0.66rem ${sans}; white-space: nowrap; cursor: pointer; transition: opacity 0.3s, border-color 0.2s, background 0.2s; backdrop-filter: blur(6px); }
.hub-pill b { font-weight: 700; }
.hub-pill i { font: 600 0.62rem ${mono}; font-style: normal; color: #7dd3e8; }
.hub-pill:hover { border-color: rgba(212,175,55,0.6); z-index: 2; }
.hub-pill.active { background: ${GOLD}; border-color: ${GOLD}; color: #0a1020; z-index: 1; }
.hub-pill.active i { color: #0a1020; }
/* MapLibre écrit une opacité en ligne sur ses marqueurs : !important obligatoire pour les masquer. */
.hub-pill.off { opacity: 0 !important; pointer-events: none; }
.hub-dot { position: relative; width: 12px; height: 12px; padding: 0; border-radius: 50%; border: 2px solid #0a1020; background: #7dd3e8; cursor: pointer; transition: opacity 0.3s, transform 0.2s; }
.hub-stage[data-level="city"] .hub-dot { opacity: 0 !important; pointer-events: none; }
.hub-dot:hover { transform: scale(1.35); z-index: 3; }
.hub-dot span { position: absolute; left: 50%; bottom: 150%; transform: translateX(-50%); padding: 4px 8px; border-radius: 8px; background: rgba(10,16,32,0.94); border: 1px solid rgba(255,255,255,0.12); color: ${IVORY}; font: 600 0.64rem ${sans}; white-space: nowrap; max-width: 240px; overflow: hidden; text-overflow: ellipsis; opacity: 0; pointer-events: none; transition: opacity 0.2s; }
.hub-dot:hover span, .hub-dot:focus-visible span { opacity: 1; }
.hub-beacon { display: flex; flex-direction: column; align-items: center; pointer-events: none; }
.hub-chip { font: 700 0.72rem ${display}; color: #0a1020; background: ${GOLD}; padding: 3px 9px; border-radius: 999px; white-space: nowrap; box-shadow: 0 2px 14px rgba(212,175,55,0.45); margin-bottom: 4px; }
.hub-beam { width: 2px; height: 46px; background: linear-gradient(to bottom, rgba(212,175,55,0), rgba(212,175,55,0.9)); }
.hub-core { position: relative; width: 14px; height: 14px; }
.hub-core i { position: absolute; inset: 3px; border-radius: 50%; background: ${GOLD}; box-shadow: 0 0 12px rgba(212,175,55,0.9); }
.hub-core span { position: absolute; inset: 0; border-radius: 50%; border: 1.5px solid rgba(212,175,55,0.8); animation: hub-pulse 2.4s cubic-bezier(0.16,1,0.3,1) infinite; }
.hub-core span:nth-child(2) { animation-delay: 1.2s; }
.hub-stage .maplibregl-ctrl-attrib { background: rgba(10,16,32,0.72); font-family: ${sans}; }
.hub-stage .maplibregl-ctrl-attrib a { color: rgba(240,235,224,0.6); }
.hub-stage .maplibregl-ctrl-bottom-right { z-index: 5; }

/* Mobile : la carte en plein écran, le reste dans un tiroir bas. */
.hub-stage.mobile .hub-free { padding: 64px 8px 0; justify-content: flex-start; }
.hub-stage.mobile .hub-stepper { gap: 2px; padding: 4px; }
.hub-stage.mobile .hub-stepper button { gap: 5px; padding: 6px 9px 6px 6px; font-size: 0.64rem; }
.hub-stage.mobile .hub-stepper button i { width: 17px; height: 17px; font-size: 0.56rem; }
.hub-stage.mobile .hub-zoom { display: none; }
.hub-sheet { position: absolute; left: 0; right: 0; bottom: 0; z-index: 6; display: flex; flex-direction: column; max-height: 78dvh; padding: 8px 8px calc(10px + env(safe-area-inset-bottom)); border-radius: 20px 20px 0 0; background: rgba(9,14,28,0.94); border-top: 1px solid rgba(212,175,55,0.3); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); }
.hub-sheet.analyses, .hub-sheet.advisor { height: 78dvh; }
.hub-sheet-bar { display: flex; gap: 6px; margin-bottom: 8px; }
.hub-sheet-bar button { flex: 1; padding: 10px 8px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.045); color: rgba(240,235,224,0.8); font: 700 0.72rem ${sans}; }
.hub-sheet-bar button.on { border-color: ${GOLD}; color: ${GOLD}; background: rgba(212,175,55,0.12); }
.hub-sheet-body { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.hub-sheet-body .hub-head { padding: 6px 8px 0; }
.hub-sheet-body .hub-tabs { margin-right: 0; }
.hub-sheet-body .hub-tabs.dock { margin: 0 0 8px; }
.hub-sheet-body .hub-body { padding: 12px 8px 16px; }
.hub-sheet-body .hub-dock-body { padding: 0; }
.hub-sheet .hub-card { width: 100%; padding: 8px; border-radius: 16px; background: transparent; border: 0; box-shadow: none; backdrop-filter: none; }
.hub-sheet .hub-stem { display: none; }
.hub-sheet .hub-photo { flex-basis: 92px; height: 92px; }
.hub-sheet .hub-card-main h3 { font-size: 0.9rem; }

/* La fenêtre de chat devient la carte : la scène est d'abord découpée à la
   forme du chat, puis s'ouvre jusqu'aux bords de l'écran pendant que le voile
   (la couleur du chat) se dissipe. */
.hub-morph { position: relative; animation: hub-morph 1.3s cubic-bezier(0.7,0,0.2,1) both; }
.hub-morph::after { content: ''; position: absolute; inset: 0; z-index: 30; pointer-events: none; background: #090e1c; animation: hub-veil 1s ease 0.15s both; }
@keyframes hub-morph { from { clip-path: inset(var(--mt) var(--mr) var(--mb) var(--ml) round 28px); } to { clip-path: inset(0 0 0 0 round 0px); } }
@keyframes hub-veil { from { opacity: 1; } to { opacity: 0; } }
@keyframes hub-in { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
@keyframes hub-fade { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
@keyframes hub-shine { to { background-position: -200% 0; } }
@keyframes hub-sweep { to { transform: rotate(360deg); } }
@keyframes hub-pulse { 0% { transform: scale(1); opacity: 0.9; } 100% { transform: scale(3.4); opacity: 0; } }
@media (prefers-reduced-motion: reduce) {
  .hub-card, .hub-stem, .hub-free { transition: none; }
  .hub-panel, .hub-dock, .hub-body, .hub-core span, .hub-radar::after, .hub-skel { animation: none; }
  .hub-morph { animation: none; }
  .hub-morph::after { display: none; }
}
`;

export default ResultsHub;
