/**
 * Endpoint dynamique pour /llms.txt
 *
 * Sert la version générée par l'agent SEO/GEO (fraîche quotidiennement).
 * Si Supabase est indisponible ou que le contenu n'est pas encore généré,
 * retourne le contenu statique de secours.
 *
 * Accessible via la réécriture Vercel : /llms.txt → /api/llms-txt
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Contenu statique de secours (si Supabase indisponible)
const STATIC_FALLBACK = `# DubaiInvest AI Advisor

> Plateforme d'intelligence artificielle pour l'investissement immobilier à Dubaï, destinée aux investisseurs francophones (France, Belgique, Suisse, Luxembourg, Canada).

## Qu'est-ce que DubaiInvest AI Advisor ?

DubaiInvest AI Advisor est un conseiller en investissement immobilier à Dubaï propulsé par IA. Il agrège en temps réel +1 000 annonces immobilières réelles depuis PropertyFinder, les analyse selon le profil de l'investisseur, et fournit des simulations de rendement, cashflow et stratégie d'investissement personnalisées.

## Données et sources

- **Annonces immobilières** : +1 000 biens mis à jour quotidiennement (JVC, Marina, Downtown, Business Bay, Creek Harbour, Palm, JBR)
- **Transactions DLD** : Données réelles du Dubai Land Department
- **Marché 2026** : Croissance prix +15-20% sur 3 ans, rendement locatif moyen 6-9% brut

## Fiscalité

- 0% d'impôt sur les revenus locatifs à Dubaï
- 0% de taxe sur les plus-values immobilières
- 0% d'impôt sur la succession
- Convention fiscale France-EAU (1989) : évite la double imposition
- Frais DLD à l'achat : 4% du prix

## Golden Visa

- Résidence 10 ans renouvelable aux EAU
- Accessible dès 2 000 000 AED (~545 000€) en immobilier freehold
- Éligible aux membres de la famille

## Pages de référence

- [Accueil — simulateur d'investissement IA](https://dubainvest.eu/) : simulation rendement, cashflow, fiscalité en 5 questions
- [Analyse géopolitique Dubaï 2026](https://dubainvest.eu/analyse-geopolitique-dubai) : impact du conflit Moyen-Orient sur les prix et transactions, données hebdomadaires
- [Guide Golden Visa Dubaï](https://dubainvest.eu/guide-visa-or-dubai) : conditions, coûts et démarches pour la résidence 10 ans dès 2M AED (~545 000 €)
- [Meilleurs quartiers où investir à Dubaï en 2026](https://dubainvest.eu/meilleurs-quartiers-dubai-investissement) : comparatif rendement, valorisation et risque par district
- [Analyses quotidiennes du marché](https://dubainvest.eu/blog) : un article par jour basé sur les annonces réelles et les transactions DLD

## Contact

https://dubainvest.eu/
`.trim();

async function fetchFromSupabase(): Promise<string | null> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;

  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/seo_content?key=eq.llms_txt&select=content,generated_at&limit=1`,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(5_000),
      }
    );

    if (!res.ok) return null;
    const rows: any[] = await res.json();
    if (!rows.length || !rows[0]?.content) return null;

    // Ignore content older than 72h (stale)
    const generatedAt = new Date(rows[0].generated_at).getTime();
    if (Date.now() - generatedAt > 72 * 60 * 60 * 1000) return null;

    return rows[0].content as string;
  } catch {
    return null;
  }
}

export default async function handler(
  _req: unknown,
  res: {
    setHeader: (key: string, value: string) => void;
    status: (code: number) => { end: (body: string) => void };
  }
) {
  const content = await fetchFromSupabase() ?? STATIC_FALLBACK;

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  res.setHeader('X-Content-Source', content === STATIC_FALLBACK ? 'static-fallback' : 'supabase-dynamic');

  return res.status(200).end(content);
}
