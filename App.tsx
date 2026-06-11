
import React, { useState, useRef, useEffect, useLayoutEffect, useMemo } from 'react';
import { GoogleGenAI, Chat, GenerateContentResponse } from "@google/genai";
import { UserProfile, Message, Role, ChartDataPoint, SimulationParams, CashflowDataPoint, CostDataPoint, ExchangeRateDataPoint, Property, DistrictData } from './types';
import { createInvestmentChat, generateInitialAnalysisPrompt } from './services/geminiService';
import DecisionTree from './components/DecisionTree';
import ChatInterface from './components/ChatInterface';
import ProjectionsChart from './components/ProjectionsChart';
import StatCard from './components/kpi/StatCard';
import CashflowChart from './components/charts/CashflowChart';
import StrategyComparison from './components/StrategyComparison';
import ExchangeRateChart from './components/charts/ExchangeRateChart';
import TaxComparisonChart from './components/charts/TaxComparisonChart';
import LoanComparisonChart from './components/charts/LoanComparisonChart';
import PropertyCard from './components/PropertyCard';
import LeadModal from './components/LeadModal';
import ScrollReveal from './components/ScrollReveal';
import GrowthVisualizer from './components/GrowthVisualizer';
import SmartNavbar from './components/SmartNavbar';
import DubaiMap from './components/DubaiMap'; // New
import FiscalitySimulator from './components/FiscalitySimulator'; // New
import CostBreakdownChart from './components/charts/CostBreakdownChart'; // Used now
import InvestmentDecisionCharts from './components/charts/InvestmentDecisionCharts';
import { fetchDldWeeklyImpact, DldWeeklyResponse } from './services/dldService';
import { ChartIcon, TrendingUpIcon, RobotAvatarIcon, PercentIcon, EuroIcon, BuildingIcon } from './components/Icons';
import HeroSection from './components/HeroSection';
import AITopPick, { scoreProperty } from './components/AITopPick';
import Footer from './components/Footer';
import { gtm } from './services/gtm';

// Données enrichies
// ── Skeleton loaders ──────────────────────────────────────────────────────────

