import React, { useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { AGENTS, LivingVideoLayers } from './AgentsSection';

/**
 * Avatar compagnon — quand un conseiller est choisi (AgentsSection), son
 * portrait vivant glisse sur le bord droit de l'écran et accompagne tout le
 * parcours : un message contextuel par étape du questionnaire, puis présence
 * discrète sur le tableau de bord de simulation.
 */

interface AgentCompanionProps {
  agentId: string;
  /** 'tree' pendant le questionnaire, 'dashboard' après soumission du profil */
  phase: 'tree' | 'dashboard';
  /** index de l'étape courante du questionnaire (steps.length = formulaire final) */
  step: number;
}

const HINTS: Record<string, { tree: string[]; final: string; dashboard: string }> = {
  locatif: {
    tree: [
      "Je suis Karim. Dites-moi quel type de loyer vous visez — toute la stratégie en découle.",
      "Votre enveloppe détermine le quartier et le rendement atteignable. Soyez précis.",
      "Le timing de vos premiers loyers oriente le choix : bien livré ou off-plan.",
      "Soyez honnête sur le risque — je calibre le type de bien en conséquence.",
      "Le bon locataire, c'est 11 mois de loyer sur 12. Choisissez bien votre cible.",
    ],
    final: "Parfait. Encore 30 secondes et je calibre votre simulation locative complète.",
    dashboard: "Je reste à vos côtés. Posez-moi vos questions : rendement, quartiers, fiscalité.",
  },
  residence: {
    tree: [
      "Je suis James. Racontez-moi comment vous voulez vivre à Dubaï.",
      "Votre budget définit le quartier et la surface — et le Golden Visa dès 545 000 €.",
      "La date d'emménagement décide entre bien livré et off-plan neuf à personnaliser.",
      "Une résidence reste un actif : parlons de ce qui compte vraiment pour vous.",
      "Le quartier fait le quotidien : écoles, plage, restaurants. Votre style de vie ?",
    ],
    final: "Excellent. Je prépare votre projet résidentiel — dernière étape.",
    dashboard: "Je vous accompagne : quartiers, écoles, Golden Visa, financement — demandez-moi.",
  },
  location: {
    tree: [
      "Je suis Léa. Courte ou longue durée ? Tout part de là.",
      "Votre budget mensuel cible les bons quartiers — et votre marge de négociation.",
      "Le marché bouge vite : votre date d'emménagement fixe le tempo de la recherche.",
      "Meublé, non meublé, services hôteliers : chaque formule a son juste prix.",
      "Dernier détail : votre style de vie. Le quartier fait toute l'expérience.",
    ],
    final: "C'est noté. Je finalise votre recherche personnalisée.",
    dashboard: "Je reste là pour vous : loyers réels, quartiers, négociation — demandez-moi tout.",
  },
};

const AgentCompanion: React.FC<AgentCompanionProps> = ({ agentId, phase, step }) => {
  const agent = AGENTS.find(a => a.id === agentId);
  const [imgFailed, setImgFailed] = useState(false);
  const [videoOk, setVideoOk] = useState(false);
  const reduced = useReducedMotion();

  if (!agent) return null;

  const hints = HINTS[agentId];
  const hint = !hints
    ? ''
    : phase === 'dashboard'
      ? hints.dashboard
      : step >= hints.tree.length ? hints.final : hints.tree[step];

  const showVideo = videoOk && !reduced && !agent.noVideo;
  const initials = agent.name.split(' ').map(w => w[0]).join('');
  const isTree = phase === 'tree';

  return (
    // Le conteneur externe fixe la position (bord droit centré pendant le
    // questionnaire, coin bas-gauche sur le dashboard pour laisser le chat à
    // droite) ; le motion.div interne gère la glissade vers le bord.
    <div
      className={`fixed z-40 pointer-events-none ${isTree ? 'right-2 md:right-6' : 'left-2 bottom-3 md:left-6 md:bottom-6'}`}
      style={isTree ? { top: 'calc(50% - 160px)' } : undefined}
    >
      <motion.div
        key={`${agent.id}-${phase}`}
        initial={reduced ? { opacity: 0 } : { x: isTree ? -180 : 0, y: isTree ? 0 : 140, opacity: 0, scale: 0.82 }}
        animate={{ x: 0, y: 0, opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 150, damping: 21 }}
        className="pointer-events-auto flex flex-col items-center gap-2.5"
      >
        {/* Bulle de dialogue contextuelle (masquée sur mobile, l'écran est trop étroit) */}
        <AnimatePresence mode="wait">
          <motion.div
            key={hint}
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
            className="hidden md:block relative rounded-2xl px-4 py-3"
            style={{
              maxWidth: isTree ? 200 : 230,
              background: 'rgba(10,10,18,0.94)',
              border: `1px solid ${agent.accent}44`,
              boxShadow: `0 8px 28px rgba(0,0,0,0.5), 0 0 18px ${agent.accent}18`,
              backdropFilter: 'blur(14px)',
              WebkitBackdropFilter: 'blur(14px)',
            }}
          >
            <p style={{ fontFamily: '"Manrope",sans-serif', fontSize: '0.72rem', lineHeight: 1.55, color: 'rgba(240,235,224,0.88)' }}>
              {hint}
            </p>
            {/* pointe de la bulle vers le portrait */}
            <div
              className="absolute left-1/2 -translate-x-1/2 -bottom-[6px] w-3 h-3 rotate-45"
              style={{ background: 'rgba(10,10,18,0.94)', borderRight: `1px solid ${agent.accent}44`, borderBottom: `1px solid ${agent.accent}44` }}
            />
          </motion.div>
        </AnimatePresence>

        {/* Portrait vivant */}
        <div
          className={`relative overflow-hidden rounded-2xl ${isTree ? 'w-16 md:w-36' : 'w-14 md:w-24'}`}
          style={{
            aspectRatio: '3 / 4',
            background: '#0a0a12',
            border: `1px solid ${agent.accent}55`,
            boxShadow: `0 14px 44px rgba(0,0,0,0.6), 0 0 26px ${agent.accent}22`,
          }}
        >
          {!reduced && !imgFailed && !agent.noVideo && (
            <LivingVideoLayers agent={agent} showVideo={showVideo} onShowVideo={setVideoOk} />
          )}
          {!imgFailed ? (
            <img
              src={agent.photo}
              alt={`${agent.name}, votre conseiller`}
              onError={() => setImgFailed(true)}
              className="absolute inset-0 w-full h-full object-cover object-top"
              style={{ opacity: showVideo ? 0 : 1, transition: 'opacity .7s ease' }}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center" style={{ background: `radial-gradient(ellipse at 50% 35%, ${agent.accent}22, #0a0a12 70%)` }}>
              <span style={{ fontFamily: '"Sora",sans-serif', fontSize: '1.6rem', fontWeight: 700, color: agent.accent, opacity: 0.55 }}>{initials}</span>
            </div>
          )}
          {/* nom en pied de portrait */}
          <div className="absolute inset-x-0 bottom-0 pt-6 pb-1.5 px-1.5 text-center" style={{ background: 'linear-gradient(to top, rgba(5,5,8,0.92), transparent)' }}>
            <p className="hidden md:block" style={{ fontFamily: '"Sora",sans-serif', fontSize: '0.62rem', fontWeight: 700, color: '#fff', lineHeight: 1.1 }}>{agent.name}</p>
            <p className="hidden md:block" style={{ fontFamily: '"Manrope",sans-serif', fontSize: '0.5rem', fontWeight: 600, color: agent.accent, marginTop: 1 }}>{agent.role}</p>
          </div>
          {/* halo doux */}
          {!reduced && (
            <motion.div
              aria-hidden
              className="absolute inset-0 pointer-events-none"
              style={{ boxShadow: `inset 0 -30px 46px -22px ${agent.accent}` }}
              animate={{ opacity: [0.2, 0.5, 0.2] }}
              transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut' }}
            />
          )}
          {/* pastille "en ligne" */}
          <span className="absolute top-1.5 right-1.5 flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60" style={{ background: agent.accent }} />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5" style={{ background: agent.accent }} />
          </span>
        </div>
      </motion.div>
    </div>
  );
};

export default AgentCompanion;
