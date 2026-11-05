import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldCheck, TrendingDown, TrendingUp, Minus, ExternalLink, ChevronDown, Sparkles } from 'lucide-react';
import type { MatchedListing, MarketSummary } from '../services/agentService';
import { Map3DButton } from './map3d/Map3DDialog';

/**
 * Biens réels retenus par le moteur de matching pour le dossier en cours.
 *
 * L'information différenciante n'est pas l'annonce — elle est publique — mais le
 * verdict prix face aux transactions réellement enregistrées au DLD, et le score
 * d'adéquation au dossier. C'est donc ça qu'on met en avant, pas la photo.
 */

const VERDICT_STYLE: Record<
  MatchedListing['priceCode'],
  { color: string; bg: string; border: string; label: string; Icon: React.ComponentType<{ size?: number }> }
> = {
  well_below: { color: '#34d399', bg: 'rgba(52,211,153,0.10)', border: 'rgba(52,211,153,0.32)', label: 'Sous le marché', Icon: TrendingDown },
  below:      { color: '#6ee7b7', bg: 'rgba(110,231,183,0.09)', border: 'rgba(110,231,183,0.28)', label: 'Sous le marché', Icon: TrendingDown },
  fair:       { color: '#48cae4', bg: 'rgba(72,202,228,0.09)',  border: 'rgba(72,202,228,0.28)', label: 'Au prix du marché', Icon: Minus },
  above:      { color: '#fbbf24', bg: 'rgba(251,191,36,0.09)',  border: 'rgba(251,191,36,0.28)', label: 'Au-dessus du marché', Icon: TrendingUp },
  well_above: { color: '#f87171', bg: 'rgba(248,113,113,0.09)', border: 'rgba(248,113,113,0.28)', label: 'Surévalué', Icon: TrendingUp },
  unknown:    { color: 'rgba(240,235,224,0.5)', bg: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.10)', label: 'Non vérifiable', Icon: Minus },
};

const eur = (n: number) => `${Math.round(n).toLocaleString('fr-FR')} €`;

const ScoreRing: React.FC<{ score: number }> = ({ score }) => {
  const r = 18;
  const circumference = 2 * Math.PI * r;
  const tone = score >= 75 ? '#34d399' : score >= 55 ? '#48cae4' : score >= 35 ? '#fbbf24' : '#f87171';
  return (
    <div className="relative shrink-0" style={{ width: 46, height: 46 }}>
      <svg width="46" height="46" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="23" cy="23" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3.5" />
        <motion.circle
          cx="23" cy="23" r={r} fill="none" stroke={tone} strokeWidth="3.5" strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: circumference * (1 - score / 100) }}
          transition={{ duration: 0.9, ease: 'easeOut' }}
        />
      </svg>
      <div
        className="absolute inset-0 flex items-center justify-center"
        style={{ fontFamily: '"Manrope",sans-serif', fontSize: '0.72rem', fontWeight: 800, color: tone }}
      >
        {score}
      </div>
    </div>
  );
};

