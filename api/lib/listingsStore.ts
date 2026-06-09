/* eslint-disable @typescript-eslint/no-explicit-any */

type ListingsPayload = {
  live: boolean;
  source: string;
  fetchedAt: string;
  listings: any[];
  statuses: any[];
};

let memorySnapshot: { key: string; payload: ListingsPayload; updatedAt: string } | null = null;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TABLE = process.env.SUPABASE_LISTINGS_TABLE || 'live_listings_snapshots';

function hasSupabase() {
  return !!SUPABASE_URL && !!SUPABASE_SERVICE_ROLE_KEY;
}

function headers() {
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY as string,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY as string}`,
    'Content-Type': 'application/json'
  };
}

export async function saveListingsSnapshot(key: string, payload: ListingsPayload) {
  const nowIso = new Date().toISOString();
  memorySnapshot = { key, payload, updatedAt: nowIso };

  if (!hasSupabase()) return { persisted: false, backend: 'memory' as const };

  const body = [{ key, payload, updated_at: nowIso }];
  const url = `${SUPABASE_URL}/rest/v1/${TABLE}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      ...headers(),
      Prefer: 'resolution=merge-duplicates,return=minimal'
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase upsert failed: ${res.status} ${text}`);
  }

  return { persisted: true, backend: 'supabase' as const };
}

export async function getLatestListingsSnapshot(key: string) {
  if (hasSupabase()) {
    const url = `${SUPABASE_URL}/rest/v1/${TABLE}?key=eq.${encodeURIComponent(
      key
    )}&select=payload,updated_at&order=updated_at.desc&limit=1`;
    const res = await fetch(url, { headers: headers() });
    if (res.ok) {
      const rows = (await res.json()) as Array<{ payload: ListingsPayload; updated_at: string }>;
      if (rows?.length) return { payload: rows[0].payload, updatedAt: rows[0].updated_at, backend: 'supabase' as const };
    }
  }

  if (memorySnapshot?.key === key) {
    return { payload: memorySnapshot.payload, updatedAt: memorySnapshot.updatedAt, backend: 'memory' as const };
  }

  return null;
}

export function getStoreInfo() {
  return {
    supabaseConfigured: hasSupabase(),
    table: TABLE
  };
}
