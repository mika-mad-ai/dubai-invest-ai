import React, { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Box } from 'lucide-react';
import type { MapSubject } from './Property3DMap';

// MapLibre (~230 kB gz) ne se charge que si l'utilisateur ouvre la carte.
const Property3DMap = lazy(() => import('./Property3DMap'));

const sans = '"Manrope",sans-serif';

/**
 * Isole les pannes de la scène (chunk MapLibre introuvable après un
 * déploiement, WebGL indisponible…) : sans ce garde-fou, l'erreur remonte à
 * l'ErrorBoundary global et c'est toute la page qui tombe.
 */
class MapErrorBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.warn('[map3d] scène indisponible', error);
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, height: '100%', padding: 24, textAlign: 'center' }}>
        <p style={{ fontFamily: sans, fontSize: '0.85rem', color: 'rgba(240,235,224,0.78)', maxWidth: 380, lineHeight: 1.6, margin: 0 }}>
          La carte 3D n’a pas pu démarrer (connexion ou carte graphique non
          prise en charge). Le reste de l’analyse reste disponible.
        </p>
        <button
          onClick={() => window.location.reload()}
          style={{ fontFamily: sans, fontSize: '0.75rem', fontWeight: 700, color: '#0a1020', background: '#D4AF37', border: 'none', borderRadius: 999, padding: '8px 16px', cursor: 'pointer' }}
        >
          Recharger la page
        </button>
      </div>
    );
  }
}

const Map3DDialog: React.FC<{ subject: MapSubject; onClose: () => void }> = ({ subject, onClose }) => {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    // Focus dans le dialogue à l'ouverture, rendu à l'élément d'origine ensuite.
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus({ preventScroll: true });
    return () => opener?.focus?.({ preventScroll: true });
  }, []);

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
          ref={closeRef}
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

        <MapErrorBoundary>
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
        </MapErrorBoundary>
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
          // Bouton plein, lisible sur photo : c'est l'entrée de la carte 3D,
          // il doit se voir (l'ancien contour doré se perdait sur les images).
          fontFamily: sans, fontSize: compact ? '0.7rem' : '0.74rem', fontWeight: 800,
          color: '#0a0d16', background: 'linear-gradient(135deg, #f0d27a 0%, #D4AF37 60%, #b8891e 100%)',
          border: '1px solid rgba(255,236,170,0.55)', borderRadius: 999,
          boxShadow: '0 4px 18px rgba(212,175,55,0.35), 0 1px 0 rgba(255,255,255,0.35) inset',
          padding: compact ? '6px 12px' : '7px 14px', cursor: 'pointer', letterSpacing: '0.01em',
        }}
        aria-haspopup="dialog"
      >
        <Box size={compact ? 13 : 14} strokeWidth={2.4} />
        Carte 3D
      </button>
      <AnimatePresence>{open && <Map3DDialog subject={subject} onClose={close} />}</AnimatePresence>
    </>
  );
};

export default Map3DDialog;
