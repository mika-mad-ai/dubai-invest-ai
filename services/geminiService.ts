
import { GoogleGenAI, Chat } from "@google/genai";
import { UserProfile, SimulationParams } from '../types';

// Use a generally available model to avoid preview access issues.
const MODEL_NAME = 'gemini-2.0-flash';

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
const getSystemInstruction = (profile: UserProfile, params: SimulationParams) => {
  return `
    Tu es l'IA conseillère experte de "DubaïInvest", spécialisée en arbitrage patrimonial et investissement immobilier à Dubaï.
    
    TON OBJECTIF :
    Conseiller l'investisseur sur la meilleure stratégie d'allocation pour son budget de ${profile.totalBudget}€.

    STYLE DE RÉPONSE :
    - Réponses ultra concises, 5 phrases max, privilégie les listes courtes.
    - Pas de longs paragraphes ; bullets courtes, chiffres clés, actions immédiates.
    - Termine par une recommandation claire et une alerte risque si besoin.
    
    CONTEXTE DE L'INVESTISSEUR :
    - Nom : ${profile.name}
    - Budget Global : ${profile.totalBudget}€ (Apport : ${profile.initialInvestment}€)
    - Épargne Mensuelle : ${profile.monthlyContribution}€
    - Stratégie : ${profile.propertyStatus} (Ready ou Off-plan)
    - Risque : Niveau ${profile.riskLevel}/5
    - Horizon : ${profile.duration} ans
    
    TES MISSIONS CRITIQUES :
    1. ANALYSE DU GAP : Calcule le besoin en financement bancaire ou plan de paiement.
    2. SÉCURITÉ : Pour un risque < 3, ne suggère que des promoteurs Top-Tier (Emaar, Meraas). Pour un risque > 3, explore les opportunités de plus-value sur les zones en développement (Dubai South, Arjan).
    3. RENTABILITÉ : Calcule l'impact du délai de ${profile.roiDelay} mois avant les premiers loyers sur son ROI global.
    4. TRANSPARENCE : Utilise toujours Google Search pour citer les prix actuels du DLD (Dubai Land Department) et les dernières annonces.
    
    TON TON : Professionnel, analytique, luxueux et rassurant.
  `;
};

export const createInvestmentChat = (profile: UserProfile, params: SimulationParams): Chat => {
  const ai = getAI();
  return ai.chats.create({
    model: MODEL_NAME,
    config: {
      systemInstruction: getSystemInstruction(profile, params),
      temperature: 0.15, // Faible température pour plus de précision factuelle
      tools: [{ googleSearch: {} }]
    },
  });
};

export const generateInitialAnalysisPrompt = (profile: UserProfile, params: SimulationParams): string => {
  return `
  LANCE L'AUDIT STRATÉGIQUE INITIAL :
  
  Basé sur mon profil, fournis-moi :
  1. Une validation de ma capacité d'investissement pour un bien de type ${profile.propertyStatus}.
  2. Une recommandation de 2 quartiers spécifiques correspondant à mon profil de risque ${profile.riskLevel}/5.
  3. Une estimation de l'appréciation du capital (Capital Gains) à Dubaï sur ${profile.duration} ans comparativement au marché européen.
  4. Mentionne explicitement si mon épargne mensuelle de ${profile.monthlyContribution}€ suffit à couvrir un plan de paiement off-plan ou un crédit.
  `;
};
