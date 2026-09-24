/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Bureau des leads — le CRM interne de l'agence.
 *
 * Remplace Airtable et HubSpot : les leads sont déjà dans Supabase, il ne
 * manquait qu'une surface pour les travailler. Page rendue côté serveur, donc
 * rien n'entre dans le bundle public et aucune brique d'authentification n'est
 * nécessaire au-delà du secret.
 *
 * GET  ?key=ADMIN_SECRET              → tableau de bord
 * GET  ?key=…&format=csv              → export CSV (pour livrer un lot à une agence)
 * POST ?key=…  { handle, status, soldTo?, soldPriceEur? }  → met à jour un lead
 *
 * ⚠️ Le secret passe en query string : il apparaît donc dans les logs d'accès.
 * Acceptable pour un outil interne, à remplacer par une vraie session si le
 * bureau doit être ouvert à des tiers.
 */

import { listActiveLeads, upsertLead, LEAD_STATUSES, type LeadStatus, type StoredLead } from './lib/leadStore';
import { SIGNAL_LABELS, type BuyingSignal } from './lib/leadScore';
import { ADVISORS } from './lib/claude';

const TIER_COLORS: Record<string, string> = {
  qualified: '#34d399', hot: '#48cae4', warm: '#fbbf24', cold: '#94a3b8',
};
const STATUS_LABELS: Record<LeadStatus, string> = {
  new: 'Nouveau', contacted: 'Contacté', qualified: 'Qualifié', sold: 'Vendu', discarded: 'Écarté',
};
/** Valeur de revente indicative par palier, alignée sur `leadScore`. */
const TIER_VALUE: Record<string, number> = { qualified: 2000, hot: 1400, warm: 800, cold: 0 };

const esc = (s: unknown): string =>
  String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

const eur = (n: unknown): string => {
  const v = Number(n) || 0;
  return v ? `${v.toLocaleString('fr-FR')} €` : '—';
};

function isAuthorized(req: any): boolean {
  const expected = process.env.ADMIN_SECRET;
  if (!expected) return false; // pas de secret configuré → bureau fermé, pas ouvert
  const provided = req.query?.key || req.headers?.['x-admin-secret'];
  return provided === expected;
}

function ago(iso?: string): string {
  if (!iso) return '—';
  const h = (Date.now() - new Date(iso).getTime()) / 3_600_000;
  if (!Number.isFinite(h)) return '—';
  if (h < 1) return `${Math.round(h * 60)} min`;
  if (h < 48) return `${Math.round(h)} h`;
  return `${Math.round(h / 24)} j`;
}

function lastMessageOf(lead: StoredLead): string {
  for (let i = lead.transcript.length - 1; i >= 0; i--) {
    if (lead.transcript[i].role === 'user') return lead.transcript[i].content;
  }
  return '';
}

