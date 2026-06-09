/* eslint-disable @typescript-eslint/no-explicit-any */
const DLD_RESOURCE_ID = process.env.DLD_RESOURCE_ID || 'a37511b0-ea36-485d-bccd-2d6cb24507e7';
const DLD_OAUTH_URL =
  process.env.DLD_OAUTH_URL ||
  'https://api.dubaipulse.gov.ae/oauth/client_credential/accesstoken?grant_type=client_credentials';
const DLD_CKAN_BASE = process.env.DLD_CKAN_BASE || 'https://www.dubaipulse.gov.ae/api/3/action';

const DATE_FIELDS = [
  'instance_date',
  'transaction_date',
  'procedure_date',
  'registration_date',
  'trans_date',
  'date'
];

const VALUE_FIELDS = [
  'actual_worth',
  'amount',
  'amount_aed',
  'transaction_amount',
  'transaction_value',
  'value'
];

const TYPE_HINTS = ['type', 'group', 'procedure', 'category', 'transaction'];
const SALE_TERMS = ['sale', 'sales', 'sell', 'selling', 'buy', 'mubayaa', 'مبايعة', 'بيع'];
const EXCLUDE_TERMS = ['mortgage', 'gift', 'inheritance', 'merge', 'separation'];

function parseNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return 0;
  const normalized = value.replace(/,/g, '').trim();
  const num = Number(normalized);
  return Number.isFinite(num) ? num : 0;
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function weekStartISO(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

function getTypeBlob(record: Record<string, any>): string {
  return Object.entries(record)
    .filter(([k, v]) => TYPE_HINTS.some(h => k.toLowerCase().includes(h)) && typeof v === 'string')
    .map(([, v]) => String(v).toLowerCase())
    .join(' | ');
}

function isLikelySale(record: Record<string, any>): boolean {
  const blob = getTypeBlob(record);
  if (!blob) return true;
  if (EXCLUDE_TERMS.some(term => blob.includes(term))) return false;
  return SALE_TERMS.some(term => blob.includes(term));
}

async function getAccessToken(): Promise<string | null> {
  if (process.env.DLD_ACCESS_TOKEN) return process.env.DLD_ACCESS_TOKEN;
  const clientId = process.env.DLD_API_KEY;
  const clientSecret = process.env.DLD_API_SECRET;
  if (!clientId || !clientSecret) return null;

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret
  });

  const tokenRes = await fetch(DLD_OAUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });

  if (!tokenRes.ok) return null;
  const tokenJson = await tokenRes.json();
  return tokenJson?.access_token || null;
}

async function fetchDldRecords(token: string | null, dateStart: string, dateEnd: string): Promise<Record<string, any>[]> {
  const headers: Record<string, string> = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
    headers['x-access-token'] = token;
  }

  for (const dateField of DATE_FIELDS) {
    const sql = `SELECT * FROM "${DLD_RESOURCE_ID}" WHERE "${dateField}" >= '${dateStart}' AND "${dateField}" <= '${dateEnd}' LIMIT 200000`;
    const url = `${DLD_CKAN_BASE}/datastore_search_sql?sql=${encodeURIComponent(sql)}`;
    const res = await fetch(url, { headers });
    if (!res.ok) continue;
    const json = await res.json();
    if (!json?.success) continue;
    const records = json?.result?.records;
    if (Array.isArray(records) && records.length > 0) return records;
  }

  return [];
}

function aggregateWeekly(records: Record<string, any>[]): Array<{ week: string; salesCount: number; avgPrice: number }> {
  const buckets = new Map<string, { count: number; total: number }>();

  for (const record of records) {
    if (!isLikelySale(record)) continue;

    const dateField = DATE_FIELDS.find(key => key in record);
    const date = parseDate(dateField ? record[dateField] : null);
    if (!date) continue;

    const valueField = VALUE_FIELDS.find(key => key in record);
    const amount = parseNumber(valueField ? record[valueField] : null);
    if (amount <= 0) continue;

    const week = weekStartISO(date);
    const current = buckets.get(week) || { count: 0, total: 0 };
    current.count += 1;
    current.total += amount;
    buckets.set(week, current);
  }

  return Array.from(buckets.entries())
    .map(([week, v]) => ({
      week,
      salesCount: v.count,
      avgPrice: v.count > 0 ? v.total / v.count : 0
    }))
    .sort((a, b) => a.week.localeCompare(b.week));
}

function buildResponse(weekly: Array<{ week: string; salesCount: number; avgPrice: number }>) {
  const conflictDate = new Date('2025-06-13T00:00:00Z');
  const conflictWeekStart = weekStartISO(conflictDate);
  const conflictWeekIndex = weekly.findIndex(w => w.week === conflictWeekStart);

  const preWeeks = 5;
  const postWeeks = 5;
  const fallbackConflictIndex = Math.max(preWeeks, Math.floor(weekly.length / 2));
  const idx = conflictWeekIndex >= 0 ? conflictWeekIndex : fallbackConflictIndex;
  const start = Math.max(0, idx - preWeeks);
  const end = Math.min(weekly.length, idx + postWeeks + 1);
  const windowed = weekly.slice(start, end);
  const center = idx - start;

  const immediateData = windowed.map((w, i) => {
    const relative = i - center;
    const period = relative === 0 ? 'S0' : relative > 0 ? `S+${relative}` : `S${relative}`;
    return {
      period,
      weekStart: w.week,
      avgPrice: Math.round(w.avgPrice),
      salesVolume: w.salesCount
    };
  });

  const pre = windowed.filter((_, i) => i < center);
  const post = windowed.filter((_, i) => i > center);
  const preAvg = pre.length ? pre.reduce((acc, x) => acc + x.avgPrice, 0) / pre.length : 0;
  const postAvg = post.length ? post.reduce((acc, x) => acc + x.avgPrice, 0) / post.length : 0;
  const shockPct = preAvg > 0 ? ((postAvg - preAvg) / preAvg) * 100 : 0;

  const mediumTermProjection = Array.from({ length: 8 }, (_, i) => {
    const quarter = i + 1;
    const decay = Math.exp(-0.24 * i);
    return {
      quarter: `T+${quarter}`,
      impactPct: Number((shockPct * decay).toFixed(2))
    };
  });

  return {
    live: true,
    source: 'Dubai Land Department (DLD) via Dubai Pulse API',
    conflictDate: '2025-06-13',
    generatedAt: new Date().toISOString(),
    immediateData,
    mediumTermProjection
  };
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const token = await getAccessToken();
    const dateStart = (req.query?.dateStart as string) || '2025-05-01';
    const dateEnd = (req.query?.dateEnd as string) || '2025-08-31';
    const records = await fetchDldRecords(token, dateStart, dateEnd);

    if (!records.length) {
      res.status(200).json({
        live: false,
        source: 'DLD unreachable or unauthorized',
        generatedAt: new Date().toISOString(),
        reason:
          'Configure DLD_API_KEY + DLD_API_SECRET (or DLD_ACCESS_TOKEN) in Vercel project env to enable live DLD ingestion.'
      });
      return;
    }

    const weekly = aggregateWeekly(records);
    res.status(200).json(buildResponse(weekly));
  } catch (error: any) {
    res.status(200).json({
      live: false,
      source: 'DLD API error',
      generatedAt: new Date().toISOString(),
      reason: error?.message || 'Unknown error'
    });
  }
}
