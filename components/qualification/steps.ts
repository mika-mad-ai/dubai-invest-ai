/**
 * Questions de qualification : le parcours générique et un parcours par
 * conseiller. Chaque option porte les champs du profil investisseur qu'elle
 * renseigne (`updates`). Partagé par le questionnaire historique
 * (DecisionTree) et par le chat d'accueil (ConciergeChat).
 */
import type React from 'react';
import type { UserProfile, PropertyStatus } from '../../types';
import { BuildingIcon, TrendingUpIcon, ShieldIcon, EuroIcon, MapPinIcon, ChartIcon, PercentIcon } from '../Icons';

export type StepOption = {
  value: string | number;
  label: string;
  desc: string;
  icon?: React.ComponentType<{ className?: string }>;
  updates: Partial<UserProfile>;
};

export type TreeStep = {
  id: string;
  question: string;
  sub?: string;
  options: StepOption[];
};

export const TREE_STEPS: TreeStep[] = [
  {
    id: 'objective',
    question: 'Qu\'est-ce que vous voulez faire avec cet argent ?',
    sub: 'C\'est la question de départ. Votre réponse détermine le type de bien, le quartier et la stratégie fiscale recommandés.',
    options: [
      {
        value: 'rental_income',
        label: 'Toucher un loyer mensuel',
        icon: PercentIcon,
        desc: 'Vous percevez un loyer régulier depuis la France. 0 % d\'impôt à Dubaï (vs 30 %+ en France). Rendement brut moyen : 6–8 %.',
        updates: { riskLevel: 2, propertyStatus: 'ready' as PropertyStatus, roiDelay: '1', objective: 'rental_income' },
      },
      {
        value: 'capital_gains',
        label: 'Revendre avec une forte plus-value',
        icon: TrendingUpIcon,
        desc: 'Vous achetez un bien sur plan (off-plan) et le revendez avant ou à la livraison. Plus-values observées : +30 à +80 % en 3–5 ans.',
        updates: { riskLevel: 4, propertyStatus: 'off-plan' as PropertyStatus, roiDelay: '36', objective: 'capital_gains' },
      },
      {
        value: 'secondary_residence',
        label: 'Un pied-à-terre + revenus Airbnb',
        icon: BuildingIcon,
        desc: 'Vous séjournez quelques semaines par an et louez le reste du temps. Rendement Airbnb : 7–9 %. Gestion déléguable à 100 %.',
        updates: { riskLevel: 2, propertyStatus: 'ready' as PropertyStatus, roiDelay: '3', objective: 'secondary_residence' },
      },
      {
        value: 'golden_visa',
        label: 'Obtenir la résidence UAE (Golden Visa)',
        icon: ShieldIcon,
        desc: 'Investissement ≥ 545 000 € → résidence de 10 ans pour vous et votre famille. Accès école internationale, santé, compte bancaire UAE.',
        updates: { riskLevel: 2, totalBudget: '600000', initialInvestment: '600000', propertyStatus: 'ready' as PropertyStatus, roiDelay: '6', objective: 'golden_visa' },
      },
      {
        value: 'diversification',
        label: 'Protéger mon patrimoine hors euro',
        icon: ChartIcon,
        desc: 'Sortir 20–30 % de votre patrimoine de la fiscalité française. AED indexé au dollar. 0 % IFI, 0 % droits de succession à Dubaï.',
        updates: { riskLevel: 3, propertyStatus: 'ready' as PropertyStatus, roiDelay: '12', objective: 'diversification' },
      },
    ],
  },
  {
    id: 'budget',
    question: 'Quelle est votre enveloppe totale disponible ?',
    sub: 'Budget total = prix du bien + DLD 4 % (équivalent frais de notaire) + agence 2 %. Les non-résidents peuvent emprunter jusqu\'à 60–70 % du prix auprès de banques UAE.',
    options: [
      {
        value: 'under_200k',
        label: 'Moins de 200 000 €',
        icon: EuroIcon,
        desc: 'Studio 35–55 m². Quartiers JVC, DSO. Rendements jusqu\'à 9 %. Ticket d\'entrée idéal pour commencer.',
        updates: { totalBudget: '180000', initialInvestment: '45000', monthlyContribution: '600' },
      },
      {
        value: '200_400k',
        label: '200 000 – 400 000 €',
        icon: EuroIcon,
        desc: 'Appartement 1 chambre. Marina, JLT, Business Bay. Le segment le plus liquide — revendu en quelques semaines si besoin.',
        updates: { totalBudget: '320000', initialInvestment: '80000', monthlyContribution: '1000' },
      },
      {
        value: '400_700k',
        label: '400 000 – 700 000 €',
        icon: EuroIcon,
        desc: 'Appartement 2 chambres. Dubai Hills, Creek Harbour. Forte demande des familles d\'expatriés. Belle appréciation long terme.',
        updates: { totalBudget: '560000', initialInvestment: '140000', monthlyContribution: '1800' },
      },
      {
        value: '700k_1_5m',
        label: '700 000 € – 1,5 M€',
        icon: EuroIcon,
        desc: 'Appartement premium. Downtown, Palm, Marina Gate. Golden Visa automatiquement inclus. Clientèle internationale, très liquide.',
        updates: { totalBudget: '1000000', initialInvestment: '300000', monthlyContribution: '3500' },
      },
      {
        value: 'above_1_5m',
        label: 'Plus de 1,5 M€',
        icon: EuroIcon,
        desc: 'Villa ou penthouse. Palm Jumeirah, Emirates Hills, MBR City. Marché ultra-luxe, valorisation de +40 % sur 5 ans observée.',
        updates: { totalBudget: '2000000', initialInvestment: '600000', monthlyContribution: '6000' },
      },
    ],
  },
  {
    id: 'horizon',
    question: 'Dans combien de temps voulez-vous récupérer votre argent ?',
    sub: 'Important : les frais d\'entrée (DLD 4 %) ne sont rentabilisés qu\'après ~2 ans de loyers. Revendre trop tôt réduit la performance globale.',
    options: [
      {
        value: 'short',
        label: 'Dans 1 à 3 ans',
        icon: TrendingUpIcon,
        desc: 'Stratégie "flip" off-plan : revendre avant la livraison des clés. Gain rapide possible, mais risque de liquidité si le marché se retourne.',
        updates: { duration: '2', riskLevel: 5, propertyStatus: 'off-plan' as PropertyStatus, investmentHorizon: 'short' },
      },
      {
        value: 'medium',
        label: 'Dans 3 à 6 ans',
        icon: ChartIcon,
        desc: 'L\'horizon optimal selon les données DLD. Vous cumulez les loyers ET une belle plus-value. Sortie idéale autour de 2027–2028.',
        updates: { duration: '5', riskLevel: 3, propertyStatus: 'ready' as PropertyStatus, investmentHorizon: 'medium' },
      },
      {
        value: 'long',
        label: 'Dans 6 à 10 ans',
        icon: ShieldIcon,
        desc: 'Construction patrimoniale sereine : vous traversez au moins un cycle complet du marché. Appréciation et loyers s\'accumulent.',
        updates: { duration: '8', riskLevel: 2, propertyStatus: 'ready' as PropertyStatus, investmentHorizon: 'long' },
      },
      {
        value: 'permanent',
        label: 'Pas de date prévue',
        icon: BuildingIcon,
        desc: 'Rente à vie ou transmission à vos enfants. Zéro droits de succession à Dubaï. Idéal pour une stratégie "family office".',
        updates: { duration: '15', riskLevel: 1, propertyStatus: 'ready' as PropertyStatus, investmentHorizon: 'permanent' },
      },
    ],
  },
  {
    id: 'risk_profile',
    question: 'Comment réagissez-vous si la valeur baisse de 15 % ?',
    sub: 'Dubaï a connu −40 % en 2009, puis +70 % entre 2021 et 2024. Votre réponse permet de calibrer le type de bien et la zone recommandés.',
    options: [
      {
        value: 'conservative',
        label: 'Je veux dormir tranquille',
        icon: ShieldIcon,
        desc: 'Bien livré avec locataire déjà en place. Revenu immédiat dès le mois suivant. Promoteurs top-tier uniquement (Emaar, Meraas).',
        updates: { riskLevel: 1 },
      },
      {
        value: 'moderate',
        label: 'J\'accepte −15 % temporaire',
        icon: EuroIcon,
        desc: 'Mix bien livré + légère prise de risque sur zones établies. Business Bay, JLT. Récupération attendue en 18–24 mois.',
        updates: { riskLevel: 3 },
      },
      {
        value: 'dynamic',
        label: 'Je joue la croissance',
        icon: TrendingUpIcon,
        desc: 'Off-plan Emaar ou Nakheel avec paiement échelonné sur 3 ans (10 % à la signature, reste à la livraison). Potentiel +40 % avant clés.',
        updates: { riskLevel: 4 },
      },
      {
        value: 'speculative',
        label: 'Je maximise l\'effet de levier',
        icon: ChartIcon,
        desc: 'Achat off-plan + revente avant livraison. Mise de départ : 10–20 % du prix. Gain très élevé si timing bon, perte partielle sinon.',
        updates: { riskLevel: 5 },
      },
    ],
  },
  {
    id: 'zone_preference',
    question: 'Quel type de locataire ou d\'acheteur visez-vous ?',
    sub: 'Chaque quartier de Dubaï attire un profil différent. Cela impacte directement votre taux d\'occupation, le loyer obtenu et la facilité de revente.',
    options: [
      {
        value: 'high_yield',
        label: 'Rendement maximal',
        icon: PercentIcon,
        desc: 'JVC, JLT, DSO. Locataires : jeunes actifs et PME. Rendement 7–9 %. Vacance locative < 6 semaines/an en moyenne.',
        updates: { riskLevel: 2, roiDelay: '2', zonePreference: 'high_yield' },
      },
      {
        value: 'capital_appreciation',
        label: 'Plus-value en priorité',
        icon: TrendingUpIcon,
        desc: 'Downtown, Creek Harbour, MBR City. Acheteurs : investisseurs du monde entier. Hausse constatée : +18 % en 2024, +12 % en 2023.',
        updates: { riskLevel: 4, roiDelay: '24', zonePreference: 'capital_appreciation' },
      },
      {
        value: 'premium_lifestyle',
        label: 'Airbnb haut de gamme',
        icon: BuildingIcon,
        desc: 'Palm Jumeirah, JBR, Marina. Touristes et expatriés haut de gamme. Taux d\'occupation 70–85 % en haute saison, loyers 2× la moyenne.',
        updates: { riskLevel: 3, roiDelay: '6', zonePreference: 'premium_lifestyle' },
      },
      {
        value: 'emerging',
        label: 'Pari sur une zone qui monte',
        icon: MapPinIcon,
        desc: 'Dubai South, Al Furjan, RAK. Prix d\'entrée 30–40 % sous le marché établi. Infrastructure en cours = prise de valeur attendue sur 5–7 ans.',
        updates: { riskLevel: 5, roiDelay: '48', zonePreference: 'emerging' },
      },
      {
        value: 'balanced',
        label: 'Équilibre rendement / sécurité',
        icon: ChartIcon,
        desc: 'Business Bay, Dubai Hills, Downtown. Le meilleur compromis : rendement correct (5–7 %), forte liquidité, appréciation régulière.',
        updates: { riskLevel: 3, roiDelay: '3', zonePreference: 'balanced' },
      },
    ],
  },
];

