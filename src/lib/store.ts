/**
 * Gestione delle collezioni (i file dati/*.json del repository privato).
 *
 * - `carica(nome)` legge e mette in cache l'elenco con il suo SHA.
 * - `aggiorna(nome, modifica, messaggio)` applica una modifica e la salva. Se nel frattempo
 *   un collega ha salvato, ricarica i dati aggiornati e riapplica la modifica (fino a 3 volte):
 *   così nessuno perde il lavoro dell'altro.
 * - Le cancellazioni sono sempre "soft": si imposta `eliminato_il`, il record resta nel file.
 */
import { ErroreGitHub, leggiFile, scriviFile } from './github'

export type NomeCollezione =
  | 'societa' | 'conduttori' | 'condomini' | 'immobili'
  | 'contratti' | 'annualita'
  | 'movimenti'
  | 'voci_condominiali' | 'piani_rientro' | 'allegati'

export interface RecordBase {
  id: string
  creato_il: string
  creato_da: string
  modificato_il: string
  modificato_da: string
  eliminato_il: string | null
}

interface Cache<T> { record: T[]; sha: string | null }

const cache = new Map<NomeCollezione, Cache<RecordBase>>()
const ascoltatori = new Set<() => void>()

export function percorsoCollezione(nome: NomeCollezione): string {
  return `dati/${nome}.json`
}

export function nuovoId(): string {
  return crypto.randomUUID()
}

export function adesso(): string {
  return new Date().toISOString()
}

/** Registra una funzione da chiamare quando una collezione cambia (per aggiornare le schermate). */
export function osserva(fn: () => void): () => void {
  ascoltatori.add(fn)
  return () => ascoltatori.delete(fn)
}

function notifica(): void {
  ascoltatori.forEach((fn) => fn())
}

async function leggiCollezione<T extends RecordBase>(token: string, nome: NomeCollezione): Promise<Cache<T>> {
  const file = await leggiFile(token, percorsoCollezione(nome))
  if (!file) return { record: [], sha: null }
  let record: T[]
  try {
    const dati = JSON.parse(file.contenuto) as unknown
    record = Array.isArray(dati) ? (dati as T[]) : []
  } catch {
    throw new Error(`Il file ${percorsoCollezione(nome)} non è un JSON valido: controllarlo su GitHub.`)
  }
  return { record, sha: file.sha }
}

/** Carica una collezione (dalla cache se già letta, altrimenti da GitHub). */
export async function carica<T extends RecordBase>(token: string, nome: NomeCollezione, forza = false): Promise<T[]> {
  if (!forza && cache.has(nome)) return cache.get(nome)!.record as T[]
  const letto = await leggiCollezione<T>(token, nome)
  cache.set(nome, letto)
  notifica()
  return letto.record
}

/** Restituisce i record già in cache (o array vuoto) senza chiamare GitHub. */
export function inCache<T extends RecordBase>(nome: NomeCollezione): T[] {
  return (cache.get(nome)?.record ?? []) as T[]
}

export function svuotaCache(): void {
  cache.clear()
  notifica()
}

/**
 * Applica `modifica` all'elenco e salva su GitHub con un commit dal messaggio indicato.
 * `modifica` deve essere una funzione pura (riceve l'elenco corrente, restituisce il nuovo):
 * in caso di conflitto viene richiamata sui dati appena ricaricati.
 */
export async function aggiorna<T extends RecordBase>(
  token: string,
  nome: NomeCollezione,
  modifica: (record: T[]) => T[],
  messaggio: string,
): Promise<T[]> {
  const TENTATIVI = 3
  let ultimoErrore: unknown
  for (let i = 0; i < TENTATIVI; i++) {
    const attuale = (i === 0 && cache.has(nome)) ? (cache.get(nome)! as Cache<T>) : await leggiCollezione<T>(token, nome)
    const nuovo = modifica(attuale.record)
    const contenuto = JSON.stringify(nuovo, null, 2) + '\n'
    try {
      const sha = await scriviFile(token, percorsoCollezione(nome), contenuto, messaggio, attuale.sha ?? undefined)
      cache.set(nome, { record: nuovo, sha })
      notifica()
      return nuovo
    } catch (e) {
      ultimoErrore = e
      if (e instanceof ErroreGitHub && e.conflitto) {
        cache.delete(nome) // forza la rilettura al prossimo giro
        continue
      }
      throw e
    }
  }
  throw new Error(`Salvataggio non riuscito dopo ${TENTATIVI} tentativi: ${(ultimoErrore as Error)?.message ?? ''}`)
}

/** Campi di tracciamento per un record nuovo. */
export function campiNuovo(nome: string): Pick<RecordBase, 'id' | 'creato_il' | 'creato_da' | 'modificato_il' | 'modificato_da' | 'eliminato_il'> {
  const t = adesso()
  return { id: nuovoId(), creato_il: t, creato_da: nome, modificato_il: t, modificato_da: nome, eliminato_il: null }
}

/** Campi di tracciamento per una modifica. */
export function campiModifica(nome: string): Pick<RecordBase, 'modificato_il' | 'modificato_da'> {
  return { modificato_il: adesso(), modificato_da: nome }
}

/** Filtra i record non eliminati. */
export function attivi<T extends RecordBase>(record: T[]): T[] {
  return record.filter((r) => !r.eliminato_il)
}
