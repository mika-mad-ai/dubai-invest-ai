/**
 * Installe les boucles idle générées par Veo.
 *
 * Recadre, démuxe l'audio, construit un boomerang pour une boucle sans coupure,
 * puis MESURE le mouvement avant d'installer. Le garde-fou est le cœur du script :
 * les deux générations précédentes ont échoué exactement là — soit un portrait
 * vivant qui articule en continu, soit un portrait muet mais figé. Un contrôle
 * visuel ne suffit pas, une bouche qui s'ouvre une seule fois passe inaperçue à
 * l'œil et devient évidente en boucle.
 *
 * Aucune clé API. Usage :
 *   npm run avatars:idle                 # lit ~/Desktop/veo-idles/<id>.mp4
 *   npm run avatars:idle -- --dir=/chemin --force
 */

import { existsSync, mkdtempSync, copyFileSync, statSync, readFileSync } from 'fs';
import { spawnSync } from 'child_process';
import { tmpdir, homedir } from 'os';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const AGENTS = ['locatif', 'residence', 'location'];

const args = process.argv.slice(2);
const argOf = (name, def) => {
  const hit = args.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : def;
};
const SRC_DIR = argOf('dir', join(homedir(), 'Desktop', 'veo-idles'));
const FORCE = args.includes('--force');

// ─── ffmpeg ─────────────────────────────────────────────────────────────────
function findFfmpeg() {
  try {
    const p = require(resolve(ROOT, 'node_modules/ffmpeg-static/package.json'));
    void p;
    return resolve(ROOT, 'node_modules/ffmpeg-static/ffmpeg');
  } catch {
    const which = spawnSync('which', ['ffmpeg'], { encoding: 'utf8' });
    if (which.status === 0) return which.stdout.trim();
    return null;
  }
}
const FF = findFfmpeg();
if (!FF || !existsSync(FF)) {
  console.error('ffmpeg introuvable. Installe-le : npm i -D ffmpeg-static');
  process.exit(1);
}
const run = a => spawnSync(FF, a, { encoding: 'utf8', maxBuffer: 80e6 });

// ─── Mesure du mouvement ────────────────────────────────────────────────────
/** Luminance moyenne de la différence entre images consécutives, à 10 fps. */
function motion(file, crop) {
  const vf = [
    crop ? `crop=${crop}` : null,
    'fps=10', 'scale=140:-2', 'format=gray',
    'tblend=all_mode=difference', 'signalstats', 'metadata=print',
  ].filter(Boolean).join(',');
  // ffmpeg écrit les métadonnées de filtre sur stderr, pas stdout.
  const r = run(['-v', 'info', '-i', file, '-vf', vf, '-f', 'null', '-']);
  const out = (r.stdout || '') + (r.stderr || '');
  const v = [...out.matchAll(/lavfi\.signalstats\.YAVG=([\d.]+)/g)]
    .map(m => parseFloat(m[1]))
    .slice(1); // la 1re image n'a pas de précédente
  if (!v.length) return { mean: 0, max: 0, n: 0 };
  return { mean: v.reduce((a, b) => a + b, 0) / v.length, max: Math.max(...v), n: v.length };
}

/** Bande basse et centrale du visage sur un cadrage buste 3:4. */
const MOUTH_CROP = 'in_w*0.42:in_h*0.20:in_w*0.29:in_h*0.40';

/**
 * Seuils calibrés sur les générations mesurées :
 *   vivant     : e273016 était entre 3,4 et 9,6 · f09190f entre 0,42 et 0,81
 *   sans parler: e273016 (parlant) entre 4,6 et 11,2 sur la zone bouche
 * On compare la bouche au mouvement global : une bouche qui bouge nettement plus
 * que le reste du cadre articule ; une bouche qui suit le mouvement de tête non.
 */
const ALIVE_MIN = 1.2;
const MOUTH_RATIO_MAX = 2.4;

const results = [];

