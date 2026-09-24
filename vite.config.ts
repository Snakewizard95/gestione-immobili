import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// "base" deve coincidere con il nome del repository pubblico su GitHub Pages:
// il sito sarà pubblicato a https://TUONOME.github.io/gestione-immobili/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: '/gestione-immobili/',
})
