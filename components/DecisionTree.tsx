import React, { useState, useRef, useEffect, useLayoutEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { UserProfile, PropertyStatus } from '../types';
import { gtm } from '../services/gtm';
import { ArrowRightIcon, BuildingIcon, TrendingUpIcon, ShieldIcon, EuroIcon, CheckIcon, MapPinIcon, ChartIcon, PercentIcon } from './Icons';

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
  sub?: string;
  options: StepOption[];
};

const TREE_STEPS: TreeStep[] = [
  {
    id: 'objective',
    question: 'Qu\'est-ce que vous voulez faire avec cet argent ?',
    sub: 'C\'est la question de départ. Votre réponse détermine le type de bien, le quartier et la stratégie fiscale recommandés.',
    options: [
      {
        value: 'rental_income',
        label: 'Toucher un loyer mensuel',
        icon: PercentIcon,
        desc: 'Vous percevez un loyer régulier depuis la France. 0 % d\'impôt à Dubaï (vs 30 %+ en France). Rendement brut moyen : 6–8 %.',
        updates: { riskLevel: 2, propertyStatus: 'ready' as PropertyStatus, roiDelay: '1', objective: 'rental_income' },
      },
      {
        value: 'capital_gains',
        label: 'Revendre avec une forte plus-value',
        icon: TrendingUpIcon,
        desc: 'Vous achetez un bien sur plan (off-plan) et le revendez avant ou à la livraison. Plus-values observées : +30 à +80 % en 3–5 ans.',
        updates: { riskLevel: 4, propertyStatus: 'off-plan' as PropertyStatus, roiDelay: '36', objective: 'capital_gains' },
      },
      {
        value: 'secondary_residence',
        label: 'Un pied-à-terre + revenus Airbnb',
        icon: BuildingIcon,
        desc: 'Vous séjournez quelques semaines par an et louez le reste du temps. Rendement Airbnb : 7–9 %. Gestion déléguable à 100 %.',
        updates: { riskLevel: 2, propertyStatus: 'ready' as PropertyStatus, roiDelay: '3', objective: 'secondary_residence' },
      },
      {
        value: 'golden_visa',
        label: 'Obtenir la résidence UAE (Golden Visa)',
        icon: ShieldIcon,
        desc: 'Investissement ≥ 545 000 € → résidence de 10 ans pour vous et votre famille. Accès école internationale, santé, compte bancaire UAE.',
        updates: { riskLevel: 2, totalBudget: '600000', initialInvestment: '600000', propertyStatus: 'ready' as PropertyStatus, roiDelay: '6', objective: 'golden_visa' },
      },
      {
        value: 'diversification',
        label: 'Protéger mon patrimoine hors euro',
        icon: ChartIcon,
        desc: 'Sortir 20–30 % de votre patrimoine de la fiscalité française. AED indexé au dollar. 0 % IFI, 0 % droits de succession à Dubaï.',
        updates: { riskLevel: 3, propertyStatus: 'ready' as PropertyStatus, roiDelay: '12', objective: 'diversification' },
      },
    ],
  },
  {
    id: 'budget',
    question: 'Quelle est votre enveloppe totale disponible ?',
    sub: 'Budget total = prix du bien + DLD 4 % (équivalent frais de notaire) + agence 2 %. Les non-résidents peuvent emprunter jusqu\'à 60–70 % du prix auprès de banques UAE.',
    options: [
      {
        value: 'under_200k',
        label: 'Moins de 200 000 €',
        icon: EuroIcon,
        desc: 'Studio 35–55 m². Quartiers JVC, DSO. Rendements jusqu\'à 9 %. Ticket d\'entrée idéal pour commencer.',
        updates: { totalBudget: '180000', initialInvestment: '45000', monthlyContribution: '600' },
      },
      {
        value: '200_400k',
        label: '200 000 – 400 000 €',
        icon: EuroIcon,
        desc: 'Appartement 1 chambre. Marina, JLT, Business Bay. Le segment le plus liquide — revendu en quelques semaines si besoin.',
        updates: { totalBudget: '320000', initialInvestment: '80000', monthlyContribution: '1000' },
      },
      {
        value: '400_700k',
        label: '400 000 – 700 000 €',
        icon: EuroIcon,
        desc: 'Appartement 2 chambres. Dubai Hills, Creek Harbour. Forte demande des familles d\'expatriés. Belle appréciation long terme.',
        updates: { totalBudget: '560000', initialInvestment: '140000', monthlyContribution: '1800' },
      },
      {
        value: '700k_1_5m',
        label: '700 000 € – 1,5 M€',
        icon: EuroIcon,
        desc: 'Appartement premium. Downtown, Palm, Marina Gate. Golden Visa automatiquement inclus. Clientèle internationale, très liquide.',
        updates: { totalBudget: '1000000', initialInvestment: '300000', monthlyContribution: '3500' },
      },
      {
        value: 'above_1_5m',
        label: 'Plus de 1,5 M€',
        icon: EuroIcon,
        desc: 'Villa ou penthouse. Palm Jumeirah, Emirates Hills, MBR City. Marché ultra-luxe, valorisation de +40 % sur 5 ans observée.',
        updates: { totalBudget: '2000000', initialInvestment: '600000', monthlyContribution: '6000' },
      },
    ],
  },
  {
    id: 'horizon',
    question: 'Dans combien de temps voulez-vous récupérer votre argent ?',
    sub: 'Important : les frais d\'entrée (DLD 4 %) ne sont rentabilisés qu\'après ~2 ans de loyers. Revendre trop tôt réduit la performance globale.',
    options: [
      {
        value: 'short',
        label: 'Dans 1 à 3 ans',
        icon: TrendingUpIcon,
        desc: 'Stratégie "flip" off-plan : revendre avant la livraison des clés. Gain rapide possible, mais risque de liquidité si le marché se retourne.',
        updates: { duration: '2', riskLevel: 5, propertyStatus: 'off-plan' as PropertyStatus, investmentHorizon: 'short' },
      },
      {
        value: 'medium',
        label: 'Dans 3 à 6 ans',
        icon: ChartIcon,
        desc: 'L\'horizon optimal selon les données DLD. Vous cumulez les loyers ET une belle plus-value. Sortie idéale autour de 2027–2028.',
        updates: { duration: '5', riskLevel: 3, propertyStatus: 'ready' as PropertyStatus, investmentHorizon: 'medium' },
      },
      {
        value: 'long',
        label: 'Dans 6 à 10 ans',
        icon: ShieldIcon,
        desc: 'Construction patrimoniale sereine : vous traversez au moins un cycle complet du marché. Appréciation et loyers s\'accumulent.',
        updates: { duration: '8', riskLevel: 2, propertyStatus: 'ready' as PropertyStatus, investmentHorizon: 'long' },
      },
      {
        value: 'permanent',
        label: 'Pas de date prévue',
        icon: BuildingIcon,
        desc: 'Rente à vie ou transmission à vos enfants. Zéro droits de succession à Dubaï. Idéal pour une stratégie "family office".',
        updates: { duration: '15', riskLevel: 1, propertyStatus: 'ready' as PropertyStatus, investmentHorizon: 'permanent' },
      },
    ],
  },
  {
    id: 'risk_profile',
    question: 'Comment réagissez-vous si la valeur baisse de 15 % ?',
    sub: 'Dubaï a connu −40 % en 2009, puis +70 % entre 2021 et 2024. Votre réponse permet de calibrer le type de bien et la zone recommandés.',
    options: [
      {
        value: 'conservative',
        label: 'Je veux dormir tranquille',
        icon: ShieldIcon,
        desc: 'Bien livré avec locataire déjà en place. Revenu immédiat dès le mois suivant. Promoteurs top-tier uniquement (Emaar, Meraas).',
        updates: { riskLevel: 1 },
      },
      {
        value: 'moderate',
        label: 'J\'accepte −15 % temporaire',
        icon: EuroIcon,
        desc: 'Mix bien livré + légère prise de risque sur zones établies. Business Bay, JLT. Récupération attendue en 18–24 mois.',
        updates: { riskLevel: 3 },
      },
      {
        value: 'dynamic',
        label: 'Je joue la croissance',
        icon: TrendingUpIcon,
        desc: 'Off-plan Emaar ou Nakheel avec paiement échelonné sur 3 ans (10 % à la signature, reste à la livraison). Potentiel +40 % avant clés.',
        updates: { riskLevel: 4 },
      },
      {
        value: 'speculative',
        label: 'Je maximise l\'effet de levier',
        icon: ChartIcon,
        desc: 'Achat off-plan + revente avant livraison. Mise de départ : 10–20 % du prix. Gain très élevé si timing bon, perte partielle sinon.',
        updates: { riskLevel: 5 },
      },
    ],
  },
  {
    id: 'zone_preference',
    question: 'Quel type de locataire ou d\'acheteur visez-vous ?',
    sub: 'Chaque quartier de Dubaï attire un profil différent. Cela impacte directement votre taux d\'occupation, le loyer obtenu et la facilité de revente.',
    options: [
      {
        value: 'high_yield',
        label: 'Rendement maximal',
        icon: PercentIcon,
        desc: 'JVC, JLT, DSO. Locataires : jeunes actifs et PME. Rendement 7–9 %. Vacance locative < 6 semaines/an en moyenne.',
        updates: { riskLevel: 2, roiDelay: '2', zonePreference: 'high_yield' },
      },
      {
        value: 'capital_appreciation',
        label: 'Plus-value en priorité',
        icon: TrendingUpIcon,
        desc: 'Downtown, Creek Harbour, MBR City. Acheteurs : investisseurs du monde entier. Hausse constatée : +18 % en 2024, +12 % en 2023.',
        updates: { riskLevel: 4, roiDelay: '24', zonePreference: 'capital_appreciation' },
      },
      {
        value: 'premium_lifestyle',
        label: 'Airbnb haut de gamme',
        icon: BuildingIcon,
        desc: 'Palm Jumeirah, JBR, Marina. Touristes et expatriés haut de gamme. Taux d\'occupation 70–85 % en haute saison, loyers 2× la moyenne.',
        updates: { riskLevel: 3, roiDelay: '6', zonePreference: 'premium_lifestyle' },
      },
      {
        value: 'emerging',
        label: 'Pari sur une zone qui monte',
        icon: MapPinIcon,
        desc: 'Dubai South, Al Furjan, RAK. Prix d\'entrée 30–40 % sous le marché établi. Infrastructure en cours = prise de valeur attendue sur 5–7 ans.',
        updates: { riskLevel: 5, roiDelay: '48', zonePreference: 'emerging' },
      },
      {
        value: 'balanced',
        label: 'Équilibre rendement / sécurité',
        icon: ChartIcon,
        desc: 'Business Bay, Dubai Hills, Downtown. Le meilleur compromis : rendement correct (5–7 %), forte liquidité, appréciation régulière.',
        updates: { riskLevel: 3, roiDelay: '3', zonePreference: 'balanced' },
      },
    ],
  },
];

