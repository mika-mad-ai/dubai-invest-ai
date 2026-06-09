/**
 * Google Sheets Lead Service
 * Sends lead data to a Google Apps Script Web App endpoint.
 *
 * Required env var: VITE_GOOGLE_SHEET_WEBHOOK
 * (set in .env.local for dev, in Vercel env vars for prod)
 */

export interface LeadPayload {
  // Identité
  name: string;
  email: string;
  phone: string;
  // Étape 1 — Objectif
  objective?: string;
  // Étape 2 — Budget
  totalBudget?: string;
  // Étape 3 — Horizon
  investmentHorizon?: string;
  // Étape 4 — Risque
  riskLevel?: number;
  // Étape 5 — Zone / profil locataire
  zonePreference?: string;
  // Formulaire final
  initialInvestment?: string;
  monthlyContribution?: string;
  duration?: string;
  propertyStatus?: string;
  roiDelay?: string;
  // Bien sélectionné
  propertyTitle: string;
  propertyUrl: string;
  propertyYield: number;
  propertyLocation: string;
  propertyPrice: number;
  // Meta
  source?: string;
  timestamp?: string;
}

// Labels lisibles pour les valeurs codées
const OBJECTIVE_LABELS: Record<string, string> = {
  rental_income:        'Revenus locatifs',
  capital_gains:        'Plus-value',
  secondary_residence:  'Résidence secondaire + Airbnb',
  golden_visa:          'Golden Visa',
  diversification:      'Protection du patrimoine',
};

const HORIZON_LABELS: Record<string, string> = {
  short:     '1 à 3 ans',
  medium:    '3 à 6 ans',
  long:      '6 à 10 ans',
  permanent: 'Pas de date précise',
};

const ZONE_LABELS: Record<string, string> = {
  high_yield:            'Rendement max (JVC, Dubai South…)',
  capital_appreciation:  'Plus-value (Downtown, DIFC…)',
  premium_lifestyle:     'Premium lifestyle (Palm, Marina…)',
  emerging:              'Quartiers émergents',
  balanced:              'Équilibré',
};

const RISK_LABELS: Record<number, string> = {
  1: 'Très prudent',
  2: 'Prudent',
  3: 'Croissance',
  4: 'Dynamique',
  5: 'Maximum levier',
};

const STATUS_LABELS: Record<string, string> = {
  ready:    'Livré (prêt à louer)',
  'off-plan': 'Sur plan (off-plan)',
};

export function formatPayloadForSheet(p: LeadPayload) {
  return {
    ...p,
    objective:        p.objective        ? (OBJECTIVE_LABELS[p.objective]  ?? p.objective)  : '',
    investmentHorizon: p.investmentHorizon ? (HORIZON_LABELS[p.investmentHorizon] ?? p.investmentHorizon) : '',
    zonePreference:   p.zonePreference   ? (ZONE_LABELS[p.zonePreference]  ?? p.zonePreference)  : '',
    riskLevel:        p.riskLevel        ? (RISK_LABELS[p.riskLevel]       ?? String(p.riskLevel)) : '',
    propertyStatus:   p.propertyStatus   ? (STATUS_LABELS[p.propertyStatus] ?? p.propertyStatus) : '',
  };
}

export async function sendLeadToSheet(payload: LeadPayload): Promise<{ ok: boolean; error?: string }> {
  const webhookUrl = import.meta.env.VITE_GOOGLE_SHEET_WEBHOOK as string | undefined;

  if (!webhookUrl) {
    console.warn('[GoogleSheets] VITE_GOOGLE_SHEET_WEBHOOK is not configured — lead not sent.');
    return { ok: false, error: 'webhook_not_configured' };
  }

  try {
    const body = formatPayloadForSheet({
      ...payload,
      source: payload.source ?? 'DubaiInvest AI Advisor',
      timestamp: payload.timestamp ?? new Date().toISOString(),
    });

    // Google Apps Script requires Content-Type: text/plain to avoid CORS preflight.
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('[GoogleSheets] HTTP error', response.status, text);
      return { ok: false, error: `http_${response.status}` };
    }

    const json = await response.json();
    if (!json.success) {
      console.error('[GoogleSheets] Script error', json.error);
      return { ok: false, error: json.error };
    }

    return { ok: true };
  } catch (err) {
    console.error('[GoogleSheets] Network error', err);
    return { ok: false, error: String(err) };
  }
}