const PropertyCardSkeleton: React.FC = () => (
  <div className="rounded-2xl overflow-hidden animate-pulse" style={{ border: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.03)' }}>
    <div className="h-[220px]" style={{ background: 'rgba(255,255,255,0.06)' }} />
    <div className="p-4 space-y-3">
      <div className="h-5 rounded-md w-3/4" style={{ background: 'rgba(255,255,255,0.06)' }} />
      <div className="h-3 rounded-md w-1/2" style={{ background: 'rgba(255,255,255,0.04)' }} />
      <div className="grid grid-cols-2 gap-2 pt-1">
        <div className="h-10 rounded" style={{ background: 'rgba(255,255,255,0.04)' }} />
        <div className="h-10 rounded" style={{ background: 'rgba(255,255,255,0.04)' }} />
      </div>
      <div className="h-10 rounded-md" style={{ background: 'rgba(255,255,255,0.04)' }} />
    </div>
  </div>
);

const AITopPickSkeleton: React.FC = () => (
  <div className="rounded-2xl mb-10 px-6 pt-8 pb-8 animate-pulse" style={{ border: '1px solid rgba(212,175,55,0.15)', background: 'rgba(255,255,255,0.02)' }}>
    <div className="text-center mb-8 space-y-3">
      <div className="h-3 w-48 mx-auto rounded" style={{ background: 'rgba(212,175,55,0.15)' }} />
      <div className="h-8 w-72 mx-auto rounded" style={{ background: 'rgba(255,255,255,0.06)' }} />
      <div className="h-8 w-56 mx-auto rounded" style={{ background: 'rgba(212,175,55,0.10)' }} />
    </div>
    <div className="flex justify-center mb-8">
      <div className="rounded-full" style={{ width: 354, height: 354, background: 'rgba(255,255,255,0.04)', border: '9px solid rgba(212,175,55,0.10)' }} />
    </div>
    <div className="text-center space-y-3 max-w-sm mx-auto">
      <div className="h-3 w-24 mx-auto rounded" style={{ background: 'rgba(212,175,55,0.12)' }} />
      <div className="flex gap-1 items-center justify-center">
        <span className="text-xs animate-pulse" style={{ color: 'rgba(212,175,55,0.55)' }}>Collecte des annonces en cours</span>
        <span className="text-xs" style={{ color: 'rgba(212,175,55,0.55)' }}>…</span>
      </div>
      <p className="text-[10px]" style={{ color: 'rgba(180,175,165,0.35)' }}>PropertyFinder · Apify · ~60s</p>
    </div>
  </div>
);

function App() {
  const sectionClassName =
    "relative overflow-hidden rounded-3xl border border-white/[0.06] p-5 md:p-8 shadow-[0_18px_60px_rgba(0,0,0,0.5)] before:content-[''] before:absolute before:left-0 before:top-0 before:h-full before:w-[3px] before:bg-gradient-to-b before:from-[#D4AF37] before:via-[#00F2FF] before:to-transparent"
  const sectionStyle = { background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(20px)' };

  const [hasProfile, setHasProfile] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [groundingSources, setGroundingSources] = useState<any[]>([]);
  
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

  const chatSessionRef = useRef<Chat | null>(null);
  
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
        { name: 'Admin/Trustee', value: 1200, fill: '#64748b' },
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

  const handleProfileSubmit = async (profile: UserProfile) => {
    gtm.funnelComplete(profile);
    setUserProfile(profile);
    setIsChatLoading(true);
    setHasProfile(true);

    try {
      chatSessionRef.current = createInvestmentChat(profile, simParams);
      const prompt = generateInitialAnalysisPrompt(profile, simParams);
      const result = await chatSessionRef.current.sendMessage({ message: prompt });
      const sources = result.candidates?.[0]?.groundingMetadata?.groundingChunks?.map((chunk: any) => ({ title: chunk.web?.title || "Données DLD", uri: chunk.web?.uri })).filter((s: any) => s.uri) || [];
      setGroundingSources(sources);
      setMessages([{ id: '1', role: Role.MODEL, text: result.text || "Analyse terminée.", timestamp: new Date() }]);
    } catch (error) {
      console.error("Init Error", error);
    } finally {
      setIsChatLoading(false);
    }
  };

  const handleSendMessage = async (text: string) => {
    if (!chatSessionRef.current || isChatLoading) return;
    const newMsg: Message = { id: Date.now().toString(), role: Role.USER, text, timestamp: new Date() };
    setMessages(prev => [...prev, newMsg]);
    setIsChatLoading(true);

    try {
      const result = await chatSessionRef.current.sendMessage({ message: text });
      const sources = result.candidates?.[0]?.groundingMetadata?.groundingChunks?.map((chunk: any) => ({ title: chunk.web?.title || "Marché Immo", uri: chunk.web?.uri })).filter((s: any) => s.uri) || [];
      setGroundingSources(sources);
      setMessages(prev => [...prev, { id: (Date.now() + 1).toString(), role: Role.MODEL, text: result.text || "Analyse en cours...", timestamp: new Date() }]);
    } catch (error) {
      console.error("Chat Error", error);
    } finally {
      setIsChatLoading(false);
    }
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

  const formatCurrency = (val: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(val);

  return (
    <div className="min-h-screen font-sans" style={{ background: '#050505', color: 'rgba(240,235,224,0.88)' }}>
      <SmartNavbar
        message={isChatLoading ? "Analyse de votre profil en cours…" : `Bonjour ${userProfile?.name?.split(' ')[0] || ''} — votre simulation est prête. Posez-moi vos questions.`}
        isStreaming={isChatLoading}
        hasProfile={hasProfile}
        onReset={() => { setHasProfile(false); setUserProfile(null); setMessages([]); }}
        exchangeRate={simParams.exchangeRate}
      />

      <div className="relative">
      {!hasProfile && (
        <>
          <HeroSection
            avgYield={7.4}
            avgPrice={1_850_000}
            totalTransactions={14320}
            onCTAClick={() => document.getElementById('decision-tree')?.scrollIntoView({ behavior: 'smooth' })}
          />
          <div id="decision-tree" className="relative w-full flex flex-col items-center justify-start py-16 px-4" style={{ background: '#050505' }}>
            <DecisionTree onSubmit={handleProfileSubmit} isLoading={isChatLoading} />
          </div>
        </>
      )}

      {hasProfile && (
        <div className="pt-20 md:pt-24 pb-20 px-4 md:px-8 max-w-[1700px] mx-auto animate-fadeIn flex flex-col xl:flex-row gap-8">
            
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
                        <span className="text-2xl md:text-4xl font-serif text-gold-500 opacity-20 font-bold shrink-0">01</span>
                        <div>
                            <h2 className="text-xl md:text-3xl font-serif text-white">Par quel quartier commencer ?</h2>
                            <p className="text-xs text-slate-400 uppercase tracking-widest">Rendement · valorisation · risque · comparatif selon votre profil</p>
                        </div>
                    </div>
                    <InvestmentDecisionCharts profile={userProfile!} />
                </section>
                
                {/* THEME 2: PRISE DE VALEUR & HORIZON */}
                <section className={sectionClassName} style={sectionStyle}>
                    <div className="flex items-center gap-3 md:gap-4 mb-6 flex-wrap">
                        <span className="text-2xl md:text-4xl font-serif text-gold-500 opacity-20 font-bold shrink-0">02</span>
                        <div>
                            <h2 className="text-xl md:text-3xl font-serif text-white">Combien vaudra votre bien dans {simParams.duration} ans ?</h2>
                            <p className="text-xs text-slate-400 uppercase tracking-widest">Projection de valeur vs épargne classique en France</p>
                        </div>
                    </div>
                    
                    <div className="glass-panel p-6 rounded-2xl border border-white/5 mb-6">
                        <div className="flex justify-between items-center mb-4">
                            <label className="text-sm font-bold text-white flex items-center gap-2">
                                <TrendingUpIcon className="w-4 h-4 text-gold-400" /> Dans combien d'années récupérez-vous votre argent ?
                            </label>
                            <span className="text-xl font-serif text-gold-400">{simParams.duration} ans</span>
                        </div>
                        <input 
                            type="range" min="5" max="30" step="1" 
                            value={simParams.duration} 
                            onChange={(e) => setSimParams({...simParams, duration: parseInt(e.target.value)})}
                            className="modern-slider slider-gold"
                        />
                         <div className="flex justify-between text-[10px] text-slate-500 mt-2 uppercase font-bold">
                            <span>Court Terme (5 ans)</span>
                            <span>Retraite (30 ans)</span>
                         </div>
                    </div>

                    <div className="h-[260px] md:h-[500px]">
                         <GrowthVisualizer data={calculationResult.chartData} duration={simParams.duration} />
                    </div>
                </section>


                {/* THEME 3: ROI LOCATIF & TYPE DE LOCATION */}
                <section className={sectionClassName} style={sectionStyle}>
                    <div className="flex items-center gap-3 md:gap-4 mb-6 flex-wrap">
                        <span className="text-2xl md:text-4xl font-serif text-gold-500 opacity-20 font-bold shrink-0">03</span>
                        <div>
                            <h2 className="text-xl md:text-3xl font-serif text-white">Ce que vous toucherez chaque mois</h2>
                            <p className="text-xs text-slate-400 uppercase tracking-widest">Loyer net estimé après charges et frais de gestion</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 mb-6">
                        {/* Strategy Selector */}
                         <div className="glass-panel p-6 rounded-2xl border border-white/5 flex flex-col justify-center">
                            <label className="text-xs font-bold text-slate-300 uppercase tracking-widest mb-4">Comment souhaitez-vous louer ?</label>
                            <div className="flex p-1 bg-midnight-950 rounded-xl border border-white/10">
                                <button
                                    onClick={() => setSimParams({...simParams, strategy: 'long_term'})}
                                    className={`flex-1 py-4 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${
                                        simParams.strategy === 'long_term'
                                        ? 'bg-white/10 text-white shadow-sm border border-white/10'
                                        : 'text-slate-500 hover:text-slate-300'
                                    }`}
                                >
                                    <span className="block text-lg mb-1">🏠</span> Location longue durée
                                </button>
                                <button
                                    onClick={() => setSimParams({...simParams, strategy: 'short_term'})}
                                    className={`flex-1 py-4 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${
                                        simParams.strategy === 'short_term'
                                        ? 'bg-gold-500/20 text-gold-400 shadow-sm border border-gold-500/20'
                                        : 'text-slate-500 hover:text-slate-300'
                                    }`}
                                >
                                     <span className="block text-lg mb-1">🏖️</span> Airbnb / courte durée
                                </button>
                            </div>
                         </div>
                         
                         {/* Quick KPI */}
                         <div className="glass-panel p-6 rounded-2xl border border-white/5 flex items-center justify-between">
                             <div>
                                <p className="text-[10px] text-slate-500 uppercase tracking-widest">Loyer net estimé par mois</p>
                                <p className="text-3xl font-serif text-white mt-1">{formatCurrency(calculationResult.annualRent / 12)}<span className="text-sm text-slate-500">/mois</span></p>
                             </div>
                             <div className="text-right">
                                <p className="text-[10px] text-slate-500 uppercase tracking-widest">Rendement net annuel</p>
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
                        <span className="text-2xl md:text-4xl font-serif text-gold-500 opacity-20 font-bold shrink-0">04</span>
                        <div>
                            <h2 className="text-xl md:text-3xl font-serif text-white">Le coût complet de l'achat</h2>
                            <p className="text-xs text-slate-400 uppercase tracking-widest">DLD 4 % · frais d'agence · charges annuelles · rien de caché</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        <CostBreakdownChart data={calculationResult.costData} />
                        <div className="glass-panel p-6 rounded-2xl border border-white/5 flex flex-col justify-center gap-6">
                            <div className="flex items-start gap-4">
                                <div className="p-3 bg-gold-500/10 rounded-full text-gold-400"><BuildingIcon className="w-6 h-6" /></div>
                                <div>
                                    <h4 className="text-white font-bold mb-1">DLD Fee (4 %) — obligatoire</h4>
                                    <p className="text-xs text-slate-400 leading-relaxed">C'est l'équivalent des frais de notaire en France. Payé une seule fois à l'enregistrement auprès du Dubai Land Department.</p>
                                </div>
                            </div>
                            <div className="flex items-start gap-4">
                                <div className="p-3 bg-blue-500/10 rounded-full text-blue-400"><EuroIcon className="w-6 h-6" /></div>
                                <div>
                                    <h4 className="text-white font-bold mb-1">Service Charges (charges annuelles)</h4>
                                    <p className="text-xs text-slate-400 leading-relaxed">Charges de copropriété (ascenseur, piscine, sécurité, entretien). Estimées à {serviceChargesSqft} AED/sqft/an pour ce bien. Pas de taxe foncière à Dubaï.</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>


                {/* THEME 5: FISCALITÉ & RÉSIDENCE */}
                <section className={sectionClassName} style={sectionStyle}>
                    <div className="flex items-center gap-3 md:gap-4 mb-6 flex-wrap">
                        <span className="text-2xl md:text-4xl font-serif text-gold-500 opacity-20 font-bold shrink-0">05</span>
                        <div>
                            <h2 className="text-xl md:text-3xl font-serif text-white">Ce que vous économisez face à la France</h2>
                            <p className="text-xs text-slate-400 uppercase tracking-widest">0 % d'impôt locatif à Dubaï · comparatif selon votre résidence fiscale</p>
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
                        <span className="text-2xl md:text-4xl font-serif text-gold-500 opacity-20 font-bold shrink-0">06</span>
                        <div>
                            <h2 className="text-xl md:text-3xl font-serif text-white">Où investir et quels biens vous correspondent ?</h2>
                            <p className="text-xs text-slate-400 uppercase tracking-widest">Quartiers à potentiel · annonces sélectionnées selon votre profil</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-8">
                        <DubaiMap onSelectDistrict={handleSelectDistrict} selectedDistrictId={selectedDistrictId} />
                        
                        <div>
                             <h3 className="text-xl font-serif text-white mb-6 pl-4 border-l-2 border-gold-500">
                                {selectedDistrictId 
                                    ? `Projets disponibles : ${properties.find(p => p.districtId === selectedDistrictId)?.location || 'Ce quartier'}` 
                                    : 'Dernières Opportunités Détectées'}
                             </h3>
                             <div className="mb-4">
                                {propertiesSource === 'live' && (
                                  <span className="text-[10px] uppercase tracking-widest px-2 py-1 rounded border text-emerald-400 border-emerald-500/40 bg-emerald-500/10">
                                    Annonces réelles · PropertyFinder
                                  </span>
                                )}
                                {propertiesLoading && (
                                  <span className="ml-2 text-[10px] text-gold-400 animate-pulse">Collecte en cours…</span>
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
                                        Aucune annonce disponible pour ce profil pour le moment.
                                    </div>
                                )}
                             </div>
                        </div>
                    </div>
                </section>

            </div>

            {/* RIGHT COLUMN: CHAT (STICKY) */}
            <div className="hidden xl:block w-[400px] shrink-0">
                <div className="sticky top-28 h-[calc(100vh-140px)]">
                    <ChatInterface 
                        messages={messages} 
                        onSendMessage={handleSendMessage} 
                        isStreaming={isChatLoading} 
                        groundingSources={groundingSources}
                    />
                </div>
            </div>

            {/* MOBILE CHAT (FIXED BOTTOM TOGGLE OR INLINE - For now inline at bottom) */}
            <div className="xl:hidden h-[600px] mt-12">
                 <ChatInterface 
                    messages={messages} 
                    onSendMessage={handleSendMessage} 
                    isStreaming={isChatLoading} 
                    groundingSources={groundingSources}
                />
            </div>
        </div>
      )}

      <LeadModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} property={selectedLeadProperty} userProfile={userProfile} />
      </div>
      <Footer />
    </div>
  );
}

export default App;
