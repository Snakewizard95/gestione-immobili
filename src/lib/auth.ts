/**
 * Autenticazione con credenziale unica.
 *
 * Il token GitHub è cifrato con AES-GCM (chiave a 256 bit derivata dalla password condivisa
 * tramite PBKDF2-SHA256). Il blocco cifrato è in src/config.token.json, incluso nel sito
 * pubblico: senza la password è illeggibile. Lo stesso algoritmo è usato da scripts/cifra-token.mjs.
 */

export interface TokenCifrato {
  versione: number
  iterazioni: number
  sale: string     // base64
  iv: string       // base64
  dati: string     // base64 (token cifrato)
  scadenza_token: string | null // AAAA-MM-GG, per l'avviso di rinnovo
}

export interface Sessione {
  token: string
  nome: string
  scadenzaToken: string | null
  accessoIl: string
}

const CHIAVE_SESSIONE = 'gestione-immobili.sessione'

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function derivaChiave(password: string, sale: Uint8Array, iterazioni: number): Promise<CryptoKey> {
  const materiale = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: sale as BufferSource, iterations: iterazioni, hash: 'SHA-256' },
    materiale,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  )
}

/** Decifra il token con la password. Lancia un errore in italiano se la password è sbagliata. */
export async function decifraToken(blocco: TokenCifrato, password: string): Promise<string> {
  if (!blocco.dati) throw new Error('Il sito non è ancora configurato: manca il token cifrato (eseguire `npm run cifra-token`).')
  const chiave = await derivaChiave(password, base64ToBytes(blocco.sale), blocco.iterazioni)
  try {
    const chiaro = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64ToBytes(blocco.iv) as BufferSource }, chiave, base64ToBytes(blocco.dati) as BufferSource)
    return new TextDecoder().decode(chiaro)
  } catch {
    throw new Error('Password non corretta.')
  }
}

export function salvaSessione(s: Sessione): void {
  try { localStorage.setItem(CHIAVE_SESSIONE, JSON.stringify(s)) } catch { /* modalità privata: si resta collegati solo finché la pagina è aperta */ }
}

export function leggiSessione(): Sessione | null {
  try {
    const raw = localStorage.getItem(CHIAVE_SESSIONE)
    return raw ? (JSON.parse(raw) as Sessione) : null
  } catch { return null }
}

export function cancellaSessione(): void {
  try { localStorage.removeItem(CHIAVE_SESSIONE) } catch { /* ignora */ }
}

/** Giorni mancanti alla scadenza del token (null se sconosciuta). */
export function giorniAllaScadenza(scadenza: string | null): number | null {
  if (!scadenza) return null
  const ms = new Date(scadenza).getTime() - Date.now()
  return Math.floor(ms / 86_400_000)
}
