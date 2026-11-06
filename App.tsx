
import React, { useState, useRef, useEffect, useLayoutEffect, useMemo, lazy, Suspense } from 'react';
// Les composants qui ne servent qu'APRÈS le questionnaire (graphiques Recharts,
// carte Leaflet, simulateurs, chat) sont chargés à la demande : la page
// d'accueil ne télécharge et n'exécute plus leur code.
import { UserProfile, Message, Role, ChartDataPoint, SimulationParams, CashflowDataPoint, CostDataPoint, ExchangeRateDataPoint, Property, DistrictData } from './types';
import { streamAdvisor, captureLead, type AgentMeta, type MatchedListing, type WireMessage } from './services/agentService';
import DecisionTree from './components/DecisionTree';
const ChatInterface = lazy(() => import('./components/ChatInterface'));
const ProjectionsChart = lazy(() => import('./components/ProjectionsChart'));
import StatCard from './components/kpi/StatCard';
const CashflowChart = lazy(() => import('./components/charts/CashflowChart'));
const StrategyComparison = lazy(() => import('./components/StrategyComparison'));
const ExchangeRateChart = lazy(() => import('./components/charts/ExchangeRateChart'));
const TaxComparisonChart = lazy(() => import('./components/charts/TaxComparisonChart'));
const LoanComparisonChart = lazy(() => import('./components/charts/LoanComparisonChart'));
const PropertyCard = lazy(() => import('./components/PropertyCard'));
import LeadModal from './components/LeadModal';
import ScrollReveal from './components/ScrollReveal';
const GrowthVisualizer = lazy(() => import('./components/GrowthVisualizer'));
import SmartNavbar from './components/SmartNavbar';
const DubaiMap = lazy(() => import('./components/DubaiMap'));
const FiscalitySimulator = lazy(() => import('./components/FiscalitySimulator'));
const CostBreakdownChart = lazy(() => import('./components/charts/CostBreakdownChart'));
const InvestmentDecisionCharts = lazy(() => import('./components/charts/InvestmentDecisionCharts'));
import { fetchDldWeeklyImpact, DldWeeklyResponse } from './services/dldService';
import { ChartIcon, TrendingUpIcon, RobotAvatarIcon, PercentIcon, EuroIcon, BuildingIcon } from './components/Icons';
import HeroSection from './components/HeroSection';
import AgentsSection from './components/AgentsSection';
import AgentCompanion from './components/AgentCompanion';
const MatchedListings = lazy(() => import('./components/MatchedListings'));
import CurtainReveal from './components/CurtainReveal';
import AITopPick, { scoreProperty } from './components/AITopPick';
import Footer from './components/Footer';
import { gtm } from './services/gtm';
import { useI18n, fmt } from './i18n';

// Données enrichies
// ── Skeleton loaders ──────────────────────────────────────────────────────────

/** Pendant le chargement des modules de résultats (quelques centaines de ms). */
const ResultsSkeleton: React.FC = () => (
  <div className="pt-24 pb-20 px-4 md:px-8 max-w-[1700px] mx-auto" aria-busy="true" aria-label="Chargement de votre analyse">
    <div className="flex flex-col gap-6 xl:max-w-[calc(100%-432px)]">
      {[260, 420, 320].map((h, i) => (
        <div key={i} className="rounded-2xl animate-pulse" style={{ height: h, background: 'linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.015))', border: '1px solid rgba(212,175,55,0.08)' }} />
      ))}
    </div>
  </div>
);

