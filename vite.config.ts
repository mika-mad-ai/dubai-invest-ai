
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Charge les variables du fichier .env
  const env = loadEnv(mode, process.cwd(), '');
  
  return {
    plugins: [react()],
    define: {
      // Permet au code d'utiliser process.env.API_KEY comme prévu par le SDK Gemini
      'process.env.API_KEY': JSON.stringify(env.API_KEY),
    },
  }
})
