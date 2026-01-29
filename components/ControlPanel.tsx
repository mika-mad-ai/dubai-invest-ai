import React from 'react';
import { SimulationParams } from '../types';
import { SettingsIcon, EuroIcon, PercentIcon, TrendingUpIcon, BuildingIcon, ShieldIcon } from './Icons';

interface ControlPanelProps {
  params: SimulationParams;
  onChange: (newParams: SimulationParams) => void;
}

const ControlPanel: React.FC<ControlPanelProps> = ({ params, onChange }) => {
  const handleChange = (key: keyof SimulationParams, value: any) => {
    onChange({ ...params, [key]: value });
  };

  return (
    <div className="glass-panel rounded-2xl p-6 border border-white/5">
      <div className="flex items-center gap-3 mb-6 pb-4 border-b border-white/5">
        <SettingsIcon className="w-5 h-5 text-gold-400" />
        <h3 className="font-serif text-xl text-white">Paramètres de Simulation</h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        
        {/* COL 1: Stratégie & Risque */}
        <div className="space-y-6">
            {/* Strategy Selector */}
            <div className="space-y-3">
            <label className="text-xs font-bold text-gold-400 uppercase tracking-widest flex items-center gap-2">
                <BuildingIcon className="w-3 h-3" /> Stratégie
            </label>
            <div className="flex p-1 bg-midnight-950 rounded-lg border border-white/10">
                <button
                onClick={() => handleChange('strategy', 'long_term')}
                className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider rounded-md transition-all ${
                    params.strategy === 'long_term' 
                    ? 'bg-white/10 text-white shadow-sm border border-white/10' 
                    : 'text-slate-500 hover:text-slate-300'
                }`}
                >
                Annuel
                </button>
                <button
                onClick={() => handleChange('strategy', 'short_term')}
                className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider rounded-md transition-all ${
                    params.strategy === 'short_term' 
                    ? 'bg-gold-500/20 text-gold-400 shadow-sm border border-gold-500/20' 
                    : 'text-slate-500 hover:text-slate-300'
                }`}
                >
                Airbnb
                </button>
            </div>
            </div>

            {/* Risk / Volatility */}
            <div className="space-y-3">
            <div className="flex justify-between items-center">
                <label className="text-sm font-medium text-slate-300 flex items-center gap-2">
                <ShieldIcon className="w-4 h-4 text-slate-500" /> Volatilité
                </label>
                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-sm ${
                    params.riskTolerance > 3 ? 'bg-red-500/20 text-red-400' : 
                    params.riskTolerance < 2 ? 'bg-green-500/20 text-green-400' : 'bg-blue-500/20 text-blue-400'
                }`}>
                {params.riskTolerance === 1 ? 'Faible' : params.riskTolerance === 5 ? 'Élevée' : 'Moyenne'}
                </span>
            </div>
            <input 
                type="range" min="1" max="5" step="1" 
                value={params.riskTolerance} 
                onChange={(e) => handleChange('riskTolerance', parseFloat(e.target.value))}
                className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-slate-400"
            />
            </div>
        </div>

        {/* COL 2: Rendement & Plus-value */}
        <div className="space-y-6">
            {/* Rental Yield */}
            <div className="space-y-3">
            <div className="flex justify-between items-center">
                <label className="text-sm font-medium text-slate-300 flex items-center gap-2">
                <PercentIcon className="w-4 h-4 text-slate-500" /> Rendement Brut
                </label>
                <span className="text-sm font-bold text-gold-400 font-mono">
                {params.rentalYield}%
                </span>
            </div>
            <input 
                type="range" min="3" max="15" step="0.5" 
                value={params.rentalYield} 
                onChange={(e) => handleChange('rentalYield', parseFloat(e.target.value))}
                className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-gold-500"
            />
            </div>

            {/* Appreciation */}
            <div className="space-y-3">
            <div className="flex justify-between items-center">
                <label className="text-sm font-medium text-slate-300 flex items-center gap-2">
                <TrendingUpIcon className="w-4 h-4 text-slate-500" /> Plus-value / an
                </label>
                <span className="text-sm font-bold text-blue-400 font-mono">{params.appreciation}%</span>
            </div>
            <input 
                type="range" min="0" max="15" step="0.5" 
                value={params.appreciation} 
                onChange={(e) => handleChange('appreciation', parseFloat(e.target.value))}
                className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-blue-500"
            />
            </div>
        </div>

        {/* COL 3: Taux & Durée */}
        <div className="space-y-6">
            {/* Exchange Rate */}
            <div className="space-y-3">
            <div className="flex justify-between items-center">
                <label className="text-sm font-medium text-slate-300 flex items-center gap-2">
                <EuroIcon className="w-4 h-4 text-slate-500" /> EUR/AED
                </label>
                <span className="text-sm font-bold text-white font-mono">{params.exchangeRate.toFixed(2)}</span>
            </div>
            <input 
                type="range" min="3.50" max="4.50" step="0.01" 
                value={params.exchangeRate} 
                onChange={(e) => handleChange('exchangeRate', parseFloat(e.target.value))}
                className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-slate-400"
            />
            </div>

            {/* Duration */}
            <div className="space-y-3">
            <div className="flex justify-between items-center">
                <label className="text-sm font-medium text-slate-300">Durée Simulation</label>
                <span className="text-sm font-bold text-white font-serif">{params.duration} Ans</span>
            </div>
            <input 
                type="range" min="5" max="30" step="1" 
                value={params.duration} 
                onChange={(e) => handleChange('duration', parseFloat(e.target.value))}
                className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-white"
            />
            </div>
        </div>

      </div>
    </div>
  );
};

export default ControlPanel;