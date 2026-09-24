/**
 * Accesso al repository dati tramite GitHub REST API (Contents API + Git Data API).
 * Tutte le funzioni lanciano ErroreGitHub con messaggio in italiano in caso di problemi.
 */
import { CONFIG } from '../config'

const API = 'https://api.github.com'

/**
 * MODALITÀ DIMOSTRATIVA: se il token cifrato non è ancora configurato, l'app funziona in locale
 * salvando i dati nel browser (localStorage) invece che su GitHub. Serve per provare le
 * schermate prima della pubblicazione. Nessun dato lascia il computer.
 */
export const TOKEN_DEMO = 'DEMO'
export const MODO_DEMO = !CONFIG.tokenCifrato.dati
const PREFISSO_DEMO = 'gestione-immobili.demo.'

function demoLeggi(percorso: string): FileLetto | null {
  const raw = localStorage.getItem(PREFISSO_DEMO + percorso)
  return raw ? { contenuto: raw, sha: String(raw.length) + ':' + percorso } : null
}
function demoScrivi(percorso: string, contenuto: string, messaggio: string): string {
  localStorage.setItem(PREFISSO_DEMO + percorso, contenuto)
  const commits = JSON.parse(localStorage.getItem(PREFISSO_DEMO + '_commits') ?? '[]') as Commit[]
  commits.unshift({ sha: crypto.randomUUID(), messaggio, data: new Date().toISOString(), autore: messaggio.split(':')[0] })
  localStorage.setItem(PREFISSO_DEMO + '_commits', JSON.stringify(commits.slice(0, 200)))
  return String(contenuto.length) + ':' + percorso
}

export class ErroreGitHub extends Error {
  stato: number
  conflitto: boolean
  constructor(message: string, stato: number, conflitto = false) {
    super(message)
    this.name = 'ErroreGitHub'
    this.stato = stato
    this.conflitto = conflitto
  }
}

export interface FileLetto {
  contenuto: string
  sha: string
}

export interface Commit {
  sha: string
  messaggio: string
  data: string
  autore: string
}

function base(): string {
  return `${API}/repos/${CONFIG.proprietario}/${CONFIG.repoDati}`
}

function intestazioni(token: string, accept = 'application/vnd.github+json'): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: accept,
    'X-GitHub-Api-Version': '2022-11-28',
  }
}

function messaggioPerStato(stato: number, dettaglio?: string): string {
  switch (stato) {
    case 401: return 'Token non valido o scaduto: rinnovare il token (vedi Impostazioni).'
    case 403: return 'Accesso negato dal server GitHub (permessi insufficienti o troppe richieste). Riprovare tra qualche minuto.'
    case 404: return 'File o repository non trovato. Controllare nome utente e repository in configurazione.'
    case 409:
    case 422: return 'Un altro utente ha salvato nel frattempo: la modifica verrà riapplicata sui dati aggiornati.'
    default: return `Errore di comunicazione con GitHub (codice ${stato})${dettaglio ? ': ' + dettaglio : ''}.`
  }
}

async function richiesta(token: string, percorso: string, init: RequestInit = {}, accept?: string): Promise<Response> {
  let risposta: Response
  try {
    risposta = await fetch(`${base()}${percorso}`, { ...init, headers: { ...intestazioni(token, accept), ...(init.headers ?? {}) } })
  } catch {
    throw new ErroreGitHub('Connessione a GitHub non riuscita: verificare la rete.', 0)
  }
  if (!risposta.ok) {
    let dettaglio: string | undefined
    try { dettaglio = ((await risposta.json()) as { message?: string }).message } catch { /* nessun dettaglio */ }
    const conflitto = risposta.status === 409 || (risposta.status === 422 && !!dettaglio?.toLowerCase().includes('sha'))
    throw new ErroreGitHub(messaggioPerStato(risposta.status, dettaglio), risposta.status, conflitto)
  }
  return risposta
}

/** Verifica che il token permetta di leggere il repository dati. Restituisce il nome del repo. */
export async function verificaAccesso(token: string): Promise<string> {
  if (token === TOKEN_DEMO) return 'modalità dimostrativa (dati solo in questo browser)'
  const r = await richiesta(token, '')
  const dati = (await r.json()) as { full_name: string; permissions?: { push?: boolean } }
  if (dati.permissions && dati.permissions.push === false) {
    throw new ErroreGitHub('Il token permette solo la lettura: serve il permesso "Contents: Read and write".', 403)
  }
  return dati.full_name
}

function decodificaBase64Utf8(b64: string): string {
  const bin = atob(b64.replace(/\n/g, ''))
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}

function codificaBase64(bytes: Uint8Array): string {
  let bin = ''
  const blocco = 0x8000
  for (let i = 0; i < bytes.length; i += blocco) {
    bin += String.fromCharCode(...bytes.subarray(i, i + blocco))
  }
  return btoa(bin)
}

