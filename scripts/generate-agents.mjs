import { GoogleGenAI } from '@google/genai';
import { writeFileSync } from 'node:fs';
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
const MODEL = 'gemini-2.5-flash-image';

const agents = [
  { file: 'agent-locatif', prompt: 'Ultra-realistic professional corporate headshot photograph of a confident male real estate investment advisor, early 40s, short dark hair, clean well-groomed look, wearing a tailored deep navy suit with a subtle tie, warm confident closed-mouth smile, premium studio lighting, shallow depth of field, dark elegant background with soft golden bokeh evoking Dubai skyline at dusk, high-end LinkedIn executive headshot, photorealistic, 8k, sharp eyes, no text, no watermark' },
  { file: 'agent-residence', prompt: 'Ultra-realistic professional corporate headshot photograph of a warm approachable male real estate advisor specialized in primary homes, mid 30s, short neat hair with a light trimmed beard, wearing a smart charcoal blazer over an open-collar white shirt, friendly genuine smile, premium studio lighting, shallow depth of field, dark elegant background with soft golden bokeh evoking Dubai skyline, high-end executive headshot, photorealistic, 8k, sharp eyes, no text, no watermark' },
  { file: 'agent-location', prompt: 'Ultra-realistic professional corporate headshot photograph of an elegant confident female real estate rental advisor, early 30s, shoulder-length dark brown hair, refined natural makeup, wearing an elegant cream tailored blazer, warm professional smile, premium studio lighting, shallow depth of field, dark elegant background with soft golden bokeh evoking Dubai skyline, high-end executive headshot, photorealistic, 8k, sharp eyes, no text, no watermark' },
];

for (const a of agents) {
  console.log('Génération', a.file, '…');
  const resp = await ai.models.generateContent({
    model: MODEL,
    contents: a.prompt,
    config: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '3:4' } },
  });
  const parts = resp?.candidates?.[0]?.content?.parts ?? [];
  const b64 = parts.find(p => p?.inlineData?.data)?.inlineData?.data;
  if (!b64) { console.error('  échec', a.file, JSON.stringify(resp).slice(0,200)); continue; }
  writeFileSync(`public/agents/${a.file}.png`, Buffer.from(b64, 'base64'));
  console.log('  OK → public/agents/' + a.file + '.png');
}
console.log('Terminé.');
