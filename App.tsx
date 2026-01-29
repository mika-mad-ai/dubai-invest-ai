
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { GoogleGenAI, Chat, GenerateContentResponse } from "@google/genai";
import { Sparkles, Zap } from "lucide-react";
import { UserProfile, Message, Role, ChartDataPoint, SimulationParams, CashflowDataPoint, CostDataPoint, ExchangeRateDataPoint, Property } from './types';
import { createInvestmentChat, generateInitialAnalysisPrompt } from './services/geminiService';
import ProfileForm from './components/ProfileForm';
import ChatInterface from './components/ChatInterface';
import ProjectionsChart from './components/ProjectionsChart';
import ControlPanel from './components/ControlPanel';
import StatCard from './components/kpi/StatCard';
import CashflowChart from './components/charts/CashflowChart';
import CostBreakdownChart from './components/charts/CostBreakdownChart';
import ExchangeRateChart from './components/charts/ExchangeRateChart';
import TaxComparisonChart from './components/charts/TaxComparisonChart';
import LoanComparisonChart from './components/charts/LoanComparisonChart';
import PropertyCard from './components/PropertyCard';
import LeadModal from './components/LeadModal';
import ScrollReveal from './components/ScrollReveal';
import GrowthVisualizer from './components/GrowthVisualizer';
import SmartNavbar from './components/SmartNavbar';
import { ChartIcon, TrendingUpIcon, RobotAvatarIcon, PercentIcon, EuroIcon } from './components/Icons';

const PROPERTIES_DATA: Property[] = [
  {
    id: 'p1',
    title: "The Address Fountain Views",
    location: "Downtown Dubai",
    price: 480000,
    yield: 6.5,
    type: "Appartement 1 Ch.",
    image: "https://images.unsplash.com/photo-1582653291997-079a1c04e5a1?q=80&w=1200&auto=format&fit=crop",
    beds: 1,
    baths: 2,
    sqm: 79,
    completion: "Prêt"
  },
  {
    id: 'p2',
    title: "Creek Harbour Horizon",
    location: "Dubai Creek",
    price: 320000,
    yield: 7.8,
    type: "Appartement 1 Ch.",
    image: "https://images.unsplash.com/photo-1518684079-3c830dcef090?q=80&w=1200&auto=format&fit=crop",
    beds: 1,
    baths: 1,
    sqm: 67,
    completion: "Q4 2026"
  },
  {
    id: 'p3',
    title: "Marina Gate Tower",
    location: "Dubai Marina",
    price: 650000,
    yield: 5.9,
    type: "Appartement 2 Ch.",
    image: "https://images.unsplash.com/photo-1549944850-84e00be4203b?q=80&w=1200&auto=format&fit=crop",
    beds: 2,
    baths: 3,
    sqm: 116,
    completion: "Prêt"
  },
  {
    id: 'p4',
    title: "Signature Villa Frond J",
    location: "The Palm Jumeirah",
    price: 4500000,
    yield: 4.2,
    type: "Villa 5 Ch.",
    image: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?q=80&w=1200&auto=format&fit=crop",
    beds: 5,
    baths: 6,
    sqm: 632,
    completion: "Prêt"
  }
];