/** Legge un file di testo (JSON) con il suo SHA. Restituisce null se non esiste. */
export async function leggiFile(token: string, percorso: string): Promise<FileLetto | null> {
  if (token === TOKEN_DEMO) return demoLeggi(percorso)
  let r: Response
  try {
    r = await richiesta(token, `/contents/${percorso}?ref=${CONFIG.ramo}`)
  } catch (e) {
    if (e instanceof ErroreGitHub && e.stato === 404) return null
    throw e
  }
  const meta = (await r.json()) as { sha: string; content?: string; encoding?: string; size: number }
  if (meta.encoding === 'base64' && meta.content !== undefined) {
    return { contenuto: decodificaBase64Utf8(meta.content), sha: meta.sha }
  }
  // File oltre 1 MB: la Contents API non include il contenuto, si legge il blob "raw".
  const blob = await richiesta(token, `/git/blobs/${meta.sha}`, {}, 'application/vnd.github.raw+json')
  return { contenuto: await blob.text(), sha: meta.sha }
}

/**
 * Scrive (crea o aggiorna) un file di testo. Passare lo SHA letto in precedenza per
 * l'aggiornamento: se nel frattempo qualcun altro ha salvato, viene lanciato un ErroreGitHub
 * con `conflitto = true`.
 */
export async function scriviFile(token: string, percorso: string, contenuto: string, messaggio: string, sha?: string): Promise<string> {
  if (token === TOKEN_DEMO) return demoScrivi(percorso, contenuto, messaggio)
  const corpo = {
    message: messaggio,
    content: codificaBase64(new TextEncoder().encode(contenuto)),
    branch: CONFIG.ramo,
    ...(sha ? { sha } : {}),
  }
  const r = await richiesta(token, `/contents/${percorso}`, { method: 'PUT', body: JSON.stringify(corpo) })
  const dati = (await r.json()) as { content: { sha: string } }
  return dati.content.sha
}

/** Carica un allegato binario. Restituisce lo SHA del blob. */
export async function caricaAllegato(token: string, percorso: string, file: Blob, messaggio: string): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (token === TOKEN_DEMO) return demoScrivi(percorso, 'data:' + file.type + ';base64,' + codificaBase64(bytes), messaggio)
  const corpo = { message: messaggio, content: codificaBase64(bytes), branch: CONFIG.ramo }
  const r = await richiesta(token, `/contents/${percorso}`, { method: 'PUT', body: JSON.stringify(corpo) })
  const dati = (await r.json()) as { content: { sha: string } }
  return dati.content.sha
}

/** Scarica un allegato come Blob (qualunque dimensione fino a 100 MB). */
export async function scaricaAllegato(token: string, percorso: string): Promise<Blob> {
  if (token === TOKEN_DEMO) {
    const f = demoLeggi(percorso)
    if (!f) throw new ErroreGitHub('Allegato non trovato.', 404)
    return (await fetch(f.contenuto)).blob()
  }
  const meta = await richiesta(token, `/contents/${percorso}?ref=${CONFIG.ramo}`)
  const { sha } = (await meta.json()) as { sha: string }
  const blob = await richiesta(token, `/git/blobs/${sha}`, {}, 'application/vnd.github.raw+json')
  return blob.blob()
}

/** Elimina fisicamente un file (usato solo per allegati caricati per errore). */
export async function eliminaFile(token: string, percorso: string, sha: string, messaggio: string): Promise<void> {
  if (token === TOKEN_DEMO) { localStorage.removeItem(PREFISSO_DEMO + percorso); demoScrivi('_eliminazioni', sha, messaggio); return }
  await richiesta(token, `/contents/${percorso}`, {
    method: 'DELETE',
    body: JSON.stringify({ message: messaggio, sha, branch: CONFIG.ramo }),
  })
}

/** Elenco degli ultimi commit (storico modifiche), opzionalmente filtrato per percorso. */
export async function listaCommit(token: string, percorso?: string, quanti = 50): Promise<Commit[]> {
  if (token === TOKEN_DEMO) return (JSON.parse(localStorage.getItem(PREFISSO_DEMO + '_commits') ?? '[]') as Commit[]).slice(0, quanti)
  const q = new URLSearchParams({ sha: CONFIG.ramo, per_page: String(quanti) })
  if (percorso) q.set('path', percorso)
  const r = await richiesta(token, `/commits?${q.toString()}`)
  const dati = (await r.json()) as Array<{ sha: string; commit: { message: string; author: { date: string; name: string } } }>
  return dati.map((c) => ({ sha: c.sha, messaggio: c.commit.message, data: c.commit.author.date, autore: c.commit.author.name }))
}

/** Legge un file com'era in un certo commit (per vedere versioni precedenti). */
export async function leggiFileAlCommit(token: string, percorso: string, sha: string): Promise<string> {
  const r = await richiesta(token, `/contents/${percorso}?ref=${sha}`, {}, 'application/vnd.github.raw+json')
  return r.text()
}
