
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
          manualChunks: {
            charts: ['recharts'],
            icons: ['lucide-react'],
          },
        },
      },
    },
    // Ne JAMAIS injecter de clé d'API dans le bundle navigateur (`define`) :
    // tout ce qui est injecté ici est lisible par n'importe quel visiteur.
    // Les appels Gemini / Claude passent par les fonctions serveur `api/*`.
  }
})
