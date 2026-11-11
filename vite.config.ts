
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// https://vitejs.dev/config/
export default defineConfig(() => {
  
  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    // MapLibre n'est importé que par un chunk lazy : sans pré-bundling, Vite le
    // découvre au premier clic « Carte 3D » et recharge la page en dev. Le
    // worker, lui, est fourni explicitement (setWorkerUrl, Property3DMap.tsx).
    optimizeDeps: {
      include: ['maplibre-gl'],
    },
    build: {
      // Keep warnings quiet and encourage better chunking
      chunkSizeWarningLimit: 1500, // kB
      rollupOptions: {
        output: {
          // Split big deps so the main chunk stays lean
          // Fonction et non objet : avec `{ charts: ['recharts'] }`, Rollup
          // rangeait aussi dans ce chunk des dépendances partagées (clsx…) que
          // la page d'accueil importe, ce qui forçait le préchargement des
          // 119 kB gz de graphiques dès l'arrivée sur le site.
          manualChunks(id) {
            if (/node_modules\/(recharts|d3-[^/]+|victory-vendor|internmap|decimal\.js-light|recharts-scale)\//.test(id)) return 'charts';
            if (/node_modules\/lucide-react\//.test(id)) return 'icons';
            // React et ses helpers CJS dans leur propre chunk : sinon Rollup les
            // loge dans `charts` (premier importeur) et l'accueil doit le précharger.
            if (/node_modules\/(react|react-dom|scheduler|react-is)\//.test(id)) return 'react';
            return undefined;
          },
        },
      },
    },
    // Ne JAMAIS injecter de clé d'API dans le bundle navigateur (`define`) :
    // tout ce qui est injecté ici est lisible par n'importe quel visiteur.
    // Les appels Gemini / Claude passent par les fonctions serveur `api/*`.
  }
})
