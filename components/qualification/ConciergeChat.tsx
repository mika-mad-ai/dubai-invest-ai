import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { UserProfile } from '../../types';
import { AGENTS } from '../AgentsSection';
import ConsentFields from '../ConsentFields';
import { gtm } from '../../services/gtm';
import { useI18n } from '../../i18n';
import { AGENT_TREES, type StepOption, type TreeStep } from './steps';
import { detectProject, extractAnswers, matchAnswer } from './answerMatch';

/**
 * Chat d'accueil : la qualification du visiteur se fait en conversation. Chaque
 * question du conseiller arrive avec ses réponses en un clic ; on peut aussi
 * répondre au clavier (rapprochement local, sans appel à un modèle). Une fois
 * le dossier complet, la fenêtre de chat se transforme en carte.
 */

export type MorphRect = { top: number; left: number; width: number; height: number };

type Props = {
  /** `notes` : ce que le visiteur a écrit librement, à transmettre au conseiller. */
  onSubmit: (profile: UserProfile, from: MorphRect | null, notes: string[]) => void;
  /** Le conseiller choisi (pour le suivi de la conversation côté serveur). */
  onAgent?: (agentId: string) => void;
  /** Ouvre les guides et mentions légales (le pied de page n'est plus sous l'écran). */
  onMore?: () => void;
};

const BASE_PROFILE: UserProfile = {
  name: '',
  email: '',
  totalBudget: '320000',
  initialInvestment: '80000',
  monthlyContribution: '1000',
  duration: '5',
  propertyStatus: 'ready',
  riskLevel: 3,
  roiDelay: '3',
  objective: 'rental_income',
  zonePreference: 'balanced',
  investmentHorizon: 'medium',
};

/** Première question : elle désigne le conseiller, donc le parcours. */
const PROJECT_OPTIONS: Array<{ agentId: string; label: string; desc: string }> = [
  { agentId: 'locatif', label: 'Investir pour louer', desc: 'Acheter un bien et encaisser des loyers, en longue durée ou en Airbnb.' },
  { agentId: 'residence', label: 'Acheter pour y vivre', desc: 'Résidence principale, pied-à-terre ou installation en famille.' },
  { agentId: 'location', label: 'Louer un logement', desc: 'Trouver une location à Dubaï, pour quelques semaines ou plusieurs années.' },
];

type Answer = { stepId: string; label: string; updates: Partial<UserProfile> };
type Msg = { who: 'ai' | 'me'; text: string };
/** État de la conversation ; chaque réponse en empile une copie pour « revenir ». */
type Convo = { agentId: string | null; answers: Answer[]; log: Msg[]; pending: string[]; notes: string[] };

const GREETING = 'Bonjour. Écrivez ce que vous cherchez à Dubaï et je lance la recherche — ou choisissez une réponse pour être guidé.';
const PROJECT_QUESTION = 'Quel est votre projet ?';

const GOLD = '#D4AF37';

