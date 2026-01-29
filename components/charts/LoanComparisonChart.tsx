
import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList, Legend } from 'recharts';

interface LoanComparisonProps {
  loanAmount: number;
  duration: number;
  rates: {
    france: number; // e.g. 3.5
    dubai: number;  // e.g. 5.5
  };
  propertyPrice: number;
}

const LoanComparisonChart: React.FC<LoanComparisonProps> = ({ loanAmount, duration, rates, propertyPrice }) => {
  // PMT Formula: P * r * (1 + r)^n / ((1 + r)^n - 1)
  const calculateMetrics = (principal: number, annualRate: number, years: number) => {
    const r = annualRate / 100 / 12;
    const n = years * 12;
    
    // Safety check for 0 rate
    if (r === 0) return { monthly: principal / n, totalInterest: 0 };

    const monthlyPayment = (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
    
    // Safety check for no loan
    if (principal <= 0) return { monthly: 0, totalInterest: 0 };

    const totalCost = (monthlyPayment * n) - principal;
    return {
      monthly: monthlyPayment,
      totalInterest: totalCost
    };
  };

  const franceMetrics = calculateMetrics(loanAmount, rates.france, duration);
  const dubaiMetrics = calculateMetrics(loanAmount, rates.dubai, duration);

  const data = [
    { 
      name: 'France', 
      rate: rates.france,
      interest: Math.round(franceMetrics.totalInterest),
      monthly: Math.round(franceMetrics.monthly),
      fill: '#3b82f6' // Blue
    },
    { 
      name: 'Dubaï', 
      rate: rates.dubai,
      interest: Math.round(dubaiMetrics.totalInterest),
      monthly: Math.round(dubaiMetrics.monthly),
      fill: '#D4AF37' // Gold
    }
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
        <h3 className="text-lg font-serif text-white">Coût du Financement</h3>
        <p className="text-[10px] text-slate-500 uppercase tracking-widest">
          Comparatif Coût Total du Crédit ({duration} ans)
        </p>
      </div>

      <div className="flex-1 min-h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 20, right: 20, left: 20, bottom: 0 }} barSize={60}>
             <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 12, fontWeight: 600, fill: '#94a3b8'}} dy={10} />
             <Tooltip 
                cursor={{fill: 'transparent'}}
                content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                    const d = payload[0].payload;
                    return (
                        <div className="bg-midnight-950 border border-white/10 p-3 rounded shadow-xl">
                            <p className="text-white font-serif mb-2">{d.name} (Taux {d.rate}%)</p>
                            <div className="space-y-1 text-xs">
                                <p className="text-slate-300">Coût Crédit: <span className="text-white font-bold">{formatCurrency(d.interest)}</span></p>
                                <p className="text-slate-300">Mensualité: <span className="text-white font-bold">{formatCurrency(d.monthly)}</span></p>
                            </div>
                        </div>
                    );
                    }
                    return null;
                }}
             />
             <Bar dataKey="interest" radius={[4, 4, 0, 0]}>
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.fill} />
                ))}
                <LabelList 
                    dataKey="interest" 
                    position="top" 
                    formatter={(val: number) => formatCurrency(val)}
                    style={{ fill: '#e2e8f0', fontSize: '11px', fontWeight: 'bold' }}
                />
             </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 border-t border-white/5 pt-4">
         <div className="text-center">
            <p className="text-[10px] text-slate-500 uppercase">Taux France</p>
            <p className="text-lg text-blue-400 font-mono font-bold">{rates.france}%</p>
         </div>
         <div className="text-center">
            <p className="text-[10px] text-slate-500 uppercase">Taux Dubaï</p>
            <p className="text-lg text-gold-400 font-mono font-bold">{rates.dubai}%</p>
         </div>
      </div>
    </div>
  );
};

export default LoanComparisonChart;
