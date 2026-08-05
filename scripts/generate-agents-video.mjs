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

const PROMPT = 'Photorealistic subtle cinemagraph of this exact professional person. Keep the identical face, identity, skin tone, eye color, hair and clothing. The person stays SILENT and does NOT speak: mouth kept closed with a gentle warm closed-mouth smile, no talking, no lip movement, no mouth opening. They only breathe gently and naturally, blink softly once or twice, with a very slight natural head and shoulder movement. Completely silent scene, quiet ambient room tone only, no voice, no speech, no music. Locked-off tripod camera, absolutely no zoom and no camera movement, framing unchanged. Background city bokeh lights twinkle softly. Calm, elegant, alive, high-end corporate portrait. No text, no watermark.';

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
      prompt: PROMPT,
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
    // web-léger : muet, recadré 3:4 (supprime le letterbox 9:16 de Veo), 800 de haut, faststart
    execSync(`"${FFMPEG}" -y -i ${raw} -an -c:v libx264 -crf 26 -preset slow -vf "crop=in_w:in_w*4/3,scale=-2:800" -movflags +faststart -pix_fmt yuv420p ${out}`, { stdio: 'ignore' });
    execSync(`rm -f ${raw}`);
    console.log(`[${id}] web → ${out}`);
  } else {
    execSync(`mv ${raw} ${out}`);
    console.log(`[${id}] (ffmpeg absent) → ${out} tel quel`);
  }
}
console.log('\nTerminé.');
