import React, { useRef } from 'react';
import { motion, useInView } from 'framer-motion';

/**
 * Révélation « en rideau » : deux panneaux sombres/dorés qui s'écartent
 * horizontalement quand la section entre dans le viewport, découvrant le
 * contenu (toujours rendu dessous → pas de contenu masqué si le JS ne tourne
 * pas / prefers-reduced-motion). Un mince liseré doré marque l'ouverture.
 */
export const CurtainReveal: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.25 });
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  return (
    <div ref={ref} className={`relative overflow-hidden ${className ?? ''}`}>
      <motion.div
        initial={reduced ? false : { opacity: 0, y: 36 }}
        animate={inView || reduced ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 0.35 }}
      >
        {children}
      </motion.div>

      {!reduced && (
        <>
          <motion.div
            aria-hidden
            className="absolute inset-y-0 left-0 w-[51%] z-30 pointer-events-none"
            style={{ background: 'linear-gradient(90deg,#050505 60%,#0b0a14)', borderRight: '1px solid rgba(212,175,55,0.35)', boxShadow: '8px 0 40px rgba(212,175,55,0.10)' }}
            initial={{ x: 0 }}
            animate={inView ? { x: '-100%' } : {}}
            transition={{ duration: 1.05, ease: [0.76, 0, 0.24, 1] }}
          />
          <motion.div
            aria-hidden
            className="absolute inset-y-0 right-0 w-[51%] z-30 pointer-events-none"
            style={{ background: 'linear-gradient(270deg,#050505 60%,#0b0a14)', borderLeft: '1px solid rgba(212,175,55,0.35)', boxShadow: '-8px 0 40px rgba(212,175,55,0.10)' }}
            initial={{ x: 0 }}
            animate={inView ? { x: '100%' } : {}}
            transition={{ duration: 1.05, ease: [0.76, 0, 0.24, 1] }}
          />
          {/* éclat central doré au moment de l'ouverture */}
          <motion.div
            aria-hidden
            className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px z-40 pointer-events-none"
            style={{ background: 'linear-gradient(to bottom, transparent, #D4AF37, #00F2FF, transparent)' }}
            initial={{ opacity: 0, scaleY: 0.4 }}
            animate={inView ? { opacity: [0, 1, 0], scaleY: [0.4, 1, 1] } : {}}
            transition={{ duration: 1.05, ease: 'easeOut' }}
          />
        </>
      )}
    </div>
  );
};

export default CurtainReveal;