const PropertyCardSkeleton: React.FC = () => (
  <div className="rounded-2xl overflow-hidden animate-pulse" style={{ border: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.03)' }}>
    <div className="h-[220px]" style={{ background: 'rgba(255,255,255,0.06)' }} />
    <div className="p-4 space-y-3">
      <div className="h-5 rounded-md w-3/4" style={{ background: 'rgba(255,255,255,0.06)' }} />
      <div className="h-3 rounded-md w-1/2" style={{ background: 'rgba(255,255,255,0.04)' }} />
      <div className="grid grid-cols-2 gap-2 pt-1">
        <div className="h-10 rounded-sm" style={{ background: 'rgba(255,255,255,0.04)' }} />
        <div className="h-10 rounded-sm" style={{ background: 'rgba(255,255,255,0.04)' }} />
      </div>
      <div className="h-10 rounded-md" style={{ background: 'rgba(255,255,255,0.04)' }} />
    </div>
  </div>
);

const AITopPickSkeleton: React.FC = () => (
  <div className="rounded-2xl mb-10 px-6 pt-8 pb-8 animate-pulse" style={{ border: '1px solid rgba(212,175,55,0.15)', background: 'rgba(255,255,255,0.02)' }}>
    <div className="text-center mb-8 space-y-3">
      <div className="h-3 w-48 mx-auto rounded-sm" style={{ background: 'rgba(212,175,55,0.15)' }} />
      <div className="h-8 w-72 mx-auto rounded-sm" style={{ background: 'rgba(255,255,255,0.06)' }} />
      <div className="h-8 w-56 mx-auto rounded-sm" style={{ background: 'rgba(212,175,55,0.10)' }} />
    </div>
    <div className="flex justify-center mb-8">
      <div className="rounded-full" style={{ width: 354, height: 354, background: 'rgba(255,255,255,0.04)', border: '9px solid rgba(212,175,55,0.10)' }} />
    </div>
    <div className="text-center space-y-3 max-w-sm mx-auto">
      <div className="h-3 w-24 mx-auto rounded-sm" style={{ background: 'rgba(212,175,55,0.12)' }} />
      <div className="flex gap-1 items-center justify-center">
        <span className="text-xs animate-pulse" style={{ color: 'rgba(212,175,55,0.85)' }}>{useI18n().t.app.skeletonCollecting}</span>
        <span className="text-xs" style={{ color: 'rgba(212,175,55,0.85)' }}>…</span>
      </div>
      <p className="text-[10px]" style={{ color: 'rgba(180,175,165,0.35)' }}>{useI18n().t.app.skeletonSource}</p>
    </div>
  </div>
);

function App() {
  const { t, locale, money } = useI18n();
  const sectionClassName =
    "relative overflow-hidden rounded-3xl border border-white/6 p-5 md:p-8 shadow-[0_18px_60px_rgba(0,0,0,0.5)] before:content-[''] before:absolute before:left-0 before:top-0 before:h-full before:w-[3px] before:bg-linear-to-b before:from-[#D4AF37] before:via-[#00F2FF] before:to-transparent"
  const sectionStyle = { background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(20px)' };

  const [hasProfile, setHasProfile] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  // Conseiller IA choisi (AgentsSection) — spécialise le questionnaire et
  // fait apparaître l'avatar compagnon sur le bord de l'écran
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [treeStep, setTreeStep] = useState(0);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [groundingSources, setGroundingSources] = useState<any[]>([]);
  // Biens réels retenus par le moteur de matching pour ce dossier, avec leur
  // verdict prix face aux transactions DLD.
  const [matchedListings, setMatchedListings] = useState<MatchedListing[]>([]);
  const [advisorMeta, setAdvisorMeta] = useState<AgentMeta | null>(null);
  const [leadResult, setLeadResult] = useState<Awaited<ReturnType<typeof captureLead>> | null>(null);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedLeadProperty, setSelectedLeadProperty] = useState<Property | null>(null);

  // New states for interactive filtering
  const [selectedDistrictId, setSelectedDistrictId] = useState<string | undefined>(undefined);
  const [dldImpactData, setDldImpactData] = useState<DldWeeklyResponse | null>(null);
  const [isDldLoading, setIsDldLoading] = useState(false);
  const [properties, setProperties] = useState<Property[]>([]);
  const [propertiesLoading, setPropertiesLoading] = useState(false);
  const [propertiesSource, setPropertiesSource] = useState<'live' | 'fallback'>('fallback');
  const [propertiesStatus, setPropertiesStatus] = useState<string>('');

  const [simParams, setSimParams] = useState<SimulationParams>({
    rentalYield: 8.0,
    appreciation: 5.0,
    exchangeRate: 4.24,
    occupancy: 90,
    duration: 10,
    strategy: 'long_term',
    riskTolerance: 3, 
    serviceChargesSqft: 16, 
    selectedPropertyId: undefined,
    taxResidence: 'FR'
  });
  const serviceChargesSqft = simParams.serviceChargesSqft ?? 0;

  // Historique au format attendu par l'API Claude — distinct de `messages`,
  // qui porte en plus l'état d'affichage (streaming, timestamps).
  const historyRef = useRef<WireMessage[]>([]);
  const streamAbortRef = useRef<AbortController | null>(null);

  const handleSelectProperty = (property: Property) => {
    setSimParams(prev => ({
      ...prev,
      selectedPropertyId: property.id,
      rentalYield: property.yield,
      serviceChargesSqft: property.serviceChargesSqft
    }));
  };

  const handleSelectDistrict = (id: string) => {
      setSelectedDistrictId(id === selectedDistrictId ? undefined : id);
  };

  // Force scroll to top synchronously before first paint
  useLayoutEffect(() => {
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    if (!('scrollRestoration' in window.history)) return;
    const previous = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';
    return () => {
      window.history.scrollRestoration = previous;
    };
  }, []);

  useEffect(() => {
    if (hasProfile) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [hasProfile]);

  // ── SEO/GEO : inject fresh meta + FAQ schema from daily AI optimizer ────────
  useEffect(() => {
    fetch('/api/seo-content')
      .then(r => r.ok ? r.json() : null)
      .then((data: { meta_description?: string; faq_schema?: object } | null) => {
        if (!data) return;

        // Update meta description dynamically (for Google Search CTR)
        if (data.meta_description) {
          const metaEl = document.querySelector('meta[name="description"]');
          if (metaEl) metaEl.setAttribute('content', data.meta_description);
          const ogMeta = document.querySelector('meta[property="og:description"]');
          if (ogMeta) ogMeta.setAttribute('content', data.meta_description);
        }

        // Inject FAQ Schema.org JSON-LD for Google SGE / Gemini AI Overviews
        if (data.faq_schema) {
          const existing = document.getElementById('faq-schema-dynamic');
          if (existing) existing.remove();
          const script = document.createElement('script');
          script.id = 'faq-schema-dynamic';
          script.type = 'application/ld+json';
          script.textContent = JSON.stringify(data.faq_schema);
          document.head.appendChild(script);
        }
      })
      .catch(() => { /* SEO enhancement — non-blocking */ });
  }, []);

  const calculationResult = useMemo(() => {
    const selectedProp = properties.find(p => p.id === simParams.selectedPropertyId);
    
    const propertyPrice = selectedProp 
      ? selectedProp.price 
      : (userProfile ? parseFloat(userProfile.totalBudget) : 400000);
    
    const initialCash = userProfile ? parseFloat(userProfile.initialInvestment) : 150000;
    const monthlyContribution = userProfile ? parseFloat(userProfile.monthlyContribution) : 1200;
    const duration = userProfile ? parseInt(userProfile.duration) : simParams.duration;
    const roiDelayMonths = userProfile ? parseInt(userProfile.roiDelay) : 0;
    
    const loanAmount = Math.max(0, propertyPrice - initialCash);
    const baseAppreciation = userProfile?.propertyStatus === 'off-plan' ? simParams.appreciation * 1.4 : simParams.appreciation;
    const occupancy = simParams.strategy === 'short_term' ? 0.75 : 0.92;
    const managementFeeRate = simParams.strategy === 'short_term' ? 0.18 : 0.05;
    
    // NET-NET CALCULATION
    const propertySqm = selectedProp?.sqm || (propertyPrice / 5000); 
    const serviceChargesSqft = simParams.serviceChargesSqft ?? 0;
    const serviceChargesTotalYear = (propertySqm * 10.764) * serviceChargesSqft * (1/4); // Approx conversion
    const serviceChargesMonth = serviceChargesTotalYear / 12;

    const targetMonthlyRent = (propertyPrice * (simParams.rentalYield / 100) / 12);

    const years = Array.from({ length: duration + 1 }, (_, i) => i);
    const rGrowth = (baseAppreciation / 100);

    const chartData: ChartDataPoint[] = years.map(year => {
      const propertyValue = propertyPrice * Math.pow(1 + rGrowth, year);
      const roiDelayYears = roiDelayMonths / 12;
      const earningYears = Math.max(0, year - roiDelayYears);
      
      const annualGrossRent = targetMonthlyRent * 12 * occupancy;
      const annualNetRent = annualGrossRent * (1 - managementFeeRate) - serviceChargesTotalYear;
      
      const accumulatedRent = annualNetRent * earningYears;
      const accumulatedSavings = monthlyContribution * 12 * year;
      const totalWealthDubai = propertyValue + accumulatedRent + accumulatedSavings - loanAmount;
      const totalWealthFrance = initialCash * Math.pow(1.035, year) + accumulatedSavings;
      const riskFactor = userProfile ? userProfile.riskLevel * 0.05 : 0.15;

      return {
        year: `An ${year}`,
        investedAmount: Math.round(initialCash),
        scenarioOptimiste: Math.round(totalWealthDubai),
        dubaiRange: [Math.round(totalWealthDubai * (1 - riskFactor)), Math.round(totalWealthDubai * (1 + riskFactor))],
        scenarioFrance: Math.round(totalWealthFrance),
        franceRange: [Math.round(totalWealthFrance * 0.98), Math.round(totalWealthFrance * 1.02)]
      };
    });

    const netRentMonth = (targetMonthlyRent * occupancy) * (1 - managementFeeRate) - serviceChargesMonth;
    const annualRent = netRentMonth * 12;

    return { 
      chartData, 
      cashflowData: [
        { name: 'Revenu Brut', value: Math.round(targetMonthlyRent * occupancy), type: 'income' as const },
        { name: 'Charges & Fees', value: -Math.round(serviceChargesMonth + (targetMonthlyRent * occupancy * managementFeeRate)), type: 'expense' as const },
        { name: 'Cashflow Net', value: Math.round(netRentMonth), type: 'income' as const, fill: '#22d3ee' }
      ] as CashflowDataPoint[], 
      costData: [
        { name: 'DLD Fee (4%)', value: propertyPrice * 0.04, fill: '#22d3ee' },
        { name: 'Frais Agence (2%)', value: propertyPrice * 0.02, fill: '#3b82f6' },
        { name: 'Admin/Trustee', value: 1200, fill: '#8a96ab' },
        { name: 'Apport', value: initialCash, fill: '#10b981' }
      ], 
      tax: { dubai: 0, france: (propertyPrice * 0.22) },
      loan: { amount: loanAmount },
      propertyPrice,
      annualRent,
      selectedProperty: selectedProp 
    };
  }, [simParams, userProfile, properties]);

  // Filtrage par quartier + tri par score de correspondance profil
  const filteredProperties = useMemo(() => {
    let result = selectedDistrictId
      ? properties.filter(p => p.districtId === selectedDistrictId)
      : [...properties];
    // Trier par score décroissant si profil disponible
    if (userProfile) {
      result = result.sort((a, b) => scoreProperty(b, userProfile) - scoreProperty(a, userProfile));
    }
    return result;
  }, [selectedDistrictId, properties, userProfile]);

  // Best pick IA — meilleure propriété selon le profil
  const bestPick = useMemo(() => {
    if (!userProfile || properties.length === 0) return null;
    return properties.reduce((best, p) =>
      scoreProperty(p, userProfile) > scoreProperty(best, userProfile) ? p : best
    );
  }, [userProfile, properties]);

  /**
   * Un tour de conversation avec le conseiller IA. Le texte arrive en streaming :
   * on crée un message vide côté UI puis on l'alimente au fil des chunks.
   */
  const runAdvisorTurn = async (profile: UserProfile, userText?: string) => {
    streamAbortRef.current?.abort();
    const controller = new AbortController();
    streamAbortRef.current = controller;

    if (userText) {
      historyRef.current = [...historyRef.current, { role: 'user', content: userText }];
      setMessages(prev => [...prev, {
        id: `u-${Date.now()}`, role: Role.USER, text: userText, timestamp: new Date(),
      }]);
    }

    const replyId = `a-${Date.now()}`;
    setMessages(prev => [...prev, {
      id: replyId, role: Role.MODEL, text: '', timestamp: new Date(), isStreaming: true,
    }]);
    setIsChatLoading(true);

    let accumulated = '';
    const appendToReply = (text: string) => {
      setMessages(prev => prev.map(m => (m.id === replyId ? { ...m, text } : m)));
    };

    await streamAdvisor(
      {
        advisorId: selectedAgentId ?? profile.advisorId,
        profile,
        messages: historyRef.current,
        language: t.geminiLanguage,
        knownListingIds: matchedListings.map(l => l.id),
        signal: controller.signal,
      },
      {
        onMeta: meta => {
          setMatchedListings(meta.listings);
          setAdvisorMeta(meta);
        },
        onText: chunk => {
          accumulated += chunk;
          appendToReply(accumulated);
        },
        onDone: ({ citations }) => {
          setGroundingSources(citations);
          historyRef.current = [...historyRef.current, { role: 'assistant', content: accumulated }];
        },
        onError: message => {
          // On affiche l'erreur dans la bulle en cours plutôt que de la perdre en console.
          appendToReply(accumulated ? `${accumulated}\n\n_${message}_` : message);
        },
      }
    );

    setMessages(prev => prev.map(m => (m.id === replyId ? { ...m, isStreaming: false } : m)));
    setIsChatLoading(false);
  };

  const handleProfileSubmit = async (profile: UserProfile) => {
    gtm.funnelComplete(profile);
    const withAdvisor: UserProfile = { ...profile, advisorId: selectedAgentId ?? profile.advisorId };
    setUserProfile(withAdvisor);
    setHasProfile(true);
    historyRef.current = [];
    setMessages([]);

    // Capture du lead et ouverture du dossier en parallèle : le scoring CRM ne
    // doit pas retarder l'affichage de l'analyse.
    void captureLead({
      profile: withAdvisor,
      advisorId: withAdvisor.advisorId,
      messageCount: 0,
      // Seule la case « partenaires » est posée dans ce formulaire (pas de
      // numéro) : WhatsApp reste non décidé, ni accordé ni retiré.
      consent: { partners: !!withAdvisor.consent?.partners },
      consentSource: 'web_form',
    }).then(result => setLeadResult(result));

    await runAdvisorTurn(withAdvisor);
  };

  const handleSendMessage = async (text: string) => {
    if (!userProfile || isChatLoading || !text.trim()) return;
    await runAdvisorTurn(userProfile, text.trim());
  };

  useEffect(() => {
    if (!hasProfile) return;
    let cancelled = false;
    setIsDldLoading(true);
    fetchDldWeeklyImpact()
      .then(data => {
        if (!cancelled) setDldImpactData(data);
      })
      .catch(() => {
        if (!cancelled) {
          setDldImpactData({
            live: false,
            source: 'DLD API indisponible',
            generatedAt: new Date().toISOString(),
            reason: 'Impossible de récupérer les données live.'
          });
        }
      })
      .finally(() => {
        if (!cancelled) setIsDldLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [hasProfile]);

  useEffect(() => {
    if (!hasProfile || !userProfile) return;
    let cancelled = false;

    const budget = parseFloat(userProfile.totalBudget) || 0;
    const budgetParam = budget > 0 ? `&budget=${budget}` : '';

    // Scraping direct PF — appel unique (~5-15s selon latence réseau)
    setPropertiesLoading(true);
    setProperties([]);

    (async () => {
      try {
        const r = await fetch(`/api/live-listings?limit=40${budgetParam}`);
        const payload = await r.json();
        if (cancelled) return;

        if (payload?.live && Array.isArray(payload.listings) && payload.listings.length > 0) {
          setProperties(payload.listings as Property[]);
          setPropertiesSource('live');
          const summary = Array.isArray(payload.statuses)
            ? payload.statuses.map((s: any) => `${s.source}: ${s.ok ? `ok(${s.count})` : `ko`}`).join(' • ')
            : '';
          setPropertiesStatus(summary);
        } else {
          setPropertiesStatus('Aucune annonce disponible pour ce profil pour le moment');
        }
      } catch {
        if (!cancelled) setPropertiesStatus('Erreur de chargement des annonces');
      } finally {
        if (!cancelled) setPropertiesLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [hasProfile, userProfile]);

  const formatCurrency = (val: number) => money(val);

  return (
    <div className="min-h-screen font-sans" style={{ background: '#050505', color: 'rgba(240,235,224,0.88)' }}>
      <SmartNavbar
        message={isChatLoading ? t.nav.aiAnalyzing : fmt(t.nav.aiReady, { name: userProfile?.name?.split(' ')[0] || '' })}
        isStreaming={isChatLoading}
        hasProfile={hasProfile}
        onReset={() => { setHasProfile(false); setUserProfile(null); setMessages([]); setSelectedAgentId(null); setTreeStep(0); }}
        exchangeRate={simParams.exchangeRate}
      />

      <div className="relative">
      {!hasProfile && (
        <>
          <HeroSection
            avgYield={7.4}
            avgPrice={1_850_000}
            totalTransactions={14320}
            onCTAClick={() => document.getElementById('agents')?.scrollIntoView({ behavior: 'smooth' })}
          />
          {/* Partie centrale : 3 conseillers IA — révélée en rideau */}
          <div id="agents">
            <CurtainReveal>
              <AgentsSection
                onConsult={(id) => {
                  setSelectedAgentId(id);
                  setTreeStep(0);
                  // léger délai : laisse l'avatar compagnon démarrer sa glissade avant le scroll
                  setTimeout(() => document.getElementById('decision-tree')?.scrollIntoView({ behavior: 'smooth' }), 120);
                }}
              />
            </CurtainReveal>
          </div>
          {/* Questionnaire — révélé en rideau ; remonté quand on change de conseiller */}
          <CurtainReveal>
            <div id="decision-tree" className="relative w-full flex flex-col items-center justify-start pt-16 pb-6 md:pb-10 px-4" style={{ background: '#050505' }}>
              <DecisionTree
                key={selectedAgentId ?? 'generic'}
                agentId={selectedAgentId}
                onStepChange={setTreeStep}
                onSubmit={handleProfileSubmit}
                isLoading={isChatLoading}
              />
            </div>
          </CurtainReveal>
        </>
      )}

      {hasProfile && (
        <Suspense fallback={<ResultsSkeleton />}>
        <div className="pt-20 md:pt-24 pb-20 px-4 md:px-8 max-w-[1700px] mx-auto animate-fade-in flex flex-col xl:flex-row gap-8">
            
            {/* LEFT COLUMN: 5 THEMATIC SECTIONS */}
            <div className="xl:flex-1 space-y-10 min-w-0 pb-32">

                {/* AI TOP PICK */}
                {propertiesLoading && !bestPick ? (
                  <AITopPickSkeleton />
                ) : bestPick && userProfile ? (
                  <AITopPick
                    property={bestPick}
                    profile={userProfile}
                    score={scoreProperty(bestPick, userProfile)}
                    isSelected={simParams.selectedPropertyId === bestPick.id}
                    onSelect={handleSelectProperty}
                    onContact={(p) => { setSelectedLeadProperty(p); setIsModalOpen(true); }}
                  />
                ) : null}

                {/* THEME 1: ANALYSE D'AIDE À LA DÉCISION */}
                <section className={sectionClassName} style={sectionStyle}>
                    <div className="flex items-center gap-3 md:gap-4 mb-6 flex-wrap">
                        <span className="text-2xl md:text-4xl font-serif text-gold-500/60 font-bold shrink-0">01</span>
                        <div>
                            <h2 className="text-xl md:text-3xl font-serif text-white">{t.app.s1Title}</h2>
                            <p className="text-xs text-slate-400 uppercase tracking-widest">{t.app.s1Sub}</p>
                        </div>
                    </div>
                    <InvestmentDecisionCharts profile={userProfile!} />
                </section>
                
                {/* THEME 2: PRISE DE VALEUR & HORIZON */}
                <section className={sectionClassName} style={sectionStyle}>
                    <div className="flex items-center gap-3 md:gap-4 mb-6 flex-wrap">
                        <span className="text-2xl md:text-4xl font-serif text-gold-500/60 font-bold shrink-0">02</span>
                        <div>
                            <h2 className="text-xl md:text-3xl font-serif text-white">{fmt(t.app.s2Title, { n: simParams.duration })}</h2>
                            <p className="text-xs text-slate-400 uppercase tracking-widest">{t.app.s2Sub}</p>
                        </div>
                    </div>
                    
                    <div className="glass-panel p-6 rounded-2xl border border-white/5 mb-6">
                        <div className="flex justify-between items-center mb-4">
                            <label className="text-sm font-bold text-white flex items-center gap-2">
                                <TrendingUpIcon className="w-4 h-4 text-gold-400" /> {t.app.s2Slider}
                            </label>
                            <span className="text-xl font-serif text-gold-400">{fmt(t.app.s2Years, { n: simParams.duration })}</span>
                        </div>
                        <input 
                            type="range" min="5" max="30" step="1" 
                            value={simParams.duration} 
                            onChange={(e) => setSimParams({...simParams, duration: parseInt(e.target.value)})}
                            className="modern-slider slider-gold"
                        />
                         <div className="flex justify-between text-[10px] text-slate-500 mt-2 uppercase font-bold">
                            <span>{t.app.s2Short}</span>
                            <span>{t.app.s2Long}</span>
                         </div>
                    </div>

                    <div className="h-[260px] md:h-[500px]">
                         <GrowthVisualizer data={calculationResult.chartData} duration={simParams.duration} />
                    </div>
                </section>


                {/* THEME 3: ROI LOCATIF & TYPE DE LOCATION */}
                <section className={sectionClassName} style={sectionStyle}>
                    <div className="flex items-center gap-3 md:gap-4 mb-6 flex-wrap">
                        <span className="text-2xl md:text-4xl font-serif text-gold-500/60 font-bold shrink-0">03</span>
                        <div>
                            <h2 className="text-xl md:text-3xl font-serif text-white">{t.app.s3Title}</h2>
                            <p className="text-xs text-slate-400 uppercase tracking-widest">{t.app.s3Sub}</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 mb-6">
                        {/* Strategy Selector */}
                         <div className="glass-panel p-6 rounded-2xl border border-white/5 flex flex-col justify-center">
                            <label className="text-xs font-bold text-slate-300 uppercase tracking-widest mb-4">{t.app.s3How}</label>
                            <div className="flex p-1 bg-midnight-950 rounded-xl border border-white/10">
                                <button
                                    onClick={() => setSimParams({...simParams, strategy: 'long_term'})}
                                    className={`flex-1 py-4 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${
                                        simParams.strategy === 'long_term'
                                        ? 'bg-white/10 text-white shadow-xs border border-white/10'
                                        : 'text-slate-500 hover:text-slate-300'
                                    }`}
                                >
                                    <span className="block text-lg mb-1">🏠</span> {t.app.s3LongTerm}
                                </button>
                                <button
                                    onClick={() => setSimParams({...simParams, strategy: 'short_term'})}
                                    className={`flex-1 py-4 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${
                                        simParams.strategy === 'short_term'
                                        ? 'bg-gold-500/20 text-gold-400 shadow-xs border border-gold-500/20'
                                        : 'text-slate-500 hover:text-slate-300'
                                    }`}
                                >
                                     <span className="block text-lg mb-1">🏖️</span> {t.app.s3ShortTerm}
                                </button>
                            </div>
                         </div>
                         
                         {/* Quick KPI */}
                         <div className="glass-panel p-6 rounded-2xl border border-white/5 flex items-center justify-between">
                             <div>
                                <p className="text-[10px] text-slate-500 uppercase tracking-widest">{t.app.s3NetRent}</p>
                                <p className="text-3xl font-serif text-white mt-1">{formatCurrency(calculationResult.annualRent / 12)}<span className="text-sm text-slate-500">{t.app.s3PerMonth}</span></p>
                             </div>
                             <div className="text-right">
                                <p className="text-[10px] text-slate-500 uppercase tracking-widest">{t.app.s3NetYield}</p>
                                <p className="text-3xl font-mono text-emerald-400 mt-1 font-bold">{((calculationResult.annualRent / calculationResult.propertyPrice) * 100).toFixed(2)}%</p>
                             </div>
                         </div>
                    </div>

                    <div className="h-[260px] md:h-[400px]">
                        <StrategyComparison property={calculationResult.selectedProperty} params={simParams} totalBudget={parseFloat(userProfile?.totalBudget || '0')} />
                    </div>
                </section>


                {/* THEME 4: FRAIS & TAXES (ACQUISITION) */}
                <section className={sectionClassName} style={sectionStyle}>
                    <div className="flex items-center gap-3 md:gap-4 mb-6 flex-wrap">
                        <span className="text-2xl md:text-4xl font-serif text-gold-500/60 font-bold shrink-0">04</span>
                        <div>
                            <h2 className="text-xl md:text-3xl font-serif text-white">{t.app.s4Title}</h2>
                            <p className="text-xs text-slate-400 uppercase tracking-widest">{t.app.s4Sub}</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        <CostBreakdownChart data={calculationResult.costData} />
                        <div className="glass-panel p-6 rounded-2xl border border-white/5 flex flex-col justify-center gap-6">
                            <div className="flex items-start gap-4">
                                <div className="p-3 bg-gold-500/10 rounded-full text-gold-400"><BuildingIcon className="w-6 h-6" /></div>
                                <div>
                                    <h4 className="text-white font-bold mb-1">{t.app.s4DldTitle}</h4>
                                    <p className="text-xs text-slate-400 leading-relaxed">{t.app.s4DldDesc}</p>
                                </div>
                            </div>
                            <div className="flex items-start gap-4">
                                <div className="p-3 bg-blue-500/10 rounded-full text-blue-400"><EuroIcon className="w-6 h-6" /></div>
                                <div>
                                    <h4 className="text-white font-bold mb-1">{t.app.s4ChargesTitle}</h4>
                                    <p className="text-xs text-slate-400 leading-relaxed">{fmt(t.app.s4ChargesDesc, { n: serviceChargesSqft })}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>


                {/* THEME 5: FISCALITÉ & RÉSIDENCE */}
                <section className={sectionClassName} style={sectionStyle}>
                    <div className="flex items-center gap-3 md:gap-4 mb-6 flex-wrap">
                        <span className="text-2xl md:text-4xl font-serif text-gold-500/60 font-bold shrink-0">05</span>
                        <div>
                            <h2 className="text-xl md:text-3xl font-serif text-white">{t.app.s5Title}</h2>
                            <p className="text-xs text-slate-400 uppercase tracking-widest">{t.app.s5Sub}</p>
                        </div>
                    </div>

                    <FiscalitySimulator 
                        params={simParams} 
                        onChange={(res) => setSimParams({...simParams, taxResidence: res})} 
                        annualRent={calculationResult.annualRent} 
                    />
                </section>


                {/* THEME 6: OPPORTUNITÉS & CARTE */}
                <section className={sectionClassName} style={sectionStyle}>
                    <div className="flex items-center gap-3 md:gap-4 mb-6 flex-wrap">
                        <span className="text-2xl md:text-4xl font-serif text-gold-500/60 font-bold shrink-0">06</span>
                        <div>
                            <h2 className="text-xl md:text-3xl font-serif text-white">{t.app.s6Title}</h2>
                            <p className="text-xs text-slate-400 uppercase tracking-widest">{t.app.s6Sub}</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-8">
                        <DubaiMap onSelectDistrict={handleSelectDistrict} selectedDistrictId={selectedDistrictId} />
                        
                        <div>
                             <h3 className="text-xl font-serif text-white mb-6 pl-4 border-l-2 border-gold-500">
                                {selectedDistrictId 
                                    ? fmt(t.app.s6Available, { loc: properties.find(p => p.districtId === selectedDistrictId)?.location || '—' }) 
                                    : t.app.s6Latest}
                             </h3>
                             <div className="mb-4">
                                {propertiesSource === 'live' && (
                                  <span className="text-[10px] uppercase tracking-widest px-2 py-1 rounded-sm border text-emerald-400 border-emerald-500/40 bg-emerald-500/10">
                                    {t.app.s6Live}
                                  </span>
                                )}
                                {propertiesLoading && (
                                  <span className="ml-2 text-[10px] text-gold-400 animate-pulse">{t.app.s6Collecting}</span>
                                )}
                                {propertiesStatus && !propertiesLoading && (
                                  <p className="mt-2 text-[10px] text-slate-400">{propertiesStatus}</p>
                                )}
                             </div>
                             <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                {propertiesLoading && filteredProperties.length === 0 ? (
                                    Array.from({ length: 4 }).map((_, i) => <PropertyCardSkeleton key={i} />)
                                ) : filteredProperties.length > 0 ? (
                                    filteredProperties.map(p => (
                                        <PropertyCard
                                            key={p.id}
                                            property={p}
                                            isSelected={simParams.selectedPropertyId === p.id}
                                            onSelect={handleSelectProperty}
                                            onContact={(p) => { gtm.propertyInterestClick(p); setSelectedLeadProperty(p); setIsModalOpen(true); }}
                                        />
                                    ))
                                ) : (
                                    <div className="col-span-2 py-12 text-center text-slate-500 bg-white/5 rounded-xl border border-dashed border-white/10">
                                        {t.app.s6Empty}
                                    </div>
                                )}
                             </div>
                        </div>
                    </div>
                </section>

            </div>

            {/* RIGHT COLUMN: SÉLECTION VÉRIFIÉE + CHAT (STICKY) */}
            <div className="hidden xl:block w-[400px] shrink-0">
                <div className="sticky top-28 flex flex-col gap-5" style={{ maxHeight: 'calc(100vh - 140px)' }}>
                    {/* Les biens du conseiller, prix déjà croisés avec le DLD */}
                    <div className="shrink-0 overflow-y-auto pr-1" style={{ maxHeight: '42vh' }}>
                        <MatchedListings
                            listings={matchedListings}
                            market={advisorMeta?.market}
                            advisorName={advisorMeta?.advisor?.name}
                            isLoading={isChatLoading}
                        />
                    </div>
                    <div className="flex-1 min-h-[380px]">
                        <ChatInterface
                            messages={messages}
                            onSendMessage={handleSendMessage}
                            isStreaming={isChatLoading}
                            groundingSources={groundingSources}
                        />
                    </div>
                </div>
            </div>

            {/* MOBILE : sélection puis chat, empilés */}
            <div className="xl:hidden mt-12 flex flex-col gap-8">
                <MatchedListings
                    listings={matchedListings}
                    market={advisorMeta?.market}
                    advisorName={advisorMeta?.advisor?.name}
                    isLoading={isChatLoading}
                />
                <div className="h-[600px]">
                    <ChatInterface
                        messages={messages}
                        onSendMessage={handleSendMessage}
                        isStreaming={isChatLoading}
                        groundingSources={groundingSources}
                    />
                </div>
            </div>
        </div>
        </Suspense>
      )}

      <LeadModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} property={selectedLeadProperty} userProfile={userProfile} />

      {/* Avatar compagnon — glisse sur le bord de l'écran dès qu'un conseiller
          est choisi et reste présent pendant tout le parcours */}
      {selectedAgentId && (
        <AgentCompanion
          agentId={selectedAgentId}
          phase={hasProfile ? 'dashboard' : 'tree'}
          step={treeStep}
        />
      )}
      </div>
      <Footer />
    </div>
  );
}

export default App;
