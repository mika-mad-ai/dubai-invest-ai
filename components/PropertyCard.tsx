
import React from 'react';
import { Property } from '../types';
import { MapPinIcon, BedIcon, BathIcon, ChartIcon, ArrowRightIcon, CheckIcon } from './Icons';

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

  return (
    <div className={`relative group h-full rounded-2xl overflow-hidden transition-all duration-500 ${isSelected ? 'ring-1 ring-gold-400 shadow-glow' : 'border border-white/5 hover:border-gold-500/30'}`}>
      
      {/* Selection Indicator */}
      {isSelected && (
        <div className="absolute top-4 right-4 z-20 bg-gold-500 text-midnight-950 p-1.5 rounded-full shadow-lg animate-fadeIn">
          <CheckIcon className="w-4 h-4" />
        </div>
      )}

      {/* Image Section */}
      <div className="h-[280px] overflow-hidden relative">
        <div className="absolute inset-0 bg-gradient-to-t from-midnight-950 via-midnight-950/20 to-transparent z-10" />
        <img 
          src={property.image} 
          alt={property.title} 
          className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-110"
        />
        
        {/* Type Badge */}
        <div className="absolute top-4 left-4 z-20">
          <span className="text-[10px] font-bold bg-midnight-950/80 backdrop-blur text-gold-400 px-3 py-1 rounded-sm uppercase tracking-widest border border-gold-500/20">
            {property.type}
          </span>
        </div>

        {/* Title Overlay */}
        <div className="absolute bottom-4 left-4 right-4 z-20">
          <h3 className="font-serif text-2xl text-white mb-1 leading-none drop-shadow-md">{property.title}</h3>
          <div className="flex items-center gap-1 text-slate-300 text-xs">
            <MapPinIcon className="w-3 h-3 text-gold-500" /> {property.location}
          </div>
        </div>
      </div>

      {/* Details Section */}
      <div className="p-5 bg-midnight-900/80 backdrop-blur-md h-full flex flex-col">
        <div className="flex justify-between items-center mb-6 border-b border-white/5 pb-4">
           <div className="flex gap-4 text-xs text-slate-400">
              <span className="flex items-center gap-1"><BedIcon className="w-3 h-3"/> {property.beds}</span>
              <span className="flex items-center gap-1 font-bold text-slate-200">{property.sqm} $m^2$</span>
           </div>
           <div className="text-right">
              <span className="block text-[10px] text-gold-400 font-bold uppercase tracking-wider">Rendement</span>
              <span className="text-lg font-serif text-white">{property.yield}%</span>
           </div>
        </div>

        <div className="flex justify-between items-end mb-4 flex-1">
           <div>
             <span className="text-xs text-slate-500 uppercase tracking-wider">Prix</span>
             <p className="text-xl font-serif text-white">{formatPrice(property.price)}</p>
           </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 mt-auto">
          <button 
            onClick={() => onSelect(property)}
            className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider rounded-sm transition-all flex items-center justify-center gap-2 ${
              isSelected 
                ? 'bg-gold-500/20 text-gold-400 border border-gold-500/20 cursor-default' 
                : 'bg-white/5 text-white hover:bg-white/10 border border-white/10'
            }`}
          >
            {isSelected ? 'Simulé' : 'Simuler'}
          </button>
          
          <button 
            onClick={() => onContact(property)}
            className="flex-1 py-3 bg-gold-500 text-midnight-950 text-xs font-bold uppercase tracking-wider rounded-sm hover:bg-gold-400 transition-colors shadow-lg flex items-center justify-center gap-2"
          >
            Dossier
          </button>
        </div>
      </div>
    </div>
  );
};

export default PropertyCard;
