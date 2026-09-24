/** Utenti e permessi per sezione (definiti in src/utenti.json). */
import utentiJson from '../utenti.json'

export type Livello = 'modifica' | 'lettura' | 'nessuno'
export type Sezione = 'dashboard' | 'contratti' | 'registro' | 'canoni' | 'condominio' | 'anagrafiche' | 'importa' | 'storico' | 'impostazioni'

export interface Utente {
  id: string
  nome: string
  ruolo: 'admin' | 'collaboratore'
  sezioni: Record<Sezione, Livello>
}

export const UTENTI: Utente[] = (utentiJson as { utenti: Utente[] }).utenti

export const ETICHETTE_SEZIONE: Record<Sezione, string> = {
  dashboard: 'Dashboard', contratti: 'Contratti', registro: 'ISTAT e imposta di registro', canoni: 'Canoni e incassi', condominio: 'Condominio',
  anagrafiche: 'Anagrafiche (società, immobili, conduttori, condomini)', importa: 'Importa da Excel', storico: 'Storico modifiche', impostazioni: 'Impostazioni',
}

/** Sezione a cui appartiene un percorso dell'app. */
export function sezioneDiPercorso(path: string): Sezione | null {
  if (path === '/' || path === '') return 'dashboard'
  if (path.startsWith('/contratti')) return 'contratti'
  if (path.startsWith('/registro')) return 'registro'
  if (path.startsWith('/canoni')) return 'canoni'
  if (path.startsWith('/condominio')) return 'condominio'
  if (/^\/(societa|immobili|conduttori|condomini)/.test(path)) return 'anagrafiche'
  if (path.startsWith('/stampa')) return 'contratti'
  if (path.startsWith('/importa')) return 'importa'
  if (path.startsWith('/storico')) return 'storico'
  if (path.startsWith('/impostazioni')) return 'impostazioni'
  return null
}

export function livello(u: Utente | null | undefined, s: Sezione): Livello {
  return u?.sezioni[s] ?? 'nessuno'
}
export function puoVedere(u: Utente | null | undefined, s: Sezione): boolean { return livello(u, s) !== 'nessuno' }
export function puoModificare(u: Utente | null | undefined, s: Sezione): boolean { return livello(u, s) === 'modifica' }

/** Prima sezione visibile per l'utente, in ordine di menu (per il reindirizzamento dopo il login). */
export function primoPercorso(u: Utente | null | undefined): string {
  const ordine: Array<[Sezione, string]> = [['dashboard', '/'], ['contratti', '/contratti'], ['registro', '/registro'], ['canoni', '/canoni'], ['condominio', '/condominio'], ['anagrafiche', '/societa'], ['importa', '/importa'], ['storico', '/storico'], ['impostazioni', '/impostazioni']]
  return ordine.find(([s]) => puoVedere(u, s))?.[1] ?? '/impostazioni'
}