const ConciergeChat: React.FC<Props> = ({ onSubmit, onAgent, onMore }) => {
  const { t } = useI18n();
  const cardRef = useRef<HTMLDivElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [convo, setConvo] = useState<Convo>({ agentId: null, answers: [], log: [], pending: [], notes: [] });
  const history = useRef<Convo[]>([]);
  const { agentId, answers, log } = convo;
  const [leaving, setLeaving] = useState(false);
  const [typed, setTyped] = useState('');
  const [contact, setContact] = useState({ name: '', email: '', partners: false });
  const [sending, setSending] = useState(false);
  const started = useRef(false);

  // Introduction. Sur ordinateur, elle est pilotée par le défilement : la
  // page est une piste de trois hauteurs d'écran dont la scène reste collée en
  // haut ; faire défiler avance la vidéo image par image, et en fin de course
  // le titre monte en bandeau pendant que le chat prend sa place. Sur mobile,
  // écran tactile ou mouvement réduit (le défilement image par image y est
  // saccadé), elle se joue seule en deux secondes.
  const trackRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hintRef = useRef<HTMLButtonElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);
  const loopRef = useRef<HTMLVideoElement>(null);
  const [mode] = useState<'scrub' | 'auto' | 'none'>(() => {
    if (typeof window === 'undefined') return 'none';
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return 'none';
    if (window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 768) return 'auto';
    return 'scrub';
  });
  const [intro, setIntro] = useState(mode !== 'none');

  useEffect(() => {
    if (mode !== 'auto') return;
    const end = () => setIntro(false);
    const timer = window.setTimeout(end, 2300);
    window.addEventListener('pointerdown', end, { once: true });
    window.addEventListener('keydown', end, { once: true });
    return () => {
      clearTimeout(timer);
      window.removeEventListener('pointerdown', end);
      window.removeEventListener('keydown', end);
    };
  }, [mode]);

  useEffect(() => {
    if (mode !== 'scrub') return;
    const track = trackRef.current;
    const video = videoRef.current;
    if (!track || !video) return;
    let raf = 0;
    let target = 0;
    let smooth = 0;
    let duration = video.duration || 8;
    const onMeta = () => {
      duration = video.duration || 8;
    };
    video.addEventListener('loadedmetadata', onMeta);

    const read = () => {
      const dist = track.offsetHeight - window.innerHeight;
      const p = dist > 0 ? Math.min(Math.max((window.scrollY - track.offsetTop) / dist, 0), 1) : 1;
      target = p * (duration - 0.05);
      if (hintRef.current) {
        hintRef.current.style.opacity = String(Math.max(0, 1 - p * 5));
        hintRef.current.style.pointerEvents = p > 0.18 ? 'none' : 'auto';
      }
      // Une conversation commencée ne se referme pas si l'on remonte la page.
      const inIntro = p < 0.84 && !started.current;
      // Le titre s'efface pour laisser voir la vidéo, puis revient en bandeau.
      if (heroRef.current) heroRef.current.style.opacity = inIntro ? String(Math.max(0, 1 - p * 2.4)) : '1';
      setIntro(inIntro);
    };
    // Lissage : la vidéo rattrape la position visée au lieu d'y sauter.
    const tick = () => {
      smooth += (target - smooth) * 0.12;
      if (Math.abs(target - smooth) < 0.004) smooth = target;
      if (video.readyState >= 2 && Math.abs(video.currentTime - smooth) > 0.01) {
        try {
          video.currentTime = smooth;
        } catch {
          /* position pas encore disponible */
        }
      }
      raf = requestAnimationFrame(tick);
    };
    read();
    raf = requestAnimationFrame(tick);
    window.addEventListener('scroll', read, { passive: true });
    window.addEventListener('resize', read);
    return () => {
      cancelAnimationFrame(raf);
      video.removeEventListener('loadedmetadata', onMeta);
      window.removeEventListener('scroll', read);
      window.removeEventListener('resize', read);
    };
  }, [mode]);

  // Une fois l'animation au défilement terminée, la vidéo d'ambiance prend le
  // relais en boucle, en fondu, derrière le chat.
  useEffect(() => {
    const v = loopRef.current;
    if (!v) return;
    if (!intro) void v.play().catch(() => undefined);
    else v.pause();
  }, [intro]);

  const skipIntro = () => {
    const track = trackRef.current;
    if (track) window.scrollTo({ top: track.offsetTop + track.offsetHeight - window.innerHeight, behavior: 'smooth' });
  };

  const agent = AGENTS.find(a => a.id === agentId) ?? null;
  const steps: TreeStep[] = agentId ? AGENT_TREES[agentId] ?? [] : [];
  // La question en cours est la première sans réponse : un message libre peut
  // en avoir renseigné plusieurs d'un coup, dans n'importe quel ordre.
  const step: TreeStep | null = agentId ? steps.find(s => !answers.some(a => a.stepId === s.id)) ?? null : null;
  const atContact = !!agentId && !step;
  const total = (steps.length || 5) + 2; // projet + questions + coordonnées
  const position = agentId ? Math.min(answers.length + 2, total) : 1;

  const options: Array<{ label: string; desc: string; icon?: StepOption['icon'] }> = !agentId
    ? PROJECT_OPTIONS
    : step
      ? step.options
      : [];

  const question = !agentId
    ? { text: log.length ? PROJECT_QUESTION : GREETING, sub: undefined as string | undefined }
    : step
      ? { text: step.question, sub: step.sub }
      : { text: 'Votre dossier est complet. À quel nom et à quelle adresse e-mail dois-je l’ouvrir ? La carte s’affiche juste après.', sub: undefined };

  // Le fil reste calé en bas à chaque nouveau message.
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [log.length, agentId, atContact]);

  const begin = () => {
    if (started.current) return;
    started.current = true;
    gtm.funnelStart();
  };

  const introOf = (id: string) => {
    const a = AGENTS.find(x => x.id === id);
    return a ? `Je suis ${a.name}, votre conseiller ${a.role.toLowerCase()}. ${a.desc}` : '';
  };

  const toAnswer = (s: TreeStep, index: number, amount?: number): Answer => {
    const o = s.options[index];
    const updates: Partial<UserProfile> = { ...o.updates };
    // Un montant tapé précisément remplace le milieu de tranche.
    const exact = amount && s.id === 'budget';
    if (exact) {
      updates.totalBudget = String(amount);
      updates.initialInvestment = String(Math.round(amount * 0.25));
    }
    return { stepId: s.id, label: exact ? `${amount.toLocaleString('fr-FR')} €` : o.label, updates };
  };

  /** Applique un nouvel état en faisant glisser les options (sortie à gauche, entrée à droite). */
  const commit = (next: Convo) => {
    history.current.push(convo);
    setLeaving(true);
    window.setTimeout(() => {
      setConvo(next);
      setLeaving(false);
    }, 260);
  };

  /** Réponse en un clic. */
  const choose = (index: number) => {
    if (leaving) return;
    begin();
    const base: Msg[] = [...log, { who: 'ai', text: question.text }];
    if (!agentId) {
      const p = PROJECT_OPTIONS[index];
      onAgent?.(p.agentId);
      gtm.funnelStepComplete('project', 0, p.agentId);
      // Ce que le visiteur avait écrit avant de choisir son projet est relu
      // avec les questions de ce conseiller.
      const tree = AGENT_TREES[p.agentId] ?? [];
      const found = convo.pending.flatMap(t => extractAnswers(tree, t)).filter((a, i, all) => all.findIndex(x => x.stepId === a.stepId) === i);
      const filled = found.map(a => toAnswer(tree.find(s => s.id === a.stepId)!, a.index, a.amount));
      const next: Msg[] = [...base, { who: 'me', text: p.label }, { who: 'ai', text: introOf(p.agentId) }];
      if (filled.length) next.push({ who: 'ai', text: `J’ai bien noté : ${filled.map(a => a.label).join(' · ')}.` });
      commit({ ...convo, agentId: p.agentId, answers: filled, log: next, pending: [] });
    } else if (step) {
      const a = toAnswer(step, index);
      gtm.funnelStepComplete(step.id, answers.length + 1, step.options[index].value);
      commit({ ...convo, answers: [...answers, a], log: [...base, { who: 'me', text: a.label }] });
    }
  };

  const back = () => {
    if (leaving || sending) return;
    const prev = history.current.pop();
    if (prev) setConvo(prev);
  };

  /** Ouvre la carte avec le dossier tel qu'il est (les questions sans réponse gardent leurs valeurs par défaut). */
  const launch = (id: string | null, all: Answer[], notes: string[], who?: { name: string; email: string; partners: boolean }) => {
    const tree = id ? AGENT_TREES[id] ?? [] : [];
    // Dans l'ordre des questions, pour un profil identique quel que soit
    // l'ordre dans lequel les réponses sont arrivées.
    const ordered = tree.map(s => all.find(a => a.stepId === s.id)).filter((a): a is Answer => !!a);
    const profile: UserProfile = ordered.reduce<UserProfile>((acc, a) => ({ ...acc, ...a.updates }), { ...BASE_PROFILE });
    profile.name = who?.name.trim() ?? '';
    profile.email = who?.email.trim() ?? '';
    profile.advisorId = id ?? undefined;
    if (who) profile.consent = { whatsapp: false, partners: who.partners };
    const r = cardRef.current?.getBoundingClientRect();
    onSubmit(profile, r ? { top: r.top, left: r.left, width: r.width, height: r.height } : null, notes);
  };

  /**
   * Message libre = une recherche. On en tire le projet (donc le conseiller)
   * et tout ce qu'il renseigne, puis on ouvre la carte tout de suite : le
   * conseiller répond à la demande elle-même. Pas de questions
   * supplémentaires, pas de coordonnées exigées — elles se donnent plus tard,
   * via « Être contacté ».
   */
  const sendTyped = (e: React.FormEvent) => {
    e.preventDefault();
    const text = typed.trim();
    if (!text || atContact || leaving || sending) return;
    begin();
    setTyped('');
    const notes = [...convo.notes, text];

    let id = agentId;
    if (!id) {
      const byOption = matchAnswer(PROJECT_OPTIONS, text);
      // Sans indice sur le projet, on part sur l'investissement locatif : c'est
      // l'objet du site, et le conseiller réoriente si besoin.
      id = (byOption ? PROJECT_OPTIONS[byOption.index].agentId : detectProject(text)) ?? 'locatif';
      onAgent?.(id);
      gtm.funnelStepComplete('project', 0, id);
    }

    const tree = AGENT_TREES[id] ?? [];
    const open = tree.filter(s => !answers.some(a => a.stepId === s.id));
    const found = [...convo.pending, text]
      .flatMap(t => extractAnswers(open, t, agentId ? step?.id : undefined))
      .filter((a, i, all) => all.findIndex(x => x.stepId === a.stepId) === i);
    const filled = found.map(a => toAnswer(tree.find(s => s.id === a.stepId)!, a.index, a.amount));
    filled.forEach(a => gtm.funnelStepComplete(a.stepId, answers.length + 1, a.label));
    const all = [...answers, ...filled];

    const first = AGENTS.find(a => a.id === id)?.name.split(' ')[0] ?? 'Votre conseiller';
    const noted = filled.length ? ` (${filled.map(a => a.label).join(' · ')})` : '';
    history.current.push(convo);
    setConvo({
      agentId: id,
      answers: all,
      pending: [],
      notes,
      log: [...log, { who: 'me', text }, { who: 'ai', text: `${first} lance la recherche${noted}…` }],
    });
    setSending(true);
    const finalId = id;
    window.setTimeout(() => launch(finalId, all, notes), 900);
  };

  const finish = (e: React.FormEvent) => {
    e.preventDefault();
    if (sending) return;
    setSending(true);
    launch(agentId, answers, convo.notes, contact);
  };

  const railKey = !agentId ? 'project' : step ? step.id : 'contact';

  return (
    <div ref={trackRef} className={`cc-track ${mode}`}>
    <section id="concierge" className={`cc-stage ${intro ? 'intro' : 'ready'}`} aria-label="Votre conseiller IA">
      {mode === 'scrub' ? (
        <>
          <video ref={videoRef} className="cc-video" src="/hero-scrub.mp4" poster="/hero-poster.jpg" muted playsInline preload="auto" aria-hidden="true" />
          <video ref={loopRef} className="cc-video loop drift" src="/hero-video.mp4" muted loop playsInline preload="none" aria-hidden="true" />
        </>
      ) : (
        <video className="cc-video drift" src="/hero-video.mp4" poster="/hero-poster.jpg" autoPlay muted loop playsInline preload="metadata" aria-hidden="true" />
      )}
      <div className="cc-shade" aria-hidden />
      <div className="cc-glow" aria-hidden />

      <div ref={heroRef} className="cc-hero">
        <p className="cc-eyebrow">{t.hero.badge}</p>
        <h1>
          <span>{t.hero.title1}</span> <em>{t.hero.title2}</em>
        </h1>
        <ul className="cc-proof" aria-label="En bref">
          {t.hero.subtitle
            .split(' · ')
            .slice(0, 3)
            .map(x => (
              <li key={x}>{x}</li>
            ))}
        </ul>
      </div>

      {mode === 'scrub' && (
        <button ref={hintRef} type="button" className="cc-hint" onClick={skipIntro} aria-label={t.hero.skipAria}>
          <span>{t.hero.scrollHint}</span>
          <i aria-hidden />
        </button>
      )}

      <div ref={cardRef} className={`cc-card ${sending ? 'sending' : ''}`} inert={intro}>
        <header className="cc-head">
          <span className="cc-avatar" style={agent ? { borderColor: agent.accent } : undefined}>
            {agent ? <img src={agent.photo} alt="" /> : <i aria-hidden />}
          </span>
          <span className="cc-who">
            <b>{agent ? agent.name : 'DubaiInvest'}</b>
            <em>{agent ? agent.role : 'Conseiller immobilier IA'}</em>
          </span>
          <span className="cc-progress" aria-label={`Question ${position} sur ${total}`}>
            {Array.from({ length: total }).map((_, i) => (
              <i key={i} className={i < position - 1 ? 'done' : i === position - 1 ? 'now' : ''} />
            ))}
          </span>
        </header>

        <div ref={logRef} className="cc-log" aria-live="polite">
          {log.map((m, i) => (
            <div key={i} className={`cc-msg ${m.who}`}>
              <p>{m.text}</p>
            </div>
          ))}
          {!(sending && !atContact) && (
            <div key={`q-${log.length}`} className="cc-msg ai now">
              <p>{question.text}</p>
              {question.sub && <small>{question.sub}</small>}
            </div>
          )}
        </div>

        {!atContact ? (
          <>
            <div className="cc-rail-wrap">
              <div key={railKey} className={`cc-rail ${leaving ? 'out' : ''}`} role="group" aria-label="Réponses possibles">
                {options.map((o, i) => {
                  const Icon = o.icon;
                  return (
                    <button key={o.label} type="button" className="cc-opt" onClick={() => choose(i)} disabled={leaving}>
                      <span className="cc-opt-n">{Icon ? <Icon className="w-4 h-4" /> : i + 1}</span>
                      <b>{o.label}</b>
                      <span className="cc-opt-d">{o.desc}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <form className="cc-input" onSubmit={sendTyped}>
              {log.length > 0 && (
                <button type="button" className="cc-back" onClick={back} aria-label="Revenir à la question précédente">
                  ‹
                </button>
              )}
              <input
                ref={inputRef}
                value={typed}
                onChange={e => setTyped(e.target.value)}
                placeholder={agentId ? 'Écrivez votre recherche, ou cliquez une réponse…' : 'Ex. : 300 000 €, je veux un loyer chaque mois'}
                aria-label="Votre réponse"
                autoComplete="off"
              />
              <button type="submit" className="cc-send" disabled={!typed.trim()} aria-label="Envoyer">
                ↑
              </button>
            </form>
          </>
        ) : (
          <form className="cc-contact" onSubmit={finish}>
            <div className="cc-fields">
              <input
                type="text"
                required
                autoComplete="name"
                placeholder={t.tree.namePlaceholder}
                aria-label={t.tree.namePlaceholder}
                value={contact.name}
                onChange={e => setContact({ ...contact, name: e.target.value })}
              />
              <input
                type="email"
                required
                autoComplete="email"
                placeholder={t.tree.emailPlaceholder}
                aria-label={t.tree.emailPlaceholder}
                value={contact.email}
                onChange={e => setContact({ ...contact, email: e.target.value })}
              />
            </div>
            <ConsentFields
              value={{ whatsapp: false, partners: contact.partners }}
              onChange={c => setContact({ ...contact, partners: c.partners })}
              showWhatsApp={false}
              accent={GOLD}
            />
            <div className="cc-contact-actions">
              <button type="button" className="cc-back" onClick={back} aria-label="Revenir à la question précédente">
                ‹
              </button>
              <button type="submit" className="cc-go" disabled={sending}>
                {sending ? 'Ouverture de la carte…' : 'Afficher ma carte de Dubaï'}
              </button>
            </div>
          </form>
        )}
      </div>

      {onMore && (
        <button type="button" className="cc-more" onClick={onMore}>
          Guides & mentions légales
        </button>
      )}

      <style>{CSS}</style>
    </section>
    </div>
  );
};

const sans = '"Manrope",sans-serif';
const display = '"Sora",sans-serif';
const IVORY = '#f0ebe0';

const CSS = `
/* Piste de défilement : la scène y reste collée en haut de l'écran. */
.cc-track.scrub { height: 300vh; }
.cc-track.scrub .cc-stage { position: sticky; top: 0; }
.cc-stage { position: relative; height: 100dvh; min-height: 620px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; padding: 84px 16px 18px; background: #050810; color: ${IVORY}; font-family: ${sans}; overflow: hidden; isolation: isolate; }
.cc-video { position: absolute; inset: 0; z-index: -3; width: 100%; height: 100%; object-fit: cover; }
.cc-video.loop { opacity: 0; transition: opacity 1.4s ease; }
.cc-stage.ready .cc-video.loop { opacity: 1; }
.cc-more { position: absolute; left: 14px; bottom: 6px; z-index: 2; padding: 2px 4px; border: 0; background: transparent; color: rgba(240,235,224,0.5); font: 600 0.58rem ${sans}; letter-spacing: 0.04em; cursor: pointer; transition: opacity 0.5s ease; }
.cc-more:hover { color: ${GOLD}; }
.cc-stage.intro .cc-more { opacity: 0; pointer-events: none; }
.cc-video.drift { animation: cc-drift 28s ease-in-out infinite alternate; }
.cc-hint { position: absolute; left: 50%; bottom: 28px; transform: translateX(-50%); z-index: 2; display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 6px 10px; border: 0; background: transparent; color: rgba(125,211,232,0.9); font: 700 0.66rem ${sans}; letter-spacing: 0.14em; text-transform: uppercase; text-shadow: 0 2px 8px rgba(5,8,16,0.9); cursor: pointer; }
.cc-hint i { width: 1px; height: 28px; background: linear-gradient(to bottom, rgba(125,211,232,0.8), transparent); animation: cc-nudge 1.5s ease-in-out infinite; }
/* Voile : léger pendant l'introduction (on regarde Dubaï), dense ensuite (on lit le chat). */
.cc-shade { position: absolute; inset: 0; z-index: -2; pointer-events: none; transition: opacity 1.1s ease;
  background: linear-gradient(to bottom, rgba(5,8,16,0.82) 0, rgba(5,8,16,0.5) 22%, rgba(5,8,16,0.72) 60%, rgba(5,8,16,0.96) 100%); opacity: 1; }
.cc-stage.intro .cc-shade { opacity: 0.55; }
.cc-glow { position: absolute; inset: 0; z-index: -1; pointer-events: none; opacity: 0.6;
  background:
    radial-gradient(ellipse 40% 30% at 50% 100%, rgba(212,175,55,0.14), transparent 70%),
    linear-gradient(rgba(255,255,255,0.022) 1px, transparent 1px) 0 0 / 100% 56px,
    linear-gradient(90deg, rgba(255,255,255,0.022) 1px, transparent 1px) 0 0 / 56px 100%; }

/* Titre : plein écran pendant l'introduction, puis en bandeau au-dessus du chat. */
.cc-hero { --s: 1.55; flex: 0 0 auto; display: flex; flex-direction: column; align-items: center; gap: 8px; max-width: min(940px, 100%); text-align: center; transform-origin: 50% 0; transition: transform 1.05s cubic-bezier(0.7,0,0.2,1), opacity 0.45s ease; }
.cc-stage.intro .cc-hero { transform: translateY(26dvh) scale(var(--s)); }
.cc-eyebrow { margin: 0; font: 800 0.6rem ${sans}; letter-spacing: 0.16em; text-transform: uppercase; color: ${GOLD}; text-shadow: 0 1px 10px rgba(5,8,16,0.9); }
.cc-hero h1 { margin: 0; font: 600 clamp(1.3rem, 2.5vw, 2.05rem)/1.15 ${display}; letter-spacing: -0.025em; color: #f5efe0; text-wrap: balance; text-shadow: 0 2px 24px rgba(5,8,16,0.85); }
.cc-hero h1 em { font-style: normal; font-weight: 700; background: linear-gradient(120deg, #f6e7b0, ${GOLD} 55%, #b8902a); -webkit-background-clip: text; background-clip: text; color: transparent; }
.cc-proof { display: flex; flex-wrap: wrap; justify-content: center; gap: 6px; margin: 2px 0 0; padding: 0; list-style: none; transition: opacity 0.6s ease 0.5s; }
.cc-proof li { padding: 4px 11px; border-radius: 999px; font-size: 0.68rem; font-weight: 700; color: rgba(240,235,224,0.86); background: rgba(9,14,28,0.6); border: 1px solid rgba(255,255,255,0.12); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); }
.cc-stage.intro .cc-proof { opacity: 0; transition-delay: 0s; }

.cc-card { position: relative; display: flex; flex-direction: column; flex: 0 1 720px; min-height: 0; width: min(940px, 100%); border-radius: 28px; background: rgba(9,14,28,0.9); border: 1px solid rgba(255,255,255,0.1); box-shadow: 0 40px 120px rgba(0,0,0,0.65), 0 0 0 1px rgba(212,175,55,0.07); backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px); overflow: hidden; transition: opacity 0.8s ease 0.35s, transform 1s cubic-bezier(0.16,1,0.3,1) 0.3s; }
.cc-stage.intro .cc-card { opacity: 0; transform: translateY(70px) scale(0.96); pointer-events: none; transition-delay: 0s; }
.cc-card::before { content: ''; position: absolute; top: 0; left: 32px; width: 84px; height: 2px; background: ${GOLD}; border-radius: 2px; }
.cc-card.sending { opacity: 0.85; pointer-events: none; transition: opacity 0.3s ease; }
/* Recherche lancée : les réponses proposées n'ont plus lieu d'être. */
.cc-card.sending .cc-rail-wrap { visibility: hidden; }

.cc-head { display: flex; align-items: center; gap: 12px; padding: 18px 24px 14px; border-bottom: 1px solid rgba(255,255,255,0.07); }
.cc-avatar { flex: 0 0 auto; width: 46px; height: 46px; border-radius: 50%; overflow: hidden; border: 2px solid ${GOLD}; background: linear-gradient(135deg, #1a2b55, #0d1527); display: flex; align-items: center; justify-content: center; }
.cc-avatar img { width: 100%; height: 100%; object-fit: cover; object-position: 50% 18%; }
.cc-avatar i { width: 12px; height: 12px; border-radius: 50%; background: ${GOLD}; box-shadow: 0 0 14px rgba(212,175,55,0.9); animation: cc-breathe 2.2s ease-in-out infinite; }
.cc-who { display: flex; flex-direction: column; min-width: 0; }
.cc-who b { font: 700 1rem ${display}; color: ${IVORY}; }
.cc-who em { font-style: normal; font-size: 0.72rem; color: rgba(240,235,224,0.66); }
.cc-progress { margin-left: auto; display: inline-flex; gap: 5px; }
.cc-progress i { width: 18px; height: 3px; border-radius: 2px; background: rgba(255,255,255,0.14); transition: background 0.3s; }
.cc-progress i.done { background: rgba(212,175,55,0.55); }
.cc-progress i.now { background: ${GOLD}; }

.cc-log { flex: 1; min-height: 0; overflow-y: auto; padding: 22px 24px 8px; display: flex; flex-direction: column; gap: 12px; scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.15) transparent; }
/* Le fil se cale en bas, juste au-dessus des réponses. */
.cc-log > :first-child { margin-top: auto; }
.cc-msg { max-width: 82%; animation: cc-rise 0.45s cubic-bezier(0.16,1,0.3,1) both; }
.cc-msg p { margin: 0; }
.cc-msg.ai { align-self: flex-start; }
.cc-msg.ai p { font: 500 0.92rem/1.5 ${sans}; color: rgba(240,235,224,0.8); }
.cc-msg.ai.now p { font: 600 clamp(1.02rem, 1.7vw, 1.3rem)/1.4 ${display}; color: ${IVORY}; }
.cc-msg.ai small { display: block; margin-top: 6px; font-size: 0.78rem; line-height: 1.55; color: rgba(240,235,224,0.66); }
.cc-msg.me { align-self: flex-end; padding: 9px 15px; border-radius: 18px 18px 4px 18px; background: rgba(212,175,55,0.14); border: 1px solid rgba(212,175,55,0.35); color: ${GOLD}; font-weight: 700; font-size: 0.9rem; }

/* Les réponses glissent : les anciennes sortent à gauche, les nouvelles arrivent de la droite. */
.cc-rail-wrap { overflow: hidden; padding: 6px 0 4px; }
.cc-rail { display: flex; gap: 10px; padding: 4px 24px 8px; overflow-x: auto; scroll-snap-type: x proximity; scrollbar-width: none; animation: cc-slide-in 0.5s cubic-bezier(0.16,1,0.3,1) both; }
.cc-rail::-webkit-scrollbar { display: none; }
.cc-rail.out { animation: cc-slide-out 0.26s ease-in both; }
.cc-opt { flex: 1 0 168px; max-width: 290px; display: flex; flex-direction: column; align-items: flex-start; gap: 6px; padding: 13px 14px 14px; border-radius: 18px; border: 1px solid rgba(255,255,255,0.11); background: rgba(255,255,255,0.045); color: ${IVORY}; text-align: left; font-family: ${sans}; cursor: pointer; scroll-snap-align: start; transition: transform 0.2s, border-color 0.2s, background 0.2s; }
.cc-opt:hover:not(:disabled), .cc-opt:focus-visible { transform: translateY(-3px); border-color: rgba(212,175,55,0.65); background: rgba(212,175,55,0.09); outline: none; }
.cc-opt-n { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 50%; background: rgba(212,175,55,0.14); color: ${GOLD}; font-weight: 800; font-size: 0.72rem; }
.cc-opt b { font: 700 0.9rem/1.3 ${display}; }
.cc-opt-d { font-size: 0.7rem; line-height: 1.5; color: rgba(240,235,224,0.66); display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }

.cc-input { display: flex; align-items: center; gap: 8px; margin: 4px 24px 20px; padding: 6px; border-radius: 999px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.11); }
.cc-input:focus-within { border-color: rgba(212,175,55,0.55); }
.cc-input input { flex: 1; min-width: 0; padding: 9px 10px; border: 0; background: transparent; color: ${IVORY}; font: 500 0.9rem ${sans}; outline: none; }
.cc-input input::placeholder { color: rgba(240,235,224,0.45); }
.cc-send, .cc-back { flex: 0 0 auto; width: 38px; height: 38px; border-radius: 50%; border: 1px solid rgba(255,255,255,0.14); background: rgba(255,255,255,0.05); color: ${IVORY}; font-size: 1.05rem; line-height: 1; cursor: pointer; }
.cc-send { background: ${GOLD}; border-color: ${GOLD}; color: #0a1020; font-weight: 800; }
.cc-send:disabled { opacity: 0.35; cursor: default; }
.cc-back:hover { border-color: rgba(212,175,55,0.55); }

.cc-contact { display: flex; flex-direction: column; gap: 12px; margin: 6px 24px 20px; animation: cc-slide-in 0.5s cubic-bezier(0.16,1,0.3,1) both; }
.cc-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.cc-fields input { padding: 13px 16px; border-radius: 14px; border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.05); color: ${IVORY}; font: 500 0.92rem ${sans}; outline: none; }
.cc-fields input:focus { border-color: rgba(212,175,55,0.6); }
.cc-fields input::placeholder { color: rgba(240,235,224,0.45); }
.cc-contact-actions { display: flex; align-items: center; gap: 10px; }
.cc-go { flex: 1; padding: 14px 18px; border-radius: 999px; border: 0; background: ${GOLD}; color: #0a1020; font: 800 0.86rem ${sans}; letter-spacing: 0.02em; cursor: pointer; box-shadow: 0 0 40px rgba(212,175,55,0.3); }
.cc-go:disabled { opacity: 0.7; cursor: default; }

@media (max-width: 720px) {
  .cc-stage { padding: 66px 8px 10px; gap: 8px; }
  .cc-hero { --s: 1.2; gap: 5px; max-width: 80%; }
  .cc-hero h1 { font-size: 1.12rem; }
  .cc-eyebrow { font-size: 0.5rem; letter-spacing: 0.12em; }
  .cc-proof { display: none; }
  .cc-more { left: 50%; transform: translateX(-50%); bottom: 0; font-size: 0.5rem; }
  .cc-card { flex-basis: 100%; border-radius: 22px; }
  .cc-head { padding: 14px 16px 12px; }
  .cc-progress i { width: 10px; }
  .cc-log { padding: 16px 16px 6px; }
  .cc-msg { max-width: 92%; }
  .cc-rail { padding: 4px 16px 8px; }
  .cc-opt { flex: 0 0 78%; }
  .cc-input, .cc-contact { margin: 4px 12px 14px; }
  .cc-fields { grid-template-columns: 1fr; }
}

@keyframes cc-rise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
@keyframes cc-slide-in { from { opacity: 0; transform: translateX(72px); } to { opacity: 1; transform: none; } }
@keyframes cc-slide-out { from { opacity: 1; transform: none; } to { opacity: 0; transform: translateX(-72px); } }
@keyframes cc-nudge { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(6px); } }
@keyframes cc-drift { from { transform: scale(1.02); } to { transform: scale(1.1) translateY(-1.5%); } }
@keyframes cc-breathe { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.35); } }
@media (prefers-reduced-motion: reduce) {
  .cc-msg, .cc-rail, .cc-rail.out, .cc-contact, .cc-avatar i, .cc-video.drift, .cc-hint i { animation: none; }
  .cc-hero, .cc-card, .cc-shade, .cc-proof, .cc-video.loop { transition: none; }
  .cc-opt { transition: none; }
}
`;

export default ConciergeChat;
