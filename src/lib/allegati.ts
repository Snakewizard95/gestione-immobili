/** Salvataggio di un allegato (file nel repository dati + registrazione nella collezione "allegati"). */
import { CONFIG } from '../config'
import { MODO_DEMO, caricaAllegato } from './github'
import { aggiorna, campiNuovo, type NomeCollezione } from './store'
import type { Allegato } from './tipi'
import { formattaByte } from './utils/formato'

export const LIMITE_DEMO = 2 * 1024 * 1024

export function nomeSicuro(nome: string): string {
  return nome.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 80)
}

/** Controlla la dimensione: restituisce il messaggio d'errore o null se il file va bene. */
export function controllaDimensione(file: File): string | null {
  if (file.size > CONFIG.allegatoMaxByte) return `Il file supera ${formattaByte(CONFIG.allegatoMaxByte)}: comprimerlo prima di caricarlo.`
  if (MODO_DEMO && file.size > LIMITE_DEMO) return `In modalità dimostrativa il limite è ${formattaByte(LIMITE_DEMO)} per file (il browser ha poco spazio). Online il limite sarà ${formattaByte(CONFIG.allegatoMaxByte)}.`
  return null
}

/** Carica il file in allegati/AAAA/<id>-<nome> e lo registra collegato al record indicato. */
export async function salvaAllegato(token: string, nome: string, file: File, collezione: NomeCollezione, recordId: string, categoria: string, descrizione: string): Promise<void> {
  const errore = controllaDimensione(file)
  if (errore) throw new Error(errore)
  const base = campiNuovo(nome)
  const percorso = `allegati/${new Date().getFullYear()}/${base.id.slice(0, 8)}-${nomeSicuro(file.name)}`
  await caricaAllegato(token, percorso, file, `${nome}: allegato "${file.name}" per ${descrizione}`)
  await aggiorna<Allegato>(token, 'allegati', (r) => [...r, {
    ...base, collezione, record_id: recordId, categoria, nome_file: file.name, percorso, dimensione_byte: file.size, tipo_mime: file.type, note: '',
  }], `${nome}: registra allegato "${file.name}" per ${descrizione}`)
}
