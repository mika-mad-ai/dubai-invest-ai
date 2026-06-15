import React, { useState, useEffect } from 'react';
import { RobotAvatarIcon } from './Icons';
import { useI18n, LOCALES, LOCALE_LABELS, LOCALE_FLAGS, LOCALE_NAMES } from '../i18n';

interface SmartNavbarProps {
  message: string;
  isStreaming?: boolean;
  hasProfile: boolean;
  onReset: () => void;
  exchangeRate: number;
}

const SmartNavbar: React.FC<SmartNavbarProps> = ({ message, isStreaming, hasProfile, onReset, exchangeRate }) => {
  const { t, locale, setLocale } = useI18n();
  const [isScrolled, setIsScrolled] = useState(false);
  const [lineAngle, setLineAngle] = useState(0);
  const [langOpen, setLangOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    let id: number;
    const animate = () => {
      setLineAngle(a => (a + 0.4) % 360);
      id = requestAnimationFrame(animate);
    };
    id = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(id);
  }, []);

  const scrolled = hasProfile || isScrolled;

  return (
    <nav
      className="fixed top-0 left-0 w-full z-50 transition-all duration-500"
      style={{
        background: scrolled
          ? 'rgba(5,5,5,0.92)'
          : 'linear-gradient(to bottom, rgba(5,5,5,0.20) 0%, transparent 100%)',
        backdropFilter: scrolled ? 'blur(24px)' : 'blur(0px)',
        WebkitBackdropFilter: scrolled ? 'blur(24px)' : 'blur(0px)',
        borderBottom: scrolled ? '1px solid rgba(212,175,55,0.14)' : '1px solid transparent',
        boxShadow: scrolled ? '0 4px 40px rgba(0,0,0,0.5)' : 'none',
        padding: scrolled ? '4px 0' : '10px 0',
      }}
    >
      {/* Animated top line */}
      <div
        className="absolute top-0 left-0 right-0 h-px"
        style={{
          background: scrolled
            ? `linear-gradient(${lineAngle}deg, transparent 0%, #D4AF37 30%, #f0c060 50%, #00F2FF 70%, transparent 100%)`
            : 'none',
          transition: 'opacity 0.3s',
        }}
      />

      <div className="max-w-[1600px] mx-auto px-6 md:px-10 flex items-center justify-between gap-4">

        {/* LOGO */}
        <div className="flex items-center shrink-0">
          <img
            src="/NewLogoDubAInvestV2.png"
            alt="DubaiInvest"
            className={`w-auto object-contain logo-holo transition-all duration-500 ${scrolled ? 'h-12 md:h-16' : 'h-14 md:h-28'}`}
          />
        </div>

        {/* CENTER: AI BUBBLE */}
        <div
          className={`flex-1 flex items-center justify-center max-w-2xl mx-auto transition-all duration-700 ${
            hasProfile ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4 pointer-events-none'
          }`}
        >
          <div className="w-12 h-12 mr-4 shrink-0" style={{ filter: 'drop-shadow(0 0 10px rgba(212,168,67,0.55))' }}>
            <RobotAvatarIcon
              className="w-full h-full"
              isSpeaking={isStreaming}
            />
          </div>

          <div className="relative flex-1 hidden md:block">
            <div
              className="rounded-2xl px-4 py-3 relative transition-all duration-300"
              style={{
                background: 'rgba(10,10,18,0.80)',
                border: isStreaming ? '1px solid rgba(212,175,55,0.55)' : '1px solid rgba(212,175,55,0.18)',
                boxShadow: isStreaming ? '0 0 20px rgba(212,175,55,0.18)' : 'none',
                backdropFilter: 'blur(16px)',
              }}
            >
              {/* Bubble tail */}
              <div
                className="absolute top-1/2 -translate-y-1/2 -left-[7px] w-3.5 h-3.5 rotate-45"
                style={{
                  background: 'rgba(10,10,18,0.80)',
                  borderLeft: '1px solid rgba(212,175,55,0.18)',
                  borderBottom: '1px solid rgba(212,175,55,0.18)',
                }}
              />
              <p className="text-xs leading-relaxed line-clamp-2" style={{ color: 'rgba(232,228,220,0.85)', fontFamily: '"Manrope", sans-serif' }}>
                {message}
                {isStreaming && (
                  <span
                    className="inline-block w-1 h-3 ml-1 align-middle"
                    style={{ background: '#d4a843', animation: 'pulse 1s ease-in-out infinite' }}
                  />
                )}
              </p>
            </div>
          </div>
        </div>

        {/* RIGHT: LANG SWITCHER + EXCHANGE RATE + RESET */}
        <div className="shrink-0 flex items-center gap-3 md:gap-5">

          {/* Language switcher — always visible */}
          <div className="relative">
            <button
              onClick={() => setLangOpen(o => !o)}
              aria-label="Language"
              className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest transition-colors"
              style={{
                color: '#D4AF37',
                border: '1px solid rgba(212,168,67,0.30)',
                borderRadius: '10px',
                padding: '9px 16px',
                background: 'rgba(5,5,5,0.55)',
                cursor: 'pointer',
              }}
            >
              <span style={{ fontSize: '1.35rem', lineHeight: 1 }}>{LOCALE_FLAGS[locale]}</span>
              <span>{LOCALE_LABELS[locale]}</span>
              <span style={{ fontSize: '0.7rem', opacity: 0.6, transform: langOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▾</span>
            </button>
            {langOpen && (
              <div
                className="absolute mt-2 py-1.5 rounded-xl z-50"
                style={{
                  insetInlineEnd: 0,
                  background: 'rgba(8,8,12,0.97)',
                  border: '1px solid rgba(212,175,55,0.25)',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
                  minWidth: '190px',
                  backdropFilter: 'blur(18px)',
                }}
              >
                {LOCALES.map(l => (
                  <button
                    key={l}
                    onClick={() => { setLocale(l); setLangOpen(false); }}
                    className="w-full flex items-center gap-3 text-start px-4 py-2.5 text-sm transition-colors"
                    style={{
                      color: l === locale ? '#D4AF37' : 'rgba(240,235,224,0.80)',
                      background: l === locale ? 'rgba(212,175,55,0.10)' : 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      fontWeight: l === locale ? 700 : 500,
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(212,175,55,0.08)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = l === locale ? 'rgba(212,175,55,0.10)' : 'transparent'; }}
                  >
                    <span style={{ fontSize: '1.4rem', lineHeight: 1 }}>{LOCALE_FLAGS[l]}</span>
                    <span>{LOCALE_NAMES[l]}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div
            className={`flex items-center gap-5 transition-all duration-500 ${
              hasProfile ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}
          >
          <div className="hidden lg:flex flex-col items-end" style={{ borderInlineEnd: '1px solid rgba(212,175,55,0.15)', paddingInlineEnd: '20px' }}>
            <span className="text-[9px] font-semibold uppercase tracking-widest" style={{ color: 'rgba(212,175,55,0.60)' }}>
              {t.nav.exchangeRate}
            </span>
            <span className="text-xs font-mono mt-0.5" style={{ color: '#D4AF37' }}>
              1 EUR = {exchangeRate.toFixed(2)} AED
            </span>
          </div>

          <button
            onClick={onReset}
            className="text-[10px] font-semibold uppercase tracking-widest transition-all duration-300"
            style={{
              color: 'rgba(232,228,220,0.7)',
              border: '1px solid rgba(212,168,67,0.25)',
              borderRadius: '8px',
              padding: '8px 18px',
              background: 'transparent',
            }}
            onMouseEnter={e => {
              const el = e.currentTarget;
              el.style.color = '#d4a843';
              el.style.borderColor = 'rgba(212,168,67,0.7)';
              el.style.boxShadow = '0 0 16px rgba(212,168,67,0.2)';
              el.style.background = 'rgba(212,168,67,0.06)';
            }}
            onMouseLeave={e => {
              const el = e.currentTarget;
              el.style.color = 'rgba(232,228,220,0.7)';
              el.style.borderColor = 'rgba(212,168,67,0.25)';
              el.style.boxShadow = 'none';
              el.style.background = 'transparent';
            }}
          >
            {t.nav.newBtn}
          </button>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default SmartNavbar;
