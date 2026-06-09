/**
 * Collector endpoint — démarre un run Apify ciblé sur le budget utilisateur.
 *
 * Params:
 *   budget    — budget max en EUR (ex: 500000). Converti en AED pour filtrer PF.
 *   city      — ville (défaut: dubai)
 *   limit     — nombre max d'annonces (défaut: 24)
 *
 * Flux :
 *   1. POST /api/collector/run?budget=500000  → démarre le run Apify (< 1s)
 *   2. Apify scrape PF avec pt={budgetAED} (~30-60s)
 *   3. Apify POST /api/apify-webhook → normalise + sauvegarde dataset
 *   4. /api/live-listings lit le dataset
 */

const APIFY_BASE = 'https://api.apify.com/v2';
const PF_ACTOR = 'shahidirfan~propertyfinder-scraper';

// 1 EUR ≈ 4 AED (marge de 15% pour absorber les fluctuations)
const EUR_TO_AED = 4.15;

function isAuthorized(req: any): boolean {
  const expected = process.env.COLLECTOR_SECRET;
  if (!expected) return true;
  const provided = req.headers['x-collector-secret'] || req.query?.secret;
  return provided === expected;
}

function buildStartUrls(_city: string, maxPriceAED: number): { url: string }[] {
  // La page 1 de chaque quartier est saturée de featured/sponsored luxury.
  // On cible la page 2 qui contient les annonces organiques accessibles.
  // Le filtre budget se fait côté serveur dans /api/live-listings.
  const p2 = '?page=2';
  const budgetLabel = maxPriceAED < 3_000_000 ? 'budget' : 'mid';
  void budgetLabel;
  return [
    { url: `https://www.propertyfinder.ae/en/buy/dubai/apartments-for-sale-jumeirah-village-circle.html${p2}` },
    { url: `https://www.propertyfinder.ae/en/buy/dubai/apartments-for-sale-business-bay.html${p2}` },
    { url: `https://www.propertyfinder.ae/en/buy/dubai/apartments-for-sale-downtown-dubai.html${p2}` },
    { url: `https://www.propertyfinder.ae/en/buy/dubai/apartments-for-sale-dubai-marina.html${p2}` },
    { url: `https://www.propertyfinder.ae/en/buy/dubai/apartments-for-sale-dubai-creek-harbour-the-lagoons.html${p2}` },
    // Studios JVC (page 1 ok, peu de featured)
    { url: 'https://www.propertyfinder.ae/en/buy/dubai/studio-apartments-for-sale-jumeirah-village-circle.html' },
    // 1BR Creek & Business Bay
    { url: 'https://www.propertyfinder.ae/en/buy/dubai/1-bedroom-apartments-for-sale-business-bay.html' },
    { url: 'https://www.propertyfinder.ae/en/buy/dubai/1-bedroom-apartments-for-sale-dubai-creek-harbour-the-lagoons.html' },
  ];
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!isAuthorized(req)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const token = process.env.APIFY_API_TOKEN;
  if (!token) {
    res.status(200).json({ ok: false, reason: 'APIFY_API_TOKEN not configured' });
    return;
  }

  const city = String(req.query?.city || 'dubai').toLowerCase();
  const maxItems = Math.min(100, Math.max(20, Number(req.query?.limit || 80)));

  // Budget en EUR fourni par le frontend après soumission du profil
  const budgetEur = Number(req.query?.budget || 0);
  // Si pas de budget fourni : plage large par défaut (300k–3M AED)
  const maxPriceAED = budgetEur > 0
    ? Math.round(budgetEur * EUR_TO_AED)
    : 3_000_000;

  const appUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : process.env.APP_URL || 'https://dubainvest.eu';

  const webhookUrl = `${appUrl}/api/apify-webhook`;
  const startUrls = buildStartUrls(city, maxPriceAED);

  try {
    const runResponse = await fetch(
      `${APIFY_BASE}/acts/${PF_ACTOR}/runs?token=${token}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startUrls,
          maxItems,
          webhooks: [
            {
              eventTypes: ['ACTOR.RUN.SUCCEEDED'],
              requestUrl: webhookUrl,
              payloadTemplate: JSON.stringify({
                eventType: '{{eventType}}',
                runId: '{{runId}}',
                datasetId: '{{resource.defaultDatasetId}}',
                city,
                maxItems,
                maxPriceAED,
                secret: process.env.COLLECTOR_SECRET || ''
              })
            }
          ]
        })
      }
    );

    if (!runResponse.ok) {
      const text = await runResponse.text();
      res.status(200).json({ ok: false, reason: `Apify run start failed: ${runResponse.status} ${text}` });
      return;
    }

    const runData = await runResponse.json();
    const runId = runData?.data?.id;
    const datasetId = runData?.data?.defaultDatasetId;

    res.status(200).json({
      ok: true,
      mode: 'async-webhook',
      runId,
      datasetId,
      maxPriceAED,
      startUrls: startUrls.map(u => u.url),
      message: `Run Apify démarré (budget ≤ ${maxPriceAED.toLocaleString()} AED). Webhook appelé à la fin (~30-60s).`
    });
  } catch (err: any) {
    res.status(200).json({ ok: false, error: err?.message || 'Unknown error' });
  }
}
