import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Property, UserProfile } from '../types';
import { MapPinIcon, TrendingUpIcon, CheckIcon, XIcon, BuildingIcon } from './Icons';
import { useI18n } from '../i18n';

// ── Scoring ───────────────────────────────────────────────────────────────────

export function scoreProperty(p: Property, profile: UserProfile): number {
  const budget = parseFloat(profile.totalBudget) || 400_000;
  const isReady = !p.completion?.match(/Q[1-4]|20[2-9]/i);
  const liquidityScore = p.liquidity === 'High' ? 100 : p.liquidity === 'Medium' ? 65 : 35;

  const weightedScores: Array<{ weight: number; score: number }> = [];

  // 1) Budget fit (30): 100% in budget, then linear decay to 0 at +40%.
  const budgetRatio = p.price / budget;
  const budgetFit =
    budgetRatio <= 1 ? 100 :
    budgetRatio >= 1.4 ? 0 :
    Math.round(100 * (1 - (budgetRatio - 1) / 0.4));
  weightedScores.push({ weight: 30, score: budgetFit });

  // 2) Yield fit (20): target around 8%; smooth clamp around [4%, 10%].
  const yieldFit = Math.max(0, Math.min(100, ((p.yield - 4) / 6) * 100));
  weightedScores.push({ weight: 20, score: yieldFit });

  // 3) Objective fit (20): uses explicit profile objective when available.
  let objectiveFit = 60; // neutral fallback
  switch (profile.objective) {
    case 'rental_income':
      objectiveFit = Math.max(0, Math.min(100, ((p.yield - 5) / 3) * 100));
      break;
    case 'capital_gains':
      objectiveFit = isReady ? (p.liquidity === 'High' ? 90 : 70) : 100;
      break;
    case 'secondary_residence':
      objectiveFit = p.location.match(/Marina|Palm|JBR|Downtown/i) ? 100 : 55;
      break;
    case 'golden_visa':
      objectiveFit = p.price >= 545_000 ? 100 : Math.max(0, Math.min(100, (p.price / 545_000) * 100));
      break;
    case 'diversification':
      objectiveFit = p.liquidity === 'High' ? 95 : p.liquidity === 'Medium' ? 75 : 45;
      break;
  }
  weightedScores.push({ weight: 20, score: objectiveFit });

  // 4) Risk fit (15): coherence between risk appetite and ready/off-plan profile.
  let riskFit = 60;
  if (profile.riskLevel <= 2) riskFit = isReady ? 95 : 35;
  else if (profile.riskLevel === 3) riskFit = isReady ? 80 : 70;
  else riskFit = isReady ? 65 : 95;
  weightedScores.push({ weight: 15, score: riskFit });

  // 5) Zone preference fit (10): only active if user actually provided it.
  if (profile.zonePreference) {
    let zoneFit = 50;
    switch (profile.zonePreference) {
      case 'high_yield':
        zoneFit = p.yield >= 7.5 ? 100 : p.yield >= 6.5 ? 75 : 35;
        break;
      case 'capital_appreciation':
        zoneFit = p.liquidity === 'High' ? 90 : 60;
        break;
      case 'premium_lifestyle':
        zoneFit = p.location.match(/Marina|Palm|JBR|Downtown/i) ? 100 : 40;
        break;
      case 'emerging':
        zoneFit = p.location.match(/South|Furjan|RAK|Expo|Creek/i) ? 100 : 35;
        break;
      case 'balanced':
        zoneFit = p.liquidity === 'High' ? 85 : p.liquidity === 'Medium' ? 70 : 50;
        break;
    }
    weightedScores.push({ weight: 10, score: zoneFit });
  }

  // 6) Liquidity fit (5)
  weightedScores.push({ weight: 5, score: liquidityScore });

  const totalWeight = weightedScores.reduce((acc, it) => acc + it.weight, 0);
  const totalScore = weightedScores.reduce((acc, it) => acc + it.score * it.weight, 0);
  return Math.round(totalScore / totalWeight);
}

function matchPercent(score: number): number {
  return Math.max(35, Math.min(score, 95));
}

