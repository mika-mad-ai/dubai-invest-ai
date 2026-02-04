import React from 'react';
import { SimulationParams } from '../types';

type Props = {
  params: SimulationParams;
  onChange: (taxResidence: string) => void;
  annualRent: number;
};

const FiscalitySimulator: React.FC<Props> = ({ params, onChange, annualRent }) => {
  const regimes = [
    { id: 'FR', label: 'Résident France', rate: 0.45 },
    { id: 'AE', label: 'Résident UAE', rate: 0.0 },
    { id: 'OTHER', label: 'Autre UE', rate: 0.30 },
  ];

  return (
    <div className="glass-panel p-6 rounded-2xl border border-white/5 flex flex-col gap-4">
      <div className="flex gap-3">
        {regimes.map((r) => (
          <button
            key={r.id}
            onClick={() => onChange(r.id)}
            className={`flex-1 px-4 py-3 rounded-xl border text-sm font-semibold transition-all ${
              params.taxResidence === r.id
                ? 'bg-gold-500/20 border-gold-500/30 text-gold-100'
                : 'border-white/10 text-slate-300 hover:border-gold-500/30 hover:text-white'
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      <div className="bg-white/5 rounded-xl p-4 border border-white/10">
        {regimes.map((r) => {
          const tax = annualRent * r.rate;
          return (
            <div key={r.id} className="flex justify-between text-sm text-slate-200 py-1">
              <span>{r.label}</span>
              <span className="font-mono">{Math.round(tax).toLocaleString('fr-FR')} AED</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default FiscalitySimulator;
