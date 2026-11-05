/**
 * Client du conseiller IA (Claude) — remplace l'ancien chat Gemini côté frontend.
 *
 * Le prompt, la clé API et les données marché restent côté serveur : le navigateur
 * ne voit qu'un flux SSE de texte. C'est ce qui permet d'injecter les annonces
 * réelles et les transactions DLD sans les exposer publiquement.
 */

import { UserProfile } from '../types';

export type MatchedListing = {
  id: string;
  title: string;
  location: string;
  price: number;
  beds: number;
  sqm: number;
  yield: number;
  netYield: number | null;
  image: string;
  sourceUrl: string;
  completion: string;
  type?: string;
  lat?: number | null;
  lng?: number | null;
  matchScore: number;
  matchReasons: string[];
  priceVerdict: string;
  priceCode: 'well_below' | 'below' | 'fair' | 'above' | 'well_above' | 'unknown';
};

export type MarketSummary = {
  avgPriceSqft?: number;
  volume?: number;
  period?: string;
  trend?: string;
};

export type AgentMeta = {
  advisor: { id: string; name: string; role: string };
  listings: MatchedListing[];
  market?: MarketSummary;
  sources: { listings: string; market: string };
};

export type WireMessage = { role: 'user' | 'assistant'; content: string };

export type StreamHandlers = {
  onMeta?: (meta: AgentMeta) => void;
  onText?: (chunk: string) => void;
  onDone?: (info: { citations: Array<{ title: string; uri: string }> }) => void;
  onError?: (message: string) => void;
};

/**
 * Ouvre un tour de conversation en streaming.
 * `messages` vide = ouverture du dossier (le conseiller parle en premier).
 */
export async function streamAdvisor(
  opts: {
    advisorId?: string;
    profile: UserProfile;
    messages: WireMessage[];
    language?: string;
    /**
     * Biens déjà présentés au prospect. Le serveur s'en sert pour n'injecter que
     * les nouveautés, sans réécrire le préfixe de conversation (ce qui casserait
     * le cache de prompt).
     */
    knownListingIds?: string[];
    signal?: AbortSignal;
  },
  handlers: StreamHandlers
): Promise<void> {
  let response: Response;
  try {
    response = await fetch('/api/agent-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        advisorId: opts.advisorId ?? opts.profile.advisorId,
        profile: opts.profile,
        messages: opts.messages,
        language: opts.language ?? 'français',
        knownListingIds: opts.knownListingIds ?? [],
      }),
      signal: opts.signal,
    });
  } catch (err) {
    handlers.onError?.(err instanceof Error ? err.message : 'Conseiller injoignable');
    return;
  }

  // L'endpoint répond en JSON (et non en SSE) quand il n'est pas configuré.
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/event-stream')) {
    let reason = `Conseiller indisponible (HTTP ${response.status})`;
    try {
      const data = await response.json();
      if (data?.reason) reason = data.reason;
    } catch {
      /* réponse non JSON : on garde le message par défaut */
    }
    handlers.onError?.(reason);
    return;
  }

  const reader = response.body?.getReader();
  if (!reader) {
    handlers.onError?.('Flux de réponse indisponible');
    return;
  }

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // Les événements SSE sont séparés par une ligne vide.
    const parts = buffer.split('\n\n');
    buffer = parts.pop() ?? '';

    for (const part of parts) {
      const line = part.split('\n').find(l => l.startsWith('data:'));
      if (!line) continue;
      let payload: any;
      try {
        payload = JSON.parse(line.slice(5).trim());
      } catch {
        continue;
      }
      switch (payload.type) {
        case 'meta':
          handlers.onMeta?.(payload as AgentMeta);
          break;
        case 'text':
          handlers.onText?.(payload.text as string);
          break;
        case 'done':
          handlers.onDone?.({ citations: payload.citations ?? [] });
          break;
        case 'error':
          handlers.onError?.(payload.message ?? 'Erreur du conseiller');
          break;
      }
    }
  }
}

export type LeadCaptureResult = {
  ok: boolean;
  score?: number;
  tier?: 'cold' | 'warm' | 'hot' | 'qualified';
  missing?: string[];
  advisor?: { id: string; name: string; role: string };
  reason?: string;
};

/** Enregistre le lead : scoring, CRM, et premier contact WhatsApp si consenti. */
export async function captureLead(opts: {
  profile: UserProfile & { phone?: string };
  advisorId?: string;
  viewedListings?: string[];
  messageCount?: number;
  consentWhatsApp?: boolean;
}): Promise<LeadCaptureResult> {
  try {
    const res = await fetch('/api/lead', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(opts),
    });
    const data = await res.json();
    return data as LeadCaptureResult;
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : 'Enregistrement impossible' };
  }
}