function buildRationale(p: Property, profile: UserProfile, money: (n: number) => string): string[] {
  const reasons: string[] = [];
  const budget = parseFloat(profile.totalBudget) || 400_000;
  if (p.price <= budget) reasons.push(`Dans votre budget (${money(p.price)})`);
  if (p.yield >= 7) reasons.push(`Rendement exceptionnel à ${p.yield}%`);
  if (p.liquidity === 'High') reasons.push('Liquidité élevée — revente rapide si besoin');
  if (profile.objective === 'rental_income' && p.yield >= 6.5) reasons.push('Correspond à votre objectif locatif');
  if (profile.objective === 'golden_visa' && p.price >= 545_000) reasons.push(`Éligible Golden Visa UAE (≥ ${money(545_000)})`);
  if (p.catalysts && p.catalysts.length > 0) reasons.push(`Catalyseurs : ${p.catalysts.slice(0, 2).join(', ')}`);
  return reasons.slice(0, 3);
}

// ── Lightbox ──────────────────────────────────────────────────────────────────

interface LightboxProps {
  property: Property;
  images: string[];
  initialIndex: number;
  onClose: () => void;
}

const Lightbox: React.FC<LightboxProps> = ({ property: p, images, initialIndex, onClose }) => {
  const { money } = useI18n();
  const [idx, setIdx] = useState(initialIndex);
  const prev = useCallback(() => setIdx(i => (i - 1 + images.length) % images.length), [images.length]);
  const next = useCallback(() => setIdx(i => (i + 1) % images.length), [images.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft')  prev();
      if (e.key === 'ArrowRight') next();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, prev, next]);

  const fmt = (n: number) => money(n);

  return (
    <div
      className="fixed inset-0 z-[200] flex flex-col items-center justify-center p-4"
      style={{ background: 'rgba(3,3,6,0.94)', backdropFilter: 'blur(18px)' }}
      onClick={onClose}
    >
      {/* Close */}
      <button
        onClick={onClose}
        className="absolute top-5 right-5 w-10 h-10 rounded-full flex items-center justify-center z-10"
        style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)', color: 'white' }}
      >
        <XIcon className="w-5 h-5" />
      </button>

      {/* Image area */}
      <div
        className="relative w-full max-w-3xl flex items-center justify-center"
        onClick={e => e.stopPropagation()}
      >
        <img
          key={idx}
          src={images[idx]}
          alt={p.title}
          className="w-full rounded-2xl object-contain"
          style={{ maxHeight: '55vh', boxShadow: '0 0 60px rgba(0,0,0,0.6)' }}
        />

        {/* Nav arrows */}
        {images.length > 1 && (
          <>
            <button
              onClick={prev}
              className="absolute left-3 w-10 h-10 rounded-full flex items-center justify-center transition-all"
              style={{ background: 'rgba(5,5,8,0.80)', border: '1px solid rgba(255,255,255,0.15)', color: 'white' }}
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={next}
              className="absolute right-3 w-10 h-10 rounded-full flex items-center justify-center transition-all"
              style={{ background: 'rgba(5,5,8,0.80)', border: '1px solid rgba(255,255,255,0.15)', color: 'white' }}
            >
              <ChevronRight className="w-5 h-5" />
            </button>

            {/* Dots */}
            <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 flex gap-2">
              {images.map((_, i) => (
                <button key={i} onClick={() => setIdx(i)}
                  className="rounded-full transition-all"
                  style={{ width: i === idx ? 20 : 7, height: 7, background: i === idx ? '#D4AF37' : 'rgba(255,255,255,0.30)' }}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Description */}
      <div
        className="mt-10 w-full max-w-3xl rounded-2xl p-6 overflow-y-auto"
        style={{ background: 'rgba(13,12,24,0.90)', border: '1px solid rgba(212,175,55,0.18)', maxHeight: '30vh' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-5">
          <div>
            <h3 className="text-xl font-serif text-white mb-1">{p.title}</h3>
            <p className="text-xs flex items-center gap-1" style={{ color: 'rgba(212,175,55,0.70)' }}>
              <MapPinIcon className="w-3 h-3" /> {p.location}
            </p>
          </div>
          <p className="text-xl font-serif shrink-0" style={{ color: '#D4AF37' }}>{fmt(p.price)}</p>
        </div>

        {/* Specs grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          {[
            { label: 'Rendement', value: `${p.yield}%` },
            { label: 'Surface',   value: `${p.sqm} m²` },
            { label: 'Chambres', value: `${p.beds} ch. / ${p.baths} sdb` },
            { label: 'Type',      value: p.type },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <p className="text-[8px] uppercase tracking-widest mb-1" style={{ color: 'rgba(180,175,165,0.45)' }}>{label}</p>
              <p className="text-sm font-semibold text-white">{value}</p>
            </div>
          ))}
        </div>

        {/* Catalysts */}
        {p.catalysts && p.catalysts.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {p.catalysts.map((c, i) => (
              <span key={i} className="text-[9px] px-2.5 py-1 rounded-full flex items-center gap-1"
                style={{ background: 'rgba(0,242,255,0.07)', border: '1px solid rgba(0,242,255,0.18)', color: '#00F2FF' }}>
                <TrendingUpIcon className="w-2.5 h-2.5" /> {c}
              </span>
            ))}
          </div>
        )}

        {/* Liquidité + Livraison */}
        <div className="flex flex-wrap gap-4 text-xs" style={{ color: 'rgba(180,175,165,0.60)' }}>
          {p.liquidity && <span><BuildingIcon className="w-3 h-3 inline mr-1" />Liquidité : <span className="text-white font-semibold">{p.liquidity}</span></span>}
          {p.completion && <span>Livraison : <span className="text-white font-semibold">{p.completion}</span></span>}
          {p.sourceUrl && (
            <a href={p.sourceUrl} target="_blank" rel="noopener noreferrer"
              className="text-cyan-400 hover:text-cyan-300 underline underline-offset-2">
              Voir l'annonce source →
            </a>
          )}
        </div>
      </div>
    </div>
  );
};

// ── Circular progress ring ────────────────────────────────────────────────────

const RADIUS = 168;
const STROKE = 9;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const SIZE = (RADIUS + STROKE) * 2;

const ChevronLeft: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
  </svg>
);
const ChevronRight: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
  </svg>
);

interface ProgressRingProps {
  pct: number;
  images: string[];
  title: string;
  onOpenLightbox: (index: number) => void;
}

const ProgressRing: React.FC<ProgressRingProps> = ({ pct, images, title, onOpenLightbox }) => {
  const [offset, setOffset]     = useState(CIRCUMFERENCE); // ring starts empty
  const [imgIndex, setImgIndex] = useState(0);
  const [imgLoaded, setImgLoaded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Trigger ring animation only once the component enters the viewport
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          // wait for image to be visible, then animate
          setTimeout(() => {
            setOffset(CIRCUMFERENCE * (1 - pct / 100));
          }, 400);
          observer.disconnect();
        }
      },
      { threshold: 0.4 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [pct]);

  const prev = () => setImgIndex(i => (i - 1 + images.length) % images.length);
  const next = () => setImgIndex(i => (i + 1) % images.length);

  const imgInset = STROKE + 6;

  return (
    <div ref={containerRef} className="relative mx-auto" style={{ width: SIZE, height: SIZE }}>

      {/* Circular image + carousel */}
      <div
        className="absolute overflow-hidden group/img"
        style={{ inset: imgInset, borderRadius: '50%', background: '#0d0c18', cursor: 'zoom-in' }}
        onClick={() => onOpenLightbox(imgIndex)}
      >
        <img
          key={imgIndex}
          src={images[imgIndex]}
          alt={title}
          onLoad={() => setImgLoaded(true)}
          className="w-full h-full object-cover transition-all duration-500 group-hover/img:scale-105"
          style={{ opacity: imgLoaded ? 1 : 0 }}
        />
        {/* subtle bottom vignette */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'linear-gradient(to top, rgba(5,5,8,0.45) 0%, transparent 50%)' }}
        />
        {/* zoom hint on hover */}
        <div
          className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity duration-300 pointer-events-none"
          style={{ background: 'rgba(5,5,8,0.30)' }}
        >
          <span className="text-[10px] uppercase tracking-widest font-bold px-3 py-1.5 rounded-full"
            style={{ background: 'rgba(5,5,8,0.80)', border: '1px solid rgba(212,175,55,0.50)', color: '#D4AF37' }}>
            Agrandir
          </span>
        </div>

        {/* Carousel arrows — only shown when multiple images */}
        {images.length > 1 && (
          <>
            <button
              onClick={prev}
              className="absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center transition-all"
              style={{ background: 'rgba(5,5,8,0.70)', border: '1px solid rgba(255,255,255,0.15)' }}
            >
              <ChevronLeft className="w-4 h-4 text-white" />
            </button>
            <button
              onClick={next}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center transition-all"
              style={{ background: 'rgba(5,5,8,0.70)', border: '1px solid rgba(255,255,255,0.15)' }}
            >
              <ChevronRight className="w-4 h-4 text-white" />
            </button>

            {/* Dots */}
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-1.5">
              {images.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setImgIndex(i)}
                  className="rounded-full transition-all"
                  style={{
                    width: i === imgIndex ? 16 : 6,
                    height: 6,
                    background: i === imgIndex ? '#D4AF37' : 'rgba(255,255,255,0.35)',
                  }}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* SVG progress ring — rendered on top */}
      <svg
        width={SIZE}
        height={SIZE}
        className="absolute inset-0 pointer-events-none"
        style={{ transform: 'rotate(-90deg)' }}
      >
        <defs>
          <linearGradient id="goldCyan" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%"   stopColor="#D4AF37" />
            <stop offset="55%"  stopColor="#f0c040" />
            <stop offset="100%" stopColor="#00F2FF" />
          </linearGradient>
        </defs>
        {/* Track */}
        <circle cx={SIZE/2} cy={SIZE/2} r={RADIUS} fill="none"
          stroke="rgba(212,175,55,0.10)" strokeWidth={STROKE} />
        {/* Animated arc */}
        <circle cx={SIZE/2} cy={SIZE/2} r={RADIUS} fill="none"
          stroke="url(#goldCyan)" strokeWidth={STROKE} strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE} strokeDashoffset={offset}
          style={{
            transition: 'stroke-dashoffset 1.6s cubic-bezier(0.4,0,0.2,1)',
            filter: 'drop-shadow(0 0 8px rgba(212,175,55,0.65))',
          }}
        />
      </svg>

      {/* % badge pinned at bottom of ring */}
      <div
        className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center justify-center px-5 py-2 rounded-full"
        style={{
          bottom: 2,
          background: 'rgba(5,5,8,0.94)',
          border: '1px solid rgba(212,175,55,0.55)',
          boxShadow: '0 0 20px rgba(212,175,55,0.35)',
          minWidth: 90,
          zIndex: 10,
        }}
      >
        <span className="text-2xl font-black leading-none" style={{ color: '#D4AF37' }}>{pct}%</span>
        <span className="text-[8px] uppercase tracking-widest mt-0.5" style={{ color: 'rgba(212,175,55,0.60)' }}>de match</span>
      </div>
    </div>
  );
};