// ── Scénarios spécialisés par conseiller ──────────────────────────────────────
// Chaque avatar (AgentsSection) déclenche son propre parcours de questions.
// Les `updates` restent mappés sur UserProfile pour alimenter simulation + IA.
export const AGENT_TREES: Record<string, TreeStep[]> = {
  locatif: [
    {
      id: 'rental_type',
      question: 'Quel type de revenu locatif visez-vous ?',
      sub: 'Karim adapte la stratégie : location longue durée stable, Airbnb saisonnier ou off-plan à mettre en location après livraison.',
      options: [
        {
          value: 'long_term',
          label: 'Loyer stable longue durée',
          icon: PercentIcon,
          desc: 'Bail annuel avec locataire résident. Revenu prévisible, gestion légère (5 % de frais). Rendement brut : 6–8 %.',
          updates: { objective: 'rental_income', propertyStatus: 'ready' as PropertyStatus, riskLevel: 2, roiDelay: '1', zonePreference: 'high_yield' },
        },
        {
          value: 'airbnb',
          label: 'Airbnb / courte durée',
          icon: BuildingIcon,
          desc: 'Loyers 1,5–2× supérieurs en zone touristique. Occupation 70–85 %. Gestion 100 % déléguable (15–20 % de frais).',
          updates: { objective: 'rental_income', propertyStatus: 'ready' as PropertyStatus, riskLevel: 3, roiDelay: '2', zonePreference: 'premium_lifestyle' },
        },
        {
          value: 'max_yield',
          label: 'Rendement maximal (studios)',
          icon: TrendingUpIcon,
          desc: 'Studios 35–55 m² en JVC ou DSO. Jusqu\'à 9 % brut. Ticket d\'entrée réduit, demande locative constante.',
          updates: { objective: 'rental_income', propertyStatus: 'ready' as PropertyStatus, riskLevel: 2, roiDelay: '1', zonePreference: 'high_yield' },
        },
        {
          value: 'offplan_rent',
          label: 'Off-plan puis mise en location',
          icon: ChartIcon,
          desc: 'Achat sur plan 15–25 % sous le prix livré, location dès la remise des clés. Plus-value + loyers cumulés.',
          updates: { objective: 'rental_income', propertyStatus: 'off-plan' as PropertyStatus, riskLevel: 4, roiDelay: '30', zonePreference: 'emerging' },
        },
      ],
    },
    {
      id: 'budget',
      question: 'Quelle est votre enveloppe totale disponible ?',
      sub: 'Budget total = prix du bien + DLD 4 % + agence 2 %. L\'effet de levier bancaire (60–70 % LTV) booste le rendement sur fonds propres.',
      options: [
        {
          value: 'under_200k',
          label: 'Moins de 200 000 €',
          icon: EuroIcon,
          desc: 'Studio locatif JVC/DSO : 8–9 % brut, ≈ 1 100 €/mois. Le meilleur ratio loyer/prix de Dubaï.',
          updates: { totalBudget: '180000', initialInvestment: '45000', monthlyContribution: '600' },
        },
        {
          value: '200_400k',
          label: '200 000 – 400 000 €',
          icon: EuroIcon,
          desc: '1 chambre Marina/JLT : ≈ 1 500–1 900 €/mois de loyer. Demande massive de jeunes actifs, vacance quasi nulle.',
          updates: { totalBudget: '320000', initialInvestment: '80000', monthlyContribution: '1000' },
        },
        {
          value: '400_700k',
          label: '400 000 – 700 000 €',
          icon: EuroIcon,
          desc: '2 chambres Dubai Hills/Business Bay : loyers familiaux stables, baux longs, locataires solvables.',
          updates: { totalBudget: '560000', initialInvestment: '140000', monthlyContribution: '1800' },
        },
        {
          value: '700k_1_5m',
          label: '700 000 € – 1,5 M€',
          icon: EuroIcon,
          desc: 'Premium Downtown/Palm : loyers élevés + Golden Visa inclus. Airbnb haut de gamme très rentable.',
          updates: { totalBudget: '1000000', initialInvestment: '300000', monthlyContribution: '3500' },
        },
        {
          value: 'above_1_5m',
          label: 'Plus de 1,5 M€',
          icon: EuroIcon,
          desc: 'Villa ou penthouse : loyers ultra-premium, clientèle corporate et fortunée. Rareté = pricing power.',
          updates: { totalBudget: '2000000', initialInvestment: '600000', monthlyContribution: '6000' },
        },
      ],
    },
    {
      id: 'first_rent',
      question: 'Quand voulez-vous encaisser vos premiers loyers ?',
      sub: 'Un bien livré se loue en 2–6 semaines. Un off-plan attend la livraison, mais coûte 15–25 % moins cher à l\'achat.',
      options: [
        {
          value: 'now',
          label: 'Dès le mois prochain',
          icon: PercentIcon,
          desc: 'Bien livré, idéalement déjà loué avec bail transféré. Le loyer tombe dès la signature ou presque.',
          updates: { propertyStatus: 'ready' as PropertyStatus, roiDelay: '1', duration: '8', investmentHorizon: 'long', riskLevel: 2 },
        },
        {
          value: 'soon',
          label: 'D\'ici 6 à 12 mois',
          icon: ChartIcon,
          desc: 'Bien livré à optimiser : un ameublement Airbnb soigné = +20 % de loyer par rapport au nu.',
          updates: { propertyStatus: 'ready' as PropertyStatus, roiDelay: '6', duration: '6', investmentHorizon: 'medium', riskLevel: 3 },
        },
        {
          value: 'later',
          label: 'Dans 2–3 ans, j\'optimise le prix',
          icon: TrendingUpIcon,
          desc: 'Off-plan avec paiement échelonné : vous achetez moins cher et le loyer démarre à la livraison.',
          updates: { propertyStatus: 'off-plan' as PropertyStatus, roiDelay: '30', duration: '7', investmentHorizon: 'medium', riskLevel: 4 },
        },
        {
          value: 'whenever',
          label: 'Pas pressé — je construis une rente',
          icon: ShieldIcon,
          desc: 'Horizon patrimonial : loyers réinvestis, transmission sans droits de succession à Dubaï.',
          updates: { propertyStatus: 'ready' as PropertyStatus, roiDelay: '3', duration: '15', investmentHorizon: 'permanent', riskLevel: 1 },
        },
      ],
    },
    {
      id: 'vacancy_risk',
      question: 'Deux mois sans locataire : vous réagissez comment ?',
      sub: 'La vacance moyenne à Dubaï est < 6 semaines/an en zone établie. Votre tolérance calibre la zone et le type de bien recommandés.',
      options: [
        {
          value: 'safe',
          label: 'Impossible, il me faut du garanti',
          icon: ShieldIcon,
          desc: 'Bien livré avec locataire en place et bail transféré. Revenu dès le premier mois, zéro incertitude.',
          updates: { riskLevel: 1, propertyStatus: 'ready' as PropertyStatus },
        },
        {
          value: 'absorb',
          label: 'J\'ai la trésorerie pour absorber',
          icon: EuroIcon,
          desc: 'Zones établies à forte demande (JLT, Business Bay). Relocation rapide, souvent à un loyer supérieur.',
          updates: { riskLevel: 3 },
        },
        {
          value: 'seasonal',
          label: 'J\'arbitre pour un meilleur rendement',
          icon: TrendingUpIcon,
          desc: 'Airbnb saisonnier : creux d\'été acceptés, haute saison à 2× le loyer. Net supérieur sur l\'année.',
          updates: { riskLevel: 4 },
        },
        {
          value: 'aggressive',
          label: 'Je vise le rendement max, je gère',
          icon: ChartIcon,
          desc: 'Zones émergentes à 9 %+ : vacance possible au début, compensée par un prix d\'achat 30 % plus bas.',
          updates: { riskLevel: 5, propertyStatus: 'off-plan' as PropertyStatus },
        },
      ],
    },
    {
      id: 'tenant',
      question: 'Quel locataire voulez-vous attirer ?',
      sub: 'Le locataire cible détermine le quartier, la taille du bien, la stabilité du loyer et le taux d\'occupation.',
      options: [
        {
          value: 'young_pro',
          label: 'Jeunes actifs & expats',
          icon: PercentIcon,
          desc: 'JVC, JLT, DSO. Studios et 1BR. Rendement 7–9 %, rotation maîtrisée, demande massive toute l\'année.',
          updates: { zonePreference: 'high_yield', roiDelay: '2', riskLevel: 2 },
        },
        {
          value: 'family',
          label: 'Familles d\'expatriés',
          icon: BuildingIcon,
          desc: 'Dubai Hills, Creek Harbour. Baux de 2–3 ans, locataires stables et solvables. Vacance minimale.',
          updates: { zonePreference: 'balanced', roiDelay: '3', riskLevel: 2 },
        },
        {
          value: 'tourist',
          label: 'Touristes premium (Airbnb)',
          icon: MapPinIcon,
          desc: 'Palm, JBR, Marina. Occupation 70–85 %, loyers 2× la longue durée en haute saison.',
          updates: { zonePreference: 'premium_lifestyle', roiDelay: '6', riskLevel: 3 },
        },
        {
          value: 'corporate',
          label: 'Cadres & entreprises',
          icon: ChartIcon,
          desc: 'Business Bay, Downtown. Baux corporate payés à l\'année d\'avance. Loyer premium, zéro impayé.',
          updates: { zonePreference: 'capital_appreciation', roiDelay: '3', riskLevel: 3 },
        },
      ],
    },
  ],

  residence: [
    {
      id: 'living_mode',
      question: 'Comment allez-vous vivre dans ce bien ?',
      sub: 'James adapte le quartier, la taille et le montage : résidence à l\'année, pied-à-terre ou installation familiale complète.',
      options: [
        {
          value: 'full_time',
          label: 'J\'y vis à l\'année',
          icon: BuildingIcon,
          desc: 'Résidence principale à Dubaï : 0 % d\'impôt sur le revenu, sécurité et qualité de vie au top mondial.',
          updates: { objective: 'secondary_residence', propertyStatus: 'ready' as PropertyStatus, riskLevel: 1, roiDelay: '0', zonePreference: 'balanced' },
        },
        {
          value: 'part_time',
          label: 'Pied-à-terre + Airbnb le reste',
          icon: PercentIcon,
          desc: 'Vous y séjournez quelques semaines par an ; le bien se rentabilise seul le reste du temps (7–9 %).',
          updates: { objective: 'secondary_residence', propertyStatus: 'ready' as PropertyStatus, riskLevel: 2, roiDelay: '3', zonePreference: 'premium_lifestyle' },
        },
        {
          value: 'golden_visa',
          label: 'Résidence + Golden Visa 10 ans',
          icon: ShieldIcon,
          desc: 'Investissement ≥ 545 000 € → visa 10 ans pour toute la famille : écoles, santé, compte bancaire UAE.',
          updates: { objective: 'golden_visa', totalBudget: '600000', initialInvestment: '600000', propertyStatus: 'ready' as PropertyStatus, roiDelay: '6', riskLevel: 2 },
        },
        {
          value: 'family_move',
          label: 'J\'installe ma famille',
          icon: MapPinIcon,
          desc: 'Quartiers familiaux, écoles internationales à proximité, villas et grands appartements sécurisés.',
          updates: { objective: 'secondary_residence', propertyStatus: 'ready' as PropertyStatus, riskLevel: 1, roiDelay: '0', zonePreference: 'balanced' },
        },
      ],
    },
    {
      id: 'budget',
      question: 'Quelle est votre enveloppe totale disponible ?',
      sub: 'Budget total = prix du bien + DLD 4 % + agence 2 %. Les non-résidents empruntent jusqu\'à 60–70 % auprès des banques UAE.',
      options: [
        {
          value: 'under_200k',
          label: 'Moins de 200 000 €',
          icon: EuroIcon,
          desc: 'Studio ou 1BR compact à JVC, Arjan. Pied-à-terre idéal, charges de copropriété maîtrisées.',
          updates: { totalBudget: '180000', initialInvestment: '45000', monthlyContribution: '600' },
        },
        {
          value: '200_400k',
          label: '200 000 – 400 000 €',
          icon: EuroIcon,
          desc: '1 chambre à Marina ou Downtown : vivre au cœur de la ville, vue, commodités à pied.',
          updates: { totalBudget: '320000', initialInvestment: '80000', monthlyContribution: '1000' },
        },
        {
          value: '400_700k',
          label: '400 000 – 700 000 €',
          icon: EuroIcon,
          desc: '2–3 chambres à Dubai Hills, Creek Harbour : parfait pour une famille, écoles à proximité.',
          updates: { totalBudget: '560000', initialInvestment: '140000', monthlyContribution: '1800' },
        },
        {
          value: '700k_1_5m',
          label: '700 000 € – 1,5 M€',
          icon: EuroIcon,
          desc: 'Grand appartement premium, Golden Visa automatique. Downtown, Palm, Bluewaters.',
          updates: { totalBudget: '1000000', initialInvestment: '300000', monthlyContribution: '3500' },
        },
        {
          value: 'above_1_5m',
          label: 'Plus de 1,5 M€',
          icon: EuroIcon,
          desc: 'Villa avec jardin et piscine : Emirates Hills, Palm, Dubai Hills. Le luxe résidentiel absolu.',
          updates: { totalBudget: '2000000', initialInvestment: '600000', monthlyContribution: '6000' },
        },
      ],
    },
    {
      id: 'move_in',
      question: 'Quand comptez-vous emménager ?',
      sub: 'Un bien livré = clés en 30 jours. Un off-plan neuf = 2–3 ans d\'attente, mais personnalisation et prix inférieur de 15–25 %.',
      options: [
        {
          value: 'asap',
          label: 'Dès que possible',
          icon: BuildingIcon,
          desc: 'Bien livré, transaction bouclée en 30–45 jours. Vous emménagez dès l\'enregistrement DLD.',
          updates: { propertyStatus: 'ready' as PropertyStatus, roiDelay: '0', duration: '10', investmentHorizon: 'long', riskLevel: 1 },
        },
        {
          value: 'one_year',
          label: 'D\'ici un an',
          icon: ChartIcon,
          desc: 'Le temps de comparer les quartiers, visiter sur place et négocier sereinement.',
          updates: { propertyStatus: 'ready' as PropertyStatus, roiDelay: '6', duration: '10', investmentHorizon: 'long', riskLevel: 2 },
        },
        {
          value: 'new_build',
          label: 'Dans 2–3 ans, dans du neuf',
          icon: TrendingUpIcon,
          desc: 'Off-plan : vous choisissez étage, vue et finitions. Paiement échelonné pendant la construction.',
          updates: { propertyStatus: 'off-plan' as PropertyStatus, roiDelay: '30', duration: '10', investmentHorizon: 'long', riskLevel: 3 },
        },
        {
          value: 'flexible',
          label: 'Flexible, selon l\'opportunité',
          icon: ShieldIcon,
          desc: 'Vous attendez la bonne affaire : James surveille le marché et vous alerte au bon moment.',
          updates: { propertyStatus: 'ready' as PropertyStatus, roiDelay: '3', duration: '12', investmentHorizon: 'permanent', riskLevel: 2 },
        },
      ],
    },
    {
      id: 'home_priority',
      question: 'Qu\'est-ce qui compte le plus pour vous ?',
      sub: 'Même pour y vivre, un bien à Dubaï reste un actif : autant choisir une adresse qui prend de la valeur.',
      options: [
        {
          value: 'security',
          label: 'Sérénité & qualité de construction',
          icon: ShieldIcon,
          desc: 'Promoteurs top-tier (Emaar, Meraas), résidences sécurisées, gestion de copropriété irréprochable.',
          updates: { riskLevel: 1 },
        },
        {
          value: 'resale',
          label: 'La valeur à la revente',
          icon: TrendingUpIcon,
          desc: 'Downtown, Creek Harbour : +18 % en 2024. Votre résidence est aussi votre meilleur placement.',
          updates: { riskLevel: 3, zonePreference: 'capital_appreciation' },
        },
        {
          value: 'prestige',
          label: 'Le prestige et la vue',
          icon: BuildingIcon,
          desc: 'Palm, Bluewaters, Downtown vue Burj Khalifa : des adresses qui ne se démodent jamais.',
          updates: { riskLevel: 2, zonePreference: 'premium_lifestyle' },
        },
        {
          value: 'value',
          label: 'Le meilleur prix au m²',
          icon: EuroIcon,
          desc: 'Dubai South, Al Furjan : 30–40 % sous le marché établi, infrastructures en cours d\'arrivée.',
          updates: { riskLevel: 4, zonePreference: 'emerging' },
        },
      ],
    },
    {
      id: 'lifestyle',
      question: 'Quel cadre de vie recherchez-vous ?',
      sub: 'Chaque quartier de Dubaï a sa personnalité. Votre style de vie quotidien détermine le bon choix.',
      options: [
        {
          value: 'urban',
          label: 'Urbain et vibrant',
          icon: BuildingIcon,
          desc: 'Downtown, Marina : tours, restaurants, vie nocturne. Tout à pied, métro à proximité.',
          updates: { zonePreference: 'capital_appreciation', roiDelay: '0', riskLevel: 2 },
        },
        {
          value: 'family_green',
          label: 'Familial et verdoyant',
          icon: MapPinIcon,
          desc: 'Dubai Hills, Arabian Ranches : parcs, golf, écoles internationales, communautés calmes.',
          updates: { zonePreference: 'balanced', roiDelay: '0', riskLevel: 1 },
        },
        {
          value: 'beach',
          label: 'Les pieds dans l\'eau',
          icon: PercentIcon,
          desc: 'Palm Jumeirah, JBR, Bluewaters : plage privée, beach clubs, ambiance resort au quotidien.',
          updates: { zonePreference: 'premium_lifestyle', roiDelay: '0', riskLevel: 2 },
        },
        {
          value: 'quiet_new',
          label: 'Calme, neuf et abordable',
          icon: ChartIcon,
          desc: 'Dubai South, MBR City : résidences neuves, grands espaces, à 20 minutes de tout.',
          updates: { zonePreference: 'emerging', roiDelay: '0', riskLevel: 3 },
        },
      ],
    },
  ],

  location: [
    {
      id: 'rent_duration',
      question: 'Pour combien de temps cherchez-vous à louer ?',
      sub: 'Léa oriente la recherche : courte durée meublée ultra-flexible, ou bail annuel classique (Ejari) nettement plus économique.',
      options: [
        {
          value: 'short',
          label: 'Quelques semaines à 3 mois',
          icon: MapPinIcon,
          desc: 'Meublé, tout inclus, zéro paperasse. Idéal mission, télétravail ou repérage avant installation.',
          updates: { objective: 'secondary_residence', investmentHorizon: 'short', duration: '1', riskLevel: 2, zonePreference: 'premium_lifestyle', roiDelay: '0', propertyStatus: 'ready' as PropertyStatus },
        },
        {
          value: 'mid',
          label: '3 à 12 mois',
          icon: ChartIcon,
          desc: 'Locations flexibles au mois : 10–20 % sous le prix à la nuitée, sans engagement annuel.',
          updates: { objective: 'secondary_residence', investmentHorizon: 'short', duration: '1', riskLevel: 2, zonePreference: 'balanced', roiDelay: '0', propertyStatus: 'ready' as PropertyStatus },
        },
        {
          value: 'annual',
          label: 'Bail annuel classique',
          icon: BuildingIcon,
          desc: 'Le standard Dubaï (Ejari) : 20–40 % moins cher au mois, paiement en 1 à 4 chèques.',
          updates: { objective: 'secondary_residence', investmentHorizon: 'medium', duration: '3', riskLevel: 1, zonePreference: 'balanced', roiDelay: '0', propertyStatus: 'ready' as PropertyStatus },
        },
        {
          value: 'long',
          label: 'Plusieurs années',
          icon: ShieldIcon,
          desc: 'Négociez : un bail long = loyer gelé et propriétaire conciliant. La stabilité pour la famille.',
          updates: { objective: 'secondary_residence', investmentHorizon: 'long', duration: '5', riskLevel: 1, zonePreference: 'balanced', roiDelay: '0', propertyStatus: 'ready' as PropertyStatus },
        },
      ],
    },
    {
      id: 'monthly_budget',
      question: 'Quel budget loyer par mois ?',
      sub: 'À Dubaï, le loyer annuel se paie souvent en 1 à 4 chèques. Moins il y a de chèques, plus vous avez de pouvoir de négociation.',
      options: [
        {
          value: 'b_under_1500',
          label: 'Moins de 1 500 €',
          icon: EuroIcon,
          desc: 'Studio à JVC, DSO ou Arjan. Résidences récentes, piscine et salle de sport incluses.',
          updates: { monthlyContribution: '1200', totalBudget: '180000', initialInvestment: '45000' },
        },
        {
          value: 'b_1500_3000',
          label: '1 500 – 3 000 €',
          icon: EuroIcon,
          desc: '1 chambre à Marina, JLT ou Business Bay. Le cœur du marché locatif expat.',
          updates: { monthlyContribution: '2200', totalBudget: '320000', initialInvestment: '80000' },
        },
        {
          value: 'b_3000_6000',
          label: '3 000 – 6 000 €',
          icon: EuroIcon,
          desc: '2–3 chambres à Dubai Hills ou Downtown. Standing familial, vues dégagées.',
          updates: { monthlyContribution: '4500', totalBudget: '560000', initialInvestment: '140000' },
        },
        {
          value: 'b_above_6000',
          label: 'Plus de 6 000 €',
          icon: EuroIcon,
          desc: 'Penthouse ou villa : Palm, Emirates Hills, Bluewaters. Prestations hôtelières.',
          updates: { monthlyContribution: '8000', totalBudget: '1000000', initialInvestment: '300000' },
        },
      ],
    },
    {
      id: 'move_date',
      question: 'Quand voulez-vous emménager ?',
      sub: 'Le marché locatif bouge vite : les meilleurs biens partent en 48 h. Anticipez vos documents (passeport, visa, chèques).',
      options: [
        {
          value: 'this_week',
          label: 'Cette semaine',
          icon: TrendingUpIcon,
          desc: 'Meublé disponible immédiatement. Léa présélectionne et organise les visites sous 24 h.',
          updates: { roiDelay: '0', propertyStatus: 'ready' as PropertyStatus, riskLevel: 2 },
        },
        {
          value: 'this_month',
          label: 'Dans le mois',
          icon: ChartIcon,
          desc: 'Le bon timing pour visiter, comparer plusieurs biens et négocier sans pression.',
          updates: { roiDelay: '1', propertyStatus: 'ready' as PropertyStatus, riskLevel: 2 },
        },
        {
          value: 'quarter',
          label: 'Dans 1 à 3 mois',
          icon: ShieldIcon,
          desc: 'Alerte activée : Léa vous envoie les nouvelles annonces qui matchent dès leur sortie.',
          updates: { roiDelay: '3', propertyStatus: 'ready' as PropertyStatus, riskLevel: 1 },
        },
        {
          value: 'exploring',
          label: 'Je me renseigne d\'abord',
          icon: MapPinIcon,
          desc: 'Découvrez les quartiers et les prix réels avant de décider. Zéro engagement.',
          updates: { roiDelay: '6', propertyStatus: 'ready' as PropertyStatus, riskLevel: 1 },
        },
      ],
    },
    {
      id: 'furnishing',
      question: 'Meublé, non meublé, avec services ?',
      sub: '80 % des locations courtes sont meublées. En bail annuel, le non-meublé est 15–20 % moins cher.',
      options: [
        {
          value: 'furnished',
          label: 'Meublé clé en main',
          icon: BuildingIcon,
          desc: 'Une valise et c\'est tout : literie, cuisine équipée, wifi. Le standard des zones touristiques.',
          updates: { riskLevel: 2, zonePreference: 'premium_lifestyle' },
        },
        {
          value: 'unfurnished',
          label: 'Non meublé',
          icon: EuroIcon,
          desc: 'Vos meubles, votre déco. Loyer réduit de 15–20 %, idéal pour une installation longue.',
          updates: { riskLevel: 1, zonePreference: 'balanced' },
        },
        {
          value: 'serviced',
          label: 'Résidence hôtelière',
          icon: ShieldIcon,
          desc: 'Ménage, conciergerie, room service. Le confort d\'un hôtel avec l\'espace d\'un appartement.',
          updates: { riskLevel: 2, zonePreference: 'premium_lifestyle' },
        },
        {
          value: 'best_deal',
          label: 'Peu importe : le bon deal d\'abord',
          icon: PercentIcon,
          desc: 'Léa compare tout le marché et vous sort le meilleur rapport qualité/prix, point final.',
          updates: { riskLevel: 3, zonePreference: 'high_yield' },
        },
      ],
    },
    {
      id: 'lifestyle_rent',
      question: 'Quel style de vie à Dubaï ?',
      sub: 'Le quartier fait l\'expérience : temps de trajet, restaurants, plage, écoles. Choisissez votre quotidien.',
      options: [
        {
          value: 'vibrant',
          label: 'Urbain, sortir tous les soirs',
          icon: BuildingIcon,
          desc: 'Downtown, Marina : rooftops, restaurants, Marina Walk. La ville qui ne dort jamais.',
          updates: { zonePreference: 'capital_appreciation', riskLevel: 2 },
        },
        {
          value: 'beach_life',
          label: 'Plage et soleil',
          icon: MapPinIcon,
          desc: 'JBR, Palm : la plage en bas de la tour, beach clubs et couchers de soleil quotidiens.',
          updates: { zonePreference: 'premium_lifestyle', riskLevel: 2 },
        },
        {
          value: 'family_calm',
          label: 'Familial et paisible',
          icon: ShieldIcon,
          desc: 'Dubai Hills, Mirdif : parcs, écoles internationales, communautés résidentielles vertes.',
          updates: { zonePreference: 'balanced', riskLevel: 1 },
        },
        {
          value: 'smart_space',
          label: 'Malin : max de m² pour mon loyer',
          icon: PercentIcon,
          desc: 'JVC, Al Furjan : 30 % moins cher qu\'en zone prime, résidences neuves tout équipées.',
          updates: { zonePreference: 'high_yield', riskLevel: 3 },
        },
      ],
    },
  ],
};
