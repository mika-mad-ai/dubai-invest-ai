import React from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { ChartDataPoint } from '../types';

interface ProjectionsChartProps {
  data: ChartDataPoint[];
  className?: string;
}

const ProjectionsChart: React.FC<ProjectionsChartProps> = ({ data, className }) => {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR', 
      maximumSignificantDigits: 3,
      notation: "compact",
    }).format(value);
  };

  return (
    <div className={`p-8 flex flex-col ${className}`}>
      <div className="flex justify-between items-start mb-8">
        <div>
           <h3 className="text-2xl font-serif text-white mb-1">
             Projection Patrimoniale & Risques
           </h3>
           <p className="text-gold-400 text-xs uppercase tracking-widest">Analyse de volatilité comparée</p>
        </div>
      </div>
      
      <div className="flex-1 min-h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
            margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient id="colorDubaiRange" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#D4AF37" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#D4AF37" stopOpacity={0.05}/>
              </linearGradient>
              <linearGradient id="colorFranceRange" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.2}/>
                <stop offset="95%" stopColor="#94a3b8" stopOpacity={0.05}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="year" tick={{fontSize: 12, fill: '#64748b', fontFamily: 'Plus Jakarta Sans'}} stroke="transparent" dy={10} />
            <YAxis tickFormatter={formatCurrency} tick={{fontSize: 12, fill: '#64748b', fontFamily: 'Plus Jakarta Sans'}} stroke="transparent" />
            
            <Tooltip 
              formatter={(value: any, name: string) => {
                 if (Array.isArray(value)) return null; // Hide ranges in standard tooltip line
                 let label = 'Inconnu';
                 let val = value;
                 if (name === 'scenarioOptimiste') label = 'Dubaï (Médian)';
                 if (name === 'scenarioFrance') label = 'France (Médian)';
                 return [new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(val), label];
              }}
              contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '4px', color: '#fff' }}
              labelStyle={{ color: '#94a3b8', marginBottom: '0.5rem' }}
            />

            <Legend 
              verticalAlign="top" 
              height={36} 
              iconType="circle"
              formatter={(value) => {
                 if (value === 'dubaiRange') return <span className="text-xs text-gold-400 font-bold mr-4">Zone de Volatilité Dubaï</span>;
                 if (value === 'franceRange') return <span className="text-xs text-slate-500 font-bold">Zone de Risque France</span>;
                 return null;
              }}
            />

            {/* TUNNEL DE RISQUE DUBAÏ */}
            <Area 
              type="monotone" 
              dataKey="dubaiRange" 
              stroke="none" 
              fill="url(#colorDubaiRange)" 
              animationDuration={1500}
            />
            {/* LIGNE MÉDIANE DUBAÏ */}
            <Area 
              type="monotone" 
              dataKey="scenarioOptimiste" 
              stroke="#D4AF37" 
              strokeWidth={3}
              fill="transparent" 
              animationDuration={1500}
            />

            {/* TUNNEL DE RISQUE FRANCE */}
            <Area 
              type="monotone" 
              dataKey="franceRange" 
              stroke="none" 
              fill="url(#colorFranceRange)" 
              animationDuration={1500}
            />
            {/* LIGNE MÉDIANE FRANCE */}
            <Area 
              type="monotone" 
              dataKey="scenarioFrance" 
              stroke="#94a3b8" 
              strokeWidth={2}
              strokeDasharray="4 4"
              fill="transparent" 
              animationDuration={1500}
            />

          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default ProjectionsChart;