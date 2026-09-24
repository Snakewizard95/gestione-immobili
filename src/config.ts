// Configurazione dell'app. NESSUN dato segreto in chiaro: il token è cifrato in config.token.json.
import tokenCifrato from './config.token.json'

export const CONFIG = {
  /** Nome utente GitHub proprietario dei repository (es. "davide-rossi") */
  proprietario: 'Snakewizard95',
  /** Repository PRIVATO con dati e allegati */
  repoDati: 'gestione-immobili-dati',
  /** Ramo su cui leggere/scrivere */
  ramo: 'main',
  /** Token GitHub cifrato con la password condivisa (prodotto da `npm run cifra-token`) */
  tokenCifrato,
  /** Dimensioni allegati */
  allegatoMaxByte: 50 * 1024 * 1024,      // 50 MB: oltre l'app rifiuta il file
  allegatoAvvisoByte: 10 * 1024 * 1024,   // 10 MB: oltre l'app consiglia di comprimere
  /** Giorni prima della scadenza del token in cui avvisare */
  avvisoScadenzaTokenGiorni: 30,
} as const

export type Config = typeof CONFIG
