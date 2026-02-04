import React from 'react';
import { Property } from '../types';
import { MapPinIcon, CheckIcon, TrendingUpIcon } from './Icons';

interface PropertyCardProps {
  property: Property;
  isSelected: boolean;
  onSelect: (property: Property) => void;
  onContact: (property: Property) => void;
}

const PropertyCard: React.FC<PropertyCardProps> = ({ property, isSelected, onSelect, onContact }) => {
  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(price);
  };

  // Calcul du Deal Score
  // On compare le prix au m2 de cette propriété avec le prix du marché moyen défini dans les données
  const marketPriceSqft = property.marketPriceSqft ?? 0;
  const currentPriceSqft = property.price / property.sqm; // Approximation si marketPriceSqft est en sqft
  const discount = marketPriceSqft > 0 
    ? ((marketPriceSqft - (property.price / property.sqm * 10.764)) / marketPriceSqft) * 100
    : 0;
  // Si le discount est positif, c'est un bon deal (Note: * 10.764 pour convertir sqm en sqft pour la comparaison)
  
  // Simplification pour l'affichage : on force l'affichage du Deal Score si c'est une des propriétés "Star"
  const isGoodDeal = property.yield > 6.5; 

  const getLiquidityColor = (l?: string) => {
    if (l === 'High') return 'text-emerald-400 border-emerald-500/30 bg-emerald-500/5';
    if (l === 'Medium') return 'text-gold-400 border-gold-500/30 bg-gold-500/5';
    return 'text-red-400 border-red-500/30 bg-red-500/5';
  };

  return (
    <div className={`relative group h-full rounded-2xl overflow-hidden transition-all duration-500 flex flex-col ${isSelected ? 'ring-2 ring-gold-400 shadow-glow bg-white/5' : 'border border-white/5 hover:border-gold-500/30 bg-midnight-900/40'}`}>
      
      {/* Selection Indicator */}
      {isSelected && (
        <div className="absolute top-4 right-4 z-20 bg-gold-500 text-midnight-950 p-1.5 rounded-full shadow-lg animate-fadeIn">
          <CheckIcon className="w-4 h-4" />
        </div>
      )}

      {/* Image Section */}
      <div className="h-[220px] overflow-hidden relative shrink-0">
        <div className="absolute inset-0 bg-gradient-to-t from-midnight-950 via-midnight-950/20 to-transparent z-10" />
        <img 
          src={property.image} 
          alt={property.title} 
          className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-110"
        />
        
        {/* Deal Score Badge - VERY VISIBLE */}
        {isGoodDeal && (
            <div className="absolute top-4 left-4 z-20 animate-fade-in flex flex-col items-start gap-1">
                <span className="text-[10px] font-black bg-emerald-500 text-white px-3 py-1 rounded shadow-lg uppercase tracking-widest flex items-center gap-1">
                   ★ Deal Score
                </span>
                <span className="text-xs font-bold bg-black/80 text-emerald-400 px-3 py-1 rounded border border-emerald-500/30 backdrop-blur-md">
                   Opportunité Confirmée
                </span>
            </div>
        )}

        {/* Title Overlay */}
        <div className="absolute bottom-4 left-4 right-4 z-20">
          <h3 className="font-serif text-xl text-white mb-1 leading-none drop-shadow-md truncate">{property.title}</h3>
          <div className="flex items-center gap-1 text-slate-300 text-xs">
            <MapPinIcon className="w-3 h-3 text-gold-500" /> {property.location}
          </div>
        </div>
      </div>

      {/* Details Section */}
      <div className="p-4 flex flex-col flex-1 relative z-10">
        
        {/* Key Metrics Grid */}
        <div className="grid grid-cols-2 gap-2 mb-4">
            <div className="bg-white/5 rounded p-2 border border-white/5">
                <p className="text-[8px] text-slate-500 uppercase tracking-widest mb-1">Gross Yield</p>
                <p className="text-sm font-bold text-gold-400">{property.yield}%</p>
            </div>
            <div className={`rounded p-2 border flex flex-col justify-center ${getLiquidityColor(property.liquidity)}`}>
                <p className="text-[8px] uppercase tracking-widest mb-1 opacity-80">Liquidité (Exit)</p>
                <p className="text-sm font-bold flex items-center gap-1">
                    {property.liquidity === 'High' ? '⚡ Rapide' : property.liquidity === 'Medium' ? 'Moyenne' : 'Lente'}
                </p>
            </div>
        </div>

        {/* Catalysts - Future Growth Tags */}
        {property.catalysts && property.catalysts.length > 0 && (
            <div className="mb-4">
                <p className="text-[8px] text-slate-500 uppercase tracking-widest mb-1">Catalyseurs 2026</p>
                <div className="flex flex-wrap gap-1">
                    {property.catalysts.map((cat, i) => (
                        <span key={i} className="text-[8px] px-2 py-1 rounded bg-blue-500/10 text-blue-300 border border-blue-500/20 flex items-center gap-1">
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
                className={`flex-1 py-3 text-[9px] font-black uppercase tracking-widest rounded-sm transition-all ${
                isSelected 
                    ? 'bg-gold-500 text-midnight-950 border border-gold-500 cursor-default shadow-glow' 
                    : 'bg-white/5 text-white hover:bg-white/10 border border-white/10'
                }`}
            >
                {isSelected ? 'Analysé' : 'Simuler'}
            </button>
            
            <button 
                onClick={() => onContact(property)}
                className="flex-1 py-3 bg-transparent border border-gold-500/30 text-gold-400 text-[9px] font-black uppercase tracking-widest rounded-sm hover:bg-gold-500/10 transition-colors"
            >
                Dossier
            </button>
            </div>
        </div>
      </div>
    </div>
  );
};

export default PropertyCard;
