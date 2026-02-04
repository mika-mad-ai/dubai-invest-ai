import React from 'react';
import { SimulationParams, Property } from '../types';

type Props = {
  property?: Property;
  params: SimulationParams;
  totalBudget: number;
};

const StrategyComparison: React.FC<Props> = ({ property, params, totalBudget }) => {
  if (!property) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-white/5 border border-white/10 rounded-2xl text-slate-400 text-sm">
        Sélectionnez une propriété pour comparer les stratégies.
      </div>
    );
  }

  const annualRent = property.price * (params.rentalYield / 100);
  const netLong = annualRent * 0.85; // approx after fees
  const netShort = annualRent * 1.15 * 0.75; // uplift but occupancy hit

  return (
    <div className="w-full h-full bg-white/5 border border-white/10 rounded-2xl p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
      <div>
        <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-2">Long terme</p>
        <p className="text-3xl font-serif text-white">{netLong.toFixed(0)} AED/an</p>
        <p className="text-xs text-slate-400 mt-1">Hyp. 85% après charges</p>
      </div>
      <div>
        <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-2">Court terme</p>
        <p className="text-3xl font-serif text-white">{netShort.toFixed(0)} AED/an</p>
        <p className="text-xs text-slate-400 mt-1">Majoré mais 75% d'occupation</p>
      </div>
      <div className="col-span-full text-xs text-slate-500">
        Budget dispo : {totalBudget.toLocaleString('fr-FR')} €
      </div>
    </div>
  );
};

export default StrategyComparison;
