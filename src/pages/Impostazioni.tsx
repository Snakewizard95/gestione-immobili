import { useNavigate } from 'react-router-dom'
import { Bottone } from '../components/ui'
import { esportaConsultazione } from '../lib/esportaCompleto'
import { creaBackup, ripristinaBackup } from '../lib/backup'
import { MODO_DEMO } from '../lib/github'
import { svuotaCache } from '../lib/store'
import { useState } from 'react'
import { Avviso } from '../components/ui'
import { CONFIG } from '../config'
import { giorniAllaScadenza } from '../lib/auth'
import { useSessione } from '../lib/sessione'
import { formattaData, formattaDataOra } from '../lib/utils/formato'

export default function Impostazioni() {
  const { sessione, esci } = useSessione()
  const navigate = useNavigate()
  const giorni = giorniAllaScadenza(sessione?.scadenzaToken ?? null)

  const [esito, setEsito] = useState<string | null>(null)
  const [inCorso, setInCorso] = useState(false)
  const anno = new Date().getFullYear()

  async function esegui(fn: () => Promise<string | void>) {
    setInCorso(true); setEsito(null)
    try { const r = await fn(); if (r) setEsito(r) } catch (e) { setEsito('Errore: ' + (e as Error).message) } finally { setInCorso(false) }
  }
  async function ripristina(file: File | undefined) {
    if (!file || !sessione) return
    if (!window.confirm('ATTENZIONE: il ripristino sostituisce TUTTI i dati attuali con quelli del file di backup. Continuare?')) return
    await esegui(() => ripristinaBackup(sessione.token, sessione.nome, file))
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold">Impostazioni</h1>

      <section className="mt-6 rounded-xl bg-white p-6 shadow-sm">
        <h2 className="font-semibold">Sessione</h2>
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
          <dt className="text-gray-500">Nome</dt><dd>{sessione?.nome}</dd>
          <dt className="text-gray-500">Accesso effettuato</dt><dd>{formattaDataOra(sessione?.accessoIl)}</dd>
          <dt className="text-gray-500">Repository dati</dt><dd>{CONFIG.proprietario}/{CONFIG.repoDati}</dd>
          <dt className="text-gray-500">Scadenza token</dt>
          <dd>{sessione?.scadenzaToken ? `${formattaData(sessione.scadenzaToken)} (${giorni} giorni)` : 'non indicata'}</dd>
        </dl>
        <button onClick={() => { esci(); navigate('/login') }} className="mt-4 rounded-lg border px-4 py-2 text-sm hover:bg-gray-50">
          Esci da questo dispositivo
        </button>
      </section>

      <section className="mt-6 rounded-xl bg-white p-6 shadow-sm text-sm">
        <h2 className="font-semibold">Esportazione completa per la consultazione (Excel)</h2>
        <p className="mt-2 text-gray-600">Un unico file Excel, leggibile da chiunque anche senza conoscere la situazione: un foglio per sezione (riepilogo per società, società, immobili, conduttori, condomini, contratti attivi e cessati, ISTAT e imposta di registro, canoni {anno} mese per mese, movimenti {anno}, bollettini condominiali, riepilogo condominio, piani di rientro). Nomi al posto dei codici, importi in euro, date italiane.</p>
        <Bottone className="mt-3" disabled={inCorso} onClick={() => sessione && esegui(() => esportaConsultazione(sessione.token, anno))}>Scarica l'Excel di consultazione</Bottone>
      </section>

      <section className="mt-6 rounded-xl bg-white p-6 shadow-sm text-sm">
        <h2 className="font-semibold">Copia di sicurezza (backup) e ripristino</h2>
        <p className="mt-2 text-gray-600">Il backup è un file tecnico (.json) con tutti i dati esatti, compresi quelli eliminati: serve per ripristinare la piattaforma o per caricarla su un nuovo repository. Non è pensato per la lettura. Gli allegati (PDF) non sono nel file: restano nel repository dati.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Bottone variante="secondario" disabled={inCorso} onClick={() => sessione && esegui(() => creaBackup(sessione.token, sessione.nome))}>Scarica backup (.json)</Bottone>
          <label className="cursor-pointer rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50">
            Ripristina da backup…<input type="file" accept=".json" className="hidden" disabled={inCorso} onChange={(e) => ripristina(e.target.files?.[0])} />
          </label>
        </div>
        {esito && <div className="mt-3"><Avviso tipo={esito.startsWith('Errore') ? 'errore' : 'ok'}>{esito}</Avviso></div>}
      </section>

      {MODO_DEMO && (
        <section className="mt-6 rounded-xl border border-blue-200 bg-blue-50 p-6 text-sm">
          <h2 className="font-semibold">Modalità dimostrativa</h2>
          <p className="mt-2 text-gray-700">I dati sono salvati solo in questo browser. Puoi cancellarli tutti e ripartire da zero (ad esempio per rifare l'importazione dall'Excel con le impostazioni aggiornate).</p>
          <Bottone variante="pericolo" className="mt-3" onClick={() => { if (window.confirm('Cancellare tutti i dati dimostrativi di questo browser?')) { Object.keys(localStorage).filter((k) => k.startsWith('gestione-immobili.demo.')).forEach((k) => localStorage.removeItem(k)); svuotaCache(); setEsito('Dati dimostrativi cancellati. Vai su "Importa da Excel" per ricaricarli.') } }}>Svuota dati dimostrativi</Bottone>
        </section>
      )}

      <section className="mt-6 rounded-xl bg-white p-6 shadow-sm text-sm">
        <h2 className="font-semibold">Rinnovo del token o cambio password</h2>
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-gray-700">
          <li>Su GitHub: Settings → Developer settings → Fine-grained tokens → Generate new token (solo repository <code>{CONFIG.repoDati}</code>, Contents: Read and write).</li>
          <li>Sul Mac, nel Terminale, dentro la cartella <code>app</code>: <code>npm run cifra-token</code>.</li>
          <li><code>git add -A && git commit -m "Rinnovo token" && git push</code>: il sito si aggiorna da solo.</li>
          <li>Comunica la nuova password ai collaboratori (non via email in chiaro).</li>
        </ol>
        <p className="mt-3 text-gray-500">Dettagli in <code>docs/LIMITI_E_BACKUP.md</code> del progetto.</p>
      </section>
    </div>
  )
}
