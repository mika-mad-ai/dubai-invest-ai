
import React, { useState, useRef, useEffect, useLayoutEffect, useMemo, lazy, Suspense } from 'react';
// Les composants qui ne servent qu'APRÈS le questionnaire (graphiques Recharts,
// carte Leaflet, simulateurs, chat) sont chargés à la demande : la page
// d'accueil ne télécharge et n'exécute plus leur code.
import { UserProfile, Message, Role, ChartDataPoint, SimulationParams, CashflowDataPoint, Property } from './types';
import { streamAdvisor, captureLead, type AgentMeta, type MatchedListing, type WireMessage } from './services/agentService';
import ConciergeChat, { type MorphRect } from './components/qualification/ConciergeChat';
import LeadModal from './components/LeadModal';
import SmartNavbar from './components/SmartNavbar';
import HeroSection from './components/HeroSection';
import { scoreProperty } from './components/AITopPick';
const ResultsHub = lazy(() => import('./components/hub/ResultsHub'));
import Footer from './components/Footer';
import { gtm } from './services/gtm';
import { useI18n, fmt } from './i18n';

// Données enrichies
// ── Skeleton loaders ──────────────────────────────────────────────────────────

/** Pendant le chargement de l'interface de résultats (quelques centaines de ms). */
const ResultsSkeleton: React.FC = () => (
  <div className="animate-pulse" style={{ height: '100dvh', minHeight: 640, background: '#0a1020' }} aria-busy="true" aria-label="Chargement de votre analyse" />
);

/**
 * Mode démonstration (`?demo=carte`) : ouvre directement l'interface carte
 * avec un profil et trois biens fictifs, sans questionnaire. Aucun appel au
 * conseiller ni au CRM — sert à vérifier le rendu réel de la carte sans coût.
 */
const DEMO_MAP = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('demo') === 'carte';
const DEMO_PROFILE: UserProfile = {
  name: 'Démonstration', email: '', totalBudget: '900000', initialInvestment: '300000', monthlyContribution: '1500',
  duration: '10', propertyStatus: 'ready', riskLevel: 3, roiDelay: '0', objective: 'rental_income',
};
const DEMO_LISTINGS: Property[] = [
  { id: 'demo-1', title: 'Démo · 2 ch. au pied du Burj Khalifa', location: 'Downtown Dubai, Dubai', price: 820000, yield: 6.2, type: 'Apartment', image: '/hero-poster.jpg', beds: 2, baths: 2, sqm: 118, completion: 'Ready', lat: 25.1972, lng: 55.2744, liquidity: 'High', source: 'internal' },
  { id: 'demo-2', title: 'Démo · 1 ch. Cayan Tower, Dubai Marina', location: 'Dubai Marina, Dubai', price: 430000, yield: 6.9, type: 'Apartment', image: '/hero-poster.jpg', beds: 1, baths: 1, sqm: 82, completion: 'Ready', lat: 25.0868, lng: 55.1451, liquidity: 'High', source: 'internal' },
  { id: 'demo-3', title: 'Démo · Studio, Arjan', location: 'Arjan, Dubai', price: 150000, yield: 7.8, type: 'Apartment', image: '/hero-poster.jpg', beds: 0, baths: 1, sqm: 39, completion: 'Ready', liquidity: 'Medium', source: 'internal' },
];

