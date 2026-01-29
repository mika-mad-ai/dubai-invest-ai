
import React, { useState } from 'react';
import { UserProfile, PropertyStatus } from '../types';
import { ArrowRightIcon, BuildingIcon, ShieldIcon, TrendingUpIcon } from './Icons';

interface ProfileFormProps {
  onSubmit: (profile: UserProfile) => void;
  isLoading: boolean;
}

const ProfileForm: React.FC<ProfileFormProps> = ({ onSubmit, isLoading }) => {
  const [profile, setProfile] = useState<UserProfile>({
    name: '',
    email: '',
    totalBudget: '400000',
    initialInvestment: '150000',
    monthlyContribution: '1200',
    duration: '10',
    propertyStatus: 'ready',
    riskLevel: 3,
    roiDelay: '0'
  });

  const handleChange = (field: keyof UserProfile, value: any) => {
    setProfile(prev => ({ ...prev, [field]: value }));
  };
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(profile);
  };

  const formatEuro = (val: string) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(parseInt(val));

  const getSliderBackground = (val: number, min: number, max: number, color: string) => {
    const percentage = ((val - min) / (max - min)) * 100;
    return {
      background: `linear-gradient(to right, ${color} ${percentage}%, rgba(255,255,255,0.1) ${percentage}%)`
    };
  };

  const getRiskLabel = (level: number) => {
    switch(level) {
      case 1: return "Capital Garanti";
      case 2: return "Prudent";
      case 3: return "Équilibré";
      case 4: return "Dynamique";
      case 5: return "Spéculatif (Off-plan)";
      default: return "Intermédiaire";
    }
  };

  return (
    <div className="w-full glass-panel rounded-[1.8rem] overflow-hidden shadow-2xl border border-white/10 relative">
      <div className="absolute inset-x-8 top-4 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent"></div>
      <div className="absolute -left-10 top-10 w-40 h-40 bg-aqua-500/5 blur-3xl rounded-full pointer-events-none"></div>
      <div className="absolute -right-8 bottom-10 w-32 h-32 bg-gold-400/10 blur-3xl rounded-full pointer-events-none"></div>
      <div className="bg-gradient-to-r from-white/5 via-white/0 to-white/5 p-8 border-b border-white/5 relative">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.32em] text-aqua-100">Brief Investisseur</p>
            <h2 className="text-3xl font-serif text-white mt-2">Configuration de l'Audit</h2>
            <p className="text-slate-400 text-[11px] mt-2">Curseurs dynamiques pour calibrer votre capacité d'investissement.</p>
          </div>
          <div className="hidden md:flex flex-col items-end text-right">
            <span className="text-[10px] uppercase tracking-[0.24em] text-slate-500 font-bold">Mode</span>
            <span className="text-white font-semibold text-lg">Ready / Off-plan</span>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="p-8 space-y-10 max-h-[75vh] overflow-y-auto scrollbar-thin scrollbar-thumb-gold-500/20">
        
        {/* Identité */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="group">
            <label className="block text-[10px] font-bold text-gold-400 uppercase tracking-widest mb-2">Investisseur</label>
            <input type="text" required className="w-full p-4 bg-midnight-950/50 border border-white/10 rounded-xl text-white focus:border-gold-500 outline-none transition-all" placeholder="Nom complet" value={profile.name} onChange={(e) => handleChange('name', e.target.value)} />
          </div>
          <div className="group">
            <label className="block text-[10px] font-bold text-gold-400 uppercase tracking-widest mb-2">Email</label>
            <input type="email" required className="w-full p-4 bg-midnight-950/50 border border-white/10 rounded-xl text-white focus:border-gold-500 outline-none transition-all" placeholder="votre@email.com" value={profile.email} onChange={(e) => handleChange('email', e.target.value)} />
          </div>
        </div>

        <div className="h-px bg-white/5 w-full"></div>

        {/* Stratégie Ready / Off-plan */}
        <div className="space-y-4">
          <label className="text-[10px] font-bold text-slate-300 uppercase tracking-widest block">Type de Livraison Visée</label>
          <div className="grid grid-cols-2 gap-4">
            <button 
              type="button"
              onClick={() => { handleChange('propertyStatus', 'ready'); handleChange('roiDelay', '0'); }}
              className={`p-4 rounded-2xl border-2 transition-all flex flex-col items-center gap-2 ${profile.propertyStatus === 'ready' ? 'border-gold-500 bg-gold-500/10' : 'border-white/5 bg-white/5 opacity-50'}`}
            >
              <BuildingIcon className={`w-6 h-6 ${profile.propertyStatus === 'ready' ? 'text-gold-400' : 'text-slate-500'}`} />
              <span className="text-xs font-bold uppercase tracking-widest">Ready (Livré)</span>
            </button>
            <button 
              type="button"
              onClick={() => { handleChange('propertyStatus', 'off-plan'); handleChange('roiDelay', '24'); }}
              className={`p-4 rounded-2xl border-2 transition-all flex flex-col items-center gap-2 ${profile.propertyStatus === 'off-plan' ? 'border-gold-500 bg-gold-500/10' : 'border-white/5 bg-white/5 opacity-50'}`}
            >
              <TrendingUpIcon className={`w-6 h-6 ${profile.propertyStatus === 'off-plan' ? 'text-gold-400' : 'text-slate-500'}`} />
              <span className="text-xs font-bold uppercase tracking-widest">Off-plan (Vefa)</span>
            </button>
          </div>
        </div>

        {/* Niveau de Risque */}
        <div className="space-y-4">
          <div className="flex justify-between items-end">
            <label className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">Aversion au Risque</label>
            <span className={`text-xs font-black uppercase tracking-widest ${profile.riskLevel > 3 ? 'text-orange-400' : 'text-emerald-400'}`}>
              {getRiskLabel(profile.riskLevel)}
            </span>
          </div>
          <input 
            type="range" min="1" max="5" step="1"
            className="modern-slider"
            style={getSliderBackground(profile.riskLevel, 1, 5, profile.riskLevel > 3 ? '#fb923c' : '#10b981')}
            value={profile.riskLevel}
            onChange={(e) => handleChange('riskLevel', parseInt(e.target.value))}
          />
        </div>

        {/* Délais ROI */}
        <div className="space-y-4">
          <div className="flex justify-between items-end">
            <label className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">Délai avant perception des loyers</label>
            <span className="text-gold-400 font-serif text-xl font-bold">{profile.roiDelay} Mois</span>
          </div>
          <input 
            type="range" min="0" max="60" step="3"
            className="modern-slider slider-gold"
            style={getSliderBackground(parseInt(profile.roiDelay), 0, 60, '#D4AF37')}
            value={profile.roiDelay}
            onChange={(e) => handleChange('roiDelay', e.target.value)}
          />
          <div className="flex justify-between text-[9px] text-slate-500 font-bold uppercase">
             <span>Immédiat</span>
             <span>+5 Ans (Off-plan long)</span>
          </div>
        </div>

        {/* Budgets */}
        <div className="space-y-8 pt-4">
          <div className="space-y-4">
            <div className="flex justify-between items-end">
              <label className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">Budget Global Cible</label>
              <span className="text-gold-400 font-serif text-xl font-bold">{formatEuro(profile.totalBudget)}</span>
            </div>
            <input 
              type="range" min="150000" max="10000000" step="25000"
              className="modern-slider slider-gold"
              style={getSliderBackground(parseInt(profile.totalBudget), 150000, 10000000, '#D4AF37')}
              value={profile.totalBudget}
              onChange={(e) => handleChange('totalBudget', e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
            <div className="space-y-4">
              <div className="flex justify-between items-end">
                <label className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">Apport Initial</label>
                <span className="text-blue-400 font-serif text-lg font-bold">{formatEuro(profile.initialInvestment)}</span>
              </div>
              <input 
                type="range" min="50000" max={profile.totalBudget} step="5000"
                className="modern-slider slider-blue"
                style={getSliderBackground(parseInt(profile.initialInvestment), 50000, parseInt(profile.totalBudget), '#3b82f6')}
                value={profile.initialInvestment}
                onChange={(e) => handleChange('initialInvestment', e.target.value)}
              />
            </div>

            <div className="space-y-4">
              <div className="flex justify-between items-end">
                <label className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">Épargne Mensuelle</label>
                <span className="text-emerald-400 font-serif text-lg font-bold">{formatEuro(profile.monthlyContribution)}</span>
              </div>
              <input 
                type="range" min="0" max="25000" step="100"
                className="modern-slider slider-emerald"
                style={getSliderBackground(parseInt(profile.monthlyContribution), 0, 25000, '#10b981')}
                value={profile.monthlyContribution}
                onChange={(e) => handleChange('monthlyContribution', e.target.value)}
              />
            </div>
          </div>
        </div>

        <button 
          type="submit" 
          disabled={isLoading || !profile.name || !profile.email}
          className="w-full py-6 bg-gold-gradient text-midnight-950 text-xs tracking-[0.4em] uppercase font-black hover:shadow-[0_0_40px_rgba(212,175,55,0.4)] disabled:opacity-50 transition-all rounded-2xl active:scale-[0.98] flex items-center justify-center gap-4"
        >
          {isLoading ? 'Modélisation du Risque...' : 'Lancer l\'Expertise Stratégique'} <ArrowRightIcon className="w-5 h-5" />
        </button>
      </form>
    </div>
  );
};

export default ProfileForm;
