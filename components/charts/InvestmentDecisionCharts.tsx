import React, { useState } from 'react';
import {
  BarChart, Bar, AreaChart, Area, ScatterChart, Scatter,
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell, Legend, ReferenceLine,
} from 'recharts';
import { UserProfile } from '../../types';

interface InvestmentDecisionChartsProps {
  profile: UserProfile;
}

// ── Data ─────────────────────────────────────────────────────────────────────

const YIELD_DATA = [
  { zone: 'JVC', grossYield: 7.8, netYield: 6.9, avgPriceSqftAED: 900 },
  { zone: 'DSO', grossYield: 7.5, netYield: 6.6, avgPriceSqftAED: 820 },
  { zone: 'JLT', grossYield: 7.2, netYield: 6.4, avgPriceSqftAED: 1100 },
  { zone: 'Business Bay', grossYield: 6.5, netYield: 5.7, avgPriceSqftAED: 1800 },
  { zone: 'Marina', grossYield: 6.2, netYield: 5.4, avgPriceSqftAED: 2200 },
  { zone: 'Downtown', grossYield: 5.8, netYield: 4.9, avgPriceSqftAED: 2800 },
  { zone: 'Dubai Hills', grossYield: 5.5, netYield: 4.7, avgPriceSqftAED: 1600 },
  { zone: 'Palm', grossYield: 4.2, netYield: 3.1, avgPriceSqftAED: 4500 },
];

const APPRECIATION_DATA = [
  { quarter: 'Q1 21', Downtown: 100, Marina: 100, Palm: 100, JVC: 100, BusinessBay: 100 },
  { quarter: 'Q3 21', Downtown: 108, Marina: 112, Palm: 118, JVC: 105, BusinessBay: 107 },
  { quarter: 'Q1 22', Downtown: 118, Marina: 124, Palm: 138, JVC: 111, BusinessBay: 116 },
  { quarter: 'Q3 22', Downtown: 129, Marina: 136, Palm: 155, JVC: 118, BusinessBay: 125 },
  { quarter: 'Q1 23', Downtown: 138, Marina: 145, Palm: 168, JVC: 124, BusinessBay: 133 },
  { quarter: 'Q3 23', Downtown: 148, Marina: 155, Palm: 181, JVC: 131, BusinessBay: 142 },
  { quarter: 'Q1 24', Downtown: 162, Marina: 166, Palm: 196, JVC: 139, BusinessBay: 153 },
  { quarter: 'Q3 24', Downtown: 174, Marina: 178, Palm: 208, JVC: 148, BusinessBay: 164 },
  { quarter: 'Q1 25', Downtown: 181, Marina: 185, Palm: 218, JVC: 155, BusinessBay: 170 },
];

const SCATTER_DATA = [
  { name: 'JVC Ready', riskScore: 2.1, totalReturn5Y: 52, type: 'ready' },
  { name: 'JLT Ready', riskScore: 2.4, totalReturn5Y: 55, type: 'ready' },
  { name: 'Business Bay', riskScore: 2.8, totalReturn5Y: 58, type: 'ready' },
  { name: 'Marina Ready', riskScore: 2.6, totalReturn5Y: 57, type: 'ready' },
  { name: 'Downtown Ready', riskScore: 3.0, totalReturn5Y: 62, type: 'ready' },
  { name: 'Dubai Hills', riskScore: 3.2, totalReturn5Y: 65, type: 'ready' },
  { name: 'Creek Harbour', riskScore: 3.8, totalReturn5Y: 72, type: 'off-plan' },
  { name: 'MBR City', riskScore: 4.0, totalReturn5Y: 75, type: 'off-plan' },
  { name: 'Palm Ready', riskScore: 3.5, totalReturn5Y: 60, type: 'ready' },
  { name: 'Dubai South', riskScore: 4.5, totalReturn5Y: 85, type: 'off-plan' },
  { name: 'RAK Off-Plan', riskScore: 4.8, totalReturn5Y: 92, type: 'off-plan' },
];

