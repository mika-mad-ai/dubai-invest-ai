
import React, { useState, useEffect } from 'react';
import { RobotAvatarIcon } from './Icons';

interface SmartNavbarProps {
  message: string;
  isStreaming?: boolean;
  hasProfile: boolean;
  onReset: () => void;
  exchangeRate: number;
}

const SmartNavbar: React.FC<SmartNavbarProps> = ({ message, isStreaming, hasProfile, onReset, exchangeRate }) => {
  const [isScrolled, setIsScrolled] = useState(false);

  // Détecter le scroll pour adapter l'opacité de la navbar
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Fond adaptatif : halo fin au scroll ou après profil
  const navbarBgClass = (hasProfile || isScrolled)
    ? 'bg-[#0b1021]/90 backdrop-blur-2xl border-white/10 shadow-[0_20px_60px_-35px_rgba(0,0,0,0.8)] py-4'
    : 'bg-gradient-to-b from-[#040814]/80 via-[#040814]/40 to-transparent border-transparent py-6';

  return (
    <nav className={`fixed top-0 left-0 w-full z-50 transition-all duration-500 border-b ${navbarBgClass}`}>
      <div className="max-w-[1600px] mx-auto px-4 md:px-8 flex items-center justify-between gap-4">
         
         {/* LEFT: LOGO */}
         <div className="flex items-center gap-3 shrink-0">
            <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shadow-glow transition-all duration-500 border border-white/10 ${hasProfile ? 'bg-gold-gradient' : 'bg-gold-400/90'}`}>
              <span className="font-serif font-bold text-xl text-midnight-950">D</span>
            </div>
            <div className="flex flex-col leading-tight">
              <span className="font-serif text-xl tracking-wide text-white">
                Dubai<span className="text-gold-400 italic">Invest</span>
              </span>
              <span className="text-[10px] uppercase tracking-[0.28em] text-aqua-100 font-black">AI Advisory</span>
            </div>
         </div>

         {/* CENTER: ROBOT & BUBBLE (VISIBLE ONLY IF PROFILE CREATED) */}
         <div className={`flex-1 flex items-center justify-center max-w-3xl mx-auto transition-all duration-700 ${hasProfile ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-10 pointer-events-none'}`}>
            {/* Robot Avatar */}
            <div className="w-14 h-14 mr-4 relative shrink-0">
                <div className="absolute inset-0 blur-lg bg-aqua-500/20 rounded-full"></div>
                <RobotAvatarIcon className="w-full h-full relative filter drop-shadow-[0_0_16px_rgba(23,180,212,0.6)]" isSpeaking={isStreaming} />
            </div>

            {/* Speech Bubble */}
            <div className="relative flex-1 hidden md:block">
                <div className="bg-[#0a0f21]/80 border border-white/10 rounded-2xl p-4 shadow-[0_15px_50px_-30px_rgba(0,0,0,0.8)] backdrop-blur-xl relative">
                   {/* Tail */}
                   <div className="absolute top-1/2 -translate-y-1/2 -left-3 w-5 h-5 bg-[#0a0f21]/80 border-l border-b border-white/10 transform rotate-45"></div>
                   
                   <p className="text-sm text-slate-200 leading-relaxed font-medium line-clamp-2">
                      {message}
                      {isStreaming && <span className="inline-block w-2 h-3 ml-2 bg-aqua-300 animate-pulse align-middle rounded-sm"></span>}
                   </p>
                </div>
            </div>
         </div>

         {/* RIGHT: ACTIONS */}
         <div className={`shrink-0 flex items-center gap-6 transition-all duration-500 ${hasProfile ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
            {hasProfile && (
              <>
                <div className="hidden lg:flex flex-col items-end border-r border-white/10 pr-6">
                  <span className="text-[9px] text-slate-500 font-bold uppercase tracking-[0.28em]">Taux de Change</span>
                  <span className="text-gold-100/80 text-xs font-mono">1 EUR = {exchangeRate.toFixed(2)} AED</span>
                </div>
                <button 
                  onClick={onReset}
                  className="text-[11px] font-bold uppercase tracking-[0.24em] px-4 py-2 rounded-xl border border-white/10 text-white bg-white/5 hover:bg-white/10 hover:border-white/20 active:scale-[0.98] transition-all"
                >
                  Nouveau dossier
                </button>
              </>
            )}
         </div>
      </div>
    </nav>
  );
};

export default SmartNavbar;
