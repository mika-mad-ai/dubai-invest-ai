import React, { useState, useRef, useEffect, useLayoutEffect, useMemo } from 'react';
import { UserProfile, PropertyStatus } from '../types';
import { ArrowRightIcon, BuildingIcon, TrendingUpIcon, ShieldIcon, EuroIcon, CheckIcon } from './Icons';

interface DecisionTreeProps {
  onSubmit: (profile: UserProfile) => void;
  isLoading: boolean;
}

type StepOption = {
  value: string | number;
  label: string;
  desc: string;
  icon?: React.ComponentType<{ className?: string }>;
  updates: Partial<UserProfile>;
};

type TreeStep = {
  id: string;
  question: string;
  options: StepOption[];
};

// Configuration des étapes de l'arbre
const TREE_STEPS: TreeStep[] = [
  {
    id: 'strategy',
    question: "Quel type d'actif ciblez-vous ?",
    options: [
      { 
        value: 'ready', 
        label: 'Prêt à Louer (Ready)', 
        icon: BuildingIcon,
        desc: 'Revenus immédiats',
        updates: { propertyStatus: 'ready' as PropertyStatus, roiDelay: '0' }
      },
      { 
        value: 'off-plan', 
        label: 'Sur Plan (Off-Plan)', 
        icon: TrendingUpIcon,
        desc: 'Paiement échelonné',
        updates: { propertyStatus: 'off-plan' as PropertyStatus, roiDelay: '24' }
      }
    ]
  },
  {
    id: 'budget',
    question: "Quelle est votre capacité d'investissement globale ?",
    options: [
      { 
        value: 'starter', 
        label: 'Starter (< 250k€)', 
        desc: 'Studio / 1BR Smart',
        updates: { totalBudget: '200000', initialInvestment: '80000', monthlyContribution: '800' }
      },
      { 
        value: 'growth', 
        label: 'Growth (250k - 500k€)', 
        desc: '1BR Premium / 2BR',
        updates: { totalBudget: '400000', initialInvestment: '150000', monthlyContribution: '1200' }
      },
      { 
        value: 'premium', 
        label: 'Elite (500k - 1M€)', 
        desc: 'Luxury / Penthouse',
        updates: { totalBudget: '750000', initialInvestment: '300000', monthlyContribution: '2500' }
      },
      { 
        value: 'ultra', 
        label: 'Ultra (> 1M€)', 
        desc: 'Villas / Full Floor',
        updates: { totalBudget: '1500000', initialInvestment: '800000', monthlyContribution: '5000' }
      }
    ]
  },
  {
    id: 'risk',
    question: "Quel est votre appétit au risque ?",
    options: [
      { 
        value: 2, 
        label: 'Prudent', 
        icon: ShieldIcon,
        desc: 'Capital garanti prio.',
        updates: { riskLevel: 2 }
      },
      { 
        value: 3, 
        label: 'Équilibré', 
        icon: EuroIcon,
        desc: 'Mix Rendement/Sécu',
        updates: { riskLevel: 3 }
      },
      { 
        value: 5, 
        label: 'Dynamique', 
        icon: TrendingUpIcon,
        desc: 'Plus-value max',
        updates: { riskLevel: 5 }
      }
    ]
  }
];

interface Point {
    x: number;
    y: number;
}

interface PathData {
    d: string;
    key: string;
}

