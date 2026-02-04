import React from 'react';
import { Property, SimulationParams } from '../types';
import { TrendingUpIcon, EuroIcon, PercentIcon, BuildingIcon } from './Icons';

interface StrategyComparisonProps {
  property?: Property;
  params: SimulationParams;
  totalBudget?: number;
}

const StrategyComparison: React.FC<StrategyComparisonProps> = ({ property, params, totalBudget }) => {
  
  const formatCurrency = (val: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(val);

  // Utiliser les données de la propriété OU les paramètres globaux (Market Simulation)
  const price = property ? property.price : (totalBudget || 400000);
  const grossYield = property ? property.yield : params.rentalYield;
  const scSqft = property?.serviceChargesSqft ?? params.serviceChargesSqft ?? 0;
  // Estimation de la surface si pas de propriété : Prix / 5000€ le m2 (moyenne)
  const sqm = property ? property.sqm : (price / 5000); 

  // --- CALCULS ---
  
  // 1. STRATÉGIE "RENT" (HOLD 5 ANS)
  // Revenu Net Annuel (Net-Net) = (Prix * Yield) - Charges
  const grossRentYear = price * (grossYield / 100);
  // Conversion grossière AED vers EUR pour les charges (divisé par taux de change)
  const serviceChargesYear = (sqm * 10.764) * scSqft * (1 / params.exchangeRate); 
  const netRentYear = grossRentYear - serviceChargesYear;
  
  const totalRent5Years = netRentYear * 5;
  const valueAtYear5 = price * Math.pow(1 + (params.appreciation / 100), 5);
  const totalGainHold = (valueAtYear5 - price) + totalRent5Years;
  const roiHold = (totalGainHold / price) * 100;

  // 2. STRATÉGIE "FLIP" (SELL 2 ANS)
  // Gain = Plus-value 2 ans - Frais Achat (DLD 4%) - Frais Revente (2%)
  const valueAtYear2 = price * Math.pow(1 + (params.appreciation / 100), 2);
  const buyingCosts = price * 0.04; // DLD Fee
  const sellingCosts = valueAtYear2 * 0.02; // Agency Fee
  const totalGainFlip = (valueAtYear2 - price) - buyingCosts - sellingCosts;
  const roiFlip = (totalGainFlip / price) * 100;

  // Net-Net Yield Calculation (Cash-on-Cash)
  const netNetYield = (netRentYear / price) * 100;

  return (
    <div className="glass-panel p-6 rounded-2xl h-full flex flex-col border border-white/5 relative overflow-hidden">
        {/* Background Hint */}
        {!property && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-5">
                <span className="text-6xl font-black uppercase transform -rotate-12">Simulation</span>
            </div>
        )}

        <div className="mb-6 flex justify-between items-start z-10">
            <div>
                <h3 className="text-lg font-serif text-white flex items-center gap-2">
                    {property ? 'Rent vs Flip' : 'Rent vs Flip (Marché)'}
                    {!property && <span className="text-[9px] bg-white/10 px-2 py-0.5 rounded text-slate-300 uppercase tracking-widest">Estimé</span>}
                </h3>
                <p className="text-[10px] text-slate-500 uppercase tracking-widest">Arbitrage Stratégique</p>
            </div>
            <div className="text-right">
                <p className="text-[10px] text-slate-500 uppercase tracking-widest">Net-Net Yield</p>
                <div className="flex items-baseline justify-end gap-2">
                    <p className="text-xl font-bold text-emerald-400 font-mono">{netNetYield.toFixed(2)}%</p>
                    <p className="text-[10px] line-through text-slate-600 decoration-red-500 decoration-2">{grossYield}%</p>
                </div>
                <p className="text-[9px] text-red-400/80">Charges: -{formatCurrency(serviceChargesYear)}/an</p>
            </div>
        </div>

        <div className="flex-1 grid grid-cols-2 gap-4 z-10">
            
            {/* HOLD CARD */}
            <div className="bg-white/5 rounded-xl p-4 border border-white/5 relative overflow-hidden group hover:border-gold-500/30 transition-colors">
                <div className="absolute top-0 left-0 w-full h-1 bg-gold-500"></div>
                <div className="flex justify-between items-center mb-4">
                    <span className="text-[10px] font-bold text-gold-400 uppercase tracking-widest">Hold (5 Ans)</span>
                    <TrendingUpIcon className="w-4 h-4 text-gold-500 opacity-50" />
                </div>
                
                <div className="space-y-3">
                    <div>
                        <p className="text-[10px] text-slate-500">Cashflow Net Cumulé</p>
                        <p className="text-sm font-mono text-white">{formatCurrency(totalRent5Years)}</p>
                    </div>
                    <div>
                        <p className="text-[10px] text-slate-500">Valeur Projetée (An 5)</p>
                        <p className="text-sm font-mono text-white">{formatCurrency(valueAtYear5)}</p>
                    </div>
                    <div className="pt-3 border-t border-white/10">
                        <p className="text-[10px] text-slate-400 uppercase">Total Gain</p>
                        <p className="text-xl font-bold text-gold-400">{formatCurrency(totalGainHold)}</p>
                        <p className="text-[10px] text-green-400">ROI: +{roiHold.toFixed(0)}%</p>
                    </div>
                </div>
            </div>

            {/* FLIP CARD */}
            <div className="bg-white/5 rounded-xl p-4 border border-white/5 relative overflow-hidden group hover:border-blue-500/30 transition-colors">
                 <div className="absolute top-0 left-0 w-full h-1 bg-blue-500"></div>
                 <div className="flex justify-between items-center mb-4">
                    <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">Flip (2 Ans)</span>
                    <EuroIcon className="w-4 h-4 text-blue-500 opacity-50" />
                </div>

                <div className="space-y-3">
                    <div>
                        <p className="text-[10px] text-slate-500">Valeur Revente (An 2)</p>
                        <p className="text-sm font-mono text-white">{formatCurrency(valueAtYear2)}</p>
                    </div>
                    <div>
                        <p className="text-[10px] text-slate-500">Frais (Achat + Revente)</p>
                        <p className="text-sm font-mono text-red-400">-{formatCurrency(buyingCosts + sellingCosts)}</p>
                    </div>
                    <div className="pt-3 border-t border-white/10">
                        <p className="text-[10px] text-slate-400 uppercase">Net Profit</p>
                        <p className="text-xl font-bold text-blue-400">{formatCurrency(totalGainFlip)}</p>
                        <p className={`text-[10px] ${roiFlip > 0 ? 'text-green-400' : 'text-red-400'}`}>ROI: {roiFlip > 0 ? '+' : ''}{roiFlip.toFixed(0)}%</p>
                    </div>
                </div>
            </div>

        </div>
    </div>
  );
};

export default StrategyComparison;