for (const id of AGENTS) {
  const src = join(SRC_DIR, `${id}.mp4`);
  const dest = resolve(ROOT, 'public', 'agents', `agent-${id}-idle.mp4`);

  if (!existsSync(src)) {
    results.push({ id, status: 'absent', detail: src });
    continue;
  }

  const work = mkdtempSync(join(tmpdir(), `veo-${id}-`));
  const cropped = join(work, 'cropped.mp4');
  const boomerang = join(work, 'idle.mp4');

  // 1. Recadrage 3:4 + 600x800 + suppression de l'audio, comme les fichiers en place.
  const c = run(['-y', '-i', src, '-an',
    '-vf', 'crop=in_w:in_w*4/3,scale=600:800,setsar=1',
    '-c:v', 'libx264', '-crf', '24', '-preset', 'medium', '-pix_fmt', 'yuv420p', cropped]);
  if (!existsSync(cropped)) {
    results.push({ id, status: 'échec recadrage', detail: (c.stderr || '').split('\n').slice(-3).join(' ') });
    continue;
  }

  // 2. Mesure AVANT boomerang : le retour doublerait artificiellement le mouvement.
  const g = motion(cropped, null);
  const m = motion(cropped, MOUTH_CROP);
  const ratio = g.mean > 0 ? m.mean / g.mean : Infinity;
  const alive = g.mean >= ALIVE_MIN;
  const silent = ratio <= MOUTH_RATIO_MAX;

  const verdict = { global: g.mean, mouth: m.mean, ratio, alive, silent };

  if (!FORCE && (!alive || !silent)) {
    results.push({
      id,
      status: 'REFUSÉ',
      detail: [
        !alive ? `trop figé (mouvement ${g.mean.toFixed(2)} < ${ALIVE_MIN})` : null,
        !silent ? `la bouche bouge trop (rapport ${ratio.toFixed(2)} > ${MOUTH_RATIO_MAX}) — il parle` : null,
      ].filter(Boolean).join(' · '),
      verdict,
    });
    continue;
  }

  // 3. Boomerang : aller puis retour, pour que la boucle n'ait aucune coupure.
  const b = run(['-y', '-i', cropped, '-an',
    '-filter_complex', '[0:v]split[a][b];[b]reverse[r];[a][r]concat=n=2:v=1[out]',
    '-map', '[out]', '-c:v', 'libx264', '-crf', '26', '-preset', 'slow',
    '-movflags', '+faststart', '-pix_fmt', 'yuv420p', boomerang]);
  if (!existsSync(boomerang)) {
    results.push({ id, status: 'échec boomerang', detail: (b.stderr || '').split('\n').slice(-3).join(' ') });
    continue;
  }

  // 4. Sauvegarde puis installation.
  if (existsSync(dest)) copyFileSync(dest, `${dest}.bak`);
  copyFileSync(boomerang, dest);

  results.push({
    id,
    status: 'installé',
    detail: `${Math.round(statSync(dest).size / 1024)} Ko`,
    verdict,
  });
}

// ─── Rapport ────────────────────────────────────────────────────────────────
console.log('\nTRAITEMENT DES BOUCLES IDLE VEO');
console.log(`source : ${SRC_DIR}\n`);
console.log('agent        statut       mvt global  bouche  rapport   détail');
for (const r of results) {
  const v = r.verdict;
  const nums = v
    ? `${v.global.toFixed(2).padStart(10)}  ${v.mouth.toFixed(2).padStart(6)}  ${v.ratio.toFixed(2).padStart(7)}`
    : ''.padStart(26);
  console.log(`${r.id.padEnd(12)} ${r.status.padEnd(12)}${nums}   ${r.detail}`);
}

const installed = results.filter(r => r.status === 'installé').map(r => r.id);
const refused = results.filter(r => r.status === 'REFUSÉ');

if (refused.length) {
  console.log('\n⚠️  Fichiers refusés : régénère-les avec le prompt de docs/AVATARS_VEO.md.');
  console.log('   Pour passer outre malgré la mesure : npm run avatars:idle -- --force');
}

if (installed.includes('location')) {
  const comp = readFileSync(resolve(ROOT, 'components/AgentsSection.tsx'), 'utf8');
  if (/idleFromPhoto:\s*true/.test(comp)) {
    console.log('\n→ Léa a maintenant une vraie boucle muette : retire `idleFromPhoto: true`');
    console.log('  dans components/AgentsSection.tsx (il n\'existait que par défaut de source).');
  }
}

if (installed.length) console.log(`\nEnsuite : npm run build && vercel --prod`);
process.exit(refused.length && !FORCE ? 1 : 0);
