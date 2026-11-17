/**
 * Textes du chat d'accueil par langue. Le français est la source (les
 * questions vivent dans `steps.ts`) ; l'anglais est traduit ici, dans le même
 * ordre de questions et de réponses. Les autres langues du site reçoivent
 * l'anglais plutôt que le français.
 */
import { AGENTS } from '../AgentsSection';
import { AGENT_TREES, type TreeStep } from './steps';

export type ChatLang = 'fr' | 'en';

export const chatLang = (locale: string): ChatLang => (locale === 'fr' ? 'fr' : 'en');

export const CHAT_TEXT = {
  fr: {
    stage: 'Votre conseiller IA',
    greeting: 'Bonjour. Écrivez ce que vous cherchez à Dubaï et je lance la recherche — ou choisissez une réponse pour être guidé.',
    projectQuestion: 'Quel est votre projet ?',
    contactQuestion: 'Votre dossier est complet. À quel nom et à quelle adresse e-mail dois-je l’ouvrir ? La carte s’affiche juste après.',
    intro: (name: string, role: string, desc: string) => `Je suis ${name}, votre conseiller ${role.toLowerCase()}. ${desc}`,
    noted: (items: string) => `J’ai bien noté : ${items}.`,
    searching: (first: string, noted: string) => `${first} lance la recherche${noted}…`,
    defaultAdvisor: 'Votre conseiller',
    brand: 'Conseiller immobilier IA',
    placeholderFirst: 'Ex. : 300 000 €, je veux un loyer chaque mois',
    placeholder: 'Écrivez votre recherche, ou cliquez une réponse…',
    answerAria: 'Votre réponse',
    optionsAria: 'Réponses possibles',
    sendAria: 'Envoyer',
    backAria: 'Revenir à la question précédente',
    progressAria: (n: number, total: number) => `Question ${n} sur ${total}`,
    proofAria: 'En bref',
    opening: 'Ouverture de la carte…',
    go: 'Afficher ma carte de Dubaï',
    more: 'Guides & mentions légales',
  },
  en: {
    stage: 'Your AI advisor',
    greeting: 'Hello. Type what you are looking for in Dubai and I will start the search — or pick an answer to be guided.',
    projectQuestion: 'What is your project?',
    contactQuestion: 'Your file is complete. Which name and email address should I open it under? The map appears right after.',
    intro: (name: string, role: string, desc: string) => `I’m ${name}, your ${role.toLowerCase()} advisor. ${desc}`,
    noted: (items: string) => `Noted: ${items}.`,
    searching: (first: string, noted: string) => `${first} is starting the search${noted}…`,
    defaultAdvisor: 'Your advisor',
    brand: 'AI property advisor',
    placeholderFirst: 'E.g. €300,000, I want rental income every month',
    placeholder: 'Type your search, or click an answer…',
    answerAria: 'Your answer',
    optionsAria: 'Possible answers',
    sendAria: 'Send',
    backAria: 'Back to the previous question',
    progressAria: (n: number, total: number) => `Question ${n} of ${total}`,
    proofAria: 'At a glance',
    opening: 'Opening the map…',
    go: 'Show my map of Dubai',
    more: 'Guides & legal notices',
  },
} as const;

export const PROJECT_TEXT: Record<ChatLang, Array<{ agentId: string; label: string; desc: string }>> = {
  fr: [
    { agentId: 'locatif', label: 'Investir pour louer', desc: 'Acheter un bien et encaisser des loyers, en longue durée ou en Airbnb.' },
    { agentId: 'residence', label: 'Acheter pour y vivre', desc: 'Résidence principale, pied-à-terre ou installation en famille.' },
    { agentId: 'location', label: 'Louer un logement', desc: 'Trouver une location à Dubaï, pour quelques semaines ou plusieurs années.' },
  ],
  en: [
    { agentId: 'locatif', label: 'Invest to rent out', desc: 'Buy a property and collect rent, long-term or on Airbnb.' },
    { agentId: 'residence', label: 'Buy a home to live in', desc: 'Main residence, pied-à-terre or a move with your family.' },
    { agentId: 'location', label: 'Rent a place', desc: 'Find a rental in Dubai, for a few weeks or several years.' },
  ],
};

