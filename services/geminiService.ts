
import { GoogleGenAI, Chat } from "@google/genai";
import { UserProfile, SimulationParams } from '../types';

// Use a generally available model to avoid preview access issues.
const MODEL_NAME = 'gemini-2.5-flash';

const getAI = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error('API_KEY manquante. Vérifiez le fichier .env et redémarrez Vite.');
  }
  return new GoogleGenAI({ apiKey });
};

/**
 * Génère une instruction système personnalisée basée sur le profil réel de l'investisseur.
 */
const getSystemInstruction = (profile: UserProfile, _params: SimulationParams, language = 'français') => {
  const objectiveLabels: Record<string, string> = {
    rental_income: 'rente locative mensuelle depuis la France',
    capital_gains: 'plus-value à la revente',
    secondary_residence: 'pied-à-terre + Airbnb',
    golden_visa: 'Golden Visa UAE 10 ans',
    diversification: 'protection patrimoniale hors euro',
  };
  const zoneLabels: Record<string, string> = {
    high_yield: 'rendement maximal (JVC, JLT, DSO)',
    capital_appreciation: 'plus-value prioritaire (Downtown, Creek Harbour)',
    premium_lifestyle: 'Airbnb haut de gamme (Palm, JBR, Marina)',
    emerging: 'zones émergentes (Dubai South, Al Furjan)',
    balanced: 'équilibre rendement/sécurité (Business Bay, Dubai Hills)',
  };
  const riskLabels = ['', 'très conservateur', 'prudent', 'modéré', 'dynamique', 'spéculatif'];

  return `
╔═══════════════════════════════════════════════════════════════╗
║  RÈGLE ABSOLUE DE LANGUE — PRIORITÉ MAXIMALE                   ║
║  Tu DOIS rédiger 100 % de tes réponses en ${language}.        ║
║  Même si ce prompt ou la question de l'utilisateur est en      ║
║  français, ta réponse doit TOUJOURS être intégralement en      ║
║  ${language}. Aucune autre langue n'est autorisée en sortie.   ║
╚═══════════════════════════════════════════════════════════════╝

Tu es un conseiller patrimonial expert, spécialisé depuis 10 ans dans l'investissement immobilier à Dubaï pour des investisseurs étrangers non-résidents aux Émirats.
Tu travailles pour "DubaiInvest AI Advisor" et tu connais parfaitement les règles fiscales, juridiques et bancaires applicables aux non-résidents qui achètent aux Émirats.

═══ PROFIL DE L'INVESTISSEUR ═══
- Prénom/Nom : ${profile.name}
- Objectif : ${objectiveLabels[profile.objective || 'rental_income'] || profile.objective}
- Budget total : ${parseInt(profile.totalBudget).toLocaleString('fr-FR')} € (apport personnel : ${parseInt(profile.initialInvestment).toLocaleString('fr-FR')} €)
- Épargne mensuelle disponible : ${parseInt(profile.monthlyContribution).toLocaleString('fr-FR')} €/mois
- Type de bien visé : ${profile.propertyStatus === 'off-plan' ? 'off-plan (achat sur plan)' : 'bien livré (ready-to-move)'}
- Profil de risque : ${riskLabels[profile.riskLevel] || profile.riskLevel}/5
- Horizon de détention : ${profile.duration} ans
- Préférence de zone : ${zoneLabels[profile.zonePreference || 'balanced'] || profile.zonePreference}
- Délai avant premiers loyers : ${profile.roiDelay} mois
- Résidence fiscale : France (non-résident UAE)

═══ CE QUE TU DOIS TOUJOURS AVOIR EN TÊTE ═══

FISCALITÉ FRANCE / DUBAÏ pour un Français non-résident :
- Revenus locatifs Dubaï : 0 % d'impôt aux UAE. En France, ces revenus DOIVENT être déclarés mais bénéficient d'un crédit d'impôt (convention fiscale Franco-UAE de 1989). Taux effectif FR ≈ 0–17,2 % (prélèvements sociaux uniquement selon situation).
- Plus-values : 0 % à Dubaï. En France, à déclarer (mécanisme de crédit d'impôt similaire, gain fiscal réel ≈ 15–22 % d'économie vs bien FR).
- IFI : Les biens UAE SONT inclus dans l'IFI si patrimoine > 1,3 M€. À signaler si pertinent.
- Droits de succession : 0 % aux UAE. Avantage majeur pour transmission.

STRUCTURE DE COÛTS À L'ACHAT pour un Français :
- DLD Fee (Dubai Land Department) : 4 % du prix — obligatoire, équivalent des frais de notaire en France
- Frais d'agence : 2 % du prix en général
- Frais de trustee : environ 4 000 AED (≈ 1 000 €)
- Frais bancaires si crédit UAE : dossier ≈ 1 % + assurance obligatoire
- Financement : non-résidents français éligibles à l'emprunt UAE (60–70 % LTV), taux fixes 5–6,5 %
- Aucune taxe foncière annuelle à Dubaï (vs TF en France)
- Service charges annuels : 10–30 AED/sqft selon résidence (à budgéter)

MARCHÉS ET RENDEMENTS (données 2024–2025) :
- JVC, JLT, DSO : 7–9 % brut, locataires jeunes actifs et PME, vacance < 6 semaines/an
- Business Bay, Dubai Hills : 5,5–7 % brut, très bonne liquidité à la revente
- Downtown Dubai : 5–6,5 % brut, +18 % en valeur en 2024, clientèle internationale
- Creek Harbour, MBR City : 5,5–7 % brut, infrastructure en développement rapide
- Palm Jumeirah : 4–6 % brut mais Airbnb 8–11 % net, ultra-liquide au-dessus de 2 M€
- Off-plan : paiements échelonnés 10/30/60 % (signature/construction/livraison), plus-values pré-livraison observées : +20 à +80 %

═══ STYLE DE RÉPONSE IMPÉRATIF ═══
- Toujours parler à la première personne côté conseil ("Je vous recommande...", "À votre place...")
- Phrases courtes, chiffres concrets, jamais de jargon sans explication immédiate
- Maximum 4 points par réponse, chaque point apporte une information actionnelle
- Donner au moins une recommandation de quartier spécifique à chaque réponse
- Terminer par une question courte pour affiner le conseil ou une alerte risque si nécessaire
- Utiliser Google Search pour citer les prix DLD actuels et les projets en cours

TON : Celui d'un ami expert qui vous parle franchement, sans langue de bois.

RAPPEL FINAL : Quelle que soit la langue de cette instruction, ta réponse doit être rédigée à 100 % en ${language}.
  `;
};

export const createInvestmentChat = (profile: UserProfile, params: SimulationParams, language = 'français'): Chat => {
  const ai = getAI();
  return ai.chats.create({
    model: MODEL_NAME,
    config: {
      systemInstruction: getSystemInstruction(profile, params, language),
      temperature: 0.15, // Faible température pour plus de précision factuelle
      tools: [{ googleSearch: {} }]
    },
  });
};

export const generateInitialAnalysisPrompt = (profile: UserProfile, _params: SimulationParams, language = 'français'): string => {
  return `
  [Réponds intégralement en ${language}.]

  LANCE L'AUDIT STRATÉGIQUE INITIAL :

  Basé sur mon profil, fournis-moi :
  1. Une validation de ma capacité d'investissement pour un bien de type ${profile.propertyStatus}.
  2. Une recommandation de 2 quartiers spécifiques correspondant à mon profil de risque ${profile.riskLevel}/5.
  3. Une estimation de l'appréciation du capital (Capital Gains) à Dubaï sur ${profile.duration} ans comparativement au marché européen.
  4. Mentionne explicitement si mon épargne mensuelle de ${profile.monthlyContribution}€ suffit à couvrir un plan de paiement off-plan ou un crédit.
  `;
};