const DecisionTree: React.FC<DecisionTreeProps> = ({ onSubmit, isLoading }) => {
  const [stepIndex, setStepIndex] = useState(0);
  const [history, setHistory] = useState<number[]>([]); // Stores selected option index for each step
  const [paths, setPaths] = useState<PathData[]>([]);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  
  // Ref map: [stepIndex][optionIndex] -> HTMLElement
  const itemsRef = useRef<Array<Array<HTMLButtonElement | null>>>([]);

  const [profile, setProfile] = useState<UserProfile>({
    name: '',
    email: '',
    totalBudget: '400000',
    initialInvestment: '150000',
    monthlyContribution: '1200',
    duration: '10',
    propertyStatus: 'ready',
    riskLevel: 3,
    roiDelay: '0'
  });

  // --- CALCULATION LOGIC FOR THE BUBBLE ---
  const projectedRoi = useMemo(() => {
    // Base Market Appreciation (conservative 10y)
    let roi = 45; 

    // Strategy Impact
    if (profile.propertyStatus === 'off-plan') {
        roi += 25; // Off-plan typically offers higher capital appreciation
    } else {
        roi += 10; // Ready properties are more stable
    }

    // Budget Impact (Scarcity of luxury assets)
    const budget = parseInt(profile.totalBudget);
    if (budget >= 1000000) roi += 15; // Ultra luxury scarcity
    else if (budget >= 500000) roi += 8;

    // Risk Impact (Risk premium)
    // Higher risk = higher expected return
    roi += (profile.riskLevel * 3);

    return Math.min(roi, 130); // Cap at 130% to remain realistic
  }, [profile]);

  // Initialize refs array
  if (itemsRef.current.length !== TREE_STEPS.length) {
      itemsRef.current = Array(TREE_STEPS.length).fill(null).map(() => []);
  }

  // Calculate paths for SVG lines
  const calculatePaths = () => {
      if (!containerRef.current) return;
      
      const newPaths: PathData[] = [];
      const containerRect = containerRef.current.getBoundingClientRect();

      // For each completed step (that has a selection), connect to next step's visible options
      history.forEach((selectedOptionIdx, stepIdx) => {
          // If there is no next step, stop
          if (stepIdx >= TREE_STEPS.length - 1) return;
          
          // Source: The selected option in current step
          const sourceEl = itemsRef.current[stepIdx][selectedOptionIdx];
          
          // Targets: All options in next step (stepIdx + 1)
          const nextStepIdx = stepIdx + 1;
          const nextOptions = itemsRef.current[nextStepIdx];
          
          if (sourceEl && nextOptions) {
              const sourceRect = sourceEl.getBoundingClientRect();
              const startX = sourceRect.left - containerRect.left + sourceRect.width / 2;
              const startY = sourceRect.bottom - containerRect.top;

              nextOptions.forEach((targetEl, targetIdx) => {
                  if (!targetEl) return;
                  
                  const targetRect = targetEl.getBoundingClientRect();
                  const endX = targetRect.left - containerRect.left + targetRect.width / 2;
                  const endY = targetRect.top - containerRect.top;

                  // Spacing configuration
                  const midY = endY - 60; // Lower split line for more air
                  const radius = 20; // Radius for rounded corners

                  let d = `M ${startX} ${startY}`;

                  // Vertical down to start curve
                  d += ` L ${startX} ${midY - radius}`;

                  // If purely vertical (aligned), just draw straight
                  if (Math.abs(startX - endX) < 1) {
                      d += ` L ${startX} ${endY}`;
                  } else {
                      // Determine direction
                      const isRight = endX > startX;
                      const dir = isRight ? 1 : -1;

                      // Curve 1: Vertical -> Horizontal
                      // Q controlPointX controlPointY endX endY
                      d += ` Q ${startX} ${midY} ${startX + (radius * dir)} ${midY}`;

                      // Horizontal Line
                      d += ` L ${endX - (radius * dir)} ${midY}`;

                      // Curve 2: Horizontal -> Vertical
                      d += ` Q ${endX} ${midY} ${endX} ${midY + radius}`;

                      // Final vertical drop
                      d += ` L ${endX} ${endY}`;
                  }
                  
                  newPaths.push({ d, key: `${stepIdx}-${selectedOptionIdx}-to-${nextStepIdx}-${targetIdx}` });
              });
          }
      });
      setPaths(newPaths);
  };

  // Recalculate paths on resize or state change
  useLayoutEffect(() => {
     const timer = setTimeout(() => {
         calculatePaths();
     }, 600); // Wait for transition animations (scale effect)
     
     calculatePaths();

     window.addEventListener('resize', calculatePaths);
     return () => {
         window.removeEventListener('resize', calculatePaths);
         clearTimeout(timer);
     };
  }, [stepIndex, history]);

  // Scroll logic
  useEffect(() => {
    if (stepIndex === TREE_STEPS.length && scrollRef.current) {
        setTimeout(() => {
            scrollRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 300);
    } else {
        const activeStepContainer = itemsRef.current[stepIndex]?.[0]?.parentElement?.parentElement?.parentElement;
        if(activeStepContainer) {
            setTimeout(() => {
                 activeStepContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 300);
        }
    }
  }, [stepIndex]);

  const handleOptionClick = (stepIdx: number, optionIdx: number, option: any) => {
    setProfile(prev => ({ ...prev, ...option.updates }));

    if (stepIdx < stepIndex) {
        const newHistory = history.slice(0, stepIdx);
        newHistory.push(optionIdx);
        setHistory(newHistory);
        setStepIndex(stepIdx + 1);
    } else {
        setHistory(prev => [...prev, optionIdx]);
        setStepIndex(prev => prev + 1);
    }
  };

  const handleFinalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(profile);
  };

  return (
    <div className="w-full max-w-7xl mx-auto pb-40 px-4 relative" ref={containerRef}>
      
      {/* FLOATING ROI BUBBLE */}
      <div className="fixed top-24 right-4 md:right-8 z-50 animate-fade-in transition-all duration-300">
        <div className="glass-panel p-4 rounded-2xl border border-gold-500/30 shadow-[0_0_40px_rgba(212,175,55,0.15)] backdrop-blur-xl flex flex-col items-center min-w-[120px] transform hover:scale-105 transition-transform cursor-help group">
           <span className="text-[9px] text-slate-400 uppercase tracking-widest font-bold mb-1 group-hover:text-gold-300 transition-colors">Horizon 10 Ans</span>
           <div className="flex items-center gap-2">
              <TrendingUpIcon className="w-5 h-5 text-gold-500 animate-pulse" />
              <span className="text-3xl font-serif text-white font-bold transition-all" key={projectedRoi}>+{projectedRoi}%</span>
           </div>
           <span className="text-[8px] text-gold-400/80 mt-1 font-semibold uppercase tracking-wider">Prise de Valeur</span>
        </div>
      </div>

      {/* SVG LAYER FOR CONNECTIONS */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none z-0 overflow-visible">
          <defs>
              <linearGradient id="gold-line-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#D4AF37" stopOpacity="0.8" />
                  <stop offset="100%" stopColor="#D4AF37" stopOpacity="0.1" />
              </linearGradient>
          </defs>
          {paths.map((p) => (
              <path 
                key={p.key} 
                d={p.d} 
                fill="none" 
                stroke="url(#gold-line-gradient)" 
                strokeWidth="1.5"
                className="animate-draw-line"
                style={{ strokeDasharray: 3000, strokeDashoffset: 3000, animation: 'dash 1.2s forwards ease-out' }}
              />
          ))}
          <style>{`
            @keyframes dash {
              to {
                stroke-dashoffset: 0;
              }
            }
          `}</style>
      </svg>

      <div className="flex flex-col items-center relative z-10">
        
        {/* START NODE */}
        <div className="mb-20 relative animate-fade-in">
            <div className="glass-panel px-8 py-3 rounded-full border border-gold-500/30 text-gold-400 font-bold uppercase tracking-widest text-xs shadow-[0_0_25px_rgba(212,175,55,0.15)] backdrop-blur-xl relative z-20 bg-midnight-950">
                Départ Simulation
            </div>
             {/* Initial line down */}
             <div className={`absolute left-1/2 -translate-x-1/2 top-full w-px bg-gradient-to-b from-gold-500/50 to-gold-500/10 transition-all duration-1000 ease-in-out ${stepIndex >= 0 ? 'h-20 opacity-100' : 'h-0 opacity-0'}`}></div>
        </div>

        {/* DYNAMIC STEPS */}
        {TREE_STEPS.map((step, idx) => {
            if (idx > stepIndex) return null;

            const isCompleted = idx < stepIndex;
            const selectedOptionIndex = history[idx];
            
            return (
                <div 
                    key={step.id} 
                    className={`flex flex-col items-center w-full transition-all duration-700 ease-in-out mb-24 ${idx === stepIndex ? 'opacity-100 translate-y-0' : 'opacity-100'}`}
                >
                    
                    {/* QUESTION - Wrapped to mask vertical lines */}
                    <div className={`relative z-20 px-6 py-3 bg-midnight-950 rounded-2xl mb-16 text-center transition-all duration-700 max-w-3xl mx-auto border border-white/5 shadow-2xl ${isCompleted ? 'opacity-60 scale-90 border-transparent shadow-none bg-transparent' : 'opacity-100 scale-100'}`}>
                        <h3 className="text-xl md:text-3xl font-serif text-white">{step.question}</h3>
                    </div>

                    {/* OPTIONS ROW - Flexbox Center with Gap */}
                    <div className="flex flex-wrap justify-center gap-8 relative z-10 w-full px-4 perspective-1000">
                        {step.options.map((option, optIdx) => {
                            const Icon = option.icon || CheckIcon;
                            
                            // State determination
                            const isSelected = isCompleted && optIdx === selectedOptionIndex;
                            const isIgnored = isCompleted && optIdx !== selectedOptionIndex;
                            const isActive = idx === stepIndex;

                            return (
                                <div key={optIdx} className="relative flex flex-col items-center">
                                    {/* Invisible Landing Pad for SVG Lines (Top Center) */}
                                    <div className="absolute -top-12 w-1 h-1"></div>

                                    <button
                                        ref={(el) => { itemsRef.current[idx][optIdx] = el; }}
                                        onClick={() => handleOptionClick(idx, optIdx, option)}
                                        className={`
                                            w-[160px] md:w-[220px] h-auto min-h-[220px] relative flex flex-col items-center justify-center p-6 rounded-2xl border transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)]
                                            ${isActive 
                                                ? 'bg-midnight-900/80 border-white/10 hover:border-gold-500 hover:bg-white/10 hover:shadow-[0_0_30px_rgba(212,175,55,0.15)] hover:scale-105 opacity-100 backdrop-blur-sm' 
                                                : ''
                                            }
                                            ${isSelected
                                                ? 'bg-gold-500 text-midnight-950 border-gold-400 shadow-[0_0_50px_rgba(212,175,55,0.6)] scale-110 md:scale-125 z-30 cursor-default ring-4 ring-gold-500/20 -translate-y-6'
                                                : ''
                                            }
                                            ${isIgnored
                                                ? 'bg-white/5 border-transparent text-slate-500 opacity-20 scale-90 blur-[2px] grayscale hover:grayscale-0 hover:opacity-60 hover:scale-95 hover:blur-0 cursor-pointer z-0'
                                                : ''
                                            }
                                            ${isActive && 'animate-fade-up'}
                                        `}
                                        style={{
                                            animationDelay: `${optIdx * 100}ms`
                                        }}
                                    >
                                        {/* Badge de sélection */}
                                        <div className={`absolute -top-3 -right-3 bg-white text-midnight-950 rounded-full p-1.5 shadow-xl transition-all duration-500 z-40 ${isSelected ? 'scale-100 opacity-100' : 'scale-0 opacity-0'}`}>
                                            <CheckIcon className="w-4 h-4" />
                                        </div>

                                        {Icon && <Icon className={`w-10 h-10 mb-6 transition-colors duration-500 ${isSelected ? 'text-midnight-950' : 'text-gold-400'}`} />}
                                        
                                        <span className={`text-sm font-bold uppercase tracking-wider mb-3 text-center transition-colors duration-500 ${isSelected ? 'text-midnight-950' : 'text-white'}`}>
                                            {option.label}
                                        </span>
                                        <span className={`text-[10px] text-center leading-relaxed transition-colors duration-500 ${isSelected ? 'text-midnight-900/80 font-bold' : 'text-slate-500'}`}>
                                            {option.desc}
                                        </span>
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                </div>
            );
        })}

        {/* FINAL FORM NODE */}
        {stepIndex === TREE_STEPS.length && (
            <div ref={scrollRef} className="w-full max-w-lg mt-16 animate-fade-up relative z-20">
                <div className="glass-panel p-8 rounded-3xl border border-gold-500/30 shadow-[0_0_60px_-15px_rgba(212,175,55,0.2)] relative overflow-hidden backdrop-blur-2xl">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-gold-500 to-transparent"></div>

                    <div className="text-center mb-8">
                        <h3 className="text-2xl font-serif text-white mb-2">Finalisation de l'Audit</h3>
                        <p className="text-slate-400 text-xs">Ajustez vos informations pour recevoir l'analyse IA.</p>
                    </div>

                    <form onSubmit={handleFinalSubmit} className="space-y-6">
                        {/* Adjusters */}
                        <div className="bg-white/5 rounded-xl p-5 space-y-6 border border-white/5">
                            <div>
                                <div className="flex justify-between text-[10px] text-slate-400 uppercase tracking-widest mb-2">
                                    <span>Apport Initial</span>
                                    <span className="text-gold-400 font-bold">{new Intl.NumberFormat('fr-FR').format(parseInt(profile.initialInvestment))} €</span>
                                </div>
                                <input 
                                    type="range" min="50000" max={profile.totalBudget} step="5000"
                                    className="modern-slider"
                                    value={profile.initialInvestment}
                                    onChange={(e) => setProfile({...profile, initialInvestment: e.target.value})}
                                />
                            </div>
                            <div>
                                <div className="flex justify-between text-[10px] text-slate-400 uppercase tracking-widest mb-2">
                                    <span>Mensualité</span>
                                    <span className="text-gold-400 font-bold">{new Intl.NumberFormat('fr-FR').format(parseInt(profile.monthlyContribution))} €/mois</span>
                                </div>
                                <input 
                                    type="range" min="0" max="10000" step="100"
                                    className="modern-slider"
                                    value={profile.monthlyContribution}
                                    onChange={(e) => setProfile({...profile, monthlyContribution: e.target.value})}
                                />
                            </div>
                        </div>

                        {/* Identity */}
                        <div className="space-y-4">
                            <input 
                                type="text" placeholder="Votre Nom Complet" required
                                value={profile.name} onChange={(e) => setProfile({...profile, name: e.target.value})}
                                className="w-full p-4 bg-midnight-950/50 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:border-gold-500 outline-none transition-all"
                            />
                            <input 
                                type="email" placeholder="Votre Email Professionnel" required
                                value={profile.email} onChange={(e) => setProfile({...profile, email: e.target.value})}
                                className="w-full p-4 bg-midnight-950/50 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:border-gold-500 outline-none transition-all"
                            />
                        </div>

                        <button 
                            type="submit" disabled={isLoading}
                            className="w-full py-5 bg-gold-gradient text-midnight-950 text-xs font-black uppercase tracking-[0.2em] rounded-xl hover:shadow-[0_0_30px_rgba(212,175,55,0.4)] transition-all active:scale-[0.98] flex items-center justify-center gap-3 group"
                        >
                            {isLoading ? <span className="loader !w-5 !h-5 !border-2 !border-black/20 !border-t-black"></span> : <>Générer mon Plan <ArrowRightIcon className="w-4 h-4 group-hover:translate-x-1 transition-transform" /></>}
                        </button>
                    </form>
                </div>
            </div>
        )}

      </div>
    </div>
  );
};

export default DecisionTree;
