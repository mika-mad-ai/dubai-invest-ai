/* eslint-disable @typescript-eslint/no-explicit-any */
import { createHmac, timingSafeEqual } from 'crypto';

/**
 * WhatsApp Business — envoi et normalisation des messages entrants.
 *
 * Deux fournisseurs supportés, choisis selon les variables présentes :
 *   - Twilio     : TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_WHATSAPP_FROM
 *   - 360dialog  : D360_API_KEY
 * Sans configuration, `sendWhatsApp` renvoie ok:false sans lever : le reste du
 * pipeline (scoring, CRM) continue de tourner.
 */

export type WaProvider = 'twilio' | '360dialog' | 'none';

export function waProvider(): WaProvider {
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_WHATSAPP_FROM) {
    return 'twilio';
  }
  if (process.env.D360_API_KEY) return '360dialog';
  return 'none';
}

export type SendResult = { ok: boolean; provider: WaProvider; id?: string; reason?: string };

/** Normalise en E.164 sans préfixe `whatsapp:`. */
export function normalizePhone(raw: string): string {
  const cleaned = (raw || '').replace(/^whatsapp:/i, '').replace(/[^\d+]/g, '');
  return cleaned.startsWith('+') ? cleaned : `+${cleaned}`;
}

async function sendTwilio(to: string, body: string): Promise<SendResult> {
  const sid = process.env.TWILIO_ACCOUNT_SID!;
  const token = process.env.TWILIO_AUTH_TOKEN!;
  const from = process.env.TWILIO_WHATSAPP_FROM!;

  const form = new URLSearchParams({
    From: from.startsWith('whatsapp:') ? from : `whatsapp:${normalizePhone(from)}`,
    To: `whatsapp:${normalizePhone(to)}`,
    Body: body,
  });

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form,
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) return { ok: false, provider: 'twilio', reason: `HTTP ${res.status} ${await res.text()}` };
  const data: any = await res.json();
  return { ok: true, provider: 'twilio', id: data?.sid };
}