const PRICE_PER_SQFT_DATA = [
  { zone: 'JVC', priceSqft: 900, growth2024: 11.2, currency: 'AED' },
  { zone: 'DSO', priceSqft: 820, growth2024: 9.8, currency: 'AED' },
  { zone: 'JLT', priceSqft: 1100, growth2024: 12.5, currency: 'AED' },
  { zone: 'Business Bay', priceSqft: 1800, growth2024: 13.8, currency: 'AED' },
  { zone: 'Dubai Hills', priceSqft: 1600, growth2024: 15.2, currency: 'AED' },
  { zone: 'Marina', priceSqft: 2200, growth2024: 14.6, currency: 'AED' },
  { zone: 'Creek Harbour', priceSqft: 2100, growth2024: 18.4, currency: 'AED' },
  { zone: 'Downtown', priceSqft: 2800, growth2024: 18.0, currency: 'AED' },
  { zone: 'Palm', priceSqft: 4500, growth2024: 16.3, currency: 'AED' },
];

const RADAR_DATA = [
  { criterion: 'Rendement', Marina: 7.5, JVC: 9.0, Downtown: 6.5, BusinessBay: 7.8, Palm: 4.5 },
  { criterion: 'Plus-value', Marina: 7.0, JVC: 5.5, Downtown: 8.5, BusinessBay: 7.5, Palm: 7.0 },
  { criterion: 'Liquidité', Marina: 8.5, JVC: 7.0, Downtown: 8.0, BusinessBay: 8.0, Palm: 5.0 },
  { criterion: 'Stabilité', Marina: 8.0, JVC: 7.5, Downtown: 8.5, BusinessBay: 7.5, Palm: 7.0 },
  { criterion: 'Infrastructure', Marina: 9.0, JVC: 7.0, Downtown: 9.5, BusinessBay: 8.5, Palm: 9.5 },
  { criterion: 'Accessibilité', Marina: 6.0, JVC: 9.5, Downtown: 4.0, BusinessBay: 7.0, Palm: 2.0 },
];

// ── Tooltip styles ─────────────────────────────────────────────────────────────
const tooltipStyle = {
  backgroundColor: 'rgba(8,8,14,0.95)',
  border: '1px solid rgba(20,184,166,0.25)',
  borderRadius: '10px',
  color: '#e8e4dc',
  fontSize: '0.75rem',
  fontFamily: '"Manrope",sans-serif',
};

const AREA_COLORS = {
  Downtown: '#14b8a6',
  Marina: '#22d3ee',
  Palm: '#67e8f9',
  JVC: '#0e7490',
  BusinessBay: '#0891b2',
};

const CHART_H = 280;

