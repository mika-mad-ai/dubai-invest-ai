import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Sparkles, TrendingUp, Building2, BarChart3, Send, Bot } from 'lucide-react';

// ── Liquid Aurora Canvas ───────────────────────────────────────────────────────
const LiquidAuroraCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let W = (canvas.width  = window.innerWidth);
    let H = (canvas.height = window.innerHeight);

    const nappes = [
      { ox:0.14,oy:0.22,ax:0.13,ay:0.11,fx:0.00038,fy:0.00031,px:0,py:1.2,rBase:0.52,color:[212,175,55],alpha:0.20 },
      { ox:0.82,oy:0.18,ax:0.10,ay:0.09,fx:0.00029,fy:0.00041,px:2.1,py:0.5,rBase:0.44,color:[0,242,255],alpha:0.15 },
      { ox:0.50,oy:0.78,ax:0.18,ay:0.08,fx:0.00045,fy:0.00027,px:1.0,py:3.0,rBase:0.48,color:[240,192,80],alpha:0.14 },
      { ox:0.24,oy:0.58,ax:0.11,ay:0.13,fx:0.00055,fy:0.00035,px:3.5,py:1.8,rBase:0.36,color:[0,200,240],alpha:0.11 },
      { ox:0.56,oy:0.06,ax:0.09,ay:0.07,fx:0.00042,fy:0.00058,px:0.8,py:2.6,rBase:0.32,color:[255,215,80],alpha:0.16 },
      { ox:0.80,oy:0.72,ax:0.12,ay:0.10,fx:0.00033,fy:0.00048,px:4.2,py:0.3,rBase:0.38,color:[0,242,255],alpha:0.10 },
    ];

    const loop = (ts: number) => {
      ctx.clearRect(0, 0, W, H);
      const side = Math.min(W, H);
      for (const n of nappes) {
        const x = (n.ox + Math.sin(ts * n.fx + n.px) * n.ax) * W;
        const y = (n.oy + Math.cos(ts * n.fy + n.py) * n.ay) * H;
        const r = n.rBase * side * (1 + 0.06 * Math.sin(ts * 0.0005 + n.px));
        const [cr, cg, cb] = n.color;
        const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
        grad.addColorStop(0,    `rgba(${cr},${cg},${cb},${n.alpha})`);
        grad.addColorStop(0.35, `rgba(${cr},${cg},${cb},${n.alpha * 0.55})`);
        grad.addColorStop(0.70, `rgba(${cr},${cg},${cb},${n.alpha * 0.18})`);
        grad.addColorStop(1,    `rgba(${cr},${cg},${cb},0)`);
        ctx.save();
        const sx = 1 + 0.25 * Math.sin(ts * 0.00022 + n.py);
        const sy = 1 + 0.20 * Math.cos(ts * 0.00018 + n.px);
        ctx.translate(x, y); ctx.scale(sx, sy); ctx.translate(-x, -y);
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = grad; ctx.fill();
        ctx.restore();
      }
      animId = requestAnimationFrame(loop);
    };
    animId = requestAnimationFrame(loop);
    const onResize = () => { W = canvas.width = window.innerWidth; H = canvas.height = window.innerHeight; };
    window.addEventListener('resize', onResize);
    return () => { cancelAnimationFrame(animId); window.removeEventListener('resize', onResize); };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 1 }} />;
};

// ── Count-up hook ──────────────────────────────────────────────────────────────
function useCountUp(target: number, duration = 1800, active = false) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!active) return;
    let start: number | null = null;
    const step = (ts: number) => {
      if (!start) start = ts;
      const p = Math.min((ts - start) / duration, 1);
      setVal(Math.floor((1 - Math.pow(1 - p, 3)) * target));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [target, duration, active]);
  return val;
}

