import React from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { ExchangeRateDataPoint } from '../../types';

interface ExchangeRateChartProps {
  data: ExchangeRateDataPoint[];
  currentRate: number;
}

const ExchangeRateChart: React.FC<ExchangeRateChartProps> = ({ data, currentRate }) => {
  return (
    <div className="h-full flex flex-col p-4">
      <div className="mb-2 flex justify-between items-end">
        <div>
           <h3 className="text-sm font-serif text-white">Taux EUR/AED</h3>
           <p className="text-[10px] text-slate-500 uppercase tracking-widest">Volatilité & Opportunité</p>
        </div>
        <div className="text-right">
             <span className="text-xl font-mono text-gold-400 font-bold">{currentRate.toFixed(2)}</span>
             <span className="text-[10px] text-slate-500 block">ACTUEL</span>
        </div>
      </div>
      
      <div className="flex-1 min-h-[100px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="colorRate" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.2}/>
                <stop offset="95%" stopColor="#94a3b8" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="year" tick={{fontSize: 10, fill: '#64748b'}} stroke="transparent" />
            <YAxis domain={['auto', 'auto']} tick={{fontSize: 10, fill: '#64748b'}} stroke="transparent" />
            <Tooltip 
              contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '4px', color: '#fff', fontSize: '12px' }}
              formatter={(value: number) => [`1 EUR = ${value.toFixed(2)} AED`, 'Taux']}
            />
            <ReferenceLine y={currentRate} stroke="#D4AF37" strokeDasharray="3 3" label={{ position: 'right', value: 'Spot', fill: '#D4AF37', fontSize: 10 }} />
            <Area 
              type="monotone" 
              dataKey="rate" 
              stroke="#cbd5e1" 
              strokeWidth={1}
              fillOpacity={1} 
              fill="url(#colorRate)" 
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default ExchangeRateChart;