function App() {
  const [hasProfile, setHasProfile] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [groundingSources, setGroundingSources] = useState<any[]>([]);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedLeadProperty, setSelectedLeadProperty] = useState<Property | null>(null);

  const [simParams, setSimParams] = useState<SimulationParams>({
    rentalYield: 8.0,
    appreciation: 5.0,
    exchangeRate: 4.0, 
    occupancy: 90,
    duration: 10,
    strategy: 'long_term',
    riskTolerance: 3, 
    selectedPropertyId: undefined
  });

  const chatSessionRef = useRef<Chat | null>(null);

  useEffect(() => {
    if (hasProfile) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [hasProfile]); 

  const calculationResult = useMemo(() => {
    const propertyPrice = simParams.selectedPropertyId 
      ? PROPERTIES_DATA.find(p => p.id === simParams.selectedPropertyId)?.price || 400000 
      : (userProfile ? parseFloat(userProfile.totalBudget) : 400000);
    
    const initialCash = userProfile ? parseFloat(userProfile.initialInvestment) : 150000;
    const monthlyContribution = userProfile ? parseFloat(userProfile.monthlyContribution) : 1200;
    const duration = userProfile ? parseInt(userProfile.duration) : simParams.duration;
    const roiDelayMonths = userProfile ? parseInt(userProfile.roiDelay) : 0;
    
    const loanAmount = Math.max(0, propertyPrice - initialCash);
    const baseAppreciation = userProfile?.propertyStatus === 'off-plan' ? simParams.appreciation * 1.4 : simParams.appreciation;
    const occupancy = simParams.strategy === 'short_term' ? 0.75 : 0.92;
    const managementFeeRate = simParams.strategy === 'short_term' ? 0.18 : 0.05;
    const targetMonthlyRent = (propertyPrice * (simParams.rentalYield / 100) / 12);
    const serviceChargesMonth = (propertyPrice * 0.01 / 12);

    const years = Array.from({ length: duration + 1 }, (_, i) => i);
    const rGrowth = (baseAppreciation / 100);

    const chartData: ChartDataPoint[] = years.map(year => {
      const propertyValue = propertyPrice * Math.pow(1 + rGrowth, year);
      const roiDelayYears = roiDelayMonths / 12;
      const earningYears = Math.max(0, year - roiDelayYears);
      const annualNetRent = (targetMonthlyRent * 12 * occupancy) * (1 - managementFeeRate) - (serviceChargesMonth * 12);
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

    return { 
      chartData, 
      cashflowData: [
        { name: 'Rentabilité Nette', value: Math.round(netRentMonth), type: 'income' as const },
        { name: 'Effort d\'Épargne', value: Math.round(monthlyContribution), type: 'income' as const },
        { name: 'Flux Mensuel Total', value: Math.round(netRentMonth + monthlyContribution), type: 'income' as const, fill: '#D4AF37' }
      ] as CashflowDataPoint[], 
      costData: [
        { name: 'Apport Initial', value: initialCash, fill: '#3b82f6' },
        { name: 'Financement Requis', value: loanAmount, fill: '#D4AF37' },
        { name: 'Frais Notaire (4%)', value: propertyPrice * 0.04, fill: '#64748b' }
      ], 
      tax: { dubai: 0, france: (propertyPrice * 0.22) },
      loan: { amount: loanAmount },
      propertyPrice 
    };
  }, [simParams, userProfile]);

  const handleProfileSubmit = async (profile: UserProfile) => {
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
      const message = error instanceof Error ? error.message : "Erreur inconnue lors de l'initialisation.";
      setMessages([{ id: `init-error-${Date.now()}`, role: Role.MODEL, text: `⚠️ IA indisponible : ${message}`, timestamp: new Date() }]);
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
      setMessages(prev => [...prev, { id: (Date.now() + 1).toString(), role: Role.MODEL, text: result.text || "Mise à jour effectuée.", timestamp: new Date() }]);
    } catch (error) {
      console.error("Chat Error", error);
      const message = error instanceof Error ? error.message : "Erreur inconnue lors de la réponse IA.";
      setMessages(prev => [...prev, { id: `chat-error-${Date.now()}`, role: Role.MODEL, text: `⚠️ IA indisponible : ${message}`, timestamp: new Date() }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  const handleSelectProperty = (property: Property) => {
    setSimParams(prev => ({
      ...prev,
      selectedPropertyId: property.id
    }));
  };

  return (
    <div className="min-h-screen bg-luxury-gradient text-slate-200 font-sans selection:bg-gold-500 selection:text-white relative">
      <div className="aurora"></div>
      <div className="page-surface"></div>
      <div className="page-grid"></div>
      <SmartNavbar 
        message={isChatLoading ? "IA : Analyse de votre capacité financière..." : "Expertise patrimoniale active."} 
        isStreaming={isChatLoading} 
        hasProfile={hasProfile}
        onReset={() => { setHasProfile(false); setUserProfile(null); setMessages([]); }}
        exchangeRate={simParams.exchangeRate}
      />

      {!hasProfile && (
        <div className="relative min-h-screen w-full flex flex-col items-center justify-center py-20 px-4 overflow-hidden">
            <div className="fixed inset-0 z-0">
               <img src="https://images.unsplash.com/photo-1512453979798-5ea266f8880c?q=80&w=2340&auto=format&fit=crop" className="w-full h-full object-cover opacity-20 animate-slow-zoom" alt="Dubai" />
               <div className="absolute inset-0 bg-gradient-to-b from-[#040814]/90 via-[#0b1224]/70 to-[#050912]"></div>
               <div className="absolute -left-10 top-20 w-96 h-96 bg-aqua-500/10 blur-3xl rounded-full"></div>
               <div className="absolute right-0 bottom-0 w-[28rem] h-[28rem] bg-gold-400/10 blur-3xl rounded-full"></div>
            </div>
            <div className="relative z-10 max-w-6xl w-full grid lg:grid-cols-5 gap-10 items-center">
                <div className="lg:col-span-2 space-y-6 animate-fade-in">
                   <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-full text-[11px] uppercase tracking-[0.28em] font-black text-aqua-100 shadow-aqua">
                      <span className="w-2 h-2 rounded-full bg-aqua-300 animate-pulse"></span>
                      Advisory IA Premium
                   </div>
                   <h1 className="text-4xl md:text-5xl xl:text-6xl font-serif text-white leading-tight">
                      Patrimoine <span className="text-gold-400 italic">Dubai</span> sous contrôle.
                   </h1>
                   <p className="text-slate-300 text-base md:text-lg leading-relaxed max-w-xl">
                      Modélisez votre capacité d’investissement en quelques curseurs, comparez Ready vs Off-plan et laissez l’IA sourcer les meilleurs quartiers en temps réel.
                   </p>
                   <div className="flex flex-wrap items-center gap-3">
                      <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-[12px] text-white shadow-aqua">
                        <Sparkles className="w-4 h-4 text-aqua-300" /> Hyper-personnalisation
                      </div>
                      <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-black/40 border border-white/10 text-[12px] text-white shadow-glow">
                        <Zap className="w-4 h-4 text-gold-300" /> Insights en temps réel
                      </div>
                   </div>
                   <div className="grid grid-cols-2 gap-3 max-w-md">
                      <div className="glass-panel rounded-2xl p-4 border border-white/10 shadow-glow overflow-hidden relative">
                        <div className="absolute inset-0 bg-card-sheen opacity-30 animate-sheen"></div>
                        <p className="text-[11px] uppercase tracking-[0.22em] text-slate-400 font-bold">Service d'accompagnement</p>
                        <p className="text-2xl font-serif text-white">IA Gratuit</p>
                      </div>
                      <div className="glass-panel rounded-2xl p-4 border border-white/10 relative overflow-hidden">
                        <div className="absolute inset-0 bg-card-sheen opacity-30 animate-sheen"></div>
                        <p className="text-[11px] uppercase tracking-[0.22em] text-slate-400 font-bold">Temps de réponse</p>
                        <p className="text-2xl font-serif text-white">Instantané</p>
                      </div>
                   </div>
                </div>
                <div className="lg:col-span-3 relative">
                  <div className="absolute -inset-4 bg-card-sheen opacity-40 rounded-[28px] blur-md"></div>
                  <ProfileForm onSubmit={handleProfileSubmit} isLoading={isChatLoading} />
                </div>
            </div>
        </div>
      )}

      {hasProfile && (
        <div className="pt-24 pb-20 px-4 md:px-8 max-w-[1700px] mx-auto animate-fadeIn">
            {/* Chat centré */}
            <div className="flex justify-center mb-10 px-4">
              <div className="relative w-full max-w-5xl">
                <div
                  className="absolute -inset-10 translate-y-4 blur-3xl opacity-70"
                  style={{ background: 'radial-gradient(circle at 50% 50%, rgba(87,226,255,0.28), transparent 65%)' }}
                  aria-hidden="true"
                ></div>
                <div className="glass-panel rounded-[32px] border border-white/10 shadow-[0_30px_90px_-50px_rgba(0,0,0,0.85)] p-2">
                  <ChatInterface 
                      messages={messages} 
                      onSendMessage={handleSendMessage} 
                      isStreaming={isChatLoading} 
                      groundingSources={groundingSources}
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-6 xl:gap-8 items-start mb-12">
                
                {/* DASHBOARD */}
                <div className="xl:col-span-6 min-w-0 flex flex-col gap-6 pr-0">
                    {/* Top KPI row */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <StatCard label="Patrimoine Net" value={new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(calculationResult.chartData[calculationResult.chartData.length-1].scenarioOptimiste)} trend="up" icon={<TrendingUpIcon className="w-5 h-5"/>}/>
                        <StatCard label="Effort Total" value={new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(parseFloat(userProfile?.monthlyContribution || '0') * 12 * parseInt(userProfile?.duration || '10'))} trend="neutral" icon={<ChartIcon className="w-5 h-5"/>}/>
                        <StatCard label="Apport" value={new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(parseFloat(userProfile?.initialInvestment || '0'))} icon={<EuroIcon className="w-5 h-5"/>}/>
                        <StatCard label="Horizon" value={`${userProfile?.duration || '10'} ans`} icon={<PercentIcon className="w-5 h-5"/>}/>
                    </div>

                    {/* Chart section */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                        <div className="lg:col-span-1">
                          <div className="glass-panel rounded-2xl p-4 h-full">
                            <CashflowChart data={calculationResult.cashflowData} />
                          </div>
                        </div>
                        <div className="lg:col-span-1">
                          <div className="glass-panel rounded-2xl p-4 h-full">
                            <CostBreakdownChart data={calculationResult.costData} />
                          </div>
                        </div>
                        <div className="lg:col-span-1 flex flex-col gap-6">
                           <div className="glass-panel p-4 rounded-2xl border border-white/5 flex flex-col justify-center items-center text-center">
                              <p className="text-[10px] text-gold-400 uppercase tracking-widest font-black mb-2">Statut Cible</p>
                              <p className="text-2xl font-serif text-white uppercase">{userProfile?.propertyStatus}</p>
                              <div className="w-full h-px bg-white/10 my-4"></div>
                              <p className="text-[10px] text-slate-500 uppercase tracking-widest font-black mb-2">Risque Profil</p>
                              <div className="flex gap-1">
                                {[...Array(5)].map((_, i) => (
                                  <div key={i} className={`w-3 h-3 rounded-full ${i < (userProfile?.riskLevel || 3) ? 'bg-gold-500' : 'bg-white/10'}`}></div>
                                ))}
                              </div>
                           </div>
                        </div>
                    </div>

                    <div className="glass-panel rounded-2xl p-4">
                      <GrowthVisualizer data={calculationResult.chartData} duration={userProfile ? parseInt(userProfile.duration) : 10} />
                    </div>
                </div>
            </div>

            {/* SECTIONS SECONDAIRES */}
            <div className="space-y-12 mt-12">
                <ScrollReveal>
                  <h2 className="text-3xl font-serif text-white mb-8 border-l-4 border-gold-500 pl-6">Optimisation Fiscale & Financement</h2>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                      <TaxComparisonChart franceTax={calculationResult.tax.france} dubaiTax={calculationResult.tax.dubai} duration={userProfile ? parseInt(userProfile.duration) : 10} />
                      <LoanComparisonChart loanAmount={calculationResult.loan.amount} duration={userProfile ? parseInt(userProfile.duration) : 10} rates={{france: 3.5, dubai: 5.5}} propertyPrice={calculationResult.propertyPrice} />
                  </div>
                </ScrollReveal>

                <ScrollReveal delay={200}>
                  <h2 className="text-3xl font-serif text-white mb-8 border-l-4 border-gold-500 pl-6">Ajustements de Marché</h2>
                  <ControlPanel params={simParams} onChange={setSimParams} />
                </ScrollReveal>

                <ScrollReveal delay={400}>
                  <h2 className="text-3xl font-serif text-white mb-8 border-l-4 border-gold-500 pl-6">Opportunités Immobilières Détectées</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                      {PROPERTIES_DATA.map(p => (
                        <PropertyCard key={p.id} property={p} isSelected={simParams.selectedPropertyId === p.id} onSelect={handleSelectProperty} onContact={(p) => { setSelectedLeadProperty(p); setIsModalOpen(true); }} />
                      ))}
                  </div>
                </ScrollReveal>
            </div>
        </div>
      )}

      <LeadModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} property={selectedLeadProperty} />
    </div>
  );
}

export default App;