interface PathData { d: string; key: string; }

// ── ROI projection ─────────────────────────────────────────────────────────────
function calcProjectedRoi(profile: UserProfile): number {
  let roi = 35;
  if (profile.objective === 'capital_gains') roi += 30;
  else if (profile.objective === 'rental_income') roi += 18;
  else if (profile.objective === 'diversification') roi += 22;
  else roi += 12;
  roi += profile.propertyStatus === 'off-plan' ? 22 : 8;
  const budget = parseInt(profile.totalBudget) || 0;
  if (budget >= 1500000) roi += 12; else if (budget >= 700000) roi += 8; else if (budget >= 400000) roi += 4;
  roi += (profile.riskLevel - 1) * 4;
  if (profile.zonePreference === 'emerging') roi += 18;
  else if (profile.zonePreference === 'capital_appreciation') roi += 12;
  else if (profile.zonePreference === 'high_yield') roi += 8;
  const dur = parseInt(profile.duration) || 5;
  if (dur >= 10) roi += 12; else if (dur >= 6) roi += 7;
  return Math.min(roi, 165);
}

// ── Step progress ──────────────────────────────────────────────────────────────
const StepProgress = ({ total, current }: { total: number; current: number }) => (
  <div
    className="w-full z-40"
    style={{
      position: 'sticky',
      top: '72px',
      paddingTop: '16px',
      paddingBottom: '20px',
      background: 'linear-gradient(to bottom, rgba(5,5,5,0.96) 80%, transparent 100%)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      marginBottom: '2.5rem',
    }}
  >
    <div className="flex items-center gap-0 w-full max-w-lg mx-auto px-4">
    {Array.from({ length: total }).map((_, i) => {
      const done   = i < current;
      const active = i === current;
      return (
        <React.Fragment key={i}>
          <motion.div
            className="relative w-8 h-8 rounded-full flex items-center justify-center shrink-0 z-10 overflow-hidden"
            animate={{
              background: done
                ? 'linear-gradient(135deg, #D4AF37, #f0c060)'
                : active ? 'transparent' : 'rgba(255,255,255,0.04)',
              borderColor: done ? '#D4AF37' : active ? '#00F2FF' : 'rgba(255,255,255,0.10)',
              scale: active ? 1.18 : 1,
            }}
            transition={{ duration: 0.4 }}
            style={{
              border: '2px solid',
              fontFamily: '"Manrope",sans-serif', fontSize: '0.65rem', fontWeight: 700,
              color: done ? '#050505' : active ? '#00F2FF' : 'rgba(255,255,255,0.22)',
              boxShadow: active
                ? '0 0 18px rgba(0,242,255,0.55), 0 0 36px rgba(0,242,255,0.20)'
                : done
                ? '0 0 12px rgba(212,175,55,0.45)'
                : 'none',
            }}
          >
            {/* Active ring pulse */}
            {active && (
              <motion.div
                className="absolute inset-[-3px] rounded-full"
                style={{ border: '1px solid rgba(0,242,255,0.30)' }}
                animate={{ scale: [1, 1.45, 1], opacity: [0.7, 0, 0.7] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
            )}
            {done
              ? <CheckIcon className="w-3 h-3 relative z-10" />
              : <span className="relative z-10">{i + 1}</span>
            }
          </motion.div>

          {i < total - 1 && (
            <div className="flex-1 h-px relative overflow-hidden">
              <div className="absolute inset-0" style={{ background: 'rgba(255,255,255,0.06)' }} />
              <motion.div
                className="absolute inset-0"
                animate={{ scaleX: done ? 1 : 0 }}
                transition={{ duration: 0.5, delay: 0.1 }}
                style={{ background: 'linear-gradient(90deg, #D4AF37, #00F2FF)', transformOrigin: 'left' }}
              />
            </div>
          )}
        </React.Fragment>
      );
    })}
    </div>
  </div>
);

// ── 3D Tilt wrapper ────────────────────────────────────────────────────────────
const TiltCard: React.FC<{ children: React.ReactNode; disabled: boolean }> = ({ children, disabled }) => {
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const handleMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (disabled) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const cx = (e.clientX - rect.left) / rect.width - 0.5;
    const cy = (e.clientY - rect.top) / rect.height - 0.5;
    setTilt({ x: cy * -8, y: cx * 8 });
  };
  return (
    <div
      onMouseMove={handleMove}
      onMouseLeave={() => setTilt({ x: 0, y: 0 })}
      style={{
        transform: `perspective(700px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
        transition: disabled ? 'transform 0.4s ease' : 'transform 0.15s ease',
        transformStyle: 'preserve-3d',
        willChange: 'transform',
        cursor: 'pointer',
        display: 'flex',
        width: '100%',
        height: '100%',
      }}
    >
      {children}
    </div>
  );
};

// ── Option card ────────────────────────────────────────────────────────────────
const OptionCard: React.FC<{
  option: StepOption;
  isActive: boolean;
  isSelected: boolean;
  isIgnored: boolean;
  optIdx: number;
  onClick: () => void;
  refCallback: (el: HTMLButtonElement | null) => void;
}> = ({ option, isActive, isSelected, isIgnored, optIdx, onClick, refCallback }) => {
  const Icon = option.icon || CheckIcon;

  return (
    <TiltCard disabled={isIgnored || !isActive}>
      <motion.button
        ref={refCallback}
        onClick={onClick}
        initial={{ opacity: 0, y: 20, filter: 'blur(6px)' }}
        animate={{
          opacity: isIgnored ? 0.18 : 1,
          y: isSelected ? -10 : 0,
          scale: isSelected ? 1.04 : isIgnored ? 0.92 : 1,
          filter: isIgnored ? 'blur(2px) grayscale(1)' : 'blur(0px) grayscale(0)',
        }}
        transition={{ duration: 0.45, delay: optIdx * 0.07, ease: 'easeOut' }}
        className="relative flex flex-col items-center text-center rounded-2xl outline-none select-none overflow-hidden"
        style={{
          width: '100%', minHeight: 165, padding: '1rem 0.75rem',
          background: isSelected
            ? 'linear-gradient(145deg, rgba(20,184,166,0.15) 0%, rgba(99,102,241,0.08) 100%)'
            : 'rgba(255,255,255,0.025)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          border: isSelected ? '1px solid rgba(20,184,166,0.0)' : isActive ? '1px solid rgba(255,255,255,0.07)' : '1px solid transparent',
          boxShadow: isSelected ? '0 0 40px rgba(20,184,166,0.18), inset 0 0 20px rgba(20,184,166,0.05)' : 'none',
          cursor: isIgnored ? 'pointer' : 'pointer',
        }}
      >
        {/* ── Rotating conic border (selected) ── */}
        {isSelected && (
          <div className="absolute inset-[-1px] rounded-2xl overflow-hidden pointer-events-none" style={{ zIndex: 0 }}>
            <motion.div
              className="absolute"
              style={{
                width: '300%', height: '300%',
                top: '-100%', left: '-100%',
                background: 'conic-gradient(from 0deg, transparent 0deg, #14b8a6 55deg, #67e8f9 110deg, #818cf8 150deg, transparent 200deg)',
              }}
              animate={{ rotate: 360 }}
              transition={{ duration: 3.5, repeat: Infinity, ease: 'linear' }}
            />
            {/* Inner fill to mask conic */}
            <div className="absolute inset-[1px] rounded-[calc(1rem-1px)]"
              style={{ background: 'linear-gradient(145deg, rgba(8,8,20,0.96) 0%, rgba(8,8,16,0.94) 100%)' }} />
          </div>
        )}

        {/* ── Check badge ── */}
        <AnimatePresence>
          {isSelected && (
            <motion.div
              initial={{ scale: 0, opacity: 0, rotate: -20 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 500, damping: 25 }}
              className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center"
              style={{
                background: 'linear-gradient(135deg, #67e8f9, #14b8a6)',
                boxShadow: '0 0 12px rgba(20,184,166,0.7)',
                zIndex: 20,
              }}
            >
              <CheckIcon className="w-2.5 h-2.5 text-[#0a0a0f]" />
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Icon container ── */}
        <motion.div
          className="w-11 h-11 rounded-xl flex items-center justify-center mb-3.5 relative z-10"
          animate={{
            background: isSelected ? 'rgba(20,184,166,0.2)' : 'rgba(255,255,255,0.05)',
            borderColor: isSelected ? 'rgba(20,184,166,0.5)' : 'rgba(255,255,255,0.07)',
          }}
          style={{ border: '1px solid' }}
        >
          {/* Icon glow */}
          {isSelected && (
            <motion.div
              className="absolute inset-0 rounded-xl"
              animate={{ boxShadow: ['0 0 0px rgba(20,184,166,0)', '0 0 16px rgba(20,184,166,0.4)', '0 0 0px rgba(20,184,166,0)'] }}
              transition={{ duration: 2, repeat: Infinity }}
            />
          )}
          <Icon className={`w-4 h-4 relative z-10 ${isSelected ? 'text-[#67e8f9]' : isActive ? 'text-[rgba(20,184,166,0.5)]' : 'text-[rgba(255,255,255,0.15)]'}`} />
        </motion.div>

        {/* ── Label ── */}
        <motion.span
          animate={{ color: isSelected ? '#67e8f9' : isActive ? 'rgba(240,235,224,0.92)' : 'rgba(240,235,224,0.40)' }}
          className="font-semibold uppercase tracking-widest relative z-10"
          style={{ fontFamily: '"Manrope",sans-serif', fontSize: '0.68rem', marginBottom: '0.4rem' }}
        >
          {option.label}
        </motion.span>

        {/* ── Desc ── */}
        <motion.span
          animate={{ color: isSelected ? 'rgba(103,232,249,0.70)' : isActive ? 'rgba(240,235,224,0.58)' : 'rgba(240,235,224,0.30)' }}
          className="leading-relaxed relative z-10"
          style={{ fontFamily: '"Manrope",sans-serif', fontSize: '0.68rem' }}
        >
          {option.desc}
        </motion.span>
      </motion.button>
    </TiltCard>
  );
};

// ── Main component ─────────────────────────────────────────────────────────────
const DecisionTree: React.FC<DecisionTreeProps> = ({ onSubmit, isLoading }) => {
  const [stepIndex, setStepIndex] = useState(0);
  useEffect(() => { gtm.funnelStart(); }, []);
  const [history, setHistory]     = useState<number[]>([]);
  const [paths, setPaths]         = useState<PathData[]>([]);
  const [badgeVisible, setBadgeVisible] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef    = useRef<HTMLDivElement>(null);
  const itemsRef     = useRef<Array<Array<HTMLButtonElement | null>>>([]);

  const [profile, setProfile] = useState<UserProfile>({
    name: '', email: '',
    totalBudget: '320000', initialInvestment: '80000', monthlyContribution: '1000',
    duration: '5', propertyStatus: 'ready', riskLevel: 3, roiDelay: '3',
    objective: 'rental_income', zonePreference: 'balanced', investmentHorizon: 'medium',
  });

  const projectedRoi = useMemo(() => calcProjectedRoi(profile), [profile]);

  // Show the ROI badge only while the funnel is on screen — it floats in
  // position:fixed and would otherwise overlap the hero above and the footer below
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setBadgeVisible(entry.isIntersecting),
      { threshold: 0.05 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  if (itemsRef.current.length !== TREE_STEPS.length)
    itemsRef.current = Array(TREE_STEPS.length).fill(null).map(() => []);

  const calculatePaths = () => {
    if (!containerRef.current) return;
    const newPaths: PathData[] = [];
    const cRect = containerRef.current.getBoundingClientRect();
    history.forEach((selectedOptionIdx, stepIdx) => {
      if (stepIdx >= TREE_STEPS.length - 1) return;
      const sourceEl = itemsRef.current[stepIdx][selectedOptionIdx];
      const nextOptions = itemsRef.current[stepIdx + 1];
      if (!sourceEl || !nextOptions) return;
      const sRect  = sourceEl.getBoundingClientRect();
      const startX = sRect.left - cRect.left + sRect.width / 2;
      const startY = sRect.bottom - cRect.top;
      nextOptions.forEach((targetEl, targetIdx) => {
        if (!targetEl) return;
        const tRect = targetEl.getBoundingClientRect();
        const endX  = tRect.left - cRect.left + tRect.width / 2;
        const endY  = tRect.top  - cRect.top;
        const midY  = endY - 52;
        const r     = 16;
        let d = `M ${startX} ${startY} L ${startX} ${midY - r}`;
        if (Math.abs(startX - endX) < 1) {
          d += ` L ${startX} ${endY}`;
        } else {
          const dir = endX > startX ? 1 : -1;
          d += ` Q ${startX} ${midY} ${startX + r * dir} ${midY}`;
          d += ` L ${endX - r * dir} ${midY}`;
          d += ` Q ${endX} ${midY} ${endX} ${midY + r}`;
          d += ` L ${endX} ${endY}`;
        }
        newPaths.push({ d, key: `${stepIdx}-${selectedOptionIdx}-${stepIdx + 1}-${targetIdx}` });
      });
    });
    setPaths(newPaths);
  };

  useLayoutEffect(() => {
    const t = setTimeout(calculatePaths, 520);
    calculatePaths();
    window.addEventListener('resize', calculatePaths);
    return () => { window.removeEventListener('resize', calculatePaths); clearTimeout(t); };
  }, [stepIndex, history]);

  useEffect(() => {
    // stepIndex 0 = initial render — never auto-scroll the page on mount
    if (stepIndex === 0) return;
    if (stepIndex === TREE_STEPS.length && scrollRef.current) {
      setTimeout(() => scrollRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 350);
    } else {
      const el = itemsRef.current[stepIndex]?.[0]?.parentElement?.parentElement;
      if (el) setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'center' }), 350);
    }
  }, [stepIndex]);

  const handleOptionClick = (stepIdx: number, optionIdx: number, option: StepOption) => {
    setProfile(prev => ({ ...prev, ...option.updates }));
    gtm.funnelStepComplete(TREE_STEPS[stepIdx].id, stepIdx, option.value);
    if (stepIdx < stepIndex) {
      const h = history.slice(0, stepIdx); h.push(optionIdx);
      setHistory(h); setStepIndex(stepIdx + 1);
    } else {
      setHistory(prev => [...prev, optionIdx]); setStepIndex(prev => prev + 1);
    }
  };

  const totalSteps = TREE_STEPS.length + 1;

  return (
    <div className="w-full max-w-5xl mx-auto pb-24 px-4 relative" ref={containerRef}>

      {/* ── ROI Badge ── */}
      <motion.div
        initial={{ opacity: 0, x: 30, scale: 0.8 }}
        animate={badgeVisible ? { opacity: 1, x: 0, scale: 1 } : { opacity: 0, x: 30, scale: 0.8 }}
        transition={{ duration: 0.45, type: 'spring', stiffness: 200, damping: 24 }}
        className="fixed top-24 right-4 md:right-8 z-50"
        style={{ pointerEvents: badgeVisible ? 'auto' : 'none' }}
      >
        <div className="relative overflow-hidden rounded-2xl" style={{
          background: 'rgba(6,10,18,0.92)',
          border: '1px solid rgba(212,168,67,0.28)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
        }}>
          {/* Rotating conic mini */}
          <div className="absolute -inset-[1px] rounded-2xl overflow-hidden pointer-events-none">
            <motion.div
              className="absolute w-[400%] h-[400%]"
              style={{
                top: '-150%', left: '-150%',
                background: 'conic-gradient(from 0deg, transparent 0deg, rgba(212,168,67,0.55) 40deg, rgba(72,202,228,0.3) 70deg, transparent 100deg)',
              }}
              animate={{ rotate: 360 }}
              transition={{ duration: 6, repeat: Infinity, ease: 'linear' }}
            />
            <div className="absolute inset-[1px] rounded-[calc(1rem-1px)]" style={{ background: 'rgba(6,10,18,0.96)' }} />
          </div>

          <div className="relative z-10 flex flex-col items-center px-3 py-3 md:px-5 md:py-4">
            <span style={{ color: 'rgba(212,168,67,0.55)', fontSize: '0.55rem', fontFamily: '"Manrope",sans-serif', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '0.3rem' }}>
              Horizon {profile.duration} ans
            </span>
            <motion.span
              key={projectedRoi}
              initial={{ scale: 0.7, opacity: 0, y: 8 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 18 }}
              style={{
                fontFamily: '"Sora",sans-serif', fontSize: 'clamp(1.4rem, 4vw, 2.1rem)', fontWeight: 800, lineHeight: 1,
                background: 'linear-gradient(135deg, #fef3c7, #d4a843, #48cae4)',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
                isolation: 'isolate',
              }}
            >
              +{projectedRoi}%
            </motion.span>
            <span style={{ color: 'rgba(212,168,67,0.45)', fontSize: '0.55rem', fontFamily: '"Manrope",sans-serif', letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: '0.3rem' }}>Prise de valeur</span>
            <motion.div
              className="absolute inset-0 rounded-2xl pointer-events-none"
              animate={{ boxShadow: ['0 0 0 0 rgba(212,168,67,0.25)', '0 0 0 10px rgba(212,168,67,0)', '0 0 0 0 rgba(212,168,67,0)'] }}
              transition={{ duration: 3, repeat: Infinity }}
            />
          </div>
        </div>
      </motion.div>

      {/* ── SVG connector paths ── */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none overflow-visible" style={{ zIndex: 1 }}>
        <defs>
          <linearGradient id="pathGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%"   stopColor="#14b8a6" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#14b8a6" stopOpacity="0.03" />
          </linearGradient>
          <filter id="pathGlow">
            <feGaussianBlur stdDeviation="1.5" result="b"/>
            <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>
        {paths.map(p => (
          <path key={p.key} d={p.d} fill="none" stroke="url(#pathGrad)" strokeWidth="1.5" filter="url(#pathGlow)"
            style={{ strokeDasharray: 4000, strokeDashoffset: 4000, animation: 'drawPath 1.3s ease-out forwards' }} />
        ))}
        <style>{`@keyframes drawPath{to{stroke-dashoffset:0}}`}</style>
      </svg>

      {/* ── Content ── */}
      <div className="flex flex-col items-center relative" style={{ zIndex: 2 }}>

        <StepProgress total={totalSteps} current={Math.min(stepIndex, totalSteps - 1)} />

        {/* Start node */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8, y: -10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.5, type: 'spring' }}
          className="mb-14 relative"
        >
          <div className="relative overflow-hidden px-8 py-2.5 rounded-full"
            style={{ background: 'rgba(20,184,166,0.06)', border: '1px solid rgba(20,184,166,0.25)', boxShadow: '0 0 24px rgba(20,184,166,0.08)' }}>
            <motion.div
              className="absolute inset-0 pointer-events-none"
              animate={{ x: ['-100%', '200%'] }}
              transition={{ duration: 3.5, repeat: Infinity, repeatDelay: 2, ease: 'easeInOut' }}
              style={{ background: 'linear-gradient(90deg, transparent, rgba(20,184,166,0.14), transparent)' }}
            />
            <span style={{ color: '#14b8a6', fontFamily: '"Manrope",sans-serif', fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', position: 'relative' }}>
              Trouvons votre meilleur investissement · 5 questions
            </span>
          </div>
          <div className="absolute left-1/2 -translate-x-1/2 top-full w-px h-14"
            style={{ background: 'linear-gradient(to bottom, rgba(20,184,166,0.5), transparent)' }} />
        </motion.div>

        {/* ── Steps ── */}
        {TREE_STEPS.map((step, idx) => {
          if (idx > stepIndex) return null;
          const isCompleted = idx < stepIndex;
          const selectedOptionIndex = history[idx];

          return (
            <motion.div
              key={step.id}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
              className="w-full mb-16"
            >
              <div className="flex flex-col md:flex-row md:items-start gap-4 md:gap-14">

                {/* LEFT — question */}
                <motion.div
                  animate={{ opacity: isCompleted ? 0.35 : 1, scale: isCompleted ? 0.95 : 1 }}
                  transition={{ duration: 0.4 }}
                  className="md:w-52 shrink-0 md:pt-2 md:sticky md:top-32"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <motion.div
                      animate={{
                        background: isCompleted ? 'rgba(20,184,166,0.18)' : 'rgba(20,184,166,0.1)',
                        boxShadow: isCompleted ? 'none' : '0 0 12px rgba(20,184,166,0.2)',
                      }}
                      className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0"
                      style={{ border: '1px solid rgba(20,184,166,0.3)', color: '#14b8a6', fontFamily: '"Manrope",sans-serif' }}
                    >
                      {isCompleted ? <CheckIcon className="w-2.5 h-2.5" /> : idx + 1}
                    </motion.div>
                    <span style={{ color: 'rgba(20,184,166,0.5)', fontSize: '0.6rem', fontFamily: '"Manrope",sans-serif', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase' }}>
                      Étape {idx + 1}
                    </span>
                  </div>

                  <h3 style={{
                    fontFamily: '"Sora",sans-serif',
                    fontSize: 'clamp(1.15rem, 2.2vw, 1.65rem)',
                    fontWeight: 700,
                    color: isCompleted ? 'rgba(240,235,224,0.38)' : '#f0ebe0',
                    lineHeight: 1.25, marginBottom: '0.5rem',
                  }}>
                    {step.question}
                  </h3>
                  {step.sub && (
                    <p style={{ color: 'rgba(240,235,224,0.48)', fontSize: '0.7rem', fontFamily: '"Manrope",sans-serif', fontStyle: 'italic', lineHeight: 1.55 }}>
                      {step.sub}
                    </p>
                  )}
                </motion.div>

                {/* RIGHT — cards */}
                <div className="grid grid-cols-2 gap-3 w-full" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(148px, 1fr))' }}>
                  {step.options.map((option, optIdx) => {
                    const isSelected = isCompleted && optIdx === selectedOptionIndex;
                    const isIgnored  = isCompleted && optIdx !== selectedOptionIndex;
                    const isActive   = idx === stepIndex;
                    return (
                      <OptionCard
                        key={optIdx}
                        option={option}
                        isActive={isActive}
                        isSelected={isSelected}
                        isIgnored={isIgnored}
                        optIdx={optIdx}
                        onClick={() => handleOptionClick(idx, optIdx, option)}
                        refCallback={el => { itemsRef.current[idx][optIdx] = el; }}
                      />
                    );
                  })}
                </div>
              </div>

              {idx < stepIndex - 1 && (
                <motion.div
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ duration: 0.5, delay: 0.2 }}
                  className="w-full mt-12 h-px"
                  style={{ background: 'linear-gradient(90deg, transparent, rgba(20,184,166,0.1), transparent)', transformOrigin: 'left' }}
                />
              )}
            </motion.div>
          );
        })}

        {/* ── Final form ── */}
        <AnimatePresence>
          {stepIndex === TREE_STEPS.length && (
            <motion.div
              ref={scrollRef}
              initial={{ opacity: 0, y: 40, filter: 'blur(10px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              transition={{ duration: 0.65, ease: 'easeOut' }}
              className="w-full max-w-md mt-6 relative"
            >
              {/* Rotating conic border (form) */}
              <div className="absolute -inset-[1px] rounded-3xl overflow-hidden pointer-events-none">
                <motion.div
                  className="absolute w-[300%] h-[300%]"
                  style={{
                    top: '-100%', left: '-100%',
                    background: 'conic-gradient(from 0deg, transparent 0deg, #14b8a6 50deg, #67e8f9 100deg, #818cf8 140deg, transparent 190deg)',
                  }}
                  animate={{ rotate: 360 }}
                  transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
                />
                <div className="absolute inset-[1px] rounded-[calc(1.5rem-1px)]" style={{ background: 'rgba(7,7,12,0.97)' }} />
              </div>

              <div className="relative p-8 rounded-3xl overflow-hidden"
                style={{ background: 'rgba(7,7,12,0.95)', backdropFilter: 'blur(28px)', WebkitBackdropFilter: 'blur(28px)' }}>
                <div className="absolute top-0 left-0 right-0 h-px" style={{ background: 'linear-gradient(90deg, transparent, #14b8a6, #818cf8, transparent)' }} />

                {/* Header */}
                <div className="text-center mb-7">
                  <div className="inline-flex items-center gap-2 text-[9px] font-semibold uppercase tracking-widest mb-4"
                    style={{ color: 'rgba(20,184,166,0.55)', fontFamily: '"Manrope",sans-serif' }}>
                    <motion.div
                      className="w-5 h-5 rounded-full flex items-center justify-center text-[9px]"
                      style={{ background: 'linear-gradient(135deg,rgba(20,184,166,0.15),rgba(99,102,241,0.1))', border: '1px solid rgba(20,184,166,0.3)', color: '#14b8a6' }}
                      animate={{ boxShadow: ['0 0 0 0 rgba(20,184,166,0.3)', '0 0 0 8px rgba(20,184,166,0)', '0 0 0 0 rgba(20,184,166,0)'] }}
                      transition={{ duration: 2.5, repeat: Infinity }}
                    >
                      6
                    </motion.div>
                    Finalisation
                  </div>
                  <h3 style={{ fontFamily: '"Sora",sans-serif', fontSize: '1.75rem', fontWeight: 700, color: '#f0ebe0', marginBottom: '0.35rem' }}>
                    Affinons les chiffres
                  </h3>
                  <p style={{ color: 'rgba(240,235,224,0.35)', fontSize: '0.73rem', fontFamily: '"Manrope",sans-serif', fontStyle: 'italic' }}>
                    Deux paramètres pour calibrer votre simulation. Votre analyse IA démarre ensuite.
                  </p>
                </div>

                <form onSubmit={e => { e.preventDefault(); gtm.funnelComplete(profile); onSubmit(profile); }} className="space-y-5">
                  {/* Sliders */}
                  <div className="space-y-5 p-5 rounded-2xl" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(20,184,166,0.08)' }}>
                    {[
                      { label: 'Mon apport disponible', key: 'initialInvestment', min: 30000, max: parseInt(profile.totalBudget) || 600000, step: 5000, format: (v: string) => `${new Intl.NumberFormat('fr-FR').format(parseInt(v))} €` },
                      { label: 'Je peux épargner par mois', key: 'monthlyContribution', min: 0, max: 10000, step: 100, format: (v: string) => `${new Intl.NumberFormat('fr-FR').format(parseInt(v))} €/mois` },
                    ].map(f => (
                      <div key={f.key}>
                        <div className="flex justify-between items-center mb-2.5">
                          <span style={{ color: 'rgba(240,235,224,0.4)', fontSize: '0.62rem', fontFamily: '"Manrope",sans-serif', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{f.label}</span>
                          <motion.span
                            key={(profile as any)[f.key]}
                            initial={{ opacity: 0, y: -4 }}
                            animate={{ opacity: 1, y: 0 }}
                            style={{ color: '#14b8a6', fontSize: '0.8rem', fontFamily: '"Manrope",sans-serif', fontWeight: 700 }}
                          >
                            {f.format((profile as any)[f.key])}
                          </motion.span>
                        </div>
                        <input type="range" min={f.min} max={f.max} step={f.step}
                          className="modern-slider" value={(profile as any)[f.key]}
                          onChange={e => setProfile({ ...profile, [f.key]: e.target.value })} />
                      </div>
                    ))}
                  </div>

                  {/* Inputs */}
                  <div className="space-y-3">
                    {[
                      { placeholder: 'Votre prénom et nom', key: 'name',  type: 'text',  value: profile.name },
                      { placeholder: 'Votre adresse e-mail', key: 'email', type: 'email', value: profile.email },
                    ].map(f => (
                      <input key={f.key} type={f.type} placeholder={f.placeholder} required value={f.value}
                        onChange={e => setProfile({ ...profile, [f.key]: e.target.value })}
                        className="w-full px-4 py-3.5 rounded-xl outline-none transition-all placeholder:text-[rgba(240,235,224,0.18)]"
                        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', color: '#f0ebe0', fontFamily: '"Manrope",sans-serif', fontSize: '0.85rem' }}
                        onFocus={e => { e.currentTarget.style.borderColor = 'rgba(20,184,166,0.55)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(20,184,166,0.08)'; }}
                        onBlur={e  => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'; e.currentTarget.style.boxShadow = 'none'; }}
                      />
                    ))}
                  </div>

                  {/* Submit */}
                  <motion.button
                    type="submit" disabled={isLoading}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="w-full py-4 rounded-xl flex items-center justify-center gap-3 overflow-hidden relative"
                    style={{
                      background: isLoading ? 'rgba(20,184,166,0.3)' : 'linear-gradient(135deg,#67e8f9 0%,#14b8a6 55%,#0d9488 100%)',
                      boxShadow: isLoading ? 'none' : '0 0 40px rgba(20,184,166,0.35)',
                      color: '#060d0c', fontFamily: '"Manrope",sans-serif', fontWeight: 800, fontSize: '0.73rem',
                      letterSpacing: '0.12em', textTransform: 'uppercase', border: 'none', cursor: isLoading ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {!isLoading && (
                      <motion.div
                        className="absolute inset-0 pointer-events-none"
                        animate={{ x: ['-100%', '200%'] }}
                        transition={{ duration: 2.5, repeat: Infinity, repeatDelay: 1.5, ease: 'easeInOut' }}
                        style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)' }}
                      />
                    )}
                    {isLoading
                      ? <span className="loader !w-4 !h-4 !border-2 !border-black/20 !border-t-black" />
                      : <><ArrowRightIcon className="w-4 h-4 relative" /><span className="relative">Voir ma simulation complète</span></>
                    }
                  </motion.button>
                </form>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default DecisionTree;