// ── Metric card ────────────────────────────────────────────────────────────────
const MetricCard: React.FC<{ icon: React.ReactNode; label: string; value: string; sub: string; delay: number }> = ({ icon, label, value, sub, delay }) => {
  const [hovered, setHovered] = useState(false);
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, delay, ease: 'easeOut' }}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      className="relative flex flex-col items-center gap-2 md:gap-3 px-4 md:px-6 py-4 md:py-6 rounded-2xl overflow-hidden"
      style={{
        background: hovered ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.04)',
        border: hovered ? '1px solid rgba(212,175,55,0.40)' : '1px solid rgba(255,255,255,0.07)',
        backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
        boxShadow: hovered ? '0 8px 40px rgba(212,175,55,0.18), inset 0 1px 0 rgba(255,255,255,0.06)' : '0 4px 24px rgba(0,0,0,0.35)',
        transition: 'all 0.3s ease',
      }}
    >
      <AnimatePresence>
        {hovered && (
          <motion.div
            initial={{ x: '-100%', opacity: 0 }} animate={{ x: '200%', opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.7 }}
            className="absolute inset-0 pointer-events-none"
            style={{ background: 'linear-gradient(90deg, transparent, rgba(212,175,55,0.10), rgba(0,242,255,0.06), transparent)', zIndex: 0 }}
          />
        )}
      </AnimatePresence>
      <motion.div animate={{ color: hovered ? '#00F2FF' : '#D4AF37', scale: hovered ? 1.18 : 1 }} transition={{ duration: 0.2 }} style={{ position: 'relative', zIndex: 2 }}>
        {icon}
      </motion.div>
      <div style={{ fontFamily: '"Sora",sans-serif', fontSize: 'clamp(1.3rem, 5vw, 2.2rem)', fontWeight: 700, lineHeight: 1, background: 'linear-gradient(135deg, #fef3c7 0%, #D4AF37 55%, #f0c060 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', fontVariantNumeric: 'tabular-nums', position: 'relative', zIndex: 2, isolation: 'isolate' }}>
        {value}
      </div>
      <div style={{ color: 'rgba(240,235,224,0.42)', fontSize: '0.62rem', fontFamily: '"Manrope",sans-serif', textTransform: 'uppercase', letterSpacing: '0.12em', textAlign: 'center', position: 'relative', zIndex: 2 }}>
        {label}
      </div>
      <div style={{ fontSize: '0.68rem', fontFamily: '"Manrope",sans-serif', position: 'relative', zIndex: 2, color: hovered ? 'rgba(0,242,255,0.75)' : 'rgba(212,175,55,0.50)', transition: 'color 0.2s' }}>
        {sub}
      </div>
      <div className="absolute bottom-0 left-0 right-0 h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(0,242,255,0.65), transparent)', opacity: hovered ? 1 : 0, transition: 'opacity 0.2s' }} />
    </motion.div>
  );
};

// ── AI Chat Demo ───────────────────────────────────────────────────────────────
const DEMO_MESSAGES = [
  { sender: 'ai'   as const, text: "Bonjour ! Quel est votre budget et ce que vous souhaitez en faire ?" },
  { sender: 'user' as const, text: "250 000 €, je veux toucher un loyer depuis la France chaque mois." },
  { sender: 'ai'   as const, text: "Parfait pour JVC ou JLT : 7–8 % brut, environ 1 400 €/mois nets. 0 % d'impôt à Dubaï. Je vous prépare la simulation complète ?" },
];