const AGENT_EN: Record<string, { role: string; desc: string }> = {
  locatif: {
    role: 'Rental investment',
    desc: 'A specialist in rental yield and cash flow. He finds the properties with the best return for your budget and horizon.',
  },
  residence: {
    role: 'Home purchase',
    desc: 'Your guide to buying the apartment you will live in: neighbourhoods, schools, Golden Visa and financing.',
  },
  location: {
    role: 'Rentals',
    desc: 'She finds the right rental, short or long term, in the right neighbourhood and at a fair price, to match your lifestyle.',
  },
};

/** Nom, rôle et présentation d'un conseiller dans la langue du chat. */
export function agentText(agentId: string, lang: ChatLang): { name: string; first: string; role: string; desc: string } | null {
  const a = AGENTS.find(x => x.id === agentId);
  if (!a) return null;
  const en = lang === 'en' ? AGENT_EN[agentId] : undefined;
  return { name: a.name, first: a.name.split(' ')[0], role: en?.role ?? a.role, desc: en?.desc ?? a.desc };
}

type StepEn = { question: string; sub: string; options: Array<[label: string, desc: string]> };

const BUDGET_SUB_INVEST = 'Total budget = property price + 4% DLD fee + 2% agency fee. Bank leverage (60–70% LTV) boosts the return on your own funds.';

