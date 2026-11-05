/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Rassemble le contexte marché live d'un dossier : annonces réelles scorées
 * + résumé des transactions DLD. Partagé par le chat web, l'agent WhatsApp
 * et l'agent de veille, pour qu'ils raisonnent tous sur les mêmes données.
 */

import { appUrl } from './appUrl';
import { matchListings, type MatchProfile, type ScoredListing } from './matchEngine';
import type { Listing } from './listingsCollector';

export type MarketSummary = {
  avgPriceSqft?: number;
  volume?: number;
  period?: string;
  trend?: string;
};

export type DossierContext = {
  listings: ScoredListing[];
  market?: MarketSummary;
  /** Diagnostic pour le frontend et les logs : d'où viennent les données. */
  sources: { listings: string; market: string };
};

const n = (v: unknown): number => {
  const x = typeof v === 'number' ? v : parseInt(String(v ?? ''), 10);
  return Number.isFinite(x) ? x : 0;
};

async function fetchListings(budgetEur: number, limit: number): Promise<{ listings: Listing[]; source: string }> {
  try {
    const params = new URLSearchParams({ limit: String(limit) });
    if (budgetEur > 0) params.set('budget', String(budgetEur));
    const res = await fetch(`${appUrl()}/api/live-listings?${params}`, {
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return { listings: [], source: `live-listings HTTP ${res.status}` };
    const data: any = await res.json();
    const listings: Listing[] = Array.isArray(data?.listings) ? data.listings : [];
    return { listings, source: data?.source || (listings.length ? 'live-listings' : 'aucune annonce') };
  } catch (err: any) {
    return { listings: [], source: `indisponible (${err?.message ?? 'erreur réseau'})` };
  }
}

async function fetchMarket(): Promise<{ market?: MarketSummary; source: string }> {
  try {
    const res = await fetch(`${appUrl()}/api/dld-weekly`, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return { source: `dld-weekly HTTP ${res.status}` };
    const data: any = await res.json();
    const series: any[] = Array.isArray(data?.weekly) ? data.weekly : Array.isArray(data?.data) ? data.data : [];
    if (!series.length) return { source: data?.reason || 'aucune donnée DLD' };

    const last = series[series.length - 1];
    const prev = series.length > 1 ? series[series.length - 2] : null;
    const lastPrice = n(last?.avgPrice ?? last?.avg_price);
    const prevPrice = prev ? n(prev?.avgPrice ?? prev?.avg_price) : 0;

    let trend: string | undefined;
    if (lastPrice && prevPrice) {
      const delta = ((lastPrice - prevPrice) / prevPrice) * 100;
      trend = `${delta >= 0 ? '+' : ''}${delta.toFixed(1)} % sur la période précédente`;
    }

    return {
      market: {
        avgPriceSqft: lastPrice || undefined,
        volume: n(last?.salesCount ?? last?.sales_count) || undefined,
        period: last?.week || last?.label,
        trend,
      },
      source: data?.live === false ? 'DLD indisponible — série de repli' : 'transactions DLD',
    };
  } catch (err: any) {
    return { source: `indisponible (${err?.message ?? 'erreur réseau'})` };
  }
}

/** Charge annonces + marché en parallèle, puis score pour ce profil précis. */
export async function loadDossierContext(
  profile: MatchProfile,
  opts: { limit?: number; pool?: number } = {}
): Promise<DossierContext> {
  const budget = n(profile.totalBudget);
  const [listingsRes, marketRes] = await Promise.all([
    fetchListings(budget, opts.pool ?? 40),
    fetchMarket(),
  ]);

  return {
    listings: matchListings(listingsRes.listings, profile, opts.limit ?? 8),
    market: marketRes.market,
    sources: { listings: listingsRes.source, market: marketRes.source },
  };
}
