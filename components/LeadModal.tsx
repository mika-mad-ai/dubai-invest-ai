import React, { useState } from 'react';
import { Property, UserProfile } from '../types';
import { XIcon, CheckIcon, BuildingIcon } from './Icons';
import { sendLeadToSheet } from '../services/googleSheets';
import { gtm } from '../services/gtm';

interface LeadModalProps {
  isOpen: boolean;
  onClose: () => void;
  property: Property | null;
  userProfile?: UserProfile | null;
}

const PhoneIcon: React.FC<{ className?: string; style?: React.CSSProperties }> = ({ className, style }) => (
  <svg className={className} style={style} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 7V5z" />
  </svg>
);

const LeadModal: React.FC<LeadModalProps> = ({ isOpen, onClose, property, userProfile }) => {
  const [step, setStep] = useState<'form' | 'success'>('form');
  const [phone, setPhone] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen || !property) return null;

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    gtm.leadFormSubmit({ title: property!.title, price: property!.price });

    await sendLeadToSheet({
      // Identité
      name:                userProfile?.name               ?? '',
      email:               userProfile?.email              ?? '',
      phone,
      // Étapes 1-5
      objective:           userProfile?.objective          ?? '',
      totalBudget:         userProfile?.totalBudget        ?? '',
      investmentHorizon:   userProfile?.investmentHorizon  ?? '',
      riskLevel:           userProfile?.riskLevel          ?? 0,
      zonePreference:      userProfile?.zonePreference     ?? '',
      // Formulaire final
      initialInvestment:   userProfile?.initialInvestment  ?? '',
      monthlyContribution: userProfile?.monthlyContribution ?? '',
      duration:            userProfile?.duration            ?? '',
      propertyStatus:      userProfile?.propertyStatus      ?? '',
      roiDelay:            userProfile?.roiDelay            ?? '',
      // Bien sélectionné
      propertyTitle:       property.title,
      propertyUrl:         property.sourceUrl ?? '',
      propertyYield:       property.yield,
      propertyLocation:    property.location,
      propertyPrice:       property.price,
    });

    setIsSubmitting(false);
    gtm.leadSuccess({ title: property!.title, price: property!.price });
    setStep('success');
  };

  const handleClose = () => {
    setStep('form');
    setPhone('');
    setIsSubmitting(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 backdrop-blur-sm transition-opacity animate-fadeIn"
        style={{ background: 'rgba(5,5,8,0.85)' }}
        onClick={handleClose}
      />

      {/* Modal */}
      <div
        className="relative max-w-md w-full overflow-hidden animate-fade-up"
        style={{
          background: 'rgba(13,12,24,0.97)',
          border: '1px solid rgba(212,175,55,0.28)',
          borderRadius: '20px',
          boxShadow: '0 0 60px rgba(212,175,55,0.12), 0 0 120px rgba(0,0,0,0.6)',
        }}
      >
        {/* Close */}
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 p-2 rounded-full transition-colors z-30"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)', color: 'rgba(255,255,255,0.7)' }}
        >
          <XIcon className="w-4 h-4" />
        </button>

        {/* Property image header */}
        <div className="h-44 relative group overflow-hidden">
          <div
            className="absolute inset-0 z-10"
            style={{ background: 'linear-gradient(to top, rgba(13,12,24,1) 0%, rgba(13,12,24,0.5) 50%, transparent 100%)' }}
          />
          <img
            src={property.image}
            alt={property.title}
            className="w-full h-full object-cover opacity-80 transition-transform duration-1000 group-hover:scale-105"
          />
          <div className="absolute bottom-4 left-5 right-10 z-20">
            <h3 className="text-lg font-serif text-white leading-tight mb-0.5">{property.title}</h3>
            <p className="text-xs flex items-center gap-1" style={{ color: 'rgba(212,175,55,0.75)' }}>
              <BuildingIcon className="w-3 h-3" /> {property.location}
              <span className="ml-2 text-emerald-400 font-bold">{property.yield}% rendement</span>
            </p>
          </div>
        </div>

        <div className="px-7 pb-8 pt-4">
          {step === 'form' ? (
            <form onSubmit={handleSubmit} className="space-y-5">

              {/* Header */}
              <div className="text-center pb-1">
                <div
                  className="w-12 h-12 mx-auto mb-3 rounded-full flex items-center justify-center"
                  style={{ background: 'rgba(212,175,55,0.10)', border: '1px solid rgba(212,175,55,0.30)' }}
                >
                  <PhoneIcon className="w-6 h-6" style={{ color: '#D4AF37' }} />
                </div>
                <p className="text-white font-serif text-xl">Être rappelé par un conseiller</p>
                <p className="text-xs mt-1" style={{ color: 'rgba(180,175,165,0.70)' }}>
                  Un expert DubaiInvest vous contacte sous{' '}
                  <span style={{ color: '#D4AF37' }}>24h</span> pour répondre à toutes vos questions sur ce bien.
                </p>
              </div>

              {/* Phone — only field */}
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-widest mb-1.5" style={{ color: 'rgba(212,175,55,0.75)' }}>
                  Votre numéro WhatsApp *
                </label>
                <div className="relative">
                  <PhoneIcon
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4"
                    style={{ color: '#D4AF37' }}
                  />
                  <input
                    type="tel"
                    required
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    placeholder="+33 6 xx xx xx xx"
                    className="w-full pl-10 pr-4 py-3.5 rounded-xl text-white text-sm outline-none transition-all"
                    style={{ background: 'rgba(212,175,55,0.06)', border: '1px solid rgba(212,175,55,0.35)' }}
                    onFocus={e => { e.currentTarget.style.border = '1px solid rgba(212,175,55,0.75)'; e.currentTarget.style.boxShadow = '0 0 16px rgba(212,175,55,0.12)'; }}
                    onBlur={e => { e.currentTarget.style.border = '1px solid rgba(212,175,55,0.35)'; e.currentTarget.style.boxShadow = 'none'; }}
                  />
                </div>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-4 rounded-xl text-xs font-black uppercase tracking-[0.2em] transition-all transform active:scale-[0.98] flex items-center justify-center gap-2"
                style={{
                  background: 'linear-gradient(135deg, #fef3c7 0%, #f0c040 50%, #b8891e 100%)',
                  color: '#0d0c18',
                  opacity: isSubmitting ? 0.7 : 1,
                  boxShadow: '0 0 24px rgba(212,175,55,0.30)',
                }}
              >
                {isSubmitting ? (
                  <>
                    <span className="w-4 h-4 border-2 border-black/30 border-t-black/80 rounded-full animate-spin" />
                    Envoi en cours…
                  </>
                ) : (
                  <>
                    <PhoneIcon className="w-4 h-4" />
                    Je souhaite être rappelé
                  </>
                )}
              </button>

              <p className="text-[9px] text-center uppercase tracking-widest" style={{ color: 'rgba(180,175,165,0.35)' }}>
                Sans engagement · Données confidentielles · Réponse sous 24h
              </p>
            </form>
          ) : (
            <div className="text-center py-6 animate-fade-in">
              <div
                className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-5"
                style={{
                  background: 'rgba(16,185,129,0.10)',
                  border: '1px solid rgba(16,185,129,0.25)',
                  boxShadow: '0 0 30px rgba(16,185,129,0.15)',
                  color: '#10b981',
                }}
              >
                <CheckIcon className="w-10 h-10" />
              </div>
              <h3 className="text-2xl font-serif text-white mb-2">Demande enregistrée</h3>
              <p className="text-sm leading-relaxed mb-1" style={{ color: 'rgba(180,175,165,0.75)' }}>
                Un conseiller DubaiInvest vous contactera
              </p>
              <p className="text-sm font-bold mb-1" style={{ color: '#D4AF37' }}>
                sous 24h au {phone || 'votre numéro'}
              </p>
              <div
                className="mt-5 mx-auto rounded-xl p-4 text-xs text-left"
                style={{ background: 'rgba(212,175,55,0.06)', border: '1px solid rgba(212,175,55,0.18)', color: 'rgba(180,175,165,0.70)' }}
              >
                <p className="font-semibold text-white mb-1 text-xs">{property.title}</p>
                <p>Rendement estimé : <span style={{ color: '#D4AF37' }}>{property.yield}%</span> · {property.location}</p>
              </div>
              <button
                onClick={handleClose}
                className="mt-6 py-3 px-8 rounded-lg text-xs font-bold uppercase tracking-widest transition-colors"
                style={{ border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.7)', background: 'transparent' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
              >
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
