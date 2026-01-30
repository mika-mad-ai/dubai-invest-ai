
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Charge les variables du fichier .env
  const env = loadEnv(mode, process.cwd(), '');
  
  return {
    plugins: [react()],
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
    define: {
      // Permet au code d'utiliser process.env.API_KEY comme prévu par le SDK Gemini
      'process.env.API_KEY': JSON.stringify(env.API_KEY),
    },
  }
})
