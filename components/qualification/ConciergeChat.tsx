import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { UserProfile } from '../../types';
import { AGENTS } from '../AgentsSection';
import ConsentFields from '../ConsentFields';
import { gtm } from '../../services/gtm';
import { useI18n } from '../../i18n';
import { AGENT_TREES, type StepOption, type TreeStep } from './steps';
import { matchAnswer } from './answerMatch';

/**
 * Chat d'accueil : la qualification du visiteur se fait en conversation. Chaque
 * question du conseiller arrive avec ses réponses en un clic ; on peut aussi
 * répondre au clavier (rapprochement local, sans appel à un modèle). Une fois
 * le dossier complet, la fenêtre de chat se transforme en carte.
 */

export type MorphRect = { top: number; left: number; width: number; height: number };

type Props = {
  onSubmit: (profile: UserProfile, from: MorphRect | null) => void;
  /** Le conseiller choisi (pour le suivi de la conversation côté serveur). */
  onAgent?: (agentId: string) => void;
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

const GOLD = '#D4AF37';

const ConciergeChat: React.FC<Props> = ({ onSubmit, onAgent }) => {
  const { t } = useI18n();
  const cardRef = useRef<HTMLDivElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [agentId, setAgentId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [leaving, setLeaving] = useState(false);
  const [typed, setTyped] = useState('');
  /** Réponses libres non reconnues, à afficher dans le fil avec la relance. */
  const [missed, setMissed] = useState<string[]>([]);
  const [contact, setContact] = useState({ name: '', email: '', partners: false });
  const [sending, setSending] = useState(false);
  const started = useRef(false);

  const agent = AGENTS.find(a => a.id === agentId) ?? null;
  const steps: TreeStep[] = agentId ? AGENT_TREES[agentId] ?? [] : [];
  const stepIndex = answers.length; // nombre de questions du conseiller déjà répondues
  const step: TreeStep | null = agentId && stepIndex < steps.length ? steps[stepIndex] : null;
  const atContact = !!agentId && stepIndex >= steps.length;
  const total = (steps.length || 5) + 2; // projet + questions + coordonnées
  const position = agentId ? Math.min(stepIndex + 2, total) : 1;

  const options: Array<{ label: string; desc: string; icon?: StepOption['icon'] }> = !agentId
    ? PROJECT_OPTIONS
    : step
      ? step.options
      : [];

  // Le fil reste calé en bas à chaque nouveau message.
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [answers.length, agentId, missed.length, atContact]);

  const begin = () => {
    if (started.current) return;
    started.current = true;
    gtm.funnelStart();
  };

  /** Valide une réponse (clic ou clavier) et fait glisser les options suivantes. */
  const choose = (index: number, amount?: number) => {
    if (leaving) return;
    begin();
    setLeaving(true);
    setMissed([]);
    window.setTimeout(() => {
      if (!agentId) {
        const p = PROJECT_OPTIONS[index];
        setAgentId(p.agentId);
        onAgent?.(p.agentId);
        gtm.funnelStepComplete('project', 0, p.agentId);
      } else if (step) {
        const o = step.options[index];
        const updates: Partial<UserProfile> = { ...o.updates };
        // Un montant tapé précisément remplace le milieu de tranche.
        if (amount && step.id === 'budget') {
          updates.totalBudget = String(amount);
          updates.initialInvestment = String(Math.round(amount * 0.25));
        }
        setAnswers(prev => [...prev, { stepId: step.id, label: amount && step.id === 'budget' ? `${amount.toLocaleString('fr-FR')} €` : o.label, updates }]);
        gtm.funnelStepComplete(step.id, stepIndex + 1, o.value);
      }
      setLeaving(false);
    }, 260);
  };

  const back = () => {
    if (leaving || sending) return;
    setMissed([]);
    if (answers.length) setAnswers(prev => prev.slice(0, -1));
    else setAgentId(null);
  };

  const sendTyped = (e: React.FormEvent) => {
    e.preventDefault();
    const text = typed.trim();
    if (!text || atContact) return;
    begin();
    setTyped('');
    const hit = matchAnswer(options, text);
    if (hit) choose(hit.index, hit.amount);
    else setMissed(prev => [...prev, text]);
  };

  const finish = (e: React.FormEvent) => {
    e.preventDefault();
    if (sending) return;
    setSending(true);
    const profile: UserProfile = answers.reduce<UserProfile>((acc, a) => ({ ...acc, ...a.updates }), { ...BASE_PROFILE });
    profile.name = contact.name.trim();
    profile.email = contact.email.trim();
    profile.advisorId = agentId ?? undefined;
    profile.consent = { whatsapp: false, partners: contact.partners };
    const r = cardRef.current?.getBoundingClientRect();
    onSubmit(profile, r ? { top: r.top, left: r.left, width: r.width, height: r.height } : null);
  };

  // ── Fil de conversation ──────────────────────────────────────────────────
  const first = agent ? agent.name.split(' ')[0] : '';
  const thread = useMemo(() => {
    const out: Array<{ who: 'ai' | 'me'; text: string; sub?: string; key: string }> = [];
    out.push({
      who: 'ai',
      key: 'q-project',
      text: 'Bonjour. Je prépare votre analyse de l’immobilier à Dubaï en quelques questions. Quel est votre projet ?',
    });
    if (agentId) {
      const p = PROJECT_OPTIONS.find(o => o.agentId === agentId)!;
      out.push({ who: 'me', key: 'a-project', text: p.label });
      const a = AGENTS.find(x => x.id === agentId);
      if (a) out.push({ who: 'ai', key: 'intro', text: `Je suis ${a.name}, votre conseiller ${a.role.toLowerCase()}. ${a.desc}` });
    }
    steps.forEach((s, i) => {
      if (i > answers.length) return;
      out.push({ who: 'ai', key: `q-${s.id}`, text: s.question, sub: i === answers.length ? s.sub : undefined });
      if (i < answers.length) out.push({ who: 'me', key: `a-${s.id}`, text: answers[i].label });
    });
    if (atContact) {
      out.push({
        who: 'ai',
        key: 'q-contact',
        text: 'Votre dossier est complet. À quel nom et à quelle adresse e-mail dois-je l’ouvrir ? La carte s’affiche juste après.',
      });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId, answers, atContact]);

  const railKey = !agentId ? 'project' : step ? step.id : 'contact';

  return (
    <section id="concierge" className="cc-stage" aria-label="Votre conseiller IA">
      <div className="cc-glow" aria-hidden />
      <p className="cc-eyebrow">Votre conseiller IA · {total} questions, puis votre carte de Dubaï</p>

      <div ref={cardRef} className={`cc-card ${sending ? 'sending' : ''}`}>
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
          {thread.map(m => (
            <div key={m.key} className={`cc-msg ${m.who}`}>
              <p>{m.text}</p>
              {m.sub && <small>{m.sub}</small>}
            </div>
          ))}
          {missed.map((text, i) => (
            <React.Fragment key={`miss-${i}`}>
              <div className="cc-msg me">
                <p>{text}</p>
              </div>
              <div className="cc-msg ai">
                <p>
                  Je préfère ne pas deviner{first ? `, c’est ${first} qui vous lit` : ''} : choisissez l’une des réponses
                  ci-dessous, ou reformulez avec un chiffre ou un mot de la réponse.
                </p>
              </div>
            </React.Fragment>
          ))}
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
              {agentId && (
                <button type="button" className="cc-back" onClick={back} aria-label="Revenir à la question précédente">
                  ‹
                </button>
              )}
              <input
                ref={inputRef}
                value={typed}
                onChange={e => setTyped(e.target.value)}
                placeholder="Cliquez une réponse, ou écrivez la vôtre…"
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

      <style>{CSS}</style>
    </section>
  );
};

const sans = '"Manrope",sans-serif';
const display = '"Sora",sans-serif';
const IVORY = '#f0ebe0';

const CSS = `
.cc-stage { position: relative; min-height: 100dvh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; padding: 92px 16px 28px; background: #050810; color: ${IVORY}; font-family: ${sans}; overflow: hidden; isolation: isolate; }
.cc-glow { position: absolute; inset: 0; z-index: -1; pointer-events: none;
  background:
    radial-gradient(ellipse 60% 45% at 50% 42%, rgba(26,43,85,0.75), transparent 70%),
    radial-gradient(ellipse 40% 30% at 50% 100%, rgba(212,175,55,0.12), transparent 70%),
    linear-gradient(rgba(255,255,255,0.028) 1px, transparent 1px) 0 0 / 100% 56px,
    linear-gradient(90deg, rgba(255,255,255,0.028) 1px, transparent 1px) 0 0 / 56px 100%; }
.cc-eyebrow { margin: 0; font: 800 0.64rem ${sans}; letter-spacing: 0.16em; text-transform: uppercase; color: ${GOLD}; text-align: center; }

.cc-card { position: relative; display: flex; flex-direction: column; width: min(940px, 100%); height: min(760px, calc(100dvh - 150px)); min-height: 520px; border-radius: 28px; background: rgba(9,14,28,0.9); border: 1px solid rgba(255,255,255,0.1); box-shadow: 0 40px 120px rgba(0,0,0,0.65), 0 0 0 1px rgba(212,175,55,0.07); backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px); overflow: hidden; transition: opacity 0.35s ease; }
.cc-card::before { content: ''; position: absolute; top: 0; left: 32px; width: 84px; height: 2px; background: ${GOLD}; border-radius: 2px; }
.cc-card.sending { opacity: 0.85; pointer-events: none; }

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
.cc-msg.ai p { font: 600 clamp(1.02rem, 1.7vw, 1.3rem)/1.4 ${display}; color: ${IVORY}; }
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
  .cc-stage { padding: 72px 8px 12px; gap: 8px; justify-content: flex-start; }
  .cc-card { height: calc(100dvh - 112px); border-radius: 22px; }
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
@keyframes cc-breathe { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.35); } }
@media (prefers-reduced-motion: reduce) {
  .cc-msg, .cc-rail, .cc-rail.out, .cc-contact, .cc-avatar i { animation: none; }
  .cc-opt { transition: none; }
}
`;

export default ConciergeChat;
