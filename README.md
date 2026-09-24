# gestione-immobili — codice del sito

Repository PUBBLICO: contiene solo il programma, nessun dato. I dati sono nel repository privato
`gestione-immobili-dati`. Il token di accesso è in `src/config.token.json` **cifrato** con la
password condivisa (vedi `docs/` nel progetto principale).

```bash
npm install          # prima volta
npm run dev          # sviluppo: http://localhost:5173/gestione-immobili/
npm run build        # compila in dist/
npm run cifra-token  # cifra un nuovo token GitHub con la password condivisa
```
Ogni push su `main` pubblica il sito su GitHub Pages (workflow in `.github/workflows/pages.yml`).