function App() {
  const { t, locale, money } = useI18n();
  const [hasProfile, setHasProfile] = useState(DEMO_MAP);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(DEMO_MAP ? DEMO_PROFILE : null);
  // Conseiller IA choisi (AgentsSection) — spécialise le questionnaire et
  // fait apparaître l'avatar compagnon sur le bord de l'écran
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  // Rectangle (en px, repère fenêtre) de la fenêtre de chat au moment où le
  // dossier est validé : la carte se déploie à partir de lui.
  const [morphFrom, setMorphFrom] = useState<MorphRect | null>(null);
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

  const [properties, setProperties] = useState<Property[]>(DEMO_MAP ? DEMO_LISTINGS : []);
  const [propertiesLoading, setPropertiesLoading] = useState(false);
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

  useLayoutEffect(() => {
    // L'accueil disparaît quand la carte prend le relais : on recale la page
    // en haut sans défilement, pour que la carte se déploie exactement là où
    // était la fenêtre de chat.
    if (hasProfile) window.scrollTo(0, 0);
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

  // Classement complet pour le profil : le premier est le bien mis en avant.
  const rankedProperties = useMemo(() => {
    if (!userProfile) return properties;
    return [...properties].sort((a, b) => scoreProperty(b, userProfile) - scoreProperty(a, userProfile));
  }, [properties, userProfile]);

  // Le bien affiché : celui que le visiteur a choisi, sinon le mieux classé.
  const featuredProperty = useMemo(
    () => rankedProperties.find(p => p.id === simParams.selectedPropertyId) ?? rankedProperties[0] ?? null,
    [rankedProperties, simParams.selectedPropertyId]
  );

  // Les simulations (loyer, charges, frais) suivent le bien mis en avant.
  useEffect(() => {
    if (!featuredProperty || simParams.selectedPropertyId === featuredProperty.id) return;
    setSimParams(prev => ({
      ...prev,
      selectedPropertyId: featuredProperty.id,
      rentalYield: featuredProperty.yield,
      serviceChargesSqft: featuredProperty.serviceChargesSqft,
    }));
  }, [featuredProperty, simParams.selectedPropertyId]);

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

  const handleProfileSubmit = async (profile: UserProfile, from: MorphRect | null = null) => {
    setMorphFrom(from);
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
    if (!hasProfile || !userProfile || DEMO_MAP) return;
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


  return (
    <div className="min-h-screen font-sans" style={{ background: '#050505', color: 'rgba(240,235,224,0.88)' }}>
      <SmartNavbar
        message={isChatLoading ? t.nav.aiAnalyzing : fmt(t.nav.aiReady, { name: userProfile?.name?.split(' ')[0] || '' })}
        isStreaming={isChatLoading}
        hasProfile={hasProfile}
        onReset={() => { setHasProfile(false); setUserProfile(null); setMessages([]); setSelectedAgentId(null); setMorphFrom(null); }}
        exchangeRate={simParams.exchangeRate}
      />

      <div className="relative">
      {!hasProfile && (
        <>
          <HeroSection
            avgYield={7.4}
            avgPrice={1_850_000}
            totalTransactions={14320}
            onCTAClick={() => document.getElementById('concierge')?.scrollIntoView({ behavior: 'smooth' })}
          />
          {/* Après l'introduction : la qualification en conversation. Une
              fois le dossier complet, cette fenêtre devient la carte. */}
          <ConciergeChat
            onSubmit={handleProfileSubmit}
            onAgent={id => {
              setSelectedAgentId(id);
              // Le visiteur a commencé : on précharge la carte pour que la
              // transformation du chat soit immédiate au moment venu.
              void import('./components/hub/ResultsHub');
              void import('./components/hub/HubMap');
            }}
          />
        </>
      )}

      {hasProfile && userProfile && (
        <Suspense fallback={<ResultsSkeleton />}>
          {/* Une seule interface : la carte 3D porte les analyses par niveau
              de zoom, le bien le mieux classé sort de la carte. */}
          <div
            className={morphFrom ? 'hub-morph' : undefined}
            style={morphFrom ? ({
              '--mt': `${Math.max(0, morphFrom.top)}px`,
              '--ml': `${Math.max(0, morphFrom.left)}px`,
              '--mr': `${Math.max(0, window.innerWidth - morphFrom.left - morphFrom.width)}px`,
              '--mb': `${Math.max(0, window.innerHeight - morphFrom.top - morphFrom.height)}px`,
            } as React.CSSProperties) : undefined}
          >
          <ResultsHub
            profile={userProfile}
            ranked={rankedProperties}
            featured={featuredProperty}
            scoreOf={p => scoreProperty(p, userProfile)}
            onFeature={handleSelectProperty}
            onContact={p => { gtm.propertyInterestClick(p); setSelectedLeadProperty(p); setIsModalOpen(true); }}
            listingsLoading={propertiesLoading}
            listingsStatus={propertiesStatus}
            simParams={simParams}
            setSimParams={setSimParams}
            calc={calculationResult}
            messages={messages}
            onSendMessage={handleSendMessage}
            isChatLoading={isChatLoading}
            groundingSources={groundingSources}
            matchedListings={matchedListings}
            advisorMeta={advisorMeta}
          />
          </div>
        </Suspense>
      )}

      <LeadModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} property={selectedLeadProperty} userProfile={userProfile} />

      {/* Avatar compagnon — glisse sur le bord de l'écran dès qu'un conseiller
          est choisi et reste présent pendant tout le parcours */}
      </div>
      <Footer />
    </div>
  );
}

export default App;
