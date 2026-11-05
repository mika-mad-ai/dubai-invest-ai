import React, { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Box } from 'lucide-react';
import type { MapSubject } from './Property3DMap';

// MapLibre (~230 kB gz) ne se charge que si l'utilisateur ouvre la carte.
const Property3DMap = lazy(() => import('./Property3DMap'));

const sans = '"Manrope",sans-serif';

const Map3DDialog: React.FC<{ subject: MapSubject; onClose: () => void }> = ({ subject, onClose }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return createPortal(
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label={`Carte 3D — ${subject.title}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 90,
        background: 'rgba(5,8,18,0.78)',
        backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'max(10px, 2vmin)',
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.975, y: 14 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.985, y: 8 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        onClick={e => e.stopPropagation()}
        style={{
          position: 'relative', width: 'min(1180px, 100%)', height: 'min(760px, 100%)',
          borderRadius: 20, overflow: 'hidden',
          border: '1px solid rgba(255,255,255,0.1)',
          boxShadow: '0 40px 120px rgba(0,0,0,0.6)',
          background: '#0a1020',
        }}
      >
        <button
          onClick={onClose}
          aria-label="Fermer la carte"
          style={{
            position: 'absolute', top: 12, right: 12, zIndex: 20,
            width: 34, height: 34, borderRadius: 999, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#f0ebe0', background: 'rgba(16,24,44,0.9)',
            border: '1px solid rgba(255,255,255,0.12)',
          }}
        >
          <X size={16} />
        </button>

        <Suspense
          fallback={
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
              <span style={{ fontFamily: sans, fontSize: '0.8rem', color: 'rgba(240,235,224,0.6)' }}>
                Chargement du moteur 3D…
              </span>
            </div>
          }
        >
          <Property3DMap subject={subject} />
        </Suspense>
      </motion.div>
    </motion.div>,
    document.body
  );
};

/**
 * Bouton « Carte 3D » : l'entrée unique vers la scène, posable sur n'importe
 * quel résultat (sélection du conseiller, carte d'annonce).
 */
export const Map3DButton: React.FC<{ subject: MapSubject; compact?: boolean }> = ({ subject, compact }) => {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      <button
        onClick={e => { e.stopPropagation(); setOpen(true); }}
        className="inline-flex items-center gap-1.5 transition-colors"
        style={{
          fontFamily: sans, fontSize: compact ? '0.62rem' : '0.68rem', fontWeight: 700,
          color: '#D4AF37', background: 'rgba(212,175,55,0.08)',
          border: '1px solid rgba(212,175,55,0.28)', borderRadius: 999,
          padding: compact ? '3px 9px' : '5px 11px', cursor: 'pointer',
        }}
        aria-haspopup="dialog"
      >
        <Box size={compact ? 11 : 13} />
        Carte 3D
      </button>
      <AnimatePresence>{open && <Map3DDialog subject={subject} onClose={close} />}</AnimatePresence>
    </>
  );
};

export default Map3DDialog;
