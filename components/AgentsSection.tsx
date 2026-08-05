import React, { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { TrendingUp, Home, KeyRound, ArrowRight, Sparkles } from 'lucide-react';

/**
 * Section centrale — 3 conseillers IA immobilier (personas). Chaque carte a un
 * avatar photoréaliste (public/agents/*.png, généré par Gemini). Tant que
 * l'image n'existe pas, un fallback doré élégant s'affiche (onError).
 */

interface Agent {
  id: string;
  name: string;
  role: string;
  photo: string;
  icon: React.ReactNode;
  accent: string;
  desc: string;
  tags: string[];
  noVideo?: boolean; // pas de cinemagraph vidéo → photo « qui respire »
}

const AGENTS: Agent[] = [
  {
    id: 'locatif',
    name: 'Karim Haddad',
    role: 'Investissement locatif',
    photo: '/agents/agent-locatif.png',
    icon: <TrendingUp size={18} />,
    accent: '#D4AF37',
    desc: "Spécialiste du rendement locatif et du cashflow. Il identifie les biens au meilleur ROI selon votre budget et votre horizon.",
    tags: ['Rendement 6–9 %', 'Cashflow', 'Off-plan'],
  },
  {
    id: 'residence',
    name: 'James Bennett',
    role: 'Résidence principale',
    photo: '/agents/agent-residence.png',
    icon: <Home size={18} />,
    accent: '#f0c060',
    desc: "Votre guide pour acheter l'appartement où vous allez vivre à Dubaï : quartiers, écoles, Golden Visa et financement.",
    tags: ['Golden Visa', 'Quartiers', 'Financement'],
  },
  {
    id: 'location',
    name: 'Léa Marchand',
    role: 'Location',
    photo: '/agents/agent-location.png',
    icon: <KeyRound size={18} />,
    accent: '#00F2FF',
    desc: "Elle trouve la location idéale, courte ou longue durée, dans le bon quartier et au juste prix, selon votre style de vie.",
    tags: ['Courte durée', 'Longue durée', 'Meublé'],
  },
];

const Avatar: React.FC<{ agent: Agent }> = ({ agent }) => {
  const [failed, setFailed] = useState(false);
  const [videoOk, setVideoOk] = useState(false);
  const reduced = useReducedMotion();
  const initials = agent.name.split(' ').map(w => w[0]).join('');
  const videoSrc = agent.photo.replace(/\.png$/, '.mp4');
  const showVideo = videoOk && !reduced && !agent.noVideo;
  return (
    <div className="relative w-full overflow-hidden" style={{ aspectRatio: '3 / 4', borderTopLeftRadius: 18, borderTopRightRadius: 18, background: '#0a0a12' }}>
      {/* Couche vidéo « vivante » (cinemagraph Veo). Reste invisible tant qu'elle ne joue pas → repli photo. */}
      {!reduced && !failed && !agent.noVideo && (
        <video
          src={videoSrc}
          poster={agent.photo}
          autoPlay
          loop
          muted
          playsInline
          preload="metadata"
          onCanPlay={() => setVideoOk(true)}
          onError={() => setVideoOk(false)}
          className="absolute inset-0 w-full h-full object-cover object-top"
          style={{ opacity: showVideo ? 1 : 0, transition: 'opacity .7s ease' }}
        />
      )}
      {/* Couche photo : sert de poster + repli ; « respire » doucement quand il n'y a pas de vidéo. */}
      {!failed ? (
        <motion.img
          src={agent.photo}
          alt={`${agent.name}, conseiller ${agent.role.toLowerCase()} à Dubaï`}
          onError={() => setFailed(true)}
          loading="lazy"
          className="absolute inset-0 w-full h-full object-cover object-top"
          style={{ opacity: showVideo ? 0 : 1, transition: 'opacity .7s ease' }}
          animate={!reduced && !showVideo ? { scale: [1, 1.035, 1], y: [0, -4, 0] } : { scale: 1, y: 0 }}
          transition={{ duration: 7.5, repeat: Infinity, ease: 'easeInOut' }}
        />
      ) : (
        <div className="absolute inset-0 w-full h-full flex items-center justify-center" style={{ background: `radial-gradient(ellipse at 50% 35%, ${agent.accent}22, #0a0a12 70%)` }}>
          <span style={{ fontFamily: '"Sora",sans-serif', fontSize: '3.5rem', fontWeight: 700, color: agent.accent, opacity: 0.5 }}>{initials}</span>
        </div>
      )}
      {/* halo d'accent qui pulse doucement → renforce l'effet « vivant » */}
      {!reduced && (
        <motion.div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{ boxShadow: `inset 0 -60px 90px -40px ${agent.accent}` }}
          animate={{ opacity: [0.25, 0.55, 0.25] }}
          transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}
      {/* fondu bas vers la carte */}
      <div className="absolute inset-x-0 bottom-0 h-2/5 pointer-events-none" style={{ background: 'linear-gradient(to bottom, transparent, rgba(10,10,18,0.85) 92%)' }} />
      {/* faisceau blanc d'APPARITION : balaye une fois de gauche à droite quand la carte entre à l'écran (identique sur les 3) */}
      {!reduced && (
        <motion.div
          aria-hidden
          className="absolute inset-y-0 z-20 pointer-events-none"
          style={{ width: '26%', background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.9), transparent)', filter: 'blur(7px)', transform: 'skewX(-12deg)', mixBlendMode: 'screen' }}
          initial={{ left: '-40%', opacity: 0 }}
          whileInView={{ left: ['-40%', '120%'], opacity: [0, 1, 1, 0] }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 1.15, ease: 'easeInOut', delay: 0.25 }}
        />
      )}
      {/* badge spécialité */}
      <div className="absolute top-3 left-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full" style={{ background: 'rgba(5,5,5,0.6)', backdropFilter: 'blur(8px)', border: `1px solid ${agent.accent}55`, color: agent.accent }}>
        {agent.icon}
        <span style={{ fontFamily: '"Manrope",sans-serif', fontSize: '0.66rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{agent.role}</span>
      </div>
    </div>
  );
};

const AgentCard: React.FC<{ agent: Agent; delay: number; onConsult: (id: string) => void }> = ({ agent, delay, onConsult }) => (
  <motion.div
    initial={{ opacity: 0, y: 30 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true, amount: 0.3 }}
    transition={{ duration: 0.6, delay, ease: 'easeOut' }}
    whileHover={{ y: -6 }}
    className="group relative flex flex-col rounded-[18px] overflow-hidden"
    style={{ background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(212,175,55,0.14)', boxShadow: '0 8px 30px rgba(0,0,0,0.4)' }}
  >
    <Avatar agent={agent} />
    <div className="flex flex-col gap-3 p-5 md:p-6 flex-1">
      <div>
        <h3 style={{ fontFamily: '"Sora",sans-serif', fontSize: '1.35rem', fontWeight: 700, color: '#fff', lineHeight: 1.1 }}>{agent.name}</h3>
        <p style={{ color: agent.accent, fontFamily: '"Manrope",sans-serif', fontSize: '0.8rem', fontWeight: 600, marginTop: 2 }}>{agent.role}</p>
      </div>
      <p style={{ color: 'rgba(240,235,224,0.78)', fontFamily: '"Manrope",sans-serif', fontSize: '0.9rem', lineHeight: 1.6 }}>{agent.desc}</p>
      <div className="flex flex-wrap gap-2 mt-1">
        {agent.tags.map(tag => (
          <span key={tag} style={{ fontFamily: '"Manrope",sans-serif', fontSize: '0.7rem', color: 'rgba(240,235,224,0.7)', background: 'rgba(212,175,55,0.08)', border: '1px solid rgba(212,175,55,0.18)', borderRadius: 999, padding: '4px 10px' }}>{tag}</span>
        ))}
      </div>
      <button
        onClick={() => onConsult(agent.id)}
        className="mt-auto inline-flex items-center justify-center gap-2 w-full"
        style={{ marginTop: 16, padding: '0.85rem 1.2rem', borderRadius: 12, background: `linear-gradient(135deg, ${agent.accent}, #f0c060)`, color: '#050505', fontFamily: '"Manrope",sans-serif', fontWeight: 800, fontSize: '0.8rem', letterSpacing: '0.04em', border: 'none', cursor: 'pointer' }}
      >
        Consulter {agent.name.split(' ')[0]}
        <ArrowRight size={15} />
      </button>
    </div>
  </motion.div>
);

const AgentsSection: React.FC<{ onConsult?: (id: string) => void }> = ({ onConsult }) => {
  const handle = (id: string) => (onConsult ? onConsult(id) : document.getElementById('decision-tree')?.scrollIntoView({ behavior: 'smooth' }));
  return (
    <section className="relative w-full px-4 md:px-8 py-20 md:py-28" style={{ background: '#050505' }}>
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col items-center text-center mb-12 md:mb-16 gap-4">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full" style={{ border: '1px solid rgba(212,175,55,0.32)', background: 'rgba(212,175,55,0.07)' }}>
            <Sparkles size={11} style={{ color: '#D4AF37' }} />
            <span style={{ color: '#D4AF37', fontSize: '0.64rem', fontFamily: '"Manrope",sans-serif', fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase' }}>Vos conseillers IA</span>
          </div>
          <h2 style={{ fontFamily: '"Sora",sans-serif', fontSize: 'clamp(1.8rem,4vw,3rem)', fontWeight: 700, color: '#fff', lineHeight: 1.1, textWrap: 'balance' as const }}>
            Trois experts IA, un pour chaque projet
          </h2>
          <p style={{ color: 'rgba(240,235,224,0.7)', fontFamily: '"Manrope",sans-serif', fontSize: 'clamp(0.95rem,1.5vw,1.1rem)', maxWidth: 620, lineHeight: 1.7 }}>
            Choisissez le conseiller adapté à votre objectif. Il analyse le marché en temps réel et vous guide, données réelles à l'appui.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-7">
          {AGENTS.map((a, i) => <AgentCard key={a.id} agent={a} delay={0.1 + i * 0.12} onConsult={handle} />)}
        </div>
      </div>
    </section>
  );
};

export default AgentsSection;
