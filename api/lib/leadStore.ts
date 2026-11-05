/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Persistance des leads et de leurs conversations.
 *
 * Supabase si configuré, mémoire in-process sinon (dev, et pour que l'app
 * fonctionne sans base). Le fallback mémoire ne survit pas à un cold start :
 * c'est acceptable en dev, pas en production — voir docs/AGENCY_SETUP.md.
 */

import type { BuyingSignal } from './leadScore';
import type { LeadConsent } from './consent';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const LEADS_TABLE = process.env.SUPABASE_LEADS_TABLE || 'leads';

export type StoredLead = {
  id: string;
  /** Clé de déduplication : téléphone en priorité, sinon email. */
  handle: string;
  name?: string;
  email?: string;
  phone?: string;
  advisor_id?: string;
  profile: Record<string, any>;
  /** Historique de conversation, tous canaux. */
  transcript: Array<{ role: 'user' | 'assistant'; content: string; at: string; channel: string }>;
  signals: BuyingSignal[];
  viewed_listings: string[];
  score: number;
  tier: string;
  crm_id?: string;
  /** Cycle de vie commercial, piloté depuis le tableau de bord interne. */
  status: LeadStatus;
  sold_to?: string;
  sold_at?: string;
  sold_price_eur?: number;
  /** Consentements RGPD horodatés et versionnés (voir lib/consent). */
  consent?: LeadConsent;
  created_at: string;
  updated_at: string;
};

/** `new` → `contacted` → `qualified` → `sold`, ou `discarded` à tout moment. */
export type LeadStatus = 'new' | 'contacted' | 'qualified' | 'sold' | 'discarded';

export const LEAD_STATUSES: LeadStatus[] = ['new', 'contacted', 'qualified', 'sold', 'discarded'];

const memory = new Map<string, StoredLead>();

export function hasLeadStore(): boolean {
  return !!SUPABASE_URL && !!SUPABASE_KEY;
}

function headers() {
  return {
    apikey: SUPABASE_KEY as string,
    Authorization: `Bearer ${SUPABASE_KEY as string}`,
    'Content-Type': 'application/json',
  };
}

export function normalizeHandle(input: { phone?: string; email?: string }): string {
  if (input.phone) return input.phone.replace(/[^\d+]/g, '');
  if (input.email) return input.email.trim().toLowerCase();
  return `anon:${Math.random().toString(36).slice(2, 10)}`;
}

export async function getLead(handle: string): Promise<StoredLead | null> {
  if (hasLeadStore()) {
    try {
      const url = `${SUPABASE_URL}/rest/v1/${LEADS_TABLE}?handle=eq.${encodeURIComponent(handle)}&limit=1`;
      const res = await fetch(url, { headers: headers(), signal: AbortSignal.timeout(6_000) });
      if (res.ok) {
        const rows = (await res.json()) as StoredLead[];
        if (rows?.length) return rows[0];
      }
    } catch {
      // On retombe sur la mémoire plutôt que de casser la conversation en cours.
    }
  }
  return memory.get(handle) ?? null;
}

export async function upsertLead(lead: Partial<StoredLead> & { handle: string }): Promise<StoredLead> {
  const now = new Date().toISOString();
  const existing = await getLead(lead.handle);

  const merged: StoredLead = {
    id: existing?.id ?? lead.handle,
    handle: lead.handle,
    name: lead.name ?? existing?.name,
    email: lead.email ?? existing?.email,
    phone: lead.phone ?? existing?.phone,
    advisor_id: lead.advisor_id ?? existing?.advisor_id,
    profile: { ...(existing?.profile ?? {}), ...(lead.profile ?? {}) },
    transcript: lead.transcript ?? existing?.transcript ?? [],
    signals: Array.from(new Set([...(existing?.signals ?? []), ...(lead.signals ?? [])])),
    viewed_listings: Array.from(new Set([...(existing?.viewed_listings ?? []), ...(lead.viewed_listings ?? [])])),
    score: lead.score ?? existing?.score ?? 0,
    tier: lead.tier ?? existing?.tier ?? 'cold',
    crm_id: lead.crm_id ?? existing?.crm_id,
    status: lead.status ?? existing?.status ?? 'new',
    sold_to: lead.sold_to ?? existing?.sold_to,
    sold_at: lead.sold_at ?? existing?.sold_at,
    sold_price_eur: lead.sold_price_eur ?? existing?.sold_price_eur,
    // Remplacement complet : l'appelant fusionne via applyConsent/withdrawAll.
    consent: lead.consent ?? existing?.consent ?? {},
    created_at: existing?.created_at ?? now,
    updated_at: now,
  };

  memory.set(merged.handle, merged);

  if (hasLeadStore()) {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/${LEADS_TABLE}`, {
        method: 'POST',
        headers: { ...headers(), Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify([merged]),
        signal: AbortSignal.timeout(8_000),
      });
      if (!res.ok) {
        console.error('[leadStore] upsert failed', res.status, await res.text());
      }
    } catch (err: any) {
      console.error('[leadStore] upsert error', err?.message ?? err);
    }
  }

  return merged;
}

export async function appendTurn(
  handle: string,
  turn: { role: 'user' | 'assistant'; content: string; channel: string }
): Promise<StoredLead> {
  const existing = await getLead(handle);
  const transcript = [
    ...(existing?.transcript ?? []),
    { ...turn, at: new Date().toISOString() },
  // On borne l'historique : au-delà, la qualification n'apporte plus rien et le
  // contexte coûte cher à chaque tour.
  ].slice(-40);
  return upsertLead({ handle, transcript });
}

/** Leads à re-solliciter par l'agent de veille : joignables et pas encore clos. */
export async function listActiveLeads(limit = 100): Promise<StoredLead[]> {
  if (hasLeadStore()) {
    try {
      const url = `${SUPABASE_URL}/rest/v1/${LEADS_TABLE}?select=*&order=updated_at.desc&limit=${limit}`;
      const res = await fetch(url, { headers: headers(), signal: AbortSignal.timeout(8_000) });
      if (res.ok) return (await res.json()) as StoredLead[];
    } catch {
      // idem : repli mémoire
    }
  }
  return Array.from(memory.values()).slice(0, limit);
}
