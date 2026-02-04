import React, { useState } from 'react';
import { Property } from '../types';
import { XIcon, CheckIcon, BuildingIcon, ShieldIcon } from './Icons';

interface LeadModalProps {
  isOpen: boolean;
  onClose: () => void;
  property: Property | null;
}

const LeadModal: React.FC<LeadModalProps> = ({ isOpen, onClose, property }) => {
  const [step, setStep] = useState<'form' | 'success'>('form');
  const [formData, setFormData] = useState({ name: '', email: '', phone: '' });

  if (!isOpen || !property) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Simulation d'envoi
    setTimeout(() => {
      setStep('success');
    }, 1000);
  };

  const handleClose = () => {
    setStep('form');
    setFormData({ name: '', email: '', phone: '' });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop flou et sombre */}
      <div 
        className="absolute inset-0 bg-midnight-950/80 backdrop-blur-sm transition-opacity animate-fadeIn" 
        onClick={handleClose}
      ></div>

      {/* Modal Content */}
      <div className="relative bg-midnight-900 border border-gold-500/30 rounded-2xl shadow-[0_0_50px_rgba(212,175,55,0.2)] max-w-md w-full overflow-hidden animate-fade-up">
        
        {/* Close Button */}
        <button onClick={handleClose} className="absolute top-4 right-4 p-2 bg-black/40 text-white hover:bg-white/10 rounded-full transition-colors z-30 border border-white/10">
          <XIcon className="w-4 h-4" />
        </button>

        {/* Header Image avec Gradient Gold */}
        <div className="h-48 relative group">
             <div className="absolute inset-0 bg-gradient-to-t from-midnight-900 via-midnight-900/40 to-transparent z-10"></div>
             <img src={property.image} alt={property.title} className="w-full h-full object-cover opacity-90 transition-transform duration-1000 group-hover:scale-105" />
             
             {/* Badge Info */}
             <div className="absolute bottom-6 left-6 right-6 z-20">
                <div className="flex items-center gap-2 mb-2">
                    <span className="bg-gold-500 text-midnight-950 text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-widest">
                        Opportunité Off-Market
                    </span>
                    {property.yield > 7 && (
                        <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-widest">
                            Haut Rendement
                        </span>
                    )}
                </div>
                <h3 className="text-2xl font-serif text-white leading-tight">{property.title}</h3>
                <p className="text-slate-300 text-xs flex items-center gap-1 mt-1">
                    <BuildingIcon className="w-3 h-3 text-gold-400" /> {property.location}
                </p>
             </div>
        </div>

        <div className="p-8">
          {step === 'form' ? (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                  <p className="text-white font-serif text-lg">Accès au Dossier Investisseur</p>
                  <p className="text-slate-400 text-xs leading-relaxed">
                    Recevez instantanément par email :
                    <span className="block mt-2 text-slate-300">
                        • 📄 La brochure officielle & Plans<br/>
                        • 📊 L'étude de rentabilité détaillée (Excel)<br/>
                        • 💎 Les disponibilités actuelles
                    </span>
                  </p>
              </div>
              
              <div className="space-y-4">
                <div className="group">
                  <input 
                    type="text" required 
                    value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})}
                    className="w-full p-4 bg-midnight-950/50 border border-white/10 rounded-xl text-white focus:border-gold-500 outline-none text-xs placeholder-slate-600 transition-all group-hover:border-white/20"
                    placeholder="VOTRE NOM"
                  />
                </div>
                
                <div className="group">
                  <input 
                    type="email" required 
                    value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})}
                    className="w-full p-4 bg-midnight-950/50 border border-white/10 rounded-xl text-white focus:border-gold-500 outline-none text-xs placeholder-slate-600 transition-all group-hover:border-white/20"
                    placeholder="EMAIL PROFESSIONNEL"
                  />
                </div>

                <div className="group">
                  <input 
                    type="tel" required 
                    value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})}
                    className="w-full p-4 bg-midnight-950/50 border border-white/10 rounded-xl text-white focus:border-gold-500 outline-none text-xs placeholder-slate-600 transition-all group-hover:border-white/20"
                    placeholder="TÉLÉPHONE (WHATSAPP)"
                  />
                </div>
              </div>

              <button type="submit" className="w-full py-4 bg-gold-gradient text-midnight-950 text-xs font-black uppercase tracking-[0.2em] rounded-xl hover:shadow-[0_0_30px_rgba(212,175,55,0.4)] transition-all transform active:scale-[0.98] flex items-center justify-center gap-2">
                 <ShieldIcon className="w-4 h-4" /> Débloquer l'accès
              </button>

              <p className="text-[9px] text-slate-600 text-center uppercase tracking-widest">
                Données confidentielles & Sécurisées
              </p>
            </form>
          ) : (
            <div className="text-center py-8 animate-fade-in">
              <div className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-6 text-emerald-400 border border-emerald-500/20 shadow-[0_0_30px_rgba(16,185,129,0.2)]">
                <CheckIcon className="w-10 h-10" />
              </div>
              <h3 className="text-2xl font-serif text-white mb-2">Accès Validé</h3>
              <p className="text-slate-400 text-sm max-w-xs mx-auto mb-8 leading-relaxed">
                Le dossier complet pour <span className="text-gold-400 font-bold">{property.title}</span> a été envoyé à <strong>{formData.email}</strong>.
              </p>
              <button onClick={handleClose} className="py-3 px-8 border border-white/20 text-white rounded-lg text-xs font-bold uppercase tracking-widest hover:bg-white/5 transition-colors">
                Fermer
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default LeadModal;