const HeroAIChat: React.FC<{ onCTAClick?: () => void }> = ({ onCTAClick }) => {
  const [displayed, setDisplayed] = useState<{ sender: 'ai' | 'user'; text: string }[]>([]);
  const [isTyping, setIsTyping]   = useState(false);
  const [input, setInput]         = useState('');
  const [demoIdx, setDemoIdx]     = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (demoIdx >= DEMO_MESSAGES.length) return;
    const msg = DEMO_MESSAGES[demoIdx];
    if (msg.sender === 'ai') {
      setIsTyping(true);
      const t = setTimeout(() => { setIsTyping(false); setDisplayed(p => [...p, msg]); setDemoIdx(i => i + 1); }, 1500);
      return () => clearTimeout(t);
    } else {
      const t = setTimeout(() => { setDisplayed(p => [...p, msg]); setDemoIdx(i => i + 1); }, 800);
      return () => clearTimeout(t);
    }
  }, [demoIdx]);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }); }, [displayed, isTyping]);

  return (
    <motion.div initial={{ opacity: 0, y: 32, filter: 'blur(10px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} transition={{ duration: 0.9, delay: 0.3, ease: 'easeOut' }} className="w-full max-w-xl mx-auto relative">
      <div className="absolute -inset-[1px] rounded-2xl overflow-hidden pointer-events-none" style={{ zIndex: 0 }}>
        <motion.div className="absolute w-[300%] h-[300%]" style={{ top: '-100%', left: '-100%', background: 'conic-gradient(from 0deg, transparent 0deg, rgba(212,175,55,0.80) 55deg, rgba(0,242,255,0.55) 110deg, transparent 170deg)' }} animate={{ rotate: 360 }} transition={{ duration: 5, repeat: Infinity, ease: 'linear' }} />
      </div>
      <div className="relative flex flex-col overflow-hidden rounded-2xl" style={{ background: 'rgba(5,5,5,0.88)', backdropFilter: 'blur(28px)', WebkitBackdropFilter: 'blur(28px)', border: '1px solid rgba(212,175,55,0.10)', height: 'clamp(220px, 38vh, 300px)', zIndex: 1 }}>
        <div className="absolute top-0 left-0 right-0 h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(212,175,55,0.65), rgba(0,242,255,0.40), transparent)' }} />
        <div className="flex items-center gap-2.5 px-4 py-3 shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <motion.div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0" style={{ background: 'linear-gradient(135deg, #D4AF37, #00F2FF)' }} animate={{ boxShadow: ['0 0 8px rgba(212,175,55,0.55)', '0 0 20px rgba(0,242,255,0.55)', '0 0 8px rgba(212,175,55,0.55)'] }} transition={{ duration: 2.5, repeat: Infinity }}>
            <Bot size={13} style={{ color: '#050505' }} />
          </motion.div>
          <div>
            <span style={{ color: '#D4AF37', fontFamily: '"Manrope",sans-serif', fontSize: '0.8rem', fontWeight: 700 }}>DubaiInvest AI</span>
            <span style={{ color: 'rgba(0,242,255,0.45)', fontSize: '0.62rem', fontFamily: '"Manrope",sans-serif', marginLeft: '0.4rem' }}>· Conseiller IA</span>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <motion.div className="w-1.5 h-1.5 rounded-full" style={{ background: '#00F2FF', boxShadow: '0 0 6px #00F2FF' }} animate={{ opacity: [1, 0.3, 1], scale: [1, 1.3, 1] }} transition={{ duration: 2, repeat: Infinity }} />
            <span style={{ color: 'rgba(0,242,255,0.65)', fontSize: '0.6rem', fontFamily: '"Manrope",sans-serif' }}>En ligne</span>
          </div>
        </div>
        <div ref={scrollRef} className="flex-1 px-4 py-3 overflow-y-auto space-y-3" style={{ scrollbarWidth: 'none' }}>
          <AnimatePresence>
            {displayed.map((msg, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 10, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.3 }} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className="px-3.5 py-2.5 rounded-xl max-w-[82%]" style={msg.sender === 'ai' ? { background: 'rgba(212,175,55,0.08)', border: '1px solid rgba(212,175,55,0.20)', color: 'rgba(240,235,224,0.85)', fontFamily: '"Manrope",sans-serif', fontSize: '0.79rem', lineHeight: 1.55 } : { background: 'linear-gradient(135deg, rgba(212,175,55,0.22), rgba(0,242,255,0.12))', border: '1px solid rgba(0,242,255,0.28)', color: 'rgba(240,235,224,0.88)', fontFamily: '"Manrope",sans-serif', fontSize: '0.79rem', lineHeight: 1.55 }}>
                  {msg.text}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          {isTyping && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start">
              <div className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl" style={{ background: 'rgba(0,242,255,0.06)', border: '1px solid rgba(0,242,255,0.15)' }}>
                {[0,1,2].map(d => <motion.div key={d} className="w-1.5 h-1.5 rounded-full" style={{ background: '#D4AF37' }} animate={{ y: [0,-5,0], opacity: [0.4,1,0.4] }} transition={{ duration: 0.75, repeat: Infinity, delay: d * 0.17 }} />)}
              </div>
            </motion.div>
          )}
        </div>
        <div className="flex items-center gap-2 px-3 py-2.5 shrink-0" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && onCTAClick?.()} placeholder="Ex : 300 000 €, je veux un loyer mensuel…" className="flex-1 bg-transparent outline-none min-w-0" style={{ color: 'rgba(240,235,224,0.65)', fontFamily: '"Manrope",sans-serif', fontSize: '0.77rem' }} />
          <motion.button onClick={onCTAClick} whileHover={{ scale: 1.12, boxShadow: '0 0 22px rgba(0,242,255,0.55)' }} whileTap={{ scale: 0.9 }} className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: 'linear-gradient(135deg, #D4AF37, #00F2FF)', cursor: 'pointer' }}>
            <Send size={12} style={{ color: '#050505' }} />
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
};

