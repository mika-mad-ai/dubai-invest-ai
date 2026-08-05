import { GoogleGenAI } from '@google/genai';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';

// Charge la clé depuis .env.local (jamais en clair sur la ligne de commande → évite toute fuite)
function loadEnvLocal() {
  if (process.env.API_KEY) return process.env.API_KEY;
  if (existsSync('.env.local')) {
    for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
      const m = line.match(/^\s*API_KEY\s*=\s*(.+?)\s*$/);
      if (m) return m[1].replace(/^["']|["']$/g, '');
    }
  }
  return undefined;
}
const API_KEY = loadEnvLocal();
if (!API_KEY) { console.error('Aucune clé API_KEY trouvée (ni env, ni .env.local).'); process.exit(1); }
const ai = new GoogleGenAI({ apiKey: API_KEY });
// Ordre de préférence : qualité réaliste max → repli si indispo/quota
const MODELS = ['gemini-3-pro-image', 'gemini-3.1-flash-image', 'gemini-2.5-flash-image'];

const agents = [
  { file: 'agent-locatif', prompt: 'Ultra-realistic professional corporate headshot photograph of a confident Middle-Eastern Arab male real estate investment advisor, early 40s, warm olive skin, short dark hair, neatly groomed short dark beard, dark brown eyes, wearing a tailored deep navy suit with a subtle tie, warm confident closed-mouth smile, premium studio lighting, shallow depth of field, dark elegant background with soft golden bokeh evoking Dubai skyline at dusk, high-end executive headshot, photorealistic, 8k, sharp eyes, no text, no watermark' },
  { file: 'agent-residence', prompt: 'Ultra-realistic professional corporate headshot photograph of a warm approachable English British Caucasian male real estate advisor specialized in primary homes, mid 30s, fair skin, short neat light-brown hair, clean-shaven with very light stubble, blue-grey eyes, wearing a smart charcoal blazer over an open-collar white shirt, friendly genuine smile, premium studio lighting, shallow depth of field, dark elegant background with soft golden bokeh evoking Dubai skyline, high-end executive headshot, photorealistic, 8k, sharp eyes, no text, no watermark' },
  { file: 'agent-location', prompt: 'Ultra-realistic professional corporate headshot photograph of an elegant confident mixed-race biracial female real estate rental advisor, early 30s, light caramel skin, striking clear blue eyes, shoulder-length dark brown wavy hair, refined natural makeup, wearing an elegant cream tailored blazer, warm professional smile, premium studio lighting, shallow depth of field, dark elegant background with soft golden bokeh evoking Dubai skyline, high-end executive headshot, photorealistic, 8k, sharp blue eyes, no text, no watermark' },
];

for (const a of agents) {
  console.log('Génération', a.file, '…');
  let b64, used;
  for (const model of MODELS) {
    try {
      const resp = await ai.models.generateContent({
        model,
        contents: a.prompt,
        config: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '3:4' } },
      });
      const parts = resp?.candidates?.[0]?.content?.parts ?? [];
      b64 = parts.find(p => p?.inlineData?.data)?.inlineData?.data;
      if (b64) { used = model; break; }
    } catch (e) {
      console.warn(`  ${model} indispo (${String(e.message || e).slice(0, 60)}) → repli…`);
    }
  }
  if (!b64) { console.error('  échec total', a.file); continue; }
  writeFileSync(`public/agents/${a.file}.png`, Buffer.from(b64, 'base64'));
  console.log(`  OK (${used}) → public/agents/${a.file}.png`);
}
console.log('Terminé.');
