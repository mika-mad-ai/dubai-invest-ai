export interface DldImmediatePoint {
  period: string;
  weekStart: string;
  avgPrice: number;
  salesVolume: number;
}

export interface DldProjectionPoint {
  quarter: string;
  impactPct: number;
}

export interface DldWeeklyResponse {
  live: boolean;
  source: string;
  conflictDate?: string;
  generatedAt: string;
  reason?: string;
  immediateData?: DldImmediatePoint[];
  mediumTermProjection?: DldProjectionPoint[];
}

export async function fetchDldWeeklyImpact(): Promise<DldWeeklyResponse> {
  const response = await fetch('/api/dld-weekly');
  if (!response.ok) {
    throw new Error(`DLD fetch failed (${response.status})`);
  }
  return response.json();
}
