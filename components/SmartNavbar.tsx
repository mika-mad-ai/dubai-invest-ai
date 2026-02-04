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

  // Définition dynamique des classes de fond
  // On utilise un dégradé vers le bas quand on est en haut, et un fond solide/flou dès qu'on scroll
  const navbarBgClass = (hasProfile || isScrolled)
    ? 'bg-midnight-950/95 backdrop-blur-xl border-white/5 shadow-2xl py-4'
    : 'bg-gradient-to-b from-black/90 via-black/40 to-transparent border-transparent py-6';

  return (
    <nav className={`fixed top-0 left-0 w-full z-50 transition-all duration-500 border-b ${navbarBgClass}`}>
      <div className="max-w-[1600px] mx-auto px-4 md:px-8 flex items-center justify-between gap-4">
         
         {/* LEFT: LOGO */}
         <div className="flex items-center gap-3 shrink-0">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center shadow-glow transition-all duration-500 ${hasProfile ? 'bg-gold-gradient' : 'bg-gold-400'}`}>
              <span className={`font-serif font-bold text-xl ${hasProfile ? 'text-midnight-950' : 'text-midnight-950'}`}>D</span>
            </div>
            <span className="font-serif text-xl tracking-wide text-white">
              Dubai<span className="text-gold-400 italic">Invest</span>
            </span>
         </div>

         {/* CENTER: ROBOT & BUBBLE (VISIBLE ONLY IF PROFILE CREATED) */}
         <div className={`flex-1 flex items-center justify-center max-w-3xl mx-auto transition-all duration-700 ${hasProfile ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-10 pointer-events-none'}`}>
            {/* Robot Avatar */}
            <div className="w-14 h-14 mr-4 relative shrink-0">
                <RobotAvatarIcon className="w-full h-full filter drop-shadow-[0_0_10px_rgba(212,175,55,0.5)]" isSpeaking={isStreaming} />
            </div>

            {/* Speech Bubble */}
            <div className="relative flex-1 hidden md:block">
                <div className="bg-black/60 border border-gold-500/30 rounded-2xl p-3 shadow-lg backdrop-blur-md relative">
                   {/* Tail */}
                   <div className="absolute top-1/2 -translate-y-1/2 -left-2 w-4 h-4 bg-black/60 border-l border-b border-gold-500/30 transform rotate-45"></div>
                   
                   <p className="text-xs text-slate-200 leading-relaxed font-medium line-clamp-2">
                      {message}
                      {isStreaming && <span className="inline-block w-1.5 h-3 ml-1 bg-gold-400 animate-pulse align-middle"></span>}
                   </p>
                </div>
            </div>
         </div>

         {/* RIGHT: ACTIONS */}
         <div className={`shrink-0 flex items-center gap-6 transition-all duration-500 ${hasProfile ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
            {hasProfile && (
              <>
                <div className="hidden lg:flex flex-col items-end border-r border-white/10 pr-6">
                  <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">Taux de Change</span>
                  <span className="text-gold-100/80 text-xs font-mono">1 EUR = {exchangeRate.toFixed(2)} AED</span>
                </div>
                <button 
                  onClick={onReset}
                  className="text-white hover:text-gold-400 transition-colors text-[10px] font-bold uppercase tracking-widest border border-white/10 px-4 py-2 rounded hover:bg-white/5 active:scale-95"
                >
                  Nouveau
                </button>
              </>
            )}
         </div>
      </div>
    </nav>
  );
};

export default SmartNavbar;