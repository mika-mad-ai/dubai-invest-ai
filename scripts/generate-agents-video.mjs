/**
 * Anime les portraits des agents en cinemagraphs subtils (effet "vivant")
 * via Veo 3.1 image→vidéo, puis ré-encode en MP4 web léger (loop, muet).
 *
 * Clé lue depuis process.env.API_KEY ou .env.local (jamais en clair en CLI).
 * Usage : node scripts/generate-agents-video.mjs [locatif|residence|location ...]
 *   (sans argument → les trois)
 */
import { GoogleGenAI } from '@google/genai';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

function loadKey() {
  if (process.env.API_KEY) return process.env.API_KEY;
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  if (existsSync('.env.local')) {
    for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
      const m = line.match(/^\s*API_KEY\s*=\s*(.+?)\s*$/);
      if (m) return m[1].replace(/^["']|["']$/g, '');
    }
  }
  return undefined;
}
const KEY = loadKey();
if (!KEY) { console.error('API_KEY introuvable'); process.exit(1); }
const ai = new GoogleGenAI({ apiKey: KEY });

// ffmpeg : binaire du scratchpad si présent, sinon "ffmpeg" du PATH
const FFMPEG_CANDIDATES = [
  '/private/tmp/claude-501/-Users-mickaelabramovici-Desktop-DubaiInvest-AI-Advisor/daba85f1-085f-4218-b351-c9803b50618a/scratchpad/ffmpeg/node_modules/ffmpeg-static/ffmpeg',
  'ffmpeg',
];
const FFMPEG = FFMPEG_CANDIDATES.find(p => { try { execSync(`"${p}" -version`, { stdio: 'ignore' }); return true; } catch { return false; } });

// Base commune : réalisme, mouvement PERMANENT, sourire + hochement, sans parole.
const BASE = 'Photorealistic video, keep the exact same face, identity, skin tone, eye color, hair, clothing and background as the input image. Warm, welcoming and lively person with a genuine warm smile and gentle head nods. Continuous natural motion the ENTIRE time so the person never looks frozen or static — subtle breathing, small head and shoulder sways, occasional natural blink. The person does NOT speak: the lips form a smile, not words, no talking, no lip-sync. Locked-off camera, no zoom, no camera movement. Elegant high-end corporate portrait, no text, no watermark, no subtitles.';

// Geste spécifique par agent (les mains montent dans le cadre pour la salutation).
const GESTURES = {
  locatif: ' He brings both palms together in front of his chest in a warm respectful salaam / namaste greeting, gently closing his eyes and giving a small polite bow of the head, then looks back up with a warm smile — repeated as a gentle continuous welcoming motion.',
  residence: ' He raises one hand up into frame and gives a friendly welcoming wave toward the viewer, smiling warmly and nodding gently, in a relaxed natural continuous way.',
  location: ' She raises one hand up into frame in a friendly welcoming wave / greeting toward the viewer, smiling warmly and nodding gently, in an elegant natural continuous way.',
};
const promptFor = (id) => BASE + (GESTURES[id] ?? '');

const ALL = ['locatif', 'residence', 'location'];
const targets = (process.argv.slice(2).length ? process.argv.slice(2) : ALL);

for (const id of targets) {
  const src = `public/agents/agent-${id}.png`;
  if (!existsSync(src)) { console.error('image absente:', src); continue; }
  const imageBytes = readFileSync(src).toString('base64');

  // Le filtre audio de Veo se déclenche aléatoirement (non facturé) → jusqu'à 4 essais.
  let v;
  for (let attempt = 1; attempt <= 4 && !v; attempt++) {
    console.log(`\n[${id}] Veo 3.1 image→vidéo (essai ${attempt})…`);
    let op = await ai.models.generateVideos({
      model: 'veo-3.1-generate-preview',
      prompt: promptFor(id),
      image: { imageBytes, mimeType: 'image/png' },
      config: { aspectRatio: '9:16', numberOfVideos: 1 },
    });
    const deadline = Date.now() + 8 * 60 * 1000;
    while (!op?.done && Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 10000));
      op = await ai.operations.getVideosOperation({ operation: op });
      process.stdout.write('.');
    }
    if (!op?.done) { console.error(`\n[${id}] TIMEOUT essai ${attempt}`); continue; }
    v = op?.response?.generatedVideos?.[0]?.video;
    if (!v) {
      const reason = JSON.stringify(op?.response ?? op).slice(0, 160);
      console.error(`\n[${id}] filtré essai ${attempt}: ${reason}`);
    }
  }
  if (!v) { console.error(`\n[${id}] échec après 4 essais`); continue; }

  const raw = `public/agents/agent-${id}-raw.mp4`;
  if (v.videoBytes) writeFileSync(raw, Buffer.from(v.videoBytes, 'base64'));
  else { const r = await fetch(`${v.uri}&key=${KEY}`); writeFileSync(raw, Buffer.from(await r.arrayBuffer())); }
  console.log(`\n[${id}] brut → ${raw}`);

  const out = `public/agents/agent-${id}.mp4`;
  if (FFMPEG) {
    // muet + recadré 3:4 (supprime le letterbox 9:16) + BOOMERANG (avant/arrière) →
    // mouvement continu et boucle parfaitement sans coupure (pas de "reset").
    execSync(`"${FFMPEG}" -y -i ${raw} -an -filter_complex "[0:v]crop=in_w:in_w*4/3,scale=-2:800,setsar=1,split[a][b];[b]reverse[r];[a][r]concat=n=2:v=1[out]" -map "[out]" -c:v libx264 -crf 28 -preset slow -movflags +faststart -pix_fmt yuv420p ${out}`, { stdio: 'ignore' });
    execSync(`rm -f ${raw}`);
    console.log(`[${id}] web (boomerang) → ${out}`);
  } else {
    execSync(`mv ${raw} ${out}`);
    console.log(`[${id}] (ffmpeg absent) → ${out} tel quel`);
  }
}
console.log('\nTerminé.');
