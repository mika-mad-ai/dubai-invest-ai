import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { CostDataPoint } from '../../types';

interface CostBreakdownChartProps {
  data: CostDataPoint[];
}

const CostBreakdownChart: React.FC<CostBreakdownChartProps> = ({ data }) => {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('fr-FR', { 
      style: 'currency', 
      currency: 'EUR',
      maximumFractionDigits: 0
    }).format(value);
  };

  const total = data.reduce((acc, curr) => acc + curr.value, 0);

  return (
    <div className="glass-panel p-6 rounded-2xl h-full flex flex-col border border-white/5">
      <div className="flex justify-between items-start mb-4">
        <h3 className="text-lg font-serif text-white">Structure des Coûts</h3>
        <span className="text-[10px] font-bold text-gold-400 bg-gold-500/10 px-2 py-1 rounded border border-gold-500/20">
            Total: {formatCurrency(total)}
        </span>
      </div>

      <div className="flex-1 min-h-[160px] relative">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={50}
              outerRadius={70}
              paddingAngle={4}
              dataKey="value"
              stroke="none"
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.fill} />
              ))}
            </Pie>
            <Tooltip 
                formatter={(value: number) => formatCurrency(value)} 
                contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '4px', color: '#fff' }}
            />
          </PieChart>
        </ResponsiveContainer>
        
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none">
            <span className="text-[10px] text-slate-500 uppercase tracking-widest">Invest.</span>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {data.map((item, index) => (
            <div key={index} className="flex justify-between items-center text-xs">
                <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: item.fill }}></span>
                    <span className="text-slate-300 font-medium">{item.name}</span>
                </div>
                <span className="font-bold text-white font-mono">{formatCurrency(item.value)}</span>
            </div>
        ))}
      </div>
    </div>
  );
};

export default CostBreakdownChart;