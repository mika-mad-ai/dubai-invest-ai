/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Chat du conseiller IA — streaming SSE.
 *
 * Chaque tour : on recharge les annonces réelles scorées pour le dossier et le
 * dernier point marché DLD, puis on laisse Claude arbitrer. Le conseiller ne
 * recommande donc jamais un bien qu'on n'a pas vérifié en prix.
 *
 * POST { advisorId, profile, messages: [{role, content}], language? }
 * → text/event-stream : {type:'meta'|'text'|'done'|'error', ...}
 */

import {
  assembleSystem, buildDossierMessage, buildListingsBlock, buildStableSystem,
  getClaude, hasClaude, MODEL, outputConfig, resolveAdvisor, toApiMessages, WEB_SEARCH_TOOL,
  type ChatMessage, type InvestorProfile,
} from './lib/claude';
import { loadDossierContext } from './lib/context';
import { checkDailyBudget, checkInputSize, clientIp, rateLimit, recordUsage } from './lib/guard';

type WireMessage = { role: 'user' | 'assistant'; content: string };

function sse(res: any, payload: unknown) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

/** Amorce du dossier : ce que le conseiller dit spontanément à l'ouverture. */
function openingPrompt(advisorId: string, language: string): string {
  const shared = `[Réponds intégralement en ${language}.]

Ouvre le dossier. Tu viens de recevoir mon profil et les biens disponibles ci-dessus.
Présente-toi en une phrase, puis livre ton audit initial en 250 mots MAXIMUM :`;

  const perAdvisor: Record<string, string> = {
    locatif: `${shared}
1. Ma capacité réelle d'investissement, frais inclus (DLD 4 %, agence 2 %, trustee).
2. Les deux biens de la liste que tu retiens, avec pour chacun le loyer attendu, les service
   charges et le rendement NET — et pourquoi tu écartes les autres.
3. Le rendement net que je peux viser de façon réaliste sur mon horizon.
4. Le principal risque de mon dossier tel qu'il est aujourd'hui.`,
    residence: `${shared}
1. Ce que mon budget permet réellement, frais inclus, et si le Golden Visa est atteignable.
2. Les deux biens de la liste que tu retiens, en parlant du quotidien : quartier, écoles,
   trajets, commodités — et pourquoi tu écartes les autres.
3. Le parcours de financement non-résident applicable à mon cas, avec les délais.
4. Le principal point de vigilance de mon dossier.`,
    location: `${shared}
1. Ce que mon budget mensuel permet réellement, quartier par quartier.
2. Deux quartiers que tu retiens, avec les fourchettes de loyers réelles et le nombre
   de chèques à viser.
3. La mécanique locale à connaître : Ejari, dépôt, commission d'agence.
4. Mon meilleur angle de négociation compte tenu de la saison.`,
  };
  return perAdvisor[advisorId] ?? perAdvisor.locatif;
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!hasClaude()) {
    res.status(200).json({
      ok: false,
      reason: 'ANTHROPIC_API_KEY non configurée — le conseiller IA est indisponible.',
    });
    return;
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const profile: InvestorProfile = body.profile || {};
  const language: string = body.language || 'français';
  const advisor = resolveAdvisor(body.advisorId || profile.advisorId);
  const incoming: WireMessage[] = Array.isArray(body.messages) ? body.messages : [];

  // ── Garde-fous de coût ────────────────────────────────────────────────────
  // Cet endpoint est public et le client contrôle `messages` : sans bornes, une
  // seule requête peut remplir la fenêtre de contexte et coûter 1,44 $.
  const size = checkInputSize(incoming);
  if (!size.ok) {
    res.status(413).json({ ok: false, reason: size.reason });
    return;
  }

  const rate = rateLimit(clientIp(req));
  if (!rate.ok) {
    res.setHeader('Retry-After', String(rate.retryAfterS));
    res.status(429).json({ ok: false, reason: 'Trop de requêtes. Réessayez dans un instant.' });
    return;
  }

  const budget = await checkDailyBudget();
  if (!budget.ok) {
    console.warn(`[agent-chat] budget quotidien atteint : ${budget.spent.toFixed(2)} / ${budget.budget} $`);
    res.status(503).json({
      ok: false,
      reason: 'Le conseiller est momentanément indisponible. Réessayez plus tard.',
    });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  try {
    const ctx = await loadDossierContext(profile as any, { limit: 8, pool: 40 });

    // Le frontend affiche les biens retenus en parallèle du texte du conseiller.
    sse(res, {
      type: 'meta',
      advisor: { id: advisor.id, name: advisor.name, role: advisor.role },
      listings: ctx.listings.map(l => ({
        id: l.id, title: l.title, location: l.location, price: l.price,
        beds: l.beds, sqm: l.sqm, yield: l.yield, netYield: l.netYield,
        image: l.image, sourceUrl: l.sourceUrl, completion: l.completion,
        matchScore: l.matchScore, matchReasons: l.matchReasons,
        priceVerdict: l.priceVerdict, priceCode: l.priceCheck.code,
      })),
      market: ctx.market,
      sources: ctx.sources,
    });

    // `system` reste strictement stable → il est cacheable, et l'historique
    // derrière lui l'est aussi. Le dossier part dans le premier message.
    const system = assembleSystem(buildStableSystem(advisor, language));

    const opening = openingPrompt(advisor.id, language);
    const dossier = buildDossierMessage({
      profile,
      market: ctx.market,
      listings: ctx.listings,
      instruction: opening,
    });

    // L'API exige un premier message `user`. Le tour d'ouverture est déclenché par
    // un prompt synthétique côté serveur : le client ne le connaît pas, son
    // historique commence donc par la réponse du conseiller. On réinsère le
    // dossier en tête, sinon le deuxième tour partirait en 400.
    const messages: ChatMessage[] = incoming.length
      ? incoming.map(m => ({ role: m.role, content: m.content }))
      : [{ role: 'user', content: dossier }];

    if (messages[0].role !== 'user') {
      messages.unshift({ role: 'user', content: dossier });
    }

    // Les annonces ont pu bouger depuis le début de la conversation. Plutôt que
    // de réécrire le préfixe (ce qui casserait le cache), on ajoute l'écart en
    // message `system` de fin — canal opérateur supporté sur claude-opus-5.
    const knownIds: string[] = Array.isArray(body.knownListingIds) ? body.knownListingIds : [];
    if (incoming.length && knownIds.length) {
      const fresh = ctx.listings.filter(l => !knownIds.includes(l.id));
      if (fresh.length) {
        messages.push({
          role: 'system',
          content: `Mise à jour du marché depuis le début de cet échange — nouveaux biens correspondant au dossier :\n\n${buildListingsBlock(fresh)}`,
        });
      }
    }

    // 2200 tokens plafonnent le coût par tour à ~0,055 $ sur Opus 5. Mesuré :
    // sans plafond le modèle produisait 2000 à 3000 tokens par réponse, soit
    // 80 % du coût total d'une conversation — et un pavé illisible dans une
    // colonne de chat de 400 px.
    const stream = getClaude().messages.stream({
      model: MODEL,
      max_tokens: 2200,
      system,
      messages: toApiMessages(messages),
      output_config: outputConfig('medium'),
      tools: [WEB_SEARCH_TOOL],
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        sse(res, { type: 'text', text: event.delta.text });
      }
    }

    const final = await stream.finalMessage();

    if (final.stop_reason === 'refusal') {
      sse(res, {
        type: 'error',
        message: 'Cette demande sort du périmètre du conseiller. Reformulez sur votre projet immobilier.',
      });
    } else {
      // Sources web citées par la recherche côté serveur, s'il y en a.
      const citations: Array<{ title: string; uri: string }> = [];
      for (const block of final.content) {
        if (block.type === 'web_search_tool_result' && Array.isArray((block as any).content)) {
          for (const r of (block as any).content) {
            if (r?.url) citations.push({ title: r.title || r.url, uri: r.url });
          }
        }
      }
      // Comptabilité sans await bloquant : une erreur de compteur ne doit pas
      // dégrader la réponse déjà envoyée au prospect.
      void recordUsage('agent-chat', final.usage);

      sse(res, {
        type: 'done',
        citations,
        usage: {
          input: final.usage.input_tokens,
          output: final.usage.output_tokens,
          cacheRead: final.usage.cache_read_input_tokens ?? 0,
        },
      });
    }
  } catch (err: any) {
    sse(res, { type: 'error', message: err?.message || 'Erreur du conseiller IA' });
  } finally {
    res.end();
  }
}