// ── Component ─────────────────────────────────────────────────────────────────

interface AITopPickProps {
  property: Property;
  profile: UserProfile;
  score: number;
  onSelect: (p: Property) => void;
  onContact: (p: Property) => void;
  isSelected: boolean;
}

const AITopPick: React.FC<AITopPickProps> = ({ property: p, profile, score, onSelect, onContact, isSelected }) => {
  const { money } = useI18n();
  const pct  = matchPercent(score);
  const whys = buildRationale(p, profile, money);
  const fmt  = (n: number) => money(n);

  const images = (p.images && p.images.length > 0 ? p.images : [p.image]).filter(Boolean);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  return (
    <div
      className="relative rounded-2xl overflow-hidden mb-10 px-6 pt-8 pb-8"
      style={{
        border: '1px solid rgba(212,175,55,0.30)',
        boxShadow: '0 0 80px rgba(212,175,55,0.08)',
        background: 'rgba(255,255,255,0.025)',
      }}
    >
      {/* Animated top border */}
      <div
        className="absolute top-0 left-0 right-0 h-[2px]"
        style={{ background: 'linear-gradient(90deg, transparent 0%, #D4AF37 40%, #00F2FF 60%, transparent 100%)' }}
      />

      {/* ── Title ── */}
      <div className="text-center mb-8">
        <p className="text-[10px] uppercase tracking-[0.25em] mb-2" style={{ color: 'rgba(212,175,55,0.55)' }}>
          ★ Recommandation IA · Analyse de votre profil
        </p>
        <h2 className="text-2xl md:text-4xl font-serif text-white leading-tight">
          Meilleure annonce du moment
        </h2>
        <h2 className="text-2xl md:text-4xl font-serif leading-tight" style={{ color: '#D4AF37' }}>
          pour votre profil
        </h2>
      </div>

      {/* ── Circular carousel + ring ── */}
      <div className="flex justify-center mb-8">
        <ProgressRing
          pct={pct}
          images={images}
          title={p.title}
          onOpenLightbox={setLightboxIndex}
        />
      </div>

      {/* ── Lightbox ── */}
      {lightboxIndex !== null && (
        <Lightbox
          property={p}
          images={images}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}

      {/* ── Property name + location ── */}
      <div className="text-center mb-6">
        <h3 className="text-xl md:text-2xl font-serif text-white">{p.title}</h3>
        <p className="text-xs mt-1 flex items-center justify-center gap-1" style={{ color: 'rgba(180,175,165,0.60)' }}>
          <MapPinIcon className="w-3 h-3" /> {p.location}
        </p>
        {p.sourceUrl ? (
          <a
            href={p.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 mt-3 text-[10px] uppercase tracking-widest font-bold transition-all px-4 py-1.5 rounded-full"
            style={{ color: '#00F2FF', border: '1px solid rgba(0,242,255,0.30)', background: 'rgba(0,242,255,0.06)' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,242,255,0.12)'; e.currentTarget.style.borderColor = 'rgba(0,242,255,0.60)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(0,242,255,0.06)'; e.currentTarget.style.borderColor = 'rgba(0,242,255,0.30)'; }}
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            Voir l'annonce complète
          </a>
        ) : (
          <span className="inline-block mt-3 text-[9px] uppercase tracking-widest px-3 py-1 rounded-full"
            style={{ color: 'rgba(180,175,165,0.35)', border: '1px solid rgba(255,255,255,0.07)' }}>
            Annonce interne
          </span>
        )}
      </div>

      {/* ── Key metrics ── */}
      <div className="grid grid-cols-3 gap-3 mb-6 max-w-sm mx-auto">
        {[
          { label: 'Rendement', value: `${p.yield}%`, gold: true },
          { label: 'Prix',      value: fmt(p.price),  gold: false },
          { label: 'Surface',   value: `${p.sqm} m²`, gold: false },
        ].map(({ label, value, gold }) => (
          <div
            key={label}
            className="rounded-xl p-3 text-center"
            style={{
              background: gold ? 'rgba(212,175,55,0.08)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${gold ? 'rgba(212,175,55,0.30)' : 'rgba(255,255,255,0.08)'}`,
            }}
          >
            <p className="text-[8px] uppercase tracking-widest mb-1" style={{ color: 'rgba(180,175,165,0.45)' }}>{label}</p>
            <p className="text-sm font-bold" style={{ color: gold ? '#D4AF37' : 'white' }}>{value}</p>
          </div>
        ))}
      </div>

      {/* ── Why IA picked it ── */}
      {whys.length > 0 && (
        <div className="max-w-sm mx-auto mb-6 space-y-2">
          {whys.map((w, i) => (
            <div key={i} className="flex items-start gap-2 text-xs" style={{ color: 'rgba(180,175,165,0.80)' }}>
              <CheckIcon className="w-3.5 h-3.5 mt-0.5 shrink-0 text-emerald-400" />
              {w}
            </div>
          ))}
        </div>
      )}

      {/* ── Catalysts ── */}
      {p.catalysts && p.catalysts.length > 0 && (
        <div className="flex flex-wrap justify-center gap-2 mb-6">
          {p.catalysts.map((c, i) => (
            <span
              key={i}
              className="text-[9px] px-2.5 py-1 rounded-full flex items-center gap-1"
              style={{ background: 'rgba(0,242,255,0.07)', border: '1px solid rgba(0,242,255,0.18)', color: '#00F2FF' }}
            >
              <TrendingUpIcon className="w-2.5 h-2.5" /> {c}
            </span>
          ))}
        </div>
      )}

      {/* ── CTAs ── */}
      <div className="flex flex-col sm:flex-row gap-3 max-w-sm mx-auto">
        <button
          onClick={() => onSelect(p)}
          className="flex-1 py-4 rounded-xl text-xs font-black uppercase tracking-[0.15em] transition-all flex items-center justify-center gap-2"
          style={isSelected ? {
            background: 'linear-gradient(135deg, #fef3c7 0%, #f0c040 50%, #b8891e 100%)',
            color: '#0d0c18',
            boxShadow: '0 0 28px rgba(212,175,55,0.40)',
          } : {
            background: 'rgba(212,175,55,0.10)',
            border: '1px solid rgba(212,175,55,0.40)',
            color: '#D4AF37',
          }}
        >
          {isSelected ? <><CheckIcon className="w-4 h-4" /> Bien sélectionné</> : 'Simuler avec ce bien'}
        </button>
        <button
          onClick={() => onContact(p)}
          className="flex-1 py-4 rounded-xl text-xs font-black uppercase tracking-[0.15em] transition-all"
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.12)',
            color: 'rgba(232,228,220,0.80)',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
        >
          Être rappelé
        </button>
      </div>
    </div>
  );
};

export default AITopPick;