// ── Chart panel wrapper ────────────────────────────────────────────────────────
const ChartPanel = ({ title, subtitle, badge, children }: {
  title: string; subtitle: string; badge?: string; children: React.ReactNode;
}) => (
  <div className="glass-panel p-6 rounded-2xl border border-white/5">
    <div className="mb-5 flex justify-between items-start gap-4">
      <div>
        <h3 style={{ fontFamily: '"Sora",sans-serif', fontSize: '1rem', fontWeight: 600, color: '#f0ebe0', marginBottom: '0.3rem' }}>
          {title}
        </h3>
        <p style={{ fontSize: '0.68rem', color: 'rgba(240,235,224,0.4)', fontFamily: '"Manrope",sans-serif', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          {subtitle}
        </p>
      </div>
      {badge && (
        <span className="shrink-0 text-[9px] uppercase tracking-widest px-2.5 py-1.5 rounded-lg"
          style={{ background: 'rgba(20,184,166,0.1)', border: '1px solid rgba(20,184,166,0.25)', color: '#14b8a6', fontFamily: '"Manrope",sans-serif' }}>
          {badge}
        </span>
      )}
    </div>
    <div style={{ width: '100%', height: CHART_H }}>
      {children}
    </div>
  </div>
);

// ── Tab selector ───────────────────────────────────────────────────────────────
const TABS = [
  { id: 'yield',        label: 'Rendement / m²' },
  { id: 'appreciation', label: 'Évolution des prix' },
  { id: 'risk_return',  label: 'Risque / Retour' },
  { id: 'radar',        label: 'Analyse zones' },
];

// ── Main component ─────────────────────────────────────────────────────────────
const InvestmentDecisionCharts: React.FC<InvestmentDecisionChartsProps> = ({ profile }) => {
  // Pick default tab based on objective
  const defaultTab = profile.objective === 'capital_gains' ? 'appreciation'
    : profile.objective === 'rental_income' ? 'yield'
    : profile.riskLevel >= 4 ? 'risk_return'
    : 'radar';

  const [activeTab, setActiveTab] = useState(defaultTab);

  return (
    <div className="space-y-5">
      {/* Tab bar */}
      <div className="flex items-center gap-2 flex-wrap">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="text-[10px] font-semibold uppercase tracking-widest transition-all duration-200 px-4 py-2 rounded-lg"
            style={{
              fontFamily: '"Manrope",sans-serif',
              background: activeTab === tab.id ? 'rgba(20,184,166,0.15)' : 'rgba(255,255,255,0.04)',
              border: activeTab === tab.id ? '1px solid rgba(20,184,166,0.45)' : '1px solid rgba(255,255,255,0.06)',
              color: activeTab === tab.id ? '#14b8a6' : 'rgba(240,235,224,0.45)',
              boxShadow: activeTab === tab.id ? '0 0 14px rgba(20,184,166,0.12)' : 'none',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Chart: Rendement locatif brut + prix au m² */}
      {activeTab === 'yield' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <ChartPanel
            title="Rendement locatif brut par zone"
            subtitle="Loyer annuel / prix d'achat · Dubai 2025"
            badge="KPI #1"
          >
            <ResponsiveContainer width="100%" height={CHART_H}>
              <BarChart data={YIELD_DATA} margin={{ top: 4, right: 4, left: -18, bottom: 0 }} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(255,255,255,0.05)" />
                <XAxis type="number" domain={[0, 10]} tick={{ fontSize: 10, fill: 'rgba(240,235,224,0.35)', fontFamily: '"Manrope",sans-serif' }} stroke="transparent" tickFormatter={(v: number) => `${v}%`} />
                <YAxis type="category" dataKey="zone" tick={{ fontSize: 10, fill: 'rgba(240,235,224,0.5)', fontFamily: '"Manrope",sans-serif' }} stroke="transparent" width={78} />
                <Tooltip contentStyle={tooltipStyle}
                  formatter={(v: number, name: string) => [
                    `${v.toFixed(1)} %`,
                    name === 'grossYield' ? 'Rendement brut' : 'Rendement net',
                  ]}
                />
                <Bar dataKey="grossYield" radius={[0, 6, 6, 0]} name="grossYield">
                  {YIELD_DATA.map((entry, i) => (
                    <Cell key={i} fill={entry.grossYield >= 7 ? '#14b8a6' : entry.grossYield >= 6 ? '#0891b2' : '#0e7490'} fillOpacity={0.85} />
                  ))}
                </Bar>
                <Bar dataKey="netYield" radius={[0, 6, 6, 0]} name="netYield" fill="rgba(20,184,166,0.25)" />
                <ReferenceLine x={6} stroke="rgba(20,184,166,0.4)" strokeDasharray="4 4" label={{ value: 'Seuil 6%', fill: 'rgba(20,184,166,0.6)', fontSize: 9, fontFamily: '"Manrope",sans-serif' }} />
              </BarChart>
            </ResponsiveContainer>
          </ChartPanel>

          <ChartPanel
            title="Prix moyen au m² / sqft par zone"
            subtitle="AED/sqft · données DLD 2025"
            badge="Prix réels"
          >
            <ResponsiveContainer width="100%" height={CHART_H}>
              <BarChart data={PRICE_PER_SQFT_DATA} margin={{ top: 4, right: 4, left: -18, bottom: 0 }} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(255,255,255,0.05)" />
                <XAxis type="number" tick={{ fontSize: 10, fill: 'rgba(240,235,224,0.35)', fontFamily: '"Manrope",sans-serif' }} stroke="transparent" tickFormatter={(v: number) => `${v}`} />
                <YAxis type="category" dataKey="zone" tick={{ fontSize: 10, fill: 'rgba(240,235,224,0.5)', fontFamily: '"Manrope",sans-serif' }} stroke="transparent" width={78} />
                <Tooltip contentStyle={tooltipStyle}
                  formatter={(v: number, name: string) => [
                    name === 'priceSqft' ? `${v.toLocaleString()} AED/sqft` : `+${v}%`,
                    name === 'priceSqft' ? 'Prix/sqft' : 'Croissance 2024',
                  ]}
                />
                <Bar dataKey="priceSqft" radius={[0, 6, 6, 0]} name="priceSqft">
                  {PRICE_PER_SQFT_DATA.map((entry, i) => (
                    <Cell key={i}
                      fill={entry.priceSqft >= 2800 ? '#67e8f9' : entry.priceSqft >= 1800 ? '#22d3ee' : entry.priceSqft >= 1100 ? '#14b8a6' : '#0891b2'}
                      fillOpacity={0.85}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartPanel>
        </div>
      )}

      {/* Chart: Évolution des prix — base 100 Q1 2021 */}
      {activeTab === 'appreciation' && (
        <ChartPanel
          title="Évolution du prix au m² — Base 100 (Q1 2021)"
          subtitle="Indice DLD transactions · données réelles 2021–2025"
          badge="Historique 4 ans"
        >
          <ResponsiveContainer width="100%" height={CHART_H}>
            <AreaChart data={APPRECIATION_DATA} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
              <defs>
                {Object.entries(AREA_COLORS).map(([key, color]) => (
                  <linearGradient key={key} id={`grad_${key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={color} stopOpacity={0.25} />
                    <stop offset="95%" stopColor={color} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="quarter" tick={{ fontSize: 10, fill: 'rgba(240,235,224,0.35)', fontFamily: '"Manrope",sans-serif' }} stroke="transparent" />
              <YAxis tick={{ fontSize: 10, fill: 'rgba(240,235,224,0.35)', fontFamily: '"Manrope",sans-serif' }} stroke="transparent"
                tickFormatter={(v: number) => `${v}`} domain={[90, 230]} />
              <Tooltip contentStyle={tooltipStyle}
                formatter={(v: number, name: string) => [`${v} pts`, name]}
                labelFormatter={(label: string) => `Période : ${label}`}
              />
              <Legend wrapperStyle={{ fontSize: '10px', fontFamily: '"Manrope",sans-serif', color: 'rgba(240,235,224,0.5)', paddingTop: '8px' }} />
              <ReferenceLine y={100} stroke="rgba(255,255,255,0.12)" strokeDasharray="4 4" />
              {Object.entries(AREA_COLORS).map(([key, color]) => (
                <Area key={key} type="monotone" dataKey={key} stroke={color} strokeWidth={2}
                  fill={`url(#grad_${key})`} dot={false} activeDot={{ r: 4, fill: color }} />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </ChartPanel>
      )}

      {/* Chart: Risque / Retour scatter */}
      {activeTab === 'risk_return' && (
        <ChartPanel
          title="Cartographie Risque / Rendement total (5 ans)"
          subtitle="Axe X = risque composite · Axe Y = rendement total estimé (loyer + PV) · 5 ans"
          badge="Frontière efficiente"
        >
          <ResponsiveContainer width="100%" height={CHART_H}>
            <ScatterChart margin={{ top: 12, right: 20, bottom: 12, left: -8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis type="number" dataKey="riskScore" name="Risque"
                domain={[1.5, 5.5]} tick={{ fontSize: 10, fill: 'rgba(240,235,224,0.35)', fontFamily: '"Manrope",sans-serif' }}
                stroke="rgba(255,255,255,0.08)" label={{ value: 'Score de risque →', position: 'insideBottom', offset: -4, fill: 'rgba(240,235,224,0.25)', fontSize: 9, fontFamily: '"Manrope",sans-serif' }}
              />
              <YAxis type="number" dataKey="totalReturn5Y" name="Retour 5 ans"
                domain={[40, 100]} tick={{ fontSize: 10, fill: 'rgba(240,235,224,0.35)', fontFamily: '"Manrope",sans-serif' }}
                stroke="rgba(255,255,255,0.08)" tickFormatter={(v: number) => `${v}%`}
                label={{ value: 'Retour 5 ans →', angle: -90, position: 'insideLeft', offset: 16, fill: 'rgba(240,235,224,0.25)', fontSize: 9, fontFamily: '"Manrope",sans-serif' }}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                cursor={{ strokeDasharray: '3 3', stroke: 'rgba(20,184,166,0.3)' }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0].payload;
                  return (
                    <div style={{ ...tooltipStyle, padding: '10px 14px' }}>
                      <p style={{ color: '#14b8a6', fontWeight: 700, marginBottom: 4 }}>{d.name}</p>
                      <p>Risque : <span style={{ color: '#67e8f9' }}>{d.riskScore}/5</span></p>
                      <p>Retour 5 ans : <span style={{ color: '#67e8f9' }}>+{d.totalReturn5Y} %</span></p>
                      <p>Type : <span style={{ color: d.type === 'off-plan' ? '#f97316' : '#14b8a6' }}>{d.type}</span></p>
                    </div>
                  );
                }}
              />
              <Scatter
                data={SCATTER_DATA.filter(d => d.type === 'ready')}
                name="Prêt à louer"
              >
                {SCATTER_DATA.filter(d => d.type === 'ready').map((_, i) => (
                  <Cell key={i} fill="#14b8a6" fillOpacity={0.85} />
                ))}
              </Scatter>
              <Scatter
                data={SCATTER_DATA.filter(d => d.type === 'off-plan')}
                name="Off-plan"
              >
                {SCATTER_DATA.filter(d => d.type === 'off-plan').map((_, i) => (
                  <Cell key={i} fill="#f97316" fillOpacity={0.85} />
                ))}
              </Scatter>
              <Legend
                payload={[
                  { value: 'Prêt à louer', type: 'circle', color: '#14b8a6' },
                  { value: 'Off-plan', type: 'circle', color: '#f97316' },
                ]}
                wrapperStyle={{ fontSize: '10px', fontFamily: '"Manrope",sans-serif', color: 'rgba(240,235,224,0.5)', paddingTop: '8px' }}
              />
            </ScatterChart>
          </ResponsiveContainer>
        </ChartPanel>
      )}

      {/* Chart: Radar multicritères */}
      {activeTab === 'radar' && (
        <ChartPanel
          title="Analyse multicritères des zones clés"
          subtitle="Score 1–10 sur 6 critères investisseur · adapté à votre profil"
          badge="Comparatif zones"
        >
          <ResponsiveContainer width="100%" height={CHART_H}>
            <RadarChart data={RADAR_DATA} margin={{ top: 8, right: 32, bottom: 8, left: 32 }}>
              <PolarGrid stroke="rgba(255,255,255,0.06)" />
              <PolarAngleAxis dataKey="criterion"
                tick={{ fontSize: 11, fill: 'rgba(240,235,224,0.55)', fontFamily: '"Manrope",sans-serif', fontWeight: 500 }}
              />
              <Tooltip contentStyle={tooltipStyle}
                formatter={(v: number, name: string) => [`${v}/10`, name]}
              />
              <Radar name="Marina" dataKey="Marina" stroke="#22d3ee" fill="#22d3ee" fillOpacity={0.1} strokeWidth={2} dot={{ r: 3, fill: '#22d3ee' }} />
              <Radar name="JVC" dataKey="JVC" stroke="#14b8a6" fill="#14b8a6" fillOpacity={0.1} strokeWidth={2} dot={{ r: 3, fill: '#14b8a6' }} />
              <Radar name="Downtown" dataKey="Downtown" stroke="#67e8f9" fill="#67e8f9" fillOpacity={0.08} strokeWidth={2} dot={{ r: 3, fill: '#67e8f9' }} />
              <Radar name="Business Bay" dataKey="BusinessBay" stroke="#0891b2" fill="#0891b2" fillOpacity={0.08} strokeWidth={1.5} dot={{ r: 2, fill: '#0891b2' }} />
              <Legend wrapperStyle={{ fontSize: '10px', fontFamily: '"Manrope",sans-serif', color: 'rgba(240,235,224,0.5)', paddingTop: '8px' }} />
            </RadarChart>
          </ResponsiveContainer>
        </ChartPanel>
      )}

      {/* Footer note */}
      <p style={{ fontSize: '0.65rem', color: 'rgba(240,235,224,0.25)', fontFamily: '"Manrope",sans-serif', fontStyle: 'italic' }}>
        Données basées sur les transactions DLD 2024–2025 et estimations de marché. Les rendements passés ne préjugent pas des rendements futurs. Frais d'entrée DLD 4 % + agence 2 % non inclus dans les rendements bruts.
      </p>
    </div>
  );
};

export default InvestmentDecisionCharts;
