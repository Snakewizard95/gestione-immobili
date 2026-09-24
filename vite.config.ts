import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'node:fs'
import path from 'node:path'
import type { Plugin } from 'vite'

/** Solo in sviluppo sul Mac: rende leggibili i file Excel della cartella ../dati-excel (mai pubblicati). */
function datiExcelLocali(): Plugin {
  return {
    name: 'dati-excel-locali',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/dati-excel', (req, res, next) => {
        const nome = decodeURIComponent((req.url ?? '/').split('?')[0])
        const file = path.join(__dirname, '..', 'dati-excel', nome)
        if (!nome.includes('..') && fs.existsSync(file) && fs.statSync(file).isFile()) {
          res.setHeader('Content-Type', 'application/octet-stream')
          if (req.method === 'HEAD') { res.end(); return }
          fs.createReadStream(file).pipe(res)
        } else next()
      })
    },
  }
}

// "base" deve coincidere con il nome del repository pubblico su GitHub Pages:
// il sito sarà pubblicato a https://TUONOME.github.io/gestione-immobili/
export default defineConfig({
  plugins: [react(), tailwindcss(), datiExcelLocali()],
  base: '/gestione-immobili/',
})