function toCsv(leads: StoredLead[]): string {
  const head = [
    'handle', 'nom', 'email', 'telephone', 'conseiller', 'score', 'palier', 'statut',
    'valeur_estimee_eur', 'budget_eur', 'objectif', 'signaux', 'biens_consultes',
    'dernier_message', 'cree_le', 'maj_le', 'vendu_a', 'prix_vente_eur',
  ];
  const cell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`;
  const rows = leads.map(l => [
    l.handle, l.name, l.email, l.phone,
    ADVISORS[(l.advisor_id as keyof typeof ADVISORS)]?.name ?? l.advisor_id,
    l.score, l.tier, l.status, TIER_VALUE[l.tier] ?? 0,
    (l.profile as any)?.totalBudget, (l.profile as any)?.objective,
    (l.signals ?? []).map(s => SIGNAL_LABELS[s as BuyingSignal] ?? s).join(' | '),
    (l.viewed_listings ?? []).join(' | '),
    lastMessageOf(l), l.created_at, l.updated_at, l.sold_to, l.sold_price_eur,
  ].map(cell).join(','));
  return [head.join(','), ...rows].join('\n');
}

function page(leads: StoredLead[], filters: { tier?: string; status?: string }, key: string): string {
  const pipelineValue = leads
    .filter(l => l.status !== 'sold' && l.status !== 'discarded')
    .reduce((sum, l) => sum + (TIER_VALUE[l.tier] ?? 0), 0);
  const sold = leads.filter(l => l.status === 'sold');
  const revenue = sold.reduce((s, l) => s + (Number(l.sold_price_eur) || 0), 0);

  const counts = LEAD_STATUSES.map(s => ({ s, n: leads.filter(l => l.status === s).length }));

  const rows = leads.map(l => {
    const tierColor = TIER_COLORS[l.tier] ?? '#94a3b8';
    const signals = (l.signals ?? []).map(s => SIGNAL_LABELS[s as BuyingSignal] ?? s);
    return `<tr>
  <td>
    <div class="name">${esc(l.name || '—')}</div>
    <div class="meta">${esc(l.email || '')}${l.email && l.phone ? ' · ' : ''}${esc(l.phone || '')}</div>
  </td>
  <td>${esc(ADVISORS[(l.advisor_id as keyof typeof ADVISORS)]?.name ?? l.advisor_id ?? '—')}</td>
  <td class="num"><span class="score" style="--c:${tierColor}">${l.score}</span>
    <div class="meta" style="color:${tierColor}">${esc(l.tier)}</div></td>
  <td class="num">${eur(TIER_VALUE[l.tier])}</td>
  <td>${eur((l.profile as any)?.totalBudget)}<div class="meta">${esc((l.profile as any)?.objective || '')}</div></td>
  <td>${signals.length ? signals.map(s => `<span class="sig">${esc(s)}</span>`).join('') : '<span class="meta">aucun</span>'}</td>
  <td class="msg">${esc(lastMessageOf(l).slice(0, 160)) || '<span class="meta">—</span>'}</td>
  <td class="num meta">${esc(ago(l.updated_at))}</td>
  <td>
    <form method="post" action="?key=${encodeURIComponent(key)}">
      <input type="hidden" name="handle" value="${esc(l.handle)}">
      <select name="status">
        ${LEAD_STATUSES.map(s => `<option value="${s}"${s === l.status ? ' selected' : ''}>${STATUS_LABELS[s]}</option>`).join('')}
      </select>
      <input name="soldTo" placeholder="agence" value="${esc(l.sold_to || '')}" size="8">
      <input name="soldPriceEur" placeholder="€" value="${esc(l.sold_price_eur || '')}" size="4" inputmode="numeric">
      <button type="submit">OK</button>
    </form>
  </td>
</tr>`;
  }).join('');

  const chip = (label: string, param: string, value: string, active: boolean) =>
    `<a class="chip${active ? ' on' : ''}" href="?key=${encodeURIComponent(key)}&${param}=${encodeURIComponent(value)}">${esc(label)}</a>`;

  return `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Bureau des leads — DubaiInvest</title>
<style>
:root{--bg:#0a0a12;--card:rgba(255,255,255,.03);--line:rgba(255,255,255,.08);--tx:#f0ebe0;--dim:rgba(240,235,224,.5);--gold:#D4AF37}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--tx);font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;padding:24px}
h1{font-size:1.4rem;margin:0 0 4px}
.sub{color:var(--dim);font-size:.8rem;margin-bottom:20px}
.kpis{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:20px}
.kpi{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px 16px;min-width:140px}
.kpi .v{font-size:1.5rem;font-weight:700}
.kpi .l{color:var(--dim);font-size:.68rem;text-transform:uppercase;letter-spacing:.08em}
.filters{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px;align-items:center}
.chip{color:var(--dim);text-decoration:none;border:1px solid var(--line);border-radius:999px;padding:4px 12px;font-size:.72rem}
.chip.on{color:var(--bg);background:var(--gold);border-color:var(--gold);font-weight:700}
table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line);border-radius:12px;overflow:hidden}
th,td{padding:10px 12px;text-align:left;border-bottom:1px solid var(--line);vertical-align:top}
th{font-size:.66rem;text-transform:uppercase;letter-spacing:.08em;color:var(--dim);font-weight:700;white-space:nowrap}
tr:last-child td{border-bottom:none}
.num{text-align:right;white-space:nowrap}
.name{font-weight:600}
.meta{color:var(--dim);font-size:.72rem}
.score{font-weight:800;color:var(--c)}
.sig{display:inline-block;background:rgba(212,175,55,.1);border:1px solid rgba(212,175,55,.25);color:var(--gold);border-radius:6px;padding:1px 6px;font-size:.66rem;margin:1px 2px 1px 0}
.msg{max-width:280px;font-size:.78rem;color:rgba(240,235,224,.75)}
form{display:flex;gap:4px;align-items:center}
select,input,button{background:rgba(0,0,0,.35);color:var(--tx);border:1px solid var(--line);border-radius:6px;padding:4px 6px;font-size:.72rem}
button{background:var(--gold);color:#0a0a12;font-weight:700;cursor:pointer;border-color:var(--gold)}
a.dl{color:var(--gold);font-size:.75rem;text-decoration:none;margin-left:auto}
.empty{padding:40px;text-align:center;color:var(--dim)}
</style></head><body>
<h1>Bureau des leads</h1>
<div class="sub">${leads.length} dossier${leads.length > 1 ? 's' : ''} · les paliers et scores viennent de <code>leadScore.ts</code></div>

<div class="kpis">
  <div class="kpi"><div class="v">${eur(pipelineValue)}</div><div class="l">Pipeline non vendu</div></div>
  <div class="kpi"><div class="v">${eur(revenue)}</div><div class="l">Encaissé (${sold.length} vendu${sold.length > 1 ? 's' : ''})</div></div>
  ${counts.map(c => `<div class="kpi"><div class="v">${c.n}</div><div class="l">${STATUS_LABELS[c.s]}</div></div>`).join('')}
</div>

<div class="filters">
  ${chip('Tous', 'tier', '', !filters.tier && !filters.status)}
  ${['qualified', 'hot', 'warm', 'cold'].map(t => chip(t, 'tier', t, filters.tier === t)).join('')}
  ${LEAD_STATUSES.map(s => chip(STATUS_LABELS[s], 'status', s, filters.status === s)).join('')}
  <a class="dl" href="?key=${encodeURIComponent(key)}&format=csv${filters.tier ? `&tier=${filters.tier}` : ''}${filters.status ? `&status=${filters.status}` : ''}">↓ Export CSV</a>
</div>

${leads.length ? `<table>
<thead><tr><th>Contact</th><th>Conseiller</th><th>Score</th><th>Valeur</th><th>Budget / objectif</th><th>Signaux d'achat</th><th>Dernier message</th><th>Activité</th><th>Statut</th></tr></thead>
<tbody>${rows}</tbody></table>`
: '<div class="empty">Aucun lead pour ce filtre.</div>'}
</body></html>`;
}

export default async function handler(req: any, res: any) {
  if (!isAuthorized(req)) {
    res.status(401).json({
      error: 'Unauthorized',
      hint: process.env.ADMIN_SECRET ? 'Paramètre ?key= invalide' : 'ADMIN_SECRET non configuré',
    });
    return;
  }

  const key = String(req.query?.key ?? '');

  // ── Mise à jour du statut d'un lead ───────────────────────────────────────
  if (req.method === 'POST') {
    const body = typeof req.body === 'string' ? Object.fromEntries(new URLSearchParams(req.body)) : (req.body || {});
    const handle = String(body.handle ?? '');
    const status = String(body.status ?? '') as LeadStatus;

    if (!handle || !LEAD_STATUSES.includes(status)) {
      res.status(400).json({ ok: false, reason: 'handle ou status invalide' });
      return;
    }

    const soldPrice = Number(String(body.soldPriceEur ?? '').replace(/[^\d.]/g, '')) || undefined;
    await upsertLead({
      handle,
      status,
      sold_to: body.soldTo ? String(body.soldTo) : undefined,
      sold_price_eur: soldPrice,
      sold_at: status === 'sold' ? new Date().toISOString() : undefined,
    });

    // Redirection pour éviter le renvoi de formulaire au rechargement.
    res.statusCode = 303;
    res.setHeader('Location', `/api/leads-desk?key=${encodeURIComponent(key)}`);
    res.end();
    return;
  }

  const tier = req.query?.tier ? String(req.query.tier) : undefined;
  const status = req.query?.status ? String(req.query.status) : undefined;

  let leads = await listActiveLeads(500);
  if (tier) leads = leads.filter(l => l.tier === tier);
  if (status) leads = leads.filter(l => l.status === status);
  leads.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  if (req.query?.format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="leads-dubaiinvest.csv"`);
    res.status(200).send(toCsv(leads));
    return;
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).send(page(leads, { tier, status }, key));
}
