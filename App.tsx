
import React, { useState, useRef, useEffect, useMemo } from 'react';
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
import { ChartIcon, TrendingUpIcon, RobotAvatarIcon, PercentIcon, EuroIcon, BuildingIcon } from './components/Icons';

// Données enrichies
const PROPERTIES_DATA: Property[] = [
  {
    id: 'p1',
    title: "The Address Fountain Views",
    location: "Downtown Dubai",
    districtId: 'downtown',
    price: 480000,
    yield: 6.5,
    type: "Appartement 1 Ch.",
    image: "https://images.unsplash.com/photo-1582653291997-079a1c04e5a1?q=80&w=1200&auto=format&fit=crop",
    beds: 1,
    baths: 2,
    sqm: 79,
    completion: "Prêt",
    serviceChargesSqft: 25,
    marketPriceSqft: 6300, 
    liquidity: 'High',
    catalysts: ['Dubai Mall Exp.', 'Tourisme fort']
  },
  {
    id: 'p2',
    title: "Creek Harbour Horizon",
    location: "Dubai Creek",
    districtId: 'creek',
    price: 320000,
    yield: 7.8,
    type: "Appartement 1 Ch.",
    image: "https://images.unsplash.com/photo-1518684079-3c830dcef090?q=80&w=1200&auto=format&fit=crop",
    beds: 1,
    baths: 1,
    sqm: 67,
    completion: "Q4 2026",
    serviceChargesSqft: 16,
    marketPriceSqft: 5200,
    liquidity: 'Medium',
    catalysts: ['Metro Bleu', 'Nouvelle Tour']
  },
  {
    id: 'p3',
    title: "Marina Gate Tower",
    location: "Dubai Marina",
    districtId: 'marina',
    price: 650000,
    yield: 5.9,
    type: "Appartement 2 Ch.",
    image: "https://images.unsplash.com/photo-1549944850-84e00be4203b?q=80&w=1200&auto=format&fit=crop",
    beds: 2,
    baths: 3,
    sqm: 116,
    completion: "Prêt",
    serviceChargesSqft: 18,
    marketPriceSqft: 5800,
    liquidity: 'High',
    catalysts: ['Bord de mer', 'Densité Max']
  },
  {
    id: 'p4',
    title: "Signature Villa Frond J",
    location: "The Palm Jumeirah",
    districtId: 'palm',
    price: 4500000,
    yield: 4.2,
    type: "Villa 5 Ch.",
    image: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?q=80&w=1200&auto=format&fit=crop",
    beds: 5,
    baths: 6,
    sqm: 632,
    completion: "Prêt",
    serviceChargesSqft: 12, 
    marketPriceSqft: 7500,
    liquidity: 'Medium',
    catalysts: ['Rareté', 'Casino Wynn (Proximité)']
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

  // New states for interactive filtering
  const [selectedDistrictId, setSelectedDistrictId] = useState<string | undefined>(undefined);

  const [simParams, setSimParams] = useState<SimulationParams>({
    rentalYield: 8.0,
    appreciation: 5.0,
    exchangeRate: 4.0, 
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

  useEffect(() => {
    if (hasProfile) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [hasProfile]); 

  const calculationResult = useMemo(() => {
    const selectedProp = PROPERTIES_DATA.find(p => p.id === simParams.selectedPropertyId);
    
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
        { name: 'Cashflow Net', value: Math.round(netRentMonth), type: 'income' as const, fill: '#D4AF37' }
      ] as CashflowDataPoint[], 
      costData: [
        { name: 'DLD Fee (4%)', value: propertyPrice * 0.04, fill: '#D4AF37' },
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
  }, [simParams, userProfile]);

  // Filtering properties based on map selection
  const filteredProperties = useMemo(() => {
      if (!selectedDistrictId) return PROPERTIES_DATA;
      return PROPERTIES_DATA.filter(p => p.districtId === selectedDistrictId);
  }, [selectedDistrictId]);

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

  const formatCurrency = (val: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(val);

  return (
    <div className="min-h-screen bg-midnight-950 text-slate-200 font-sans selection:bg-gold-500 selection:text-white">
      <SmartNavbar 
        message={isChatLoading ? "IA : Analyse de votre capacité financière..." : "Expertise patrimoniale active."} 
        isStreaming={isChatLoading} 
        hasProfile={hasProfile}
        onReset={() => { setHasProfile(false); setUserProfile(null); setMessages([]); }}
        exchangeRate={simParams.exchangeRate}
      />

      {!hasProfile && (
        <div className="relative min-h-screen w-full flex flex-col items-center justify-start py-24 px-4">
            <div className="fixed inset-0 z-0">
               <img src="https://images.unsplash.com/photo-1512453979798-5ea266f8880c?q=80&w=2340&auto=format&fit=crop" className="w-full h-full object-cover opacity-20 animate-slow-zoom" alt="Dubai" />
               <div className="absolute inset-0 bg-gradient-to-b from-midnight-950/90 via-midnight-950/40 to-midnight-950"></div>
            </div>
            <div className="relative z-10 w-full">
                <div className="text-center mb-12 animate-fade-in max-w-2xl mx-auto">
                   <div className="inline-block px-3 py-1 bg-gold-500/10 border border-gold-500/20 rounded-full mb-6">
                      <p className="text-[10px] font-bold text-gold-400 uppercase tracking-[0.2em]">IA de Conseil en Arbitrage Patrimonial</p>
                   </div>
                   <h1 className="text-4xl md:text-6xl font-serif text-white mb-4">Dubai<span className="text-gold-400 italic">Invest</span></h1>
                   <p className="text-slate-400 font-light max-w-md mx-auto leading-relaxed">Construisez votre stratégie d'investissement étape par étape.</p>
                </div>
                
                <DecisionTree onSubmit={handleProfileSubmit} isLoading={isChatLoading} />
            </div>
        </div>
      )}

      {hasProfile && (
        <div className="pt-24 pb-20 px-4 md:px-8 max-w-[1700px] mx-auto animate-fadeIn flex flex-col xl:flex-row gap-8">
            
            {/* LEFT COLUMN: 5 THEMATIC SECTIONS */}
            <div className="xl:flex-1 space-y-24 min-w-0 pb-32">
                
                {/* THEME 1: PRISE DE VALEUR & HORIZON */}
                <section>
                    <div className="flex items-center gap-4 mb-6">
                        <span className="text-4xl font-serif text-gold-500 opacity-20 font-bold">01</span>
                        <div>
                            <h2 className="text-3xl font-serif text-white">Prise de Valeur à la Revente</h2>
                            <p className="text-xs text-slate-400 uppercase tracking-widest">Projection de croissance patrimoniale</p>
                        </div>
                    </div>
                    
                    <div className="glass-panel p-6 rounded-2xl border border-white/5 mb-6">
                        <div className="flex justify-between items-center mb-4">
                            <label className="text-sm font-bold text-white flex items-center gap-2">
                                <TrendingUpIcon className="w-4 h-4 text-gold-400" /> Horizon de Temps
                            </label>
                            <span className="text-xl font-serif text-gold-400">{simParams.duration} Ans</span>
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

                    <div className="h-[500px]">
                         <GrowthVisualizer data={calculationResult.chartData} duration={simParams.duration} />
                    </div>
                </section>


                {/* THEME 2: ROI LOCATIF & TYPE DE LOCATION */}
                <section>
                    <div className="flex items-center gap-4 mb-6">
                        <span className="text-4xl font-serif text-gold-500 opacity-20 font-bold">02</span>
                        <div>
                            <h2 className="text-3xl font-serif text-white">Rentabilité Locative</h2>
                            <p className="text-xs text-slate-400 uppercase tracking-widest">Cashflow Net & Stratégie d'Exploitation</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                        {/* Strategy Selector */}
                         <div className="glass-panel p-6 rounded-2xl border border-white/5 flex flex-col justify-center">
                            <label className="text-xs font-bold text-slate-300 uppercase tracking-widest mb-4">Type de Location</label>
                            <div className="flex p-1 bg-midnight-950 rounded-xl border border-white/10">
                                <button
                                    onClick={() => setSimParams({...simParams, strategy: 'long_term'})}
                                    className={`flex-1 py-4 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${
                                        simParams.strategy === 'long_term' 
                                        ? 'bg-white/10 text-white shadow-sm border border-white/10' 
                                        : 'text-slate-500 hover:text-slate-300'
                                    }`}
                                >
                                    <span className="block text-lg mb-1">🏠</span> Annuel
                                </button>
                                <button
                                    onClick={() => setSimParams({...simParams, strategy: 'short_term'})}
                                    className={`flex-1 py-4 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${
                                        simParams.strategy === 'short_term' 
                                        ? 'bg-gold-500/20 text-gold-400 shadow-sm border border-gold-500/20' 
                                        : 'text-slate-500 hover:text-slate-300'
                                    }`}
                                >
                                     <span className="block text-lg mb-1">🏖️</span> Court Terme (Airbnb)
                                </button>
                            </div>
                         </div>
                         
                         {/* Quick KPI */}
                         <div className="glass-panel p-6 rounded-2xl border border-white/5 flex items-center justify-between">
                             <div>
                                <p className="text-[10px] text-slate-500 uppercase tracking-widest">Revenu Locatif Net Estimé</p>
                                <p className="text-3xl font-serif text-white mt-1">{formatCurrency(calculationResult.annualRent / 12)}<span className="text-sm text-slate-500">/mois</span></p>
                             </div>
                             <div className="text-right">
                                <p className="text-[10px] text-slate-500 uppercase tracking-widest">Net-Net Yield</p>
                                <p className="text-3xl font-mono text-emerald-400 mt-1 font-bold">{((calculationResult.annualRent / calculationResult.propertyPrice) * 100).toFixed(2)}%</p>
                             </div>
                         </div>
                    </div>

                    <div className="h-[400px]">
                        <StrategyComparison property={calculationResult.selectedProperty} params={simParams} totalBudget={parseFloat(userProfile?.totalBudget || '0')} />
                    </div>
                </section>


                {/* THEME 3: FRAIS & TAXES (ACQUISITION) */}
                <section>
                    <div className="flex items-center gap-4 mb-6">
                        <span className="text-4xl font-serif text-gold-500 opacity-20 font-bold">03</span>
                        <div>
                            <h2 className="text-3xl font-serif text-white">Frais d'Acquisition & Charges</h2>
                            <p className="text-xs text-slate-400 uppercase tracking-widest">Coûts cachés et frais d'entrée</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 h-[350px]">
                        <CostBreakdownChart data={calculationResult.costData} />
                        <div className="glass-panel p-6 rounded-2xl border border-white/5 flex flex-col justify-center gap-6">
                            <div className="flex items-start gap-4">
                                <div className="p-3 bg-gold-500/10 rounded-full text-gold-400"><BuildingIcon className="w-6 h-6" /></div>
                                <div>
                                    <h4 className="text-white font-bold mb-1">DLD Fee (4%)</h4>
                                    <p className="text-xs text-slate-400 leading-relaxed">Équivalent des frais de notaire. À payer une seule fois à l'enregistrement.</p>
                                </div>
                            </div>
                            <div className="flex items-start gap-4">
                                <div className="p-3 bg-blue-500/10 rounded-full text-blue-400"><EuroIcon className="w-6 h-6" /></div>
                                <div>
                                    <h4 className="text-white font-bold mb-1">Service Charges</h4>
        <p className="text-xs text-slate-400 leading-relaxed">Charges de copropriété (ascenseur, piscine, sécurité). Estimé à {serviceChargesSqft} AED/sqft.</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>


                {/* THEME 4: FISCALITÉ & RÉSIDENCE */}
                <section>
                    <div className="flex items-center gap-4 mb-6">
                        <span className="text-4xl font-serif text-gold-500 opacity-20 font-bold">04</span>
                        <div>
                            <h2 className="text-3xl font-serif text-white">Optimisation Fiscale</h2>
                            <p className="text-xs text-slate-400 uppercase tracking-widest">Simulateur selon votre résidence</p>
                        </div>
                    </div>

                    <FiscalitySimulator 
                        params={simParams} 
                        onChange={(res) => setSimParams({...simParams, taxResidence: res})} 
                        annualRent={calculationResult.annualRent} 
                    />
                </section>


                {/* THEME 5: OPPORTUNITÉS & CARTE */}
                <section>
                    <div className="flex items-center gap-4 mb-6">
                        <span className="text-4xl font-serif text-gold-500 opacity-20 font-bold">05</span>
                        <div>
                            <h2 className="text-3xl font-serif text-white">Carte des Opportunités</h2>
                            <p className="text-xs text-slate-400 uppercase tracking-widest">Zones à fort potentiel de construction</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-8">
                        <DubaiMap onSelectDistrict={handleSelectDistrict} selectedDistrictId={selectedDistrictId} />
                        
                        <div>
                             <h3 className="text-xl font-serif text-white mb-6 pl-4 border-l-2 border-gold-500">
                                {selectedDistrictId 
                                    ? `Projets disponibles : ${PROPERTIES_DATA.find(p => p.districtId === selectedDistrictId)?.location || 'Ce quartier'}` 
                                    : 'Dernières Opportunités Détectées'}
                             </h3>
                             <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                {filteredProperties.length > 0 ? (
                                    filteredProperties.map(p => (
                                        <PropertyCard 
                                            key={p.id} 
                                            property={p} 
                                            isSelected={simParams.selectedPropertyId === p.id} 
                                            onSelect={handleSelectProperty} 
                                            onContact={(p) => { setSelectedLeadProperty(p); setIsModalOpen(true); }} 
                                        />
                                    ))
                                ) : (
                                    <div className="col-span-2 py-12 text-center text-slate-500 bg-white/5 rounded-xl border border-dashed border-white/10">
                                        Aucune propriété disponible dans ce secteur pour le moment.
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

      <LeadModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} property={selectedLeadProperty} />
    </div>
  );
}

export default App;
