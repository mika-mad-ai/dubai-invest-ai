/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Alimentation automatique du CRM à chaque interaction.
 *
 * Deux backends au choix, pilotés par les variables d'environnement présentes :
 *   - Airtable  : AIRTABLE_TOKEN + AIRTABLE_BASE_ID (+ AIRTABLE_LEADS_TABLE)
 *   - HubSpot   : HUBSPOT_TOKEN (private app)
 * Si aucun n'est configuré, les appels sont des no-op silencieux : l'app continue
 * de fonctionner, on log simplement que le CRM n'est pas branché.
 */

import { SIGNAL_LABELS, type BuyingSignal, type LeadTier } from './leadScore';

export type CrmLead = {
  name?: string;
  email?: string;
  phone?: string;
  advisorId?: string;
  score: number;
  tier: LeadTier | string;
  estimatedValueEur?: [number, number];
  budget?: string | number;
  objective?: string;
  signals?: BuyingSignal[];
  viewedListings?: string[];
  /** Dernier message du prospect — le plus informatif pour un commercial. */
  lastMessage?: string;
  channel?: string;
  transcriptExcerpt?: string;
};

export type CrmResult = { ok: boolean; backend: string; id?: string; reason?: string };

export function crmBackend(): 'airtable' | 'hubspot' | 'none' {
  if (process.env.AIRTABLE_TOKEN && process.env.AIRTABLE_BASE_ID) return 'airtable';
  if (process.env.HUBSPOT_TOKEN) return 'hubspot';
  return 'none';
}

// ─── Airtable ───────────────────────────────────────────────────────────────

async function pushAirtable(lead: CrmLead): Promise<CrmResult> {
  const token = process.env.AIRTABLE_TOKEN!;
  const baseId = process.env.AIRTABLE_BASE_ID!;
  const table = process.env.AIRTABLE_LEADS_TABLE || 'Leads';

  const fields: Record<string, any> = {
    Nom: lead.name || '',
    Email: lead.email || '',
    Téléphone: lead.phone || '',
    Conseiller: lead.advisorId || '',
    Score: lead.score,
    Qualité: lead.tier,
    'Valeur estimée (€)': lead.estimatedValueEur ? lead.estimatedValueEur[1] : 0,
    Budget: lead.budget ? String(lead.budget) : '',
    Objectif: lead.objective || '',
    'Signaux d\'achat': (lead.signals ?? []).map(s => SIGNAL_LABELS[s] ?? s).join(', '),
    'Biens consultés': (lead.viewedListings ?? []).join(', '),
    Canal: lead.channel || 'web',
    'Dernier message': lead.lastMessage || '',
    Conversation: lead.transcriptExcerpt || '',
  };

  // Airtable upsert natif sur un champ clé : évite les doublons sans lecture préalable.
  const keyField = lead.phone ? 'Téléphone' : 'Email';
  const res = await fetch(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      performUpsert: { fieldsToMergeOn: [keyField] },
      records: [{ fields }],
      typecast: true,
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    return { ok: false, backend: 'airtable', reason: `HTTP ${res.status} ${await res.text()}` };
  }
  const data: any = await res.json();
  return { ok: true, backend: 'airtable', id: data?.records?.[0]?.id };
}

// ─── HubSpot ────────────────────────────────────────────────────────────────

async function pushHubspot(lead: CrmLead): Promise<CrmResult> {
  const token = process.env.HUBSPOT_TOKEN!;
  const properties: Record<string, any> = {
    firstname: (lead.name || '').split(' ')[0] || '',
    lastname: (lead.name || '').split(' ').slice(1).join(' ') || '',
    email: lead.email || '',
    phone: lead.phone || '',
    hs_lead_status: lead.tier === 'qualified' ? 'OPEN_DEAL' : 'NEW',
    // Propriétés personnalisées à créer côté HubSpot (voir docs/AGENCY_SETUP.md)
    dubaiinvest_score: lead.score,
    dubaiinvest_tier: lead.tier,
    dubaiinvest_advisor: lead.advisorId || '',
    dubaiinvest_budget: lead.budget ? String(lead.budget) : '',
    dubaiinvest_objective: lead.objective || '',
    dubaiinvest_signals: (lead.signals ?? []).map(s => SIGNAL_LABELS[s] ?? s).join(', '),
    dubaiinvest_channel: lead.channel || 'web',
  };

  // L'upsert HubSpot se fait par email ; sans email on crée simplement le contact.
  const idProp = lead.email ? `?idProperty=email` : '';
  const url = lead.email
    ? `https://api.hubapi.com/crm/v3/objects/contacts/${encodeURIComponent(lead.email)}${idProp}`
    : 'https://api.hubapi.com/crm/v3/objects/contacts';

  const res = await fetch(url, {
    method: lead.email ? 'PATCH' : 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ properties }),
    signal: AbortSignal.timeout(10_000),
  });

  if (res.status === 404 && lead.email) {
    // Le contact n'existe pas encore : création.
    const create = await fetch('https://api.hubapi.com/crm/v3/objects/contacts', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ properties }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!create.ok) return { ok: false, backend: 'hubspot', reason: `HTTP ${create.status} ${await create.text()}` };
    const created: any = await create.json();
    return { ok: true, backend: 'hubspot', id: created?.id };
  }

  if (!res.ok) {
    return { ok: false, backend: 'hubspot', reason: `HTTP ${res.status} ${await res.text()}` };
  }
  const data: any = await res.json();
  return { ok: true, backend: 'hubspot', id: data?.id };
}

// ─── Entrée publique ────────────────────────────────────────────────────────

export async function pushLeadToCrm(lead: CrmLead): Promise<CrmResult> {
  const backend = crmBackend();
  if (backend === 'none') {
    return { ok: false, backend: 'none', reason: 'Aucun CRM configuré (AIRTABLE_TOKEN ou HUBSPOT_TOKEN)' };
  }
  try {
    return backend === 'airtable' ? await pushAirtable(lead) : await pushHubspot(lead);
  } catch (err: any) {
    return { ok: false, backend, reason: err?.message ?? 'erreur inconnue' };
  }
}