const STEPS_EN: Record<string, Record<string, StepEn>> = {
  locatif: {
    rental_type: {
      question: 'What kind of rental income are you after?',
      sub: 'Karim adapts the strategy: steady long-term lets, seasonal Airbnb, or off-plan to rent out after handover.',
      options: [
        ['Steady long-term rent', 'Annual lease with a resident tenant. Predictable income, light management (5% fee). Gross yield: 6–8%.'],
        ['Airbnb / short-term', 'Rents 1.5–2× higher in tourist areas. 70–85% occupancy. Management fully delegable (15–20% fee).'],
        ['Maximum yield (studios)', 'Studios of 35–55 m² in JVC or DSO. Up to 9% gross. Low entry ticket, constant rental demand.'],
        ['Off-plan, then rent out', 'Buy off-plan 15–25% below the completed price, rent out at handover. Capital gain plus rent.'],
      ],
    },
    budget: {
      question: 'What is your total available budget?',
      sub: BUDGET_SUB_INVEST,
      options: [
        ['Under €200,000', 'Rental studio in JVC/DSO: 8–9% gross, about €1,100/month. Dubai’s best rent-to-price ratio.'],
        ['€200,000 – €400,000', '1-bedroom in Marina/JLT: about €1,500–1,900/month in rent. Huge demand from young professionals, almost no vacancy.'],
        ['€400,000 – €700,000', '2-bedroom in Dubai Hills/Business Bay: steady family rents, long leases, solvent tenants.'],
        ['€700,000 – €1.5M', 'Premium Downtown/Palm: high rents plus Golden Visa included. High-end Airbnb is very profitable.'],
        ['Over €1.5M', 'Villa or penthouse: ultra-premium rents, corporate and wealthy clients. Scarcity means pricing power.'],
      ],
    },
    first_rent: {
      question: 'When do you want to collect your first rent?',
      sub: 'A completed property lets in 2–6 weeks. Off-plan waits for handover but costs 15–25% less to buy.',
      options: [
        ['From next month', 'Completed property, ideally already let with the lease transferred. Rent comes in at signing, or nearly.'],
        ['Within 6 to 12 months', 'Completed property to optimise: careful Airbnb furnishing means +20% rent compared with unfurnished.'],
        ['In 2–3 years, I optimise the price', 'Off-plan with staged payments: you buy for less and rent starts at handover.'],
        ['No rush — I am building an income', 'Wealth horizon: rents reinvested, and no inheritance tax in Dubai.'],
      ],
    },
    vacancy_risk: {
      question: 'Two months without a tenant: how do you react?',
      sub: 'Average vacancy in Dubai is under 6 weeks a year in established areas. Your tolerance sets the area and property type we recommend.',
      options: [
        ['Not acceptable, I need it guaranteed', 'Completed property with a tenant in place and the lease transferred. Income from month one, no uncertainty.'],
        ['I have the cash to absorb it', 'Established high-demand areas (JLT, Business Bay). Quick re-letting, often at a higher rent.'],
        ['I trade it for a better return', 'Seasonal Airbnb: summer lows accepted, high season at 2× the rent. Higher net over the year.'],
        ['I aim for maximum yield, I will manage', 'Emerging areas at 9%+: vacancy possible at first, offset by a purchase price 30% lower.'],
      ],
    },
    tenant: {
      question: 'Which tenant do you want to attract?',
      sub: 'The target tenant determines the neighbourhood, the size, the stability of the rent and the occupancy rate.',
      options: [
        ['Young professionals & expats', 'JVC, JLT, DSO. Studios and 1BR. 7–9% yield, controlled turnover, strong demand all year.'],
        ['Expat families', 'Dubai Hills, Creek Harbour. 2–3 year leases, stable and solvent tenants. Minimal vacancy.'],
        ['Premium tourists (Airbnb)', 'Palm, JBR, Marina. 70–85% occupancy, rents 2× long-term in high season.'],
        ['Executives & companies', 'Business Bay, Downtown. Corporate leases paid a year in advance. Premium rent, no arrears.'],
      ],
    },
  },
  residence: {
    living_mode: {
      question: 'How will you live in this property?',
      sub: 'James adapts the neighbourhood, the size and the set-up: year-round home, pied-à-terre or a full family move.',
      options: [
        ['I live there all year', 'Main residence in Dubai: 0% income tax, with world-class safety and quality of life.'],
        ['Pied-à-terre + Airbnb the rest', 'You stay a few weeks a year; the property pays for itself the rest of the time (7–9%).'],
        ['Home + 10-year Golden Visa', 'Investment of €545,000 or more → 10-year visa for the whole family: schools, healthcare, UAE bank account.'],
        ['I am moving my family', 'Family neighbourhoods, international schools nearby, secure villas and large apartments.'],
      ],
    },
    budget: {
      question: 'What is your total available budget?',
      sub: 'Total budget = property price + 4% DLD fee + 2% agency fee. Non-residents can borrow up to 60–70% from UAE banks.',
      options: [
        ['Under €200,000', 'Studio or compact 1BR in JVC or Arjan. Ideal pied-à-terre, service charges under control.'],
        ['€200,000 – €400,000', '1-bedroom in Marina or Downtown: live in the heart of the city, with a view and everything on foot.'],
        ['€400,000 – €700,000', '2–3 bedrooms in Dubai Hills or Creek Harbour: perfect for a family, schools nearby.'],
        ['€700,000 – €1.5M', 'Large premium apartment, automatic Golden Visa. Downtown, Palm, Bluewaters.'],
        ['Over €1.5M', 'Villa with garden and pool: Emirates Hills, Palm, Dubai Hills. The peak of residential luxury.'],
      ],
    },
    move_in: {
      question: 'When do you plan to move in?',
      sub: 'A completed property means keys in 30 days. New off-plan means a 2–3 year wait, but customisation and a price 15–25% lower.',
      options: [
        ['As soon as possible', 'Completed property, deal closed in 30–45 days. You move in once it is registered with the DLD.'],
        ['Within a year', 'Time to compare neighbourhoods, visit in person and negotiate calmly.'],
        ['In 2–3 years, in a new build', 'Off-plan: you choose the floor, the view and the finishes. Staged payments during construction.'],
        ['Flexible, depending on the opportunity', 'You wait for the right deal: James watches the market and alerts you at the right time.'],
      ],
    },
    home_priority: {
      question: 'What matters most to you?',
      sub: 'Even as a home, a property in Dubai is still an asset: better to pick an address that gains value.',
      options: [
        ['Peace of mind & build quality', 'Top-tier developers (Emaar, Meraas), secure residences, flawless building management.'],
        ['Resale value', 'Downtown, Creek Harbour: +18% in 2024. Your home is also your best investment.'],
        ['Prestige and the view', 'Palm, Bluewaters, Downtown with a Burj Khalifa view: addresses that never go out of style.'],
        ['The best price per m²', 'Dubai South, Al Furjan: 30–40% below the established market, infrastructure on its way.'],
      ],
    },
    lifestyle: {
      question: 'What kind of surroundings are you looking for?',
      sub: 'Every Dubai neighbourhood has its own personality. Your daily lifestyle determines the right choice.',
      options: [
        ['Urban and lively', 'Downtown, Marina: towers, restaurants, nightlife. Everything on foot, metro nearby.'],
        ['Family-friendly and green', 'Dubai Hills, Arabian Ranches: parks, golf, international schools, quiet communities.'],
        ['Right on the water', 'Palm Jumeirah, JBR, Bluewaters: private beach, beach clubs, a resort feel every day.'],
        ['Quiet, new and affordable', 'Dubai South, MBR City: new residences, plenty of space, 20 minutes from everything.'],
      ],
    },
  },
  location: {
    rent_duration: {
      question: 'How long do you want to rent for?',
      sub: 'Léa steers the search: very flexible furnished short stays, or a standard annual lease (Ejari), which is much cheaper.',
      options: [
        ['A few weeks to 3 months', 'Furnished, all-inclusive, no paperwork. Ideal for an assignment, remote work or scouting before a move.'],
        ['3 to 12 months', 'Flexible monthly rentals: 10–20% below the nightly rate, with no annual commitment.'],
        ['Standard annual lease', 'The Dubai standard (Ejari): 20–40% cheaper per month, paid in 1 to 4 cheques.'],
        ['Several years', 'Negotiate: a long lease means frozen rent and an accommodating landlord. Stability for the family.'],
      ],
    },
    monthly_budget: {
      question: 'What is your monthly rent budget?',
      sub: 'In Dubai, annual rent is often paid in 1 to 4 cheques. The fewer the cheques, the more negotiating power you have.',
      options: [
        ['Under €1,500', 'Studio in JVC, DSO or Arjan. Recent buildings, pool and gym included.'],
        ['€1,500 – €3,000', '1-bedroom in Marina, JLT or Business Bay. The heart of the expat rental market.'],
        ['€3,000 – €6,000', '2–3 bedrooms in Dubai Hills or Downtown. Family standard, open views.'],
        ['Over €6,000', 'Penthouse or villa: Palm, Emirates Hills, Bluewaters. Hotel-level services.'],
      ],
    },
    move_date: {
      question: 'When do you want to move in?',
      sub: 'The rental market moves fast: the best places go within 48 hours. Get your documents ready (passport, visa, cheques).',
      options: [
        ['This week', 'Furnished and available immediately. Léa shortlists and arranges viewings within 24 hours.'],
        ['Within the month', 'The right timing to visit, compare several places and negotiate without pressure.'],
        ['In 1 to 3 months', 'Alert on: Léa sends you new matching listings as soon as they come out.'],
        ['I am just looking for now', 'Discover the neighbourhoods and real prices before deciding. No commitment.'],
      ],
    },
    furnishing: {
      question: 'Furnished, unfurnished, with services?',
      sub: '80% of short lets are furnished. On an annual lease, unfurnished is 15–20% cheaper.',
      options: [
        ['Furnished, move-in ready', 'One suitcase and that is it: bedding, fitted kitchen, wifi. The standard in tourist areas.'],
        ['Unfurnished', 'Your furniture, your style. Rent 15–20% lower, ideal for a long stay.'],
        ['Serviced residence', 'Cleaning, concierge, room service. Hotel comfort with the space of an apartment.'],
        ['No preference: the best deal first', 'Léa compares the whole market and finds you the best value, full stop.'],
      ],
    },
    lifestyle_rent: {
      question: 'What lifestyle in Dubai?',
      sub: 'The neighbourhood makes the experience: commute, restaurants, beach, schools. Choose your daily life.',
      options: [
        ['Urban, out every night', 'Downtown, Marina: rooftops, restaurants, Marina Walk. The city that never sleeps.'],
        ['Beach and sunshine', 'JBR, Palm: the beach at the foot of the tower, beach clubs and sunsets every day.'],
        ['Family-friendly and peaceful', 'Dubai Hills, Mirdif: parks, international schools, green residential communities.'],
        ['Smart: most m² for my rent', 'JVC, Al Furjan: 30% cheaper than prime areas, new fully equipped residences.'],
      ],
    },
  },
};

/**
 * Parcours d'un conseiller dans la langue du chat : mêmes identifiants et
 * mêmes effets sur le profil, seuls les textes changent. Une question non
 * traduite garde son texte français plutôt que de disparaître.
 */
export function localizedTree(agentId: string, lang: ChatLang): TreeStep[] {
  const tree = AGENT_TREES[agentId] ?? [];
  if (lang === 'fr') return tree;
  const en = STEPS_EN[agentId] ?? {};
  return tree.map(step => {
    const tr = en[step.id];
    if (!tr || tr.options.length !== step.options.length) return step;
    return {
      ...step,
      question: tr.question,
      sub: tr.sub,
      options: step.options.map((o, i) => ({ ...o, label: tr.options[i][0], desc: tr.options[i][1] })),
    };
  });
}
