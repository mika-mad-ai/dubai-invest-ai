/**
 * Webhook appelé par Apify quand un run se termine (~30s après /api/collector/run).
 * Récupère les items du dataset Apify, normalise, sauvegarde le snapshot.
 *
 * Payload Apify (configuré dans le webhooks[] du run) :
 *   { eventType, runId, datasetId, city, maxItems, secret }
 */

import { normalizePropertyFinderItems } from './lib/listingsCollector';
import { saveListingsSnapshot, getStoreInfo } from './lib/listingsStore';

const APIFY_BASE = 'https://api.apify.com/v2';
const DATA_KEY_PREFIX = 'live-listings';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const body = req.body || {};

  // Vérification du secret si configuré
  const expectedSecret = process.env.COLLECTOR_SECRET;
  if (expectedSecret && body.secret !== expectedSecret) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const token = process.env.APIFY_API_TOKEN;
  if (!token) {
    res.status(200).json({ ok: false, reason: 'APIFY_API_TOKEN not configuré' });
    return;
  }

  const { datasetId, city = 'dubai', maxItems = 24 } = body;

  if (!datasetId) {
    res.status(200).json({ ok: false, reason: 'Missing datasetId in webhook payload' });
    return;
  }

  try {
    // Récupérer les items du dataset Apify
    const itemsRes = await fetch(
      `${APIFY_BASE}/datasets/${datasetId}/items?token=${token}&limit=${maxItems}`
    );

    if (!itemsRes.ok) {
      res.status(200).json({ ok: false, reason: `Dataset fetch failed: ${itemsRes.status}` });
      return;
    }

    const rawItems: any[] = await itemsRes.json();
    const listings = normalizePropertyFinderItems(rawItems, maxItems);

    const payload = {
      live: listings.length > 0,
      source: 'Apify (Property Finder — webhook)',
      fetchedAt: new Date().toISOString(),
      listings,
      statuses: [
        { source: 'propertyfinder', ok: listings.length > 0, count: listings.length },
        { source: 'bayut', ok: false, count: 0, reason: 'CAPTCHA — proxy premium requis' }
      ]
    };

    const dataKey = `${DATA_KEY_PREFIX}:${city}:${maxItems}`;
    await saveListingsSnapshot(dataKey, payload);

    res.status(200).json({
      ok: true,
      dataKey,
      listingsCount: listings.length,
      storage: getStoreInfo()
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message || 'Unknown error' });
  }
}