const ListingRow: React.FC<{ listing: MatchedListing; index: number }> = ({ listing, index }) => {
  const [open, setOpen] = useState(false);
  const v = VERDICT_STYLE[listing.priceCode] ?? VERDICT_STYLE.unknown;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.06 }}
      className="rounded-2xl overflow-hidden"
      style={{ background: 'rgba(255,255,255,0.028)', border: '1px solid rgba(255,255,255,0.07)' }}
    >
      <div className="flex items-start gap-3 p-3.5">
        <ScoreRing score={listing.matchScore} />

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h4
              className="truncate"
              style={{ fontFamily: '"Sora",sans-serif', fontSize: '0.9rem', fontWeight: 600, color: '#f0ebe0' }}
              title={listing.title}
            >
              {listing.title}
            </h4>
            {listing.sourceUrl && (
              <a
                href={listing.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 opacity-50 hover:opacity-100 transition-opacity"
                style={{ color: '#48cae4' }}
                aria-label="Voir l'annonce source"
              >
                <ExternalLink size={13} />
              </a>
            )}
          </div>

          <p style={{ fontFamily: '"Manrope",sans-serif', fontSize: '0.72rem', color: 'rgba(240,235,224,0.55)', marginTop: 2 }}>
            {listing.location} · {listing.beds} ch · {listing.sqm} m²
            {listing.completion && listing.completion !== 'Ready' ? ` · livraison ${listing.completion}` : ''}
          </p>

          <div className="flex flex-wrap items-center gap-2 mt-2">
            <span style={{ fontFamily: '"Sora",sans-serif', fontSize: '1rem', fontWeight: 700, color: '#fff' }}>
              {eur(listing.price)}
            </span>
            {listing.netYield !== null && (
              <span
                className="px-2 py-0.5 rounded-full"
                style={{
                  fontFamily: '"Manrope",sans-serif', fontSize: '0.65rem', fontWeight: 700,
                  color: '#D4AF37', background: 'rgba(212,175,55,0.10)', border: '1px solid rgba(212,175,55,0.24)',
                }}
              >
                {listing.netYield}% net
              </span>
            )}
            <span className="ml-auto">
              <Map3DButton
                compact
                subject={{
                  title: listing.title,
                  location: listing.location,
                  price: listing.price,
                  beds: listing.beds,
                  sqm: listing.sqm,
                  type: listing.type,
                  lat: listing.lat,
                  lng: listing.lng,
                }}
              />
            </span>
          </div>

          {/* Le verdict prix : ce que l'annonce ne dit pas. */}
          <div
            className="flex items-start gap-1.5 mt-2.5 px-2.5 py-1.5 rounded-lg"
            style={{ background: v.bg, border: `1px solid ${v.border}` }}
          >
            <span style={{ color: v.color, marginTop: 1 }}><v.Icon size={12} /></span>
            <div className="min-w-0">
              <span style={{ fontFamily: '"Manrope",sans-serif', fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: v.color }}>
                {v.label}
              </span>
              <p style={{ fontFamily: '"Manrope",sans-serif', fontSize: '0.68rem', color: 'rgba(240,235,224,0.62)', lineHeight: 1.45, marginTop: 1 }}>
                {listing.priceVerdict}
              </p>
            </div>
          </div>

          {listing.matchReasons.length > 0 && (
            <>
              <button
                onClick={() => setOpen(o => !o)}
                className="inline-flex items-center gap-1 mt-2"
                style={{
                  fontFamily: '"Manrope",sans-serif', fontSize: '0.66rem', fontWeight: 600,
                  color: 'rgba(72,202,228,0.85)', background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                }}
              >
                Pourquoi ce score
                <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }} style={{ display: 'inline-flex' }}>
                  <ChevronDown size={12} />
                </motion.span>
              </button>
              <AnimatePresence initial={false}>
                {open && (
                  <motion.ul
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25 }}
                    className="overflow-hidden"
                    style={{ marginTop: 6 }}
                  >
                    {listing.matchReasons.map((r, i) => (
                      <li
                        key={i}
                        style={{
                          fontFamily: '"Manrope",sans-serif', fontSize: '0.68rem',
                          color: 'rgba(240,235,224,0.58)', lineHeight: 1.6,
                          paddingLeft: 10, position: 'relative',
                        }}
                      >
                        <span style={{ position: 'absolute', left: 0, color: 'rgba(72,202,228,0.6)' }}>·</span>
                        {r}
                      </li>
                    ))}
                  </motion.ul>
                )}
              </AnimatePresence>
            </>
          )}
        </div>
      </div>
    </motion.div>
  );
};

const MatchedListings: React.FC<{
  listings: MatchedListing[];
  market?: MarketSummary;
  advisorName?: string;
  isLoading?: boolean;
}> = ({ listings, market, advisorName, isLoading }) => {
  if (!isLoading && !listings.length) return null;

  return (
    <section className="w-full">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <div className="inline-flex items-center gap-1.5 mb-1.5">
            <ShieldCheck size={12} style={{ color: '#34d399' }} />
            <span style={{ fontFamily: '"Manrope",sans-serif', fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#34d399' }}>
              Prix vérifiés contre les transactions DLD
            </span>
          </div>
          <h3 style={{ fontFamily: '"Sora",sans-serif', fontSize: '1.15rem', fontWeight: 700, color: '#f0ebe0', lineHeight: 1.2 }}>
            {advisorName ? `La sélection de ${advisorName.split(' ')[0]}` : 'Biens retenus pour votre dossier'}
          </h3>
          {market?.avgPriceSqft && (
            <p style={{ fontFamily: '"Manrope",sans-serif', fontSize: '0.68rem', color: 'rgba(240,235,224,0.48)', marginTop: 3 }}>
              Référence marché : {Math.round(market.avgPriceSqft).toLocaleString('fr-FR')} AED/sqft
              {market.volume ? ` · ${market.volume.toLocaleString('fr-FR')} transactions` : ''}
              {market.trend ? ` · ${market.trend}` : ''}
            </p>
          )}
        </div>
        {!isLoading && (
          <span
            className="shrink-0 px-2.5 py-1 rounded-full"
            style={{
              fontFamily: '"Manrope",sans-serif', fontSize: '0.62rem', fontWeight: 700,
              color: 'rgba(240,235,224,0.6)', background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            {listings.length} sur {listings.length >= 8 ? '40+' : listings.length} analysés
          </span>
        )}
      </div>

      {isLoading && !listings.length ? (
        <div
          className="flex items-center gap-2.5 px-4 py-5 rounded-2xl"
          style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          <motion.span
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
            style={{ display: 'inline-flex', color: '#48cae4' }}
          >
            <Sparkles size={14} />
          </motion.span>
          <span style={{ fontFamily: '"Manrope",sans-serif', fontSize: '0.78rem', color: 'rgba(240,235,224,0.6)' }}>
            Analyse des annonces et croisement avec les transactions enregistrées…
          </span>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {listings.map((l, i) => <ListingRow key={l.id} listing={l} index={i} />)}
        </div>
      )}
    </section>
  );
};

export default MatchedListings;
