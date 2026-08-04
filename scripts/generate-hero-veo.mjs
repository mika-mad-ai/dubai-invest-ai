/**
 * Génère la vidéo du hero via Veo 3.1 (Gemini), la télécharge, puis
 * (si ffmpeg dispo) la ré-encode "scrub-friendly" dans public/hero-scrub.mp4.
 *
 * Prérequis : plafond de dépense Gemini suffisant (ai.studio/spend) — Veo est payant.
 * Lancer :  API_KEY=xxxx node scripts/generate-hero-veo.mjs
 * Puis :    git add public/hero-scrub.mp4 && git commit && vercel --prod
 */
import { GoogleGenAI } from '@google/genai';
import { writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

const KEY = process.env.API_KEY || process.env.GEMINI_API_KEY;
if (!KEY) { console.error('API_KEY manquante'); process.exit(1); }
const ai = new GoogleGenAI({ apiKey: KEY });
const RAW = 'public/hero-veo-raw.mp4';
const OUT = 'public/hero-scrub.mp4';

// Story-board condensé en un mouvement de caméra continu (Veo = ~8s/plan).
// Pour la version multi-plans, générer chaque plan puis raccorder (voir docs/HERO_SEQUENCE.md).
const prompt = `Cinematic continuous aerial-to-interior shot, photorealistic 8k, Dubai. Opens on calm turquoise sea meeting golden desert dunes at golden hour. Glass-and-steel skyscrapers rapidly assemble from flying fragments, snapping into place like magnetically reassembled, forming the Dubai skyline. Camera pushes forward and zooms toward the Burj Khalifa which builds itself segment by segment from base to tip. Continue the smooth forward zoom through a floor-to-ceiling window into a luxury penthouse that assembles itself, then out onto a terrace with an infinity pool whose water rises and fills on its own, overlooking the glowing skyline. Smooth cinematic camera motion, no text, no people, warm golden light, deep blue sky.`;

console.log('Veo 3.1 : lancement…');
let op = await ai.models.generateVideos({ model: 'veo-3.1-generate-preview', prompt, config: { aspectRatio: '16:9', numberOfVideos: 1 } });
const deadline = Date.now() + 10 * 60 * 1000;
while (!op?.done && Date.now() < deadline) {
  await new Promise(r => setTimeout(r, 12000));
  op = await ai.operations.getVideosOperation({ operation: op });
  process.stdout.write('.');
}
if (!op?.done) { console.error('\nTIMEOUT'); process.exit(2); }
const v = op?.response?.generatedVideos?.[0]?.video;
if (!v) { console.error('\nPas de vidéo:', JSON.stringify(op?.response ?? op).slice(0, 400)); process.exit(3); }

if (v.videoBytes) writeFileSync(RAW, Buffer.from(v.videoBytes, 'base64'));
else { const r = await fetch(`${v.uri}&key=${KEY}`); writeFileSync(RAW, Buffer.from(await r.arrayBuffer())); }
console.log('\nVidéo brute →', RAW);

// Ré-encodage scrub-friendly si ffmpeg présent
try {
  execSync(`ffmpeg -y -i ${RAW} -an -c:v libx264 -crf 24 -preset slow -g 4 -keyint_min 4 -sc_threshold 0 -movflags +faststart -pix_fmt yuv420p ${OUT}`, { stdio: 'ignore' });
  console.log('Ré-encodé scrub-friendly →', OUT);
} catch {
  console.log(`ffmpeg absent : ré-encode manuellement ${RAW} → ${OUT} (voir docs/HERO_SEQUENCE.md), keyframes -g 4.`);
}
