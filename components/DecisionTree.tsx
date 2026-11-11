import React, { useState, useRef, useEffect, useLayoutEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import ConsentFields from './ConsentFields';
import { motion, AnimatePresence } from 'framer-motion';
import { useI18n, fmt } from '../i18n';
import { UserProfile, PropertyStatus } from '../types';
import { gtm } from '../services/gtm';
import { ArrowRightIcon, BuildingIcon, TrendingUpIcon, ShieldIcon, EuroIcon, CheckIcon, MapPinIcon, ChartIcon, PercentIcon } from './Icons';

interface DecisionTreeProps {
  onSubmit: (profile: UserProfile) => void;
  isLoading: boolean;
  /** id du conseiller choisi (AgentsSection) — spécialise le scénario de questions */
  agentId?: string | null;
  /** notifie le parent de l'étape courante (pour l'avatar compagnon) */
  onStepChange?: (step: number) => void;
}

import { TREE_STEPS, AGENT_TREES, type StepOption, type TreeStep } from './qualification/steps';

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
  label: string;
  desc: string;
  isActive: boolean;
  isSelected: boolean;
  isIgnored: boolean;
  optIdx: number;
  onClick: () => void;
  refCallback: (el: HTMLButtonElement | null) => void;
}> = ({ option, label, desc, isActive, isSelected, isIgnored, optIdx, onClick, refCallback }) => {
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
        className="relative flex flex-col items-center text-center rounded-2xl outline-hidden select-none overflow-hidden"
        style={{
          width: '100%', height: '100%', minHeight: 180, padding: '1.25rem 1rem 1.15rem',
          // Fond opaque : le tracé décoratif de l'arbre passait à travers le texte.
          background: isSelected
            ? 'linear-gradient(145deg, rgba(20,184,166,0.15) 0%, rgba(99,102,241,0.08) 100%), #0b0f17'
            : 'linear-gradient(180deg, rgba(255,255,255,0.035), rgba(255,255,255,0.015)), #0b0f17',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          border: isSelected ? '1px solid rgba(20,184,166,0.0)' : isActive ? '1px solid rgba(255,255,255,0.09)' : '1px solid rgba(255,255,255,0.04)',
          boxShadow: isSelected ? '0 0 40px rgba(20,184,166,0.18), inset 0 0 20px rgba(20,184,166,0.05)' : 'none',
          cursor: isIgnored ? 'pointer' : 'pointer',
        }}
      >
        {/* ── Rotating conic border (selected) ── */}
        {isSelected && (
          <div className="absolute -inset-px rounded-2xl overflow-hidden pointer-events-none" style={{ zIndex: 0 }}>
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
            <div className="absolute inset-px rounded-[calc(1rem-1px)]"
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
          className="font-bold relative z-10"
          style={{ fontFamily: '"Sora",sans-serif', fontSize: '0.86rem', letterSpacing: '-0.005em', lineHeight: 1.3, marginBottom: '0.45rem', textWrap: 'balance' as any }}
        >
          {label}
        </motion.span>

        {/* ── Desc ── */}
        <motion.span
          animate={{ color: isSelected ? 'rgba(165,243,252,0.85)' : isActive ? 'rgba(240,235,224,0.7)' : 'rgba(240,235,224,0.38)' }}
          className="relative z-10"
          style={{ fontFamily: '"Manrope",sans-serif', fontSize: '0.78rem', lineHeight: 1.55 }}
        >
          {desc}
        </motion.span>
      </motion.button>
    </TiltCard>
  );
};

// ── Main component ─────────────────────────────────────────────────────────────
const DecisionTree: React.FC<DecisionTreeProps> = ({ onSubmit, isLoading, agentId, onStepChange }) => {
  const { t, money } = useI18n();
  // Scénario spécialisé selon le conseiller choisi ; générique sinon
  const steps = (agentId && AGENT_TREES[agentId]) || TREE_STEPS;
  const [stepIndex, setStepIndex] = useState(0);
  useEffect(() => { gtm.funnelStart(); }, []);
  useEffect(() => { onStepChange?.(stepIndex); }, [stepIndex, onStepChange]);
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

  if (itemsRef.current.length !== steps.length)
    itemsRef.current = Array(steps.length).fill(null).map(() => []);

  const calculatePaths = () => {
    if (!containerRef.current) return;
    const newPaths: PathData[] = [];
    const cRect = containerRef.current.getBoundingClientRect();
    history.forEach((selectedOptionIdx, stepIdx) => {
      if (stepIdx >= steps.length - 1) return;
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
    if (stepIndex === steps.length && scrollRef.current) {
      setTimeout(() => scrollRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 350);
    } else {
      const el = itemsRef.current[stepIndex]?.[0]?.parentElement?.parentElement;
      if (el) setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'center' }), 350);
    }
  }, [stepIndex]);

  const handleOptionClick = (stepIdx: number, optionIdx: number, option: StepOption) => {
    setProfile(prev => ({ ...prev, ...option.updates }));
    gtm.funnelStepComplete(steps[stepIdx].id, stepIdx, option.value);
    if (stepIdx < stepIndex) {
      const h = history.slice(0, stepIdx); h.push(optionIdx);
      setHistory(h); setStepIndex(stepIdx + 1);
    } else {
      setHistory(prev => [...prev, optionIdx]); setStepIndex(prev => prev + 1);
    }
  };

  const totalSteps = steps.length + 1;

  return (
    <div className="w-full max-w-5xl mx-auto pb-8 md:pb-12 px-4 relative" ref={containerRef}>

      {/* ── ROI Badge ── rendu dans <body> : un parent animé (transform) transforme
          `position: fixed` en positionnement relatif, et le badge était rogné. */}
      {typeof document !== 'undefined' && createPortal(
        <>
      <motion.div
        initial={{ opacity: 0, x: 30, scale: 0.8 }}
        animate={badgeVisible ? { opacity: 1, x: 0, scale: 1 } : { opacity: 0, x: 30, scale: 0.8 }}
        transition={{ duration: 0.45, type: 'spring', stiffness: 200, damping: 24 }}
        className="fixed bottom-4 right-3 md:bottom-auto md:top-24 md:right-8 z-50 scale-90 md:scale-100 origin-bottom-right md:origin-top-right"
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
          <div className="absolute -inset-px rounded-2xl overflow-hidden pointer-events-none">
            <motion.div
              className="absolute w-[400%] h-[400%]"
              style={{
                top: '-150%', left: '-150%',
                background: 'conic-gradient(from 0deg, transparent 0deg, rgba(212,168,67,0.55) 40deg, rgba(72,202,228,0.3) 70deg, transparent 100deg)',
              }}
              animate={{ rotate: 360 }}
              transition={{ duration: 6, repeat: Infinity, ease: 'linear' }}
            />
            <div className="absolute inset-px rounded-[calc(1rem-1px)]" style={{ background: 'rgba(6,10,18,0.96)' }} />
          </div>

          <div className="relative z-10 flex flex-col items-center px-3 py-3 md:px-5 md:py-4">
            <span style={{ color: 'rgba(212,168,67,0.55)', fontSize: '0.55rem', fontFamily: '"Manrope",sans-serif', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '0.3rem' }}>
              {fmt(t.tree.horizonLabel, { n: profile.duration })}
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
            <span style={{ color: 'rgba(212,168,67,0.45)', fontSize: '0.55rem', fontFamily: '"Manrope",sans-serif', letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: '0.3rem' }}>{t.tree.roiCaption}</span>
            <motion.div
              className="absolute inset-0 rounded-2xl pointer-events-none"
              animate={{ boxShadow: ['0 0 0 0 rgba(212,168,67,0.25)', '0 0 0 10px rgba(212,168,67,0)', '0 0 0 0 rgba(212,168,67,0)'] }}
              transition={{ duration: 3, repeat: Infinity }}
            />
          </div>
        </div>
      </motion.div>

        </>,
        document.body
      )}

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
              {t.tree.startBadge}
            </span>
          </div>
          <div className="absolute left-1/2 -translate-x-1/2 top-full w-px h-14"
            style={{ background: 'linear-gradient(to bottom, rgba(20,184,166,0.5), transparent)' }} />
        </motion.div>

        {/* ── Steps ── */}
        {steps.map((step, idx) => {
          if (idx > stepIndex) return null;
          const isCompleted = idx < stepIndex;
          const selectedOptionIndex = history[idx];
          // Les traductions i18n ne couvrent que le scénario générique
          const loc = agentId ? undefined : t.tree.steps[idx];

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
                    <span style={{ color: 'rgba(45,212,191,0.9)', fontSize: '0.6rem', fontFamily: '"Manrope",sans-serif', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase' }}>
                      {fmt(t.tree.stepLabel, { n: idx + 1 })}
                    </span>
                  </div>

                  <h3 style={{
                    fontFamily: '"Sora",sans-serif',
                    fontSize: 'clamp(1.15rem, 2.2vw, 1.65rem)',
                    fontWeight: 700,
                    color: isCompleted ? 'rgba(240,235,224,0.38)' : '#f0ebe0',
                    lineHeight: 1.25, marginBottom: '0.5rem',
                  }}>
                    {loc?.question ?? step.question}
                  </h3>
                  {step.sub && (
                    <p style={{ color: 'rgba(240,235,224,0.66)', fontSize: '0.84rem', fontFamily: '"Manrope",sans-serif', lineHeight: 1.6, maxWidth: 320 }}>
                      {loc?.sub ?? step.sub}
                    </p>
                  )}
                </motion.div>

                {/* RIGHT — cards */}
                {/* Flex centré : 5 choix → 3 + 2 équilibrés (la grille laissait une carte orpheline). */}
                <div className="flex flex-wrap justify-center gap-3 w-full">
                  {step.options.map((option, optIdx) => {
                    const isSelected = isCompleted && optIdx === selectedOptionIndex;
                    const isIgnored  = isCompleted && optIdx !== selectedOptionIndex;
                    const isActive   = idx === stepIndex;
                    return (
                      <div key={optIdx} style={{ flex: '1 1 190px', maxWidth: 250 }}>
                      <OptionCard
                        option={option}
                        label={loc?.options[optIdx]?.label ?? option.label}
                        desc={loc?.options[optIdx]?.desc ?? option.desc}
                        isActive={isActive}
                        isSelected={isSelected}
                        isIgnored={isIgnored}
                        optIdx={optIdx}
                        onClick={() => handleOptionClick(idx, optIdx, option)}
                        refCallback={el => { itemsRef.current[idx][optIdx] = el; }}
                      />
                      </div>
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
          {stepIndex === steps.length && (
            <motion.div
              ref={scrollRef}
              initial={{ opacity: 0, y: 40, filter: 'blur(10px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              transition={{ duration: 0.65, ease: 'easeOut' }}
              className="w-full max-w-md mt-6 relative"
            >
              {/* Rotating conic border (form) */}
              <div className="absolute -inset-px rounded-3xl overflow-hidden pointer-events-none">
                <motion.div
                  className="absolute w-[300%] h-[300%]"
                  style={{
                    top: '-100%', left: '-100%',
                    background: 'conic-gradient(from 0deg, transparent 0deg, #14b8a6 50deg, #67e8f9 100deg, #818cf8 140deg, transparent 190deg)',
                  }}
                  animate={{ rotate: 360 }}
                  transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
                />
                <div className="absolute inset-px rounded-[calc(1.5rem-1px)]" style={{ background: 'rgba(7,7,12,0.97)' }} />
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
                    {t.tree.finalStep}
                  </div>
                  <h3 style={{ fontFamily: '"Sora",sans-serif', fontSize: '1.75rem', fontWeight: 700, color: '#f0ebe0', marginBottom: '0.35rem' }}>
                    {t.tree.finalTitle}
                  </h3>
                  <p style={{ color: 'rgba(240,235,224,0.62)', fontSize: '0.73rem', fontFamily: '"Manrope",sans-serif', fontStyle: 'italic' }}>
                    {t.tree.finalSub}
                  </p>
                </div>

                <form onSubmit={e => { e.preventDefault(); const finalProfile = { ...profile, advisorId: agentId || undefined }; gtm.funnelComplete(finalProfile); onSubmit(finalProfile); }} className="space-y-5">
                  {/* Sliders */}
                  <div className="space-y-5 p-5 rounded-2xl" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(20,184,166,0.08)' }}>
                    {[
                      { label: t.tree.sliderDeposit, key: 'initialInvestment', min: 30000, max: parseInt(profile.totalBudget) || 600000, step: 5000, format: (v: string) => money(parseInt(v)) },
                      { label: t.tree.sliderMonthly, key: 'monthlyContribution', min: 0, max: 10000, step: 100, format: (v: string) => `${money(parseInt(v))}${t.tree.perMonthSuffix}` },
                    ].map(f => (
                      <div key={f.key}>
                        <div className="flex justify-between items-center mb-2.5">
                          <span style={{ color: 'rgba(240,235,224,0.62)', fontSize: '0.62rem', fontFamily: '"Manrope",sans-serif', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{f.label}</span>
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
                      { placeholder: t.tree.namePlaceholder, key: 'name',  type: 'text',  value: profile.name },
                      { placeholder: t.tree.emailPlaceholder, key: 'email', type: 'email', value: profile.email },
                    ].map(f => (
                      <input key={f.key} type={f.type} placeholder={f.placeholder} required value={f.value}
                        onChange={e => setProfile({ ...profile, [f.key]: e.target.value })}
                        className="w-full px-4 py-3.5 rounded-xl outline-hidden transition-all placeholder:text-[rgba(240,235,224,0.18)]"
                        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', color: '#f0ebe0', fontFamily: '"Manrope",sans-serif', fontSize: '0.85rem' }}
                        onFocus={e => { e.currentTarget.style.borderColor = 'rgba(20,184,166,0.55)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(20,184,166,0.08)'; }}
                        onBlur={e  => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'; e.currentTarget.style.boxShadow = 'none'; }}
                      />
                    ))}
                  </div>

                  {/* Consentements RGPD — facultatifs, non pré-cochés. Pas de
                      numéro collecté ici : seule la transmission partenaires est demandée. */}
                  <ConsentFields
                    value={{ whatsapp: false, partners: !!profile.consent?.partners }}
                    onChange={c => setProfile({ ...profile, consent: { whatsapp: false, partners: c.partners } })}
                    showWhatsApp={false}
                  />

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
                      ? <span className="loader w-4! h-4! border-2! border-black/20! border-t-black!" />
                      : <><ArrowRightIcon className="w-4 h-4 relative" /><span className="relative">{t.tree.submit}</span></>
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
