import React from 'react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell
} from 'recharts';
import { DldWeeklyResponse } from '../../services/dldService';

interface GeopoliticalImpactChartProps {
  basePrice: number;
  dldData: DldWeeklyResponse | null;
  isLoading: boolean;
}

const FALLBACK_IMMEDIATE = [
  { period: 'S-5', weekStart: '2025-05-12', avgPrice: 4010000, salesVolume: 3890 },
  { period: 'S-4', weekStart: '2025-05-19', avgPrice: 3970000, salesVolume: 4638 },
  { period: 'S-3', weekStart: '2025-05-26', avgPrice: 3940000, salesVolume: 3276 },
  { period: 'S-2', weekStart: '2025-06-02', avgPrice: 3190000, salesVolume: 3521 },
  { period: 'S-1', weekStart: '2025-06-09', avgPrice: 3160000, salesVolume: 4682 },
  { period: 'S0', weekStart: '2025-06-16', avgPrice: 3220000, salesVolume: 4109 },
  { period: 'S+1', weekStart: '2025-06-23', avgPrice: 3280000, salesVolume: 4205 },
  { period: 'S+2', weekStart: '2025-06-30', avgPrice: 3330000, salesVolume: 4380 },
  { period: 'S+3', weekStart: '2025-07-07', avgPrice: 3390000, salesVolume: 4475 }
];

const GeopoliticalImpactChart: React.FC<GeopoliticalImpactChartProps> = ({ basePrice, dldData, isLoading }) => {
  const liveImmediate = dldData?.live && dldData.immediateData?.length ? dldData.immediateData : null;
  const hasValidLiveData = !!liveImmediate?.some(point => point.avgPrice > 0 && point.salesVolume > 0);
  const immediateRaw = hasValidLiveData ? liveImmediate! : FALLBACK_IMMEDIATE;
  const baseline = immediateRaw[0]?.avgPrice || basePrice || 1;
  const priceSeries = immediateRaw.map(point => ({
    period: point.period,
    avgPrice: point.avgPrice,
    priceIndex: (point.avgPrice / baseline) * 100
  }));
  const volumeSeries = immediateRaw.map(point => ({
    period: point.period,
    salesVolume: point.salesVolume
  }));
  const sourceLabel = hasValidLiveData ? 'LIVE DLD' : 'Fallback';

  const minPrice = Math.min(...priceSeries.map(p => p.avgPrice));
  const maxPrice = Math.max(...priceSeries.map(p => p.avgPrice));
  const minVolume = Math.min(...volumeSeries.map(p => p.salesVolume));
  const maxVolume = Math.max(...volumeSeries.map(p => p.salesVolume));

  const priceDomain: [number, number] = [
    Math.max(0, Math.floor(minPrice * 0.92)),
    Math.ceil(maxPrice * 1.08)
  ];
  const volumeDomain: [number, number] = [
    Math.max(0, Math.floor(minVolume * 0.9)),
    Math.ceil(maxVolume * 1.1)
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-400">
          Source: {dldData?.source || 'Dataset interne'}
        </p>
        <span
          className={`text-[10px] uppercase tracking-widest px-2 py-1 rounded border ${
            hasValidLiveData ? 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10' : 'text-amber-400 border-amber-500/40 bg-amber-500/10'
          }`}
        >
          {isLoading ? 'Chargement…' : sourceLabel}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="glass-panel p-6 rounded-2xl border border-white/5 h-[340px] flex flex-col">
          <div className="mb-4 flex justify-between items-start">
            <div>
              <h3 className="text-lg font-serif text-white">Evolution Hebdomadaire du Prix Moyen</h3>
              <p className="text-[10px] text-slate-500 uppercase tracking-widest">Valeur moyenne par transaction (DLD)</p>
            </div>
          </div>

          <div className="flex-1 min-h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={priceSeries} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <defs>
                  <linearGradient id="dubaiShock" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#22d3ee" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="period" tick={{ fontSize: 10, fill: '#64748b' }} stroke="transparent" />
                <YAxis
                  tick={{ fontSize: 10, fill: '#64748b' }}
                  stroke="transparent"
                  domain={priceDomain}
                  tickFormatter={(value: number) => `${(value / 1_000_000).toFixed(1)}M`}
                />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '4px', color: '#fff' }}
                  formatter={(value: number, name: string) =>
                    name === 'avgPrice'
                      ? [
                          new Intl.NumberFormat('fr-FR', {
                            style: 'currency',
                            currency: 'AED',
                            maximumFractionDigits: 0
                          }).format(value),
                          'Prix moyen'
                        ]
                      : [`${value.toFixed(1)} pts`, 'Indice base 100']
                  }
                />
                <Area type="monotone" dataKey="avgPrice" stroke="#22d3ee" strokeWidth={2} fill="url(#dubaiShock)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="glass-panel p-6 rounded-2xl border border-white/5 h-[340px] flex flex-col">
          <div className="mb-4">
            <div>
              <h3 className="text-lg font-serif text-white">Evolution Hebdomadaire du Volume de Transactions</h3>
              <p className="text-[10px] text-slate-500 uppercase tracking-widest">Nombre de ventes enregistrées (DLD)</p>
            </div>
          </div>

          <div className="flex-1 min-h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={volumeSeries} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="period" tick={{ fontSize: 10, fill: '#64748b' }} stroke="transparent" />
                <YAxis
                  tick={{ fontSize: 10, fill: '#64748b' }}
                  stroke="transparent"
                  domain={volumeDomain}
                  tickFormatter={(value: number) => `${(value / 1000).toFixed(1)}k`}
                />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '4px', color: '#fff' }}
                  formatter={(value: number) => [
                    new Intl.NumberFormat('fr-FR').format(value),
                    'Volume ventes'
                  ]}
                />
                <Bar dataKey="salesVolume" radius={[4, 4, 0, 0]}>
                  {volumeSeries.map((entry, index) => (
                    <Cell
                      key={`${entry.period}-${index}`}
                      fill={index < 2 ? '#38bdf8' : '#22c55e'}
                      fillOpacity={0.85}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <p className="text-xs text-slate-400 leading-relaxed">
        Lecture: prix moyen = valeur totale des ventes / nombre de ventes. Volume = nombre de ventes par semaine.
      </p>
    </div>
  );
};

export default GeopoliticalImpactChart;
