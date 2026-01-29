import React from 'react';
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, Cell, LabelList } from 'recharts';

interface TaxComparisonProps {
  franceTax: number;
  dubaiTax: number;
  duration: number;
}

const TaxComparisonChart: React.FC<TaxComparisonProps> = ({ franceTax, dubaiTax, duration }) => {
  const data = [
    { name: 'France', value: franceTax, fill: '#f43f5e' }, 
    { name: 'Dubaï', value: dubaiTax, fill: '#10b981' },   
  ];

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('fr-FR', { 
      style: 'currency', 
      currency: 'EUR',
      maximumFractionDigits: 0
    }).format(value);
  };

  return (
    <div className="glass-panel p-6 rounded-2xl h-full flex flex-col border border-white/5">
      <div className="mb-4">
        <h3 className="text-lg font-serif text-white">Impact Fiscal ({duration} ans)</h3>
        <p className="text-[10px] text-slate-500 uppercase tracking-widest">Comparatif des taxes sur revenus</p>
      </div>
      
      <div className="flex-1 min-h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 20, right: 20, left: 20, bottom: 0 }}>
             <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 12, fontWeight: 600, fill: '#94a3b8'}} dy={10} />
             <Tooltip 
                cursor={{fill: 'transparent'}}
                formatter={(value: number) => [formatCurrency(value), 'Impôts Payés']}
                contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '4px', color: '#fff' }}
             />
             <Bar dataKey="value" barSize={50} radius={[4, 4, 0, 0]}>
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.fill} />
                ))}
                <LabelList 
                    dataKey="value" 
                    position="top" 
                    formatter={(val: number) => val === 0 ? "0% Fiscalité" : formatCurrency(val)}
                    style={{ fill: '#e2e8f0', fontSize: '11px', fontWeight: 'bold' }}
                />
             </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-4 text-center">
        {franceTax > 0 && (
            <div className="inline-block bg-green-500/10 text-green-400 text-[10px] font-bold uppercase tracking-widest px-4 py-2 rounded-sm border border-green-500/20">
                Total Économisé : {formatCurrency(franceTax - dubaiTax)}
            </div>
        )}
      </div>
    </div>
  );
};

export default TaxComparisonChart;