// ── Hero Section (Scroll Expansion) ───────────────────────────────────────────
interface HeroSectionProps {
  avgYield: number;
  avgPrice: number;
  totalTransactions: number;
  onCTAClick?: () => void;
}

const BG_IMAGE = 'https://images.unsplash.com/photo-1512453979798-5ea266f8880c?q=55&w=1280&auto=format&fit=crop';

export default function HeroSection({ avgYield, avgPrice, totalTransactions, onCTAClick }: HeroSectionProps) {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [showContent,    setShowContent]     = useState(false);
  const [isMobile,       setIsMobile]        = useState(false);
  const [metricsReady,   setMetricsReady]    = useState(false);
  const [shouldLoadVideo, setShouldLoadVideo] = useState(true);
  const [videoLoaded, setVideoLoaded] = useState(false);
  const [showBgImage, setShowBgImage] = useState(false);

  const animYield = useCountUp(Math.round(avgYield * 10), 1600, metricsReady);
  const animPrice = useCountUp(avgPrice, 2200, metricsReady);
  const animTx    = useCountUp(totalTransactions, 1900, metricsReady);

  // Trigger count-up once content is visible
  useEffect(() => {
    if (showContent) { const t = setTimeout(() => setMetricsReady(true), 400); return () => clearTimeout(t); }
  }, [showContent]);

  // Mobile detection
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);


  useEffect(() => {
    if (videoLoaded) {
      setShowBgImage(true);
      return;
    }
    const t = setTimeout(() => setShowBgImage(true), 1600);
    return () => clearTimeout(t);
  }, [videoLoaded]);

  // Native scroll drives the expansion — the hero section is taller than the
  // viewport and its inner stage is position:sticky, so wheel, keyboard,
  // touch and scrollbar all work without hijacking any event.
  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const el = sectionRef.current;
      if (!el) return;
      const dist = el.offsetHeight - window.innerHeight;
      const p = dist > 0 ? Math.min(Math.max((window.scrollY - el.offsetTop) / dist, 0), 1) : 1;
      setScrollProgress(p);
      setShowContent(p >= 0.85);
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  const skipToContent = () => {
    const el = sectionRef.current;
    if (!el) return;
    window.scrollTo({ top: el.offsetTop + el.offsetHeight - window.innerHeight, behavior: 'smooth' });
  };

  // Video dimensions
  const videoW   = 320 + scrollProgress * (isMobile ? 600 : 1220);
  const videoH   = 200 + scrollProgress * (isMobile ? 220 : 440);
  const titleShift = scrollProgress * (isMobile ? 90 : 130);

  const metrics = [
    { icon: <TrendingUp size={20} />, label: 'Rendement moyen',  value: `${(animYield / 10).toFixed(1)}%`, sub: 'vs 3.2% Europe' },
    { icon: <Building2  size={20} />, label: 'Prix moyen AED',   value: animPrice.toLocaleString('fr-FR'),  sub: '90j glissants' },
    { icon: <BarChart3  size={20} />, label: 'Transactions DLD', value: animTx.toLocaleString('fr-FR'),     sub: 'ce trimestre'  },
  ];

  return (
    // No overflow on this wrapper: it would break position:sticky below.
    // Horizontal clipping is handled by the sticky stage itself + body{overflow-x:hidden}.
    <div style={{ backgroundColor: '#050505' }}>
      {/* Taller-than-viewport section: scrolling through it drives the expansion */}
      <section ref={sectionRef} className="relative" style={{ height: '220vh' }}>
        <div className="sticky top-0 w-full h-[100dvh] overflow-hidden">

          {/* Aurora background */}
          <LiquidAuroraCanvas />

          {/* Dubai background image — fades out as video expands */}
          {showBgImage && (
            <motion.div
              className="absolute inset-0 h-full"
              style={{ zIndex: 2 }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 - scrollProgress * 1.4 }}
              transition={{ duration: 0.3 }}
            >
              <img src={BG_IMAGE} alt="" className="w-screen h-screen object-cover object-center" loading="eager" decoding="async" />
              <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, rgba(5,5,5,0.55) 0%, rgba(5,5,5,0.35) 50%, rgba(5,5,5,0.70) 100%)' }} />
            </motion.div>
          )}

          {/* ── Expansion stage ── */}
          <div className="flex flex-col items-center justify-center w-full h-full relative" style={{ zIndex: 10 }}>

            {/* Video */}
            {/* Halo glow ring — behind the video */}
            <div
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
              style={{
                width: `${videoW + 80}px`,
                height: `${videoH + 80}px`,
                maxWidth: '110vw',
                borderRadius: `${24 - scrollProgress * 22}px`,
                background: `radial-gradient(ellipse at center, rgba(212,175,55,${0.55 - scrollProgress * 0.40}) 0%, rgba(0,242,255,${0.20 - scrollProgress * 0.15}) 40%, transparent 70%)`,
                filter: 'blur(28px)',
                opacity: Math.max(0, 1 - scrollProgress * 1.2),
                zIndex: 0,
              }}
            />
            <div
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-2xl overflow-hidden"
              style={{
                width: `${videoW}px`,
                height: `${videoH}px`,
                maxWidth: '100vw',
                maxHeight: '100vh',
                boxShadow: `0 0 ${80 + scrollProgress * 40}px rgba(212,175,55,${0.45 - scrollProgress * 0.40}), 0 0 ${40 + scrollProgress * 20}px rgba(0,242,255,${0.20 - scrollProgress * 0.18})`,
                transition: 'none',
                borderRadius: `${18 - scrollProgress * 18}px`,
                zIndex: 1,
              }}
            >
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background: 'radial-gradient(ellipse at center, rgba(212,175,55,0.35) 0%, rgba(0,242,255,0.16) 40%, rgba(5,5,5,0.95) 100%)',
                  opacity: videoLoaded ? 0 : 1,
                  transition: 'opacity 320ms ease',
                  zIndex: 1,
                }}
              />
              <video
                src={shouldLoadVideo ? '/hero-video.mp4' : undefined}
                autoPlay
                muted
                loop
                playsInline
                preload="auto"
                poster={BG_IMAGE}
                onLoadedData={() => setVideoLoaded(true)}
                className="w-full h-full object-cover"
              />
              <motion.div
                className="absolute inset-0"
                style={{ background: '#050505' }}
                animate={{ opacity: 0.68 - scrollProgress * 0.68 }}
                transition={{ duration: 0.05 }}
              />
            </div>

            {/* Title — splits vertically as video expands */}
            <h1 className="relative z-10 flex flex-col items-center gap-3 px-6 text-center pointer-events-none select-none" style={{ margin: 0, fontWeight: 700 }}>
              <motion.span
                style={{
                  display: 'block',
                  fontFamily: '"Sora",sans-serif',
                  fontSize: 'clamp(2rem,5.5vw,4.5rem)',
                  fontWeight: 700,
                  lineHeight: 1.08,
                  letterSpacing: '-0.02em',
                  transform: `translateY(-${titleShift}px)`,
                  opacity: 1 - scrollProgress * 1.6,
                  background: 'linear-gradient(135deg, #D4AF37 0%, #f0c060 45%, #00F2FF 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                  filter: 'drop-shadow(0 2px 6px rgba(5,5,5,0.9)) drop-shadow(0 6px 24px rgba(5,5,5,0.7))',
                  margin: 0,
                  transition: 'none',
                }}
              >
                Trouvons le meilleur
              </motion.span>
              <motion.span
                style={{
                  display: 'block',
                  fontFamily: '"Sora",sans-serif',
                  fontStyle: 'italic',
                  fontSize: 'clamp(2rem,5.5vw,4.5rem)',
                  fontWeight: 700,
                  lineHeight: 1.08,
                  letterSpacing: '-0.02em',
                  transform: `translateY(${titleShift}px)`,
                  opacity: 1 - scrollProgress * 1.6,
                  background: 'linear-gradient(135deg, #00F2FF 0%, #D4AF37 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                  filter: 'drop-shadow(0 2px 6px rgba(5,5,5,0.9)) drop-shadow(0 6px 24px rgba(5,5,5,0.7))',
                  margin: 0,
                  transition: 'none',
                }}
              >
                investissement locatif à Dubaï
              </motion.span>
            </h1>

            {/* Scroll hint — clickable to skip the expansion */}
            <motion.button
              type="button"
              onClick={skipToContent}
              aria-label="Passer l'animation et découvrir le contenu"
              style={{ opacity: 1 - scrollProgress * 3, transform: `translateY(${titleShift * 0.4}px)`, transition: 'none', pointerEvents: scrollProgress > 0.3 ? 'none' : 'auto', background: 'transparent', border: 'none', cursor: 'pointer' }}
              className="relative z-10 flex flex-col items-center gap-2 mt-4 px-6 select-none"
            >
              <span style={{ color: 'rgba(0,242,255,0.65)', fontFamily: '"Manrope",sans-serif', fontSize: '0.68rem', letterSpacing: '0.14em', textTransform: 'uppercase', textShadow: '0 2px 8px rgba(5,5,5,0.9)' }}>
                Faites défiler pour découvrir
              </span>
              <motion.div
                animate={{ y: [0, 6, 0] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                style={{ width: 1, height: 28, background: 'linear-gradient(to bottom, rgba(0,242,255,0.7), transparent)' }}
              />
            </motion.button>
          </div>

        </div>
      </section>

      {/* ── Content revealed after the sticky stage ── */}
      <section className="relative w-full">
          <motion.div
            className="flex flex-col w-full"
            initial={{ opacity: 0 }}
            animate={{ opacity: showContent ? 1 : 0 }}
            transition={{ duration: 0.8 }}
            style={{ zIndex: 10, position: 'relative' }}
          >
            <div className="w-full max-w-4xl mx-auto px-4 md:px-6 flex flex-col items-center text-center" style={{ paddingTop: 'clamp(2rem, 6vw, 4rem)', paddingBottom: '4rem', gap: 'clamp(1.25rem, 3vw, 2rem)' }}>

              {/* Badge */}
              <motion.div initial={{ opacity: 0, scale: 0.85 }} animate={showContent ? { opacity: 1, scale: 1 } : {}} transition={{ duration: 0.5, delay: 0.1 }}>
                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full relative overflow-hidden" style={{ border: '1px solid rgba(212,175,55,0.32)', background: 'rgba(212,175,55,0.07)', backdropFilter: 'blur(12px)' }}>
                  <motion.div className="absolute inset-0 pointer-events-none" animate={{ x: ['-100%','200%'] }} transition={{ duration: 3, repeat: Infinity, repeatDelay: 2, ease: 'easeInOut' }} style={{ background: 'linear-gradient(90deg, transparent, rgba(212,175,55,0.18), rgba(0,242,255,0.10), transparent)' }} />
                  <motion.div animate={{ rotate: 360 }} transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}><Sparkles size={9} style={{ color: '#D4AF37' }} /></motion.div>
                  <span style={{ color: '#D4AF37', fontSize: '0.62rem', fontFamily: '"Manrope",sans-serif', fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', position: 'relative' }}>
                    Conseiller IA · Investisseurs français · Dubaï 2026
                  </span>
                </div>
              </motion.div>

              {/* Subtitle */}
              <motion.p initial={{ opacity: 0, y: 16 }} animate={showContent ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.6, delay: 0.2 }} style={{ color: 'rgba(240,235,224,0.55)', fontFamily: '"Manrope",sans-serif', fontSize: 'clamp(0.9rem,1.6vw,1.1rem)', maxWidth: '540px', lineHeight: 1.7 }}>
                0 % d'impôt sur les loyers · Rendements 6–9 % · Simulation en 5 questions · Analyse IA personnalisée
              </motion.p>

              {/* AI Chat */}
              <div className="w-full">
                <HeroAIChat onCTAClick={onCTAClick} />
              </div>

              {/* CTA */}
              <motion.div initial={{ opacity: 0, y: 20 }} animate={showContent ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.6, delay: 0.4 }} className="relative">
                <motion.div className="absolute inset-0 rounded-full pointer-events-none" animate={{ scale: [1,1.4,1], opacity: [0.55,0,0.55] }} transition={{ duration: 2.5, repeat: Infinity }} style={{ background: 'rgba(212,175,55,0.28)', filter: 'blur(14px)' }} />
                <motion.button
                  onClick={onCTAClick}
                  whileHover={{ scale: 1.04, boxShadow: '0 0 50px rgba(212,175,55,0.55), 0 0 100px rgba(0,242,255,0.18)' }}
                  whileTap={{ scale: 0.97 }}
                  className="relative inline-flex items-center gap-3 overflow-hidden"
                  style={{ padding: '1rem 2.4rem', borderRadius: '9999px', background: 'linear-gradient(135deg, #b8891e 0%, #D4AF37 48%, #f0c060 100%)', color: '#050505', fontFamily: '"Manrope",sans-serif', fontWeight: 800, fontSize: '0.78rem', letterSpacing: '0.10em', textTransform: 'uppercase', boxShadow: '0 0 30px rgba(212,175,55,0.42), 0 4px 24px rgba(0,0,0,0.6)', border: 'none', cursor: 'pointer' }}
                >
                  <motion.div className="absolute inset-0 pointer-events-none" animate={{ x: ['-100%','200%'] }} transition={{ duration: 2.5, repeat: Infinity, repeatDelay: 1 }} style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.30), transparent)' }} />
                  <span style={{ position: 'relative' }}>Démarrer ma simulation gratuite</span>
                  <motion.div animate={{ x: [0,4,0] }} transition={{ duration: 1.5, repeat: Infinity }} style={{ position: 'relative' }}><ArrowRight size={14} /></motion.div>
                </motion.button>
              </motion.div>

              {/* Divider */}
              <div style={{ width: 1, height: 48, background: 'linear-gradient(to bottom, rgba(212,175,55,0.50), transparent)' }} />

              {/* Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 md:gap-4 w-full">
                {metrics.map((m, i) => <MetricCard key={i} icon={m.icon} label={m.label} value={m.value} sub={m.sub} delay={0.1 + i * 0.08} />)}
              </div>
            </div>
          </motion.div>
      </section>

      {/* Bottom fade */}
      <div className="pointer-events-none" style={{ marginTop: '-80px', height: '80px', background: 'linear-gradient(to bottom, transparent, #050505)', position: 'relative', zIndex: 20 }} />
    </div>
  );
}
