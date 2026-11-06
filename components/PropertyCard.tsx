import React, { useState, useCallback } from 'react';
import { Property } from '../types';
import { MapPinIcon, CheckIcon, TrendingUpIcon } from './Icons';
import { useI18n, fmt } from '../i18n';
import { checkPrice } from '../api/lib/priceCheck';
import { Map3DButton } from './map3d/Map3DDialog';

interface PropertyCardProps {
  property: Property;
  isSelected: boolean;
  onSelect: (property: Property) => void;
  onContact: (property: Property) => void;
}

const PropertyCard: React.FC<PropertyCardProps> = ({ property, isSelected, onSelect, onContact }) => {
  const { t, money } = useI18n();
  const photos = property.images && property.images.length > 0 ? property.images : (property.image ? [property.image] : []);
  const [photoIdx, setPhotoIdx] = useState(0);
  // Photo indisponible (lien PF expiré, réseau) : fond dégradé plutôt que le
  // texte alternatif étalé sur la carte.
  const [photoFailed, setPhotoFailed] = useState(false);

  const prevPhoto = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setPhotoIdx(i => (i - 1 + photos.length) % photos.length);
  }, [photos.length]);

  const nextPhoto = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setPhotoIdx(i => (i + 1) % photos.length);
  }, [photos.length]);

  const formatPrice = (price: number) => money(price);

  // Verdict prix : demandé vs médiane DLD revente du quartier (corrigée par
  // nombre de chambres) — le même calcul que la sélection du conseiller.
  // On n'affiche un badge que s'il y a un écart à dire, jamais un « deal »
  // décrété sur le seul rendement.
  const price = checkPrice(property.price, property.sqm, property.location, property.marketPriceSqft, {
    beds: property.beds,
    type: property.type,
  });
  const delta = price.deltaPct != null ? Math.round(price.deltaPct) : null;
  const priceBadge =
    price.code === 'unknown' || delta == null
      ? null
      : price.code === 'fair'
        ? { tone: 'neutral' as const, text: t.property.priceFairDld }
        : {
            tone: price.code === 'below' || price.code === 'well_below' ? ('good' as const) : ('bad' as const),
            text: fmt(t.property.priceVsDld, { d: `${delta > 0 ? '+' : '−'}${Math.abs(delta)}` }),
          };
  const priceBadgeStyle = {
    good: 'text-emerald-300 border-emerald-500/40 bg-black/75',
    neutral: 'text-slate-200 border-white/20 bg-black/75',
    bad: 'text-amber-300 border-amber-500/40 bg-black/75',
  };

  const getLiquidityColor = (l?: string) => {
    if (l === 'High') return 'text-emerald-400 border-emerald-500/30 bg-emerald-500/5';
    if (l === 'Medium') return 'text-gold-400 border-gold-500/30 bg-gold-500/5';
    return 'text-red-400 border-red-500/30 bg-red-500/5';
  };

  return (
    <div className={`relative group h-full rounded-2xl overflow-hidden transition-all duration-500 flex flex-col ${isSelected ? 'ring-2 ring-gold-400 shadow-glow bg-white/5' : 'border border-white/5 hover:border-gold-500/30 bg-midnight-900/40'}`}>
      
      {/* Selection Indicator */}
      {isSelected && (
        <div className="absolute top-4 right-4 z-20 bg-gold-500 text-midnight-950 p-1.5 rounded-full shadow-lg animate-fade-in">
          <CheckIcon className="w-4 h-4" />
        </div>
      )}

      {/* Image Section */}
      <div className="h-[220px] overflow-hidden relative shrink-0">
        <div className="absolute inset-0 bg-linear-to-t from-midnight-950 via-midnight-950/20 to-transparent z-10" />
        {photoFailed ? (
          <div aria-hidden className="w-full h-full" style={{ background: 'radial-gradient(120% 90% at 30% 20%, rgba(212,175,55,0.16), transparent 60%), linear-gradient(160deg, #141a2b 0%, #0a0d16 100%)' }} />
        ) : (
          <img
            src={photos[photoIdx] || property.image}
            alt={property.title}
            loading="lazy"
            decoding="async"
            onError={() => setPhotoFailed(true)}
            className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-110"
          />
        )}

        {/* Carousel arrows — only if multiple photos */}
        {photos.length > 1 && (
          <>
            <button
              onClick={prevPhoto}
              className="absolute left-2 top-1/2 -translate-y-1/2 z-20 bg-black/50 hover:bg-black/75 text-white rounded-full w-7 h-7 flex items-center justify-center transition-colors backdrop-blur-xs"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>
            </button>
            <button
              onClick={nextPhoto}
              className="absolute right-2 top-1/2 -translate-y-1/2 z-20 bg-black/50 hover:bg-black/75 text-white rounded-full w-7 h-7 flex items-center justify-center transition-colors backdrop-blur-xs"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg>
            </button>
            {/* Dot indicators */}
            <div className="absolute bottom-14 left-1/2 -translate-x-1/2 z-20 flex gap-1">
              {photos.map((_, i) => (
                <button
                  key={i}
                  onClick={(e) => { e.stopPropagation(); setPhotoIdx(i); }}
                  className={`w-1.5 h-1.5 rounded-full transition-all ${i === photoIdx ? 'bg-white scale-125' : 'bg-white/40'}`}
                />
              ))}
            </div>
          </>
        )}
        
        {/* Verdict prix DLD — chiffré et daté, pas d'adjectif */}
        {priceBadge && (
            <div className="absolute top-4 left-4 z-20 animate-fade-in">
                <span
                  className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-sm border backdrop-blur-md ${priceBadgeStyle[priceBadge.tone]}`}
                  title={fmt(t.property.dldAsOf, { date: price.asOf })}
                >
                   {priceBadge.text}
                </span>
            </div>
        )}

        {/* Title Overlay */}
        <div className="absolute bottom-4 left-4 right-4 z-20">
          <div className="flex items-end justify-between gap-2">
            <div className="min-w-0">
              <h3 className="font-serif text-xl text-white mb-1 leading-none drop-shadow-md truncate">{property.title}</h3>
              <div className="flex items-center gap-1 text-slate-300 text-xs">
                <MapPinIcon className="w-3 h-3 text-gold-500" /> {property.location}
              </div>
            </div>
            <div className="shrink-0">
              <Map3DButton
                compact
                subject={{
                  title: property.title,
                  location: property.location,
                  price: property.price,
                  beds: property.beds,
                  sqm: property.sqm,
                  type: property.type,
                  lat: property.lat,
                  lng: property.lng,
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Details Section */}
      <div className="p-4 flex flex-col flex-1 relative z-10">
        
        {/* Key Metrics Grid */}
        <div className="grid grid-cols-2 gap-2 mb-4">
            <div className="bg-white/5 rounded-sm p-2 border border-white/5">
                <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">{t.property.grossYield}</p>
                <p className="text-sm font-bold text-gold-400">{property.yield}%</p>
            </div>
            <div className={`rounded-sm p-2 border flex flex-col justify-center ${getLiquidityColor(property.liquidity)}`}>
                <p className="text-[10px] uppercase tracking-widest mb-1 opacity-90">{t.property.liquidity}</p>
                <p className="text-sm font-bold flex items-center gap-1">
                    {property.liquidity === 'High' ? t.property.liqFast : property.liquidity === 'Medium' ? t.property.liqMedium : t.property.liqSlow}
                </p>
            </div>
        </div>

        {/* Amenities */}
        {property.amenities && property.amenities.length > 0 && (
          <div className="mb-4">
            <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1.5">{t.property.amenities}</p>
            <div className="flex flex-wrap gap-1">
              {property.amenities.slice(0, 6).map((a, i) => (
                <span key={i} className="text-[8px] px-1.5 py-0.5 rounded-sm bg-white/5 text-slate-300 border border-white/10">
                  {a}
                </span>
              ))}
              {property.amenities.length > 6 && (
                <span className="text-[8px] px-1.5 py-0.5 rounded-sm bg-white/5 text-slate-500 border border-white/10">
                  +{property.amenities.length - 6}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Catalysts - Future Growth Tags */}
        {property.catalysts && property.catalysts.length > 0 && (
            <div className="mb-4">
                <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">{t.property.catalysts}</p>
                <div className="flex flex-wrap gap-1">
                    {property.catalysts.map((cat, i) => (
                        <span key={i} className="text-[8px] px-2 py-1 rounded-sm bg-blue-500/10 text-blue-300 border border-blue-500/20 flex items-center gap-1">
                            <TrendingUpIcon className="w-2 h-2" /> {cat}
                        </span>
                    ))}
                </div>
            </div>
        )}

        <div className="mt-auto pt-4 border-t border-white/5">
            <div className="flex justify-between items-center mb-3">
                <p className="text-lg font-serif text-white">{formatPrice(property.price)}</p>
                <span className="text-xs text-slate-500">{property.sqm} m²</span>
            </div>

            <div className="flex gap-2">
            <button 
                onClick={() => onSelect(property)}
                className={`flex-1 py-3 text-[9px] font-black uppercase tracking-widest rounded-xs transition-all ${
                isSelected 
                    ? 'bg-gold-500 text-midnight-950 border border-gold-500 cursor-default shadow-glow' 
                    : 'bg-white/5 text-white hover:bg-white/10 border border-white/10'
                }`}
            >
                {isSelected ? t.property.analyzed : t.property.simulate}
            </button>
            
            <button 
                onClick={() => onContact(property)}
                className="flex-1 py-3 bg-transparent border border-gold-500/30 text-gold-400 text-[9px] font-black uppercase tracking-widest rounded-xs hover:bg-gold-500/10 transition-colors"
            >
                {t.property.contact}
            </button>
            </div>

            {property.sourceUrl && property.source && property.source !== 'internal' && (
              <a
                href={property.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-1 text-[10px] uppercase tracking-widest text-cyan-300 hover:text-cyan-200 transition-colors"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                {t.property.viewListing}
              </a>
            )}
        </div>
      </div>
    </div>
  );
};

export default PropertyCard;
