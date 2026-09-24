#!/usr/bin/env node
/**
 * Cifra il token GitHub con la password condivisa e scrive src/config.token.json.
 * Uso:  npm run cifra-token
 * Stesso algoritmo di src/lib/auth.ts: PBKDF2-SHA256 (310.000 iterazioni) → AES-GCM 256.
 */
import { webcrypto as crypto } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import readline from 'node:readline'

const ITERAZIONI = 310_000
const destinazione = resolve(dirname(fileURLToPath(import.meta.url)), '../src/config.token.json')

function chiedi(domanda, nascosto = false) {
  return new Promise((ok) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true })
    if (nascosto) {
      // Non mostra i caratteri digitati
      rl._writeToOutput = (s) => { if (s.includes(domanda)) rl.output.write(domanda) }
    }
    rl.question(domanda, (risposta) => { rl.close(); if (nascosto) process.stdout.write('\n'); ok(risposta.trim()) })
  })
}

function b64(bytes) { return Buffer.from(bytes).toString('base64') }

async function main() {
  console.log('\n=== Cifratura del token GitHub per Gestione Immobili ===\n')
  const token = await chiedi('Incolla il token GitHub (inizia con github_pat_): ', true)
  if (!token.startsWith('github_pat_') && !token.startsWith('ghp_')) {
    console.error('Il testo inserito non sembra un token GitHub. Operazione annullata.'); process.exit(1)
  }
  const scadenza = await chiedi('Data di scadenza del token (AAAA-MM-GG, invio per saltare): ')
  if (scadenza && !/^\d{4}-\d{2}-\d{2}$/.test(scadenza)) {
    console.error('Formato data non valido. Usare AAAA-MM-GG, es. 2027-09-24.'); process.exit(1)
  }
  const p1 = await chiedi('Password condivisa (minimo 12 caratteri): ', true)
  if (p1.length < 12) { console.error('Password troppo corta.'); process.exit(1) }
  const p2 = await chiedi('Ripeti la password: ', true)
  if (p1 !== p2) { console.error('Le due password non coincidono.'); process.exit(1) }

  const sale = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const materiale = await crypto.subtle.importKey('raw', new TextEncoder().encode(p1), 'PBKDF2', false, ['deriveKey'])
  const chiave = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: sale, iterations: ITERAZIONI, hash: 'SHA-256' },
    materiale, { name: 'AES-GCM', length: 256 }, false, ['encrypt'],
  )
  const cifrato = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, chiave, new TextEncoder().encode(token))

  const uscita = {
    versione: 1,
    algoritmo: 'AES-GCM-256 / PBKDF2-SHA256',
    iterazioni: ITERAZIONI,
    sale: b64(sale),
    iv: b64(iv),
    dati: b64(new Uint8Array(cifrato)),
    scadenza_token: scadenza || null,
    nota: 'Token GitHub cifrato con la password condivisa. Senza la password è illeggibile.',
  }
  writeFileSync(destinazione, JSON.stringify(uscita, null, 2) + '\n')
  console.log(`\nFatto. File scritto: ${destinazione}`)
  console.log('Ora puoi cancellare il token dalle tue note: serve solo la password.\n')
}

main().catch((e) => { console.error('Errore:', e.message); process.exit(1) })