async function send360(to: string, body: string): Promise<SendResult> {
  const key = process.env.D360_API_KEY!;
  const res = await fetch('https://waba-v2.360dialog.io/messages', {
    method: 'POST',
    headers: { 'D360-API-KEY': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: normalizePhone(to).replace('+', ''),
      type: 'text',
      text: { body, preview_url: true },
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) return { ok: false, provider: '360dialog', reason: `HTTP ${res.status} ${await res.text()}` };
  const data: any = await res.json();
  return { ok: true, provider: '360dialog', id: data?.messages?.[0]?.id };
}

export async function sendWhatsApp(to: string, body: string): Promise<SendResult> {
  const provider = waProvider();
  if (provider === 'none') {
    return { ok: false, provider: 'none', reason: 'WhatsApp non configuré (TWILIO_* ou D360_API_KEY)' };
  }
  // WhatsApp tronque au-delà de 4096 caractères : on coupe proprement en amont.
  const text = body.length > 4000 ? `${body.slice(0, 3990)}…` : body;
  try {
    return provider === 'twilio' ? await sendTwilio(to, text) : await send360(to, text);
  } catch (err: any) {
    return { ok: false, provider, reason: err?.message ?? 'erreur inconnue' };
  }
}

// ─── Messages modèles (hors fenêtre de 24 h) ────────────────────────────────

/**
 * Règle WhatsApp Business : le texte libre n'est autorisé que dans les 24 h
 * suivant le dernier message du contact (« fenêtre de service client »). Au-delà,
 * seul un modèle pré-approuvé par Meta passe — un envoi libre est rejeté.
 *
 * C'est structurant pour la veille nocturne, qui s'adresse par construction à des
 * prospects silencieux depuis plusieurs jours : elle doit passer par un modèle,
 * et Claude ne rédige alors que les variables, pas la phrase.
 */
export const SERVICE_WINDOW_HOURS = 24;

export function isInsideServiceWindow(lastInboundAt?: string | null): boolean {
  if (!lastInboundAt) return false;
  const hours = (Date.now() - new Date(lastInboundAt).getTime()) / 3_600_000;
  return Number.isFinite(hours) && hours < SERVICE_WINDOW_HOURS;
}

async function sendTwilioTemplate(to: string, contentSid: string, vars: string[]): Promise<SendResult> {
  const sid = process.env.TWILIO_ACCOUNT_SID!;
  const token = process.env.TWILIO_AUTH_TOKEN!;
  const from = process.env.TWILIO_WHATSAPP_FROM!;

  // Twilio attend les variables indexées à partir de « 1 », en JSON.
  const contentVariables = Object.fromEntries(vars.map((v, i) => [String(i + 1), v]));

  const form = new URLSearchParams({
    From: from.startsWith('whatsapp:') ? from : `whatsapp:${normalizePhone(from)}`,
    To: `whatsapp:${normalizePhone(to)}`,
    ContentSid: contentSid,
    ContentVariables: JSON.stringify(contentVariables),
  });

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form,
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) return { ok: false, provider: 'twilio', reason: `HTTP ${res.status} ${await res.text()}` };
  const data: any = await res.json();
  return { ok: true, provider: 'twilio', id: data?.sid };
}

async function send360Template(to: string, name: string, lang: string, vars: string[]): Promise<SendResult> {
  const key = process.env.D360_API_KEY!;
  const res = await fetch('https://waba-v2.360dialog.io/messages', {
    method: 'POST',
    headers: { 'D360-API-KEY': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: normalizePhone(to).replace('+', ''),
      type: 'template',
      template: {
        name,
        language: { code: lang },
        components: [{ type: 'body', parameters: vars.map(text => ({ type: 'text', text })) }],
      },
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) return { ok: false, provider: '360dialog', reason: `HTTP ${res.status} ${await res.text()}` };
  const data: any = await res.json();
  return { ok: true, provider: '360dialog', id: data?.messages?.[0]?.id };
}

/**
 * Envoie un message modèle. Le modèle doit être approuvé au préalable côté Meta.
 * - Twilio     : `WHATSAPP_TEMPLATE_ALERT_SID` (Content SID, commence par HX…)
 * - 360dialog  : `WHATSAPP_TEMPLATE_ALERT_NAME` + `WHATSAPP_TEMPLATE_LANG`
 */
export async function sendWhatsAppTemplate(to: string, vars: string[]): Promise<SendResult> {
  const provider = waProvider();
  if (provider === 'none') {
    return { ok: false, provider: 'none', reason: 'WhatsApp non configuré' };
  }
  // Les variables de modèle ne peuvent contenir ni saut de ligne ni tabulation,
  // et Meta rejette les espaces consécutifs.
  const clean = vars.map(v => v.replace(/\s+/g, ' ').trim().slice(0, 900));

  try {
    if (provider === 'twilio') {
      const sid = process.env.WHATSAPP_TEMPLATE_ALERT_SID;
      if (!sid) return { ok: false, provider, reason: 'WHATSAPP_TEMPLATE_ALERT_SID non configuré' };
      return await sendTwilioTemplate(to, sid, clean);
    }
    const name = process.env.WHATSAPP_TEMPLATE_ALERT_NAME;
    if (!name) return { ok: false, provider, reason: 'WHATSAPP_TEMPLATE_ALERT_NAME non configuré' };
    return await send360Template(to, name, process.env.WHATSAPP_TEMPLATE_LANG || 'fr', clean);
  } catch (err: any) {
    return { ok: false, provider, reason: err?.message ?? 'erreur inconnue' };
  }
}

// ─── Authenticité des entrants ──────────────────────────────────────────────

/**
 * Le webhook entrant déclenche un appel Claude payant : sans vérification,
 * n'importe qui peut le marteler avec de faux messages.
 *
 * Deux mécanismes, du plus fort au plus simple :
 *   1. signature HMAC Twilio (`X-Twilio-Signature`) — cryptographique, automatique
 *      dès que `TWILIO_AUTH_TOKEN` est présent ;
 *   2. jeton partagé en query string (`?token=WHATSAPP_VERIFY_TOKEN`) — à ajouter
 *      soi-même à l'URL de webhook dans la console du fournisseur. Fonctionne avec
 *      n'importe quel fournisseur, y compris 360dialog.
 *
 * Si aucun des deux n'est configurable, on refuse : un endpoint payant ne doit
 * pas être ouvert par défaut.
 */
export function verifyInbound(req: any): { ok: true; via: string } | { ok: false; reason: string } {
  // 1. Signature Twilio
  const sig = req.headers?.['x-twilio-signature'];
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (sig && token) {
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const url = `${proto}://${host}${req.url}`;

    // Twilio signe : URL + concaténation des paramètres triés par clé.
    const params = (req.body && typeof req.body === 'object') ? req.body : {};
    const payload = Object.keys(params).sort().reduce((acc, k) => acc + k + String(params[k]), url);

    const expected = createHmac('sha1', token).update(Buffer.from(payload, 'utf8')).digest('base64');
    const a = Buffer.from(expected);
    const b = Buffer.from(String(sig));
    const valid = a.length === b.length && timingSafeEqual(a, b);
    return valid ? { ok: true, via: 'signature Twilio' } : { ok: false, reason: 'signature Twilio invalide' };
  }

  // 2. Jeton partagé
  const shared = process.env.WHATSAPP_VERIFY_TOKEN;
  if (shared) {
    const provided = req.query?.token || req.headers?.['x-webhook-token'];
    return provided === shared
      ? { ok: true, via: 'jeton partagé' }
      : { ok: false, reason: 'jeton de webhook absent ou invalide' };
  }

  return {
    ok: false,
    reason: 'aucun moyen de vérification configuré — définir TWILIO_AUTH_TOKEN ou WHATSAPP_VERIFY_TOKEN',
  };
}

// ─── Entrants ───────────────────────────────────────────────────────────────

export type InboundMessage = {
  from: string;
  text: string;
  name?: string;
  providerMessageId?: string;
};

/**
 * Normalise un webhook entrant, quel que soit le fournisseur.
 * Twilio poste du form-urlencoded (From, Body, ProfileName) ;
 * 360dialog et Meta postent la structure Cloud API (entry/changes/value/messages).
 */
export function parseInbound(body: any): InboundMessage | null {
  if (!body) return null;

  // Twilio
  if (body.From && (body.Body !== undefined)) {
    const text = String(body.Body ?? '').trim();
    if (!text) return null;
    return {
      from: normalizePhone(String(body.From)),
      text,
      name: body.ProfileName ? String(body.ProfileName) : undefined,
      providerMessageId: body.MessageSid ? String(body.MessageSid) : undefined,
    };
  }

  // Cloud API (360dialog / Meta)
  const value = body?.entry?.[0]?.changes?.[0]?.value;
  const msg = value?.messages?.[0];
  if (msg) {
    // On ignore les accusés de lecture et les types non textuels.
    const text = msg?.text?.body ?? msg?.button?.text ?? msg?.interactive?.list_reply?.title;
    if (!text) return null;
    return {
      from: normalizePhone(String(msg.from)),
      text: String(text).trim(),
      name: value?.contacts?.[0]?.profile?.name,
      providerMessageId: msg.id,
    };
  }

  return null;
}
