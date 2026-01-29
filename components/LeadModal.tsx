import React, { useState } from 'react';
import { Property } from '../types';
import { XIcon, CheckIcon } from './Icons';

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
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm transition-opacity" onClick={handleClose}></div>

      {/* Modal Content */}
      <div className="relative bg-midnight-900 border border-white/10 rounded-lg shadow-2xl max-w-md w-full overflow-hidden animate-fadeIn">
        
        {/* Close Button */}
        <button onClick={handleClose} className="absolute top-4 right-4 p-2 bg-black/20 text-white hover:bg-white/10 rounded-full transition-colors z-20">
          <XIcon className="w-4 h-4" />
        </button>

        {/* Header Image */}
        <div className="h-40 relative">
             <div className="absolute inset-0 bg-gradient-to-t from-midnight-900 to-transparent z-10"></div>
             <img src={property.image} alt={property.title} className="w-full h-full object-cover opacity-80" />
             <div className="absolute bottom-6 left-6 right-6 z-20 text-white">
                <p className="text-[10px] font-bold text-gold-400 uppercase tracking-widest mb-1">Dossier Privé</p>
                <h3 className="text-2xl font-serif">{property.title}</h3>
             </div>
        </div>

        <div className="p-8">
          {step === 'form' ? (
            <form onSubmit={handleSubmit} className="space-y-5">
              <p className="text-slate-400 text-sm leading-relaxed">
                Accédez aux plans détaillés, à l'étude de rentabilité complète et à la brochure officielle de <strong className="text-white">{property.title}</strong>.
              </p>
              
              <div className="space-y-4">
                <div>
                  <input 
                    type="text" required 
                    value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})}
                    className="w-full p-3 bg-white/5 border border-white/10 rounded-sm text-white focus:border-gold-500 outline-none text-sm placeholder-slate-600 transition-colors"
                    placeholder="NOM COMPLET"
                  />
                </div>
                
                <div>
                  <input 
                    type="email" required 
                    value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})}
                    className="w-full p-3 bg-white/5 border border-white/10 rounded-sm text-white focus:border-gold-500 outline-none text-sm placeholder-slate-600 transition-colors"
                    placeholder="EMAIL PROFESSIONNEL"
                  />
                </div>

                <div>
                  <input 
                    type="tel" required 
                    value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})}
                    className="w-full p-3 bg-white/5 border border-white/10 rounded-sm text-white focus:border-gold-500 outline-none text-sm placeholder-slate-600 transition-colors"
                    placeholder="TÉLÉPHONE / WHATSAPP"
                  />
                </div>
              </div>

              <button type="submit" className="w-full py-4 bg-gold-500 text-midnight-950 text-xs font-bold uppercase tracking-widest rounded-sm hover:bg-gold-400 transition-colors shadow-glow mt-4">
                Obtenir le Dossier
              </button>
            </form>
          ) : (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-gold-500/10 rounded-full flex items-center justify-center mx-auto mb-6 text-gold-400 border border-gold-500/20">
                <CheckIcon className="w-8 h-8" />
              </div>
              <h3 className="text-2xl font-serif text-white mb-2">Demande Confirmée</h3>
              <p className="text-slate-400 text-sm max-w-xs mx-auto mb-8">
                Un conseiller expert vous contactera sous peu avec les documents confidentiels.
              </p>
              <button onClick={handleClose} className="py-3 px-8 border border-white/20 text-white rounded-sm text-xs font-bold uppercase tracking-widest hover:bg-white/5 transition-colors">
                Retour
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default LeadModal;