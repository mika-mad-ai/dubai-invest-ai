import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine, CartesianGrid, LabelList } from 'recharts';
import { CashflowDataPoint } from '../../types';

interface CashflowChartProps {
  data: CashflowDataPoint[];
}

const CashflowChart: React.FC<CashflowChartProps> = ({ data }) => {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('fr-FR', { 
      style: 'currency', 
      currency: 'EUR',
      maximumFractionDigits: 0
    }).format(Math.abs(value));
  };

  return (
    <div className="glass-panel p-6 rounded-2xl h-full flex flex-col border border-white/5">
      <div className="mb-6 flex justify-between items-start">
        <div>
          <h3 className="text-lg font-serif text-white">Flux de Trésorerie</h3>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
            <span className="text-green-400">Entrées</span> vs <span className="text-red-400">Sorties</span> • Moyenne estimée
          </p>
        </div>
        <div className="bg-gold-400/10 border border-gold-400/20 px-2 py-1 rounded text-[10px] font-bold text-gold-400 uppercase tracking-widest">
          Période: Mensuelle
        </div>
      </div>

      <div className="flex-1 min-h-[250px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart 
            data={data} 
            layout="vertical" 
            margin={{ top: 25, right: 60, left: 0, bottom: 5 }}
            stackOffset="sign"
          >
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(255,255,255,0.05)" />
            <XAxis type="number" hide />
            <YAxis 
              dataKey="name" 
              type="category" 
              width={0} 
              tick={false} 
              interval={0} 
            />
            <Tooltip 
              cursor={{fill: 'rgba(255,255,255,0.05)'}}
              formatter={(value: number) => formatCurrency(value)}
              contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '4px', color: '#fff' }}
            />
            <ReferenceLine x={0} stroke="#475569" />
            
            <Bar dataKey="value" barSize={12} radius={[2, 2, 2, 2]}>
              {data.map((entry, index) => (
                <Cell 
                  key={`cell-${index}`} 
                  fill={entry.value >= 0 ? '#10b981' : '#f43f5e'} 
                  fillOpacity={0.9}
                />
              ))}

              <LabelList 
                dataKey="name" 
                position="top"
                content={(props: any) => {
                    const { x, y, value } = props;
                    return (
                        <text 
                            x={0} 
                            y={y - 8} 
                            fill="#94a3b8" 
                            fontSize={10} 
                            fontWeight="bold"
                            textAnchor="start"
                            fontFamily="Plus Jakarta Sans"
                        >
                            {value.toUpperCase()}
                        </text>
                    );
                }}
              />

              <LabelList 
                dataKey="value" 
                position="right"
                content={(props: any) => {
                    const { x, y, width, height, value } = props;
                    const isPositive = value >= 0;
                    
                    const offset = 8;
                    const labelX = isPositive ? x + width + offset : x - offset;
                    const anchor = isPositive ? 'start' : 'end';
                    
                    return (
                        <text 
                            x={labelX} 
                            y={y + height / 2 + 3} 
                            fill={isPositive ? '#4ade80' : '#fb7185'} 
                            fontSize={10} 
                            fontWeight="bold"
                            textAnchor={anchor}
                            fontFamily="monospace"
                        >
                            {formatCurrency(value)}
                        </text>
                    );
                }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default CashflowChart;