import React from 'react';
import { SimulationParams } from '../types';
import { EuroIcon } from './Icons';

interface FiscalitySimulatorProps {
  params: SimulationParams;
  onChange: (residence: 'FR' | 'BE' | 'CH' | 'UAE') => void;
  annualRent: number;
}

const FiscalitySimulator: React.FC<FiscalitySimulatorProps> = ({ params, onChange, annualRent }) => {
  
  const getFlag = (code: string) => {
    switch(code) {
        case 'FR': return '🇫🇷';
        case 'BE': return '🇧🇪';
        case 'CH': return '🇨🇭';
        case 'UAE': return '🇦🇪';
        default: return '🏳️';
    }
  };

  const getFiscalAnalysis = (code: string, rent: number) => {
      switch(code) {
          case 'FR':
              return {
                  title: "Convention Fiscale France-EAU",
                  tax: rent * 0.0, // 0% direct tax in Dubai
                  description: "En vertu de la convention fiscale, les revenus immobiliers sont imposables dans l'État de situation de l'immeuble (Dubaï). Comme il n'y a pas d'impôt sur le revenu à Dubaï, vous ne payez rien localement. En France, ces revenus sont pris en compte pour le taux effectif mais bénéficient d'un crédit d'impôt égal à l'impôt français.",
                  effectiveRate: "~0%"
              };
          case 'BE':
              return {
                  title: "Convention Belgique-EAU",
                  tax: rent * 0.0,
                  description: "Exonération avec réserve de progressivité. Les revenus sont exonérés en Belgique mais pris en compte pour déterminer le taux d'imposition applicable aux autres revenus.",
                  effectiveRate: "~0% (Progressivité)"
              };
          case 'CH':
              return {
                  title: "Convention Suisse-EAU",
                  tax: rent * 0.0,
                  description: "Exonération totale en Suisse pour les biens immobiliers détenus à l'étranger. La valeur du bien peut entrer dans le calcul de la fortune.",
                  effectiveRate: "0%"
              };
          case 'UAE':
              return {
                  title: "Résident EAU",
                  tax: 0,
                  description: "Aucun impôt sur le revenu, aucune taxe foncière, aucune taxe d'habitation. Le paradis fiscal absolu pour votre patrimoine.",
                  effectiveRate: "0%"
              };
          default:
              return { title: "", tax: 0, description: "", effectiveRate: "" };
      }
  };

  const taxResidence = params.taxResidence ?? 'FR';
  const analysis = getFiscalAnalysis(taxResidence, annualRent);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Selector */}
        <div className="lg:col-span-1 glass-panel p-6 rounded-2xl border border-white/5 flex flex-col justify-center">
            <h3 className="text-xl font-serif text-white mb-6">Votre Résidence Fiscale</h3>
            <div className="space-y-3">
                {['FR', 'BE', 'CH', 'UAE'].map((code) => (
                    <button
                        key={code}
                        onClick={() => onChange(code as any)}
                        className={`w-full flex items-center justify-between p-4 rounded-xl border transition-all ${
                            taxResidence === code 
                            ? 'bg-gold-500 text-midnight-950 border-gold-500 shadow-glow font-bold' 
                            : 'bg-white/5 text-slate-400 border-white/5 hover:bg-white/10'
                        }`}
                    >
                        <span className="flex items-center gap-3">
                            <span className="text-2xl">{getFlag(code)}</span>
                            <span>{code === 'UAE' ? 'Expatrié Dubaï' : code === 'CH' ? 'Suisse' : code === 'BE' ? 'Belgique' : 'France'}</span>
                        </span>
                        {taxResidence === code && <div className="w-2 h-2 bg-midnight-950 rounded-full animate-pulse"></div>}
                    </button>
                ))}
            </div>
        </div>

        {/* Analysis */}
        <div className="lg:col-span-2 glass-panel p-8 rounded-2xl border border-white/5 relative overflow-hidden flex flex-col">
            <div className="absolute top-0 right-0 p-32 bg-gold-500/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>
            
            <div className="flex justify-between items-start mb-6">
                <div>
                    <h4 className="text-2xl font-serif text-white mb-2">{analysis.title}</h4>
                    <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Cadre Légal 2024</p>
                </div>
                <div className="text-right">
                    <p className="text-[10px] text-slate-400 uppercase tracking-widest mb-1">Impact Fiscal Est.</p>
                    <p className="text-3xl font-mono font-bold text-emerald-400">{analysis.effectiveRate}</p>
                </div>
            </div>

            <p className="text-slate-300 leading-relaxed mb-8 flex-1">
                {analysis.description}
            </p>

            {/* Visual Bar Comparison */}
            <div className="mt-auto bg-midnight-950/50 rounded-xl p-6 border border-white/5">
                <p className="text-xs text-white mb-4 font-bold uppercase tracking-widest flex items-center gap-2">
                    <EuroIcon className="w-4 h-4 text-gold-400" /> Comparatif sur {new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(annualRent)} de revenus
                </p>
                
                {/* France Scenario (Worst case usually) */}
                <div className="mb-4">
                    <div className="flex justify-between text-[10px] text-slate-500 mb-1">
                        <span>Investissement en France (TMI 30% + CSG)</span>
                        <span>~47.2% Taxe</span>
                    </div>
                    <div className="w-full h-3 bg-white/10 rounded-full overflow-hidden">
                        <div className="h-full bg-red-500 w-[47%]"></div>
                    </div>
                </div>

                {/* Dubai Scenario */}
                <div>
                    <div className="flex justify-between text-[10px] text-slate-500 mb-1">
                        <span>Investissement à Dubaï (Convention)</span>
                        <span className="text-emerald-400 font-bold">0% Taxe</span>
                    </div>
                    <div className="w-full h-3 bg-white/10 rounded-full overflow-hidden flex items-center">
                        <div className="h-full bg-emerald-500 w-[1%]"></div>
                    </div>
                </div>
            </div>

        </div>
    </div>
  );
};

export default FiscalitySimulator;
