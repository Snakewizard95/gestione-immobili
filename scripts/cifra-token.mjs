#!/usr/bin/env node
/**
 * Cifra il token GitHub con la password di OGNI utente (elenco in src/utenti.json) e scrive src/config.token.json.
 * Uso:  npm run cifra-token
 * Stesso algoritmo di src/lib/auth.ts: PBKDF2-SHA256 (310.000 iterazioni) → AES-GCM 256.
 * Si può rifare per un solo utente (cambio password): gli altri blocchi vengono conservati.
 */
import { webcrypto as crypto } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import readline from 'node:readline'

const ITERAZIONI = 310_000
const cartella = dirname(fileURLToPath(import.meta.url))
const destinazione = resolve(cartella, '../src/config.token.json')
const fileUtenti = resolve(cartella, '../src/utenti.json')

function chiedi(domanda, nascosto = false) {
  return new Promise((ok) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true })
    if (nascosto) rl._writeToOutput = (s) => { if (s.includes(domanda)) rl.output.write(domanda) }
    rl.question(domanda, (r) => { rl.close(); if (nascosto) process.stdout.write('\n'); ok(r.trim()) })
  })
}
const b64 = (bytes) => Buffer.from(bytes).toString('base64')

async function cifra(token, password) {
  const sale = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const materiale = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey'])
  const chiave = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: sale, iterations: ITERAZIONI, hash: 'SHA-256' }, materiale, { name: 'AES-GCM', length: 256 }, false, ['encrypt'])
  const cifrato = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, chiave, new TextEncoder().encode(token))
  return { sale: b64(sale), iv: b64(iv), dati: b64(new Uint8Array(cifrato)) }
}

async function main() {
  console.log('\n=== Cifratura del token GitHub per gli utenti di Gestione Immobili ===\n')
  const utenti = JSON.parse(readFileSync(fileUtenti, 'utf8')).utenti
  console.log('Utenti trovati in src/utenti.json:', utenti.map((u) => `${u.nome} (${u.id})`).join(', '), '\n')

  const esistente = existsSync(destinazione) ? JSON.parse(readFileSync(destinazione, 'utf8')) : {}
  const blocchi = { ...(esistente.utenti ?? {}) }

  const token = await chiedi('Incolla il token GitHub (inizia con github_pat_): ', true)
  if (!token.startsWith('github_pat_') && !token.startsWith('ghp_')) { console.error('Il testo inserito non sembra un token GitHub. Operazione annullata.'); process.exit(1) }
  const scadenza = await chiedi('Data di scadenza del token (AAAA-MM-GG, invio per saltare): ')
  if (scadenza && !/^\d{4}-\d{2}-\d{2}$/.test(scadenza)) { console.error('Formato data non valido. Usare AAAA-MM-GG.'); process.exit(1) }

  const soloAlcuni = await chiedi('Impostare la password per TUTTI gli utenti? (s = tutti / n = scegli): ')
  for (const u of utenti) {
    if (soloAlcuni.toLowerCase().startsWith('n')) {
      const r = await chiedi(`Impostare la password di ${u.nome}? (s/n): `)
      if (!r.toLowerCase().startsWith('s')) { if (!blocchi[u.id]) console.log(`  Attenzione: ${u.nome} resta senza accesso finché non viene impostata una password.`); continue }
    }
    const p1 = await chiedi(`Password di ${u.nome} (minimo 10 caratteri): `, true)
    if (p1.length < 10) { console.error('Password troppo corta.'); process.exit(1) }
    const p2 = await chiedi(`Ripeti la password di ${u.nome}: `, true)
    if (p1 !== p2) { console.error('Le due password non coincidono.'); process.exit(1) }
    blocchi[u.id] = await cifra(token, p1)
    console.log(`  ✓ ${u.nome}`)
  }
  // Rimuove blocchi di utenti non più presenti
  for (const id of Object.keys(blocchi)) if (!utenti.some((u) => u.id === id)) { delete blocchi[id]; console.log(`  Rimosso accesso di "${id}" (non più in utenti.json)`) }

  const uscita = { versione: 2, algoritmo: 'AES-GCM-256 / PBKDF2-SHA256', iterazioni: ITERAZIONI, scadenza_token: scadenza || esistente.scadenza_token || null, utenti: blocchi, nota: 'Token GitHub cifrato con la password di ciascun utente. Senza la password è illeggibile.' }
  writeFileSync(destinazione, JSON.stringify(uscita, null, 2) + '\n')
  console.log(`\nFatto. File scritto: ${destinazione}`)
  console.log('Ora esegui: git add -A && git commit -m "Aggiorna accessi" && git push\n')
}
main().catch((e) => { console.error('Errore:', e.message); process.exit(1) })
