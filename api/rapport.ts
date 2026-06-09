/**
 * Serveur de rapports mensuels dynamiques.
 * Route : /rapport-immobilier-dubai-[mois]-[annee]
 * Rewrite vercel.json : /rapport-immobilier-dubai-:slug → /api/rapport?slug=:slug
 *
 * Sert le HTML stocké dans Supabase seo_reports.
 * HTTP 200 avec le rapport complet, ou 404 si non trouvé.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function fetchReport(slug: string): Promise<{ html: string; title: string } | null> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/seo_reports?slug=eq.${encodeURIComponent(slug)}&select=html,title&limit=1`,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
        signal: AbortSignal.timeout(5_000),
      }
    );
    if (!res.ok) return null;
    const rows: any[] = await res.json();
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

export default async function handler(
  req: { query?: Record<string, string> },
  res: {
    setHeader: (k: string, v: string) => void;
    status: (code: number) => { end: (body: string) => void };
  }
) {
  // Extract slug from query param set by vercel rewrite
  const slug = (req as any).query?.slug ?? '';
  if (!slug || !slug.startsWith('rapport-immobilier-dubai-')) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(404).end('<h1>Rapport introuvable</h1><p><a href="https://dubainvest.eu">← Retour</a></p>');
  }

  const report = await fetchReport(slug);
  if (!report) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(404).end(`
      <!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Rapport non disponible</title></head>
      <body style="font-family:sans-serif;max-width:600px;margin:4rem auto;text-align:center">
        <h1>Ce rapport n'est pas encore disponible</h1>
        <p>Il sera généré automatiquement le 1er du mois prochain.</p>
        <a href="https://dubainvest.eu" style="display:inline-block;margin-top:1.5rem;padding:.8rem 2rem;background:#D4AF37;color:#0a0a23;font-weight:700;border-radius:6px;text-decoration:none">
          Analyser mon investissement →
        </a>
      </body></html>
    `);
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
  return res.status(200).end(report.html);
}
