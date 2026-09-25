import { useNavigate } from 'react-router-dom'
import { Download } from 'lucide-react'
import { Bottone, IntestazionePagina, Riquadro } from '../components/ui'
import { esportaConsultazione } from '../lib/esportaCompleto'
import { creaBackup, ripristinaBackup } from '../lib/backup'
import { MODO_DEMO } from '../lib/github'
import { svuotaCache } from '../lib/store'
import { useState } from 'react'
import { Avviso } from '../components/ui'
import { CONFIG } from '../config'
import { giorniAllaScadenza } from '../lib/auth'
import { useSessione, useUtente } from '../lib/sessione'
import { ETICHETTE_SEZIONE, UTENTI, type Sezione } from '../lib/permessi'
import { Etichetta } from '../components/ui'
import { formattaData, formattaDataOra } from '../lib/utils/formato'

export default function Impostazioni() {
  const { sessione, esci } = useSessione()
  const navigate = useNavigate()
  const giorni = giorniAllaScadenza(sessione?.scadenzaToken ?? null)
  const utente = useUtente()
  const admin = utente?.ruolo === 'admin'
  const SEZIONI = Object.keys(ETICHETTE_SEZIONE) as Sezione[]

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

  const sessioneBox = (
    <Riquadro className="px-[22px] py-5">
      <h4 className="mb-3">Sessione</h4>
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
        <dt className="text-neutro-700">Nome</dt><dd>{sessione?.nome}</dd>
        <dt className="text-neutro-700">Accesso effettuato</dt><dd>{formattaDataOra(sessione?.accessoIl)}</dd>
        <dt className="text-neutro-700">Repository dati</dt><dd className="break-all">{CONFIG.proprietario}/{CONFIG.repoDati}</dd>
        <dt className="text-neutro-700">Scadenza token</dt>
        <dd>{sessione?.scadenzaToken ? `${formattaData(sessione.scadenzaToken)} (${giorni} giorni)` : 'non indicata'}</dd>
      </dl>
      <Bottone variante="secondario" className="mt-4" onClick={() => { esci(); navigate('/login') }}>Esci da questo dispositivo</Bottone>
    </Riquadro>
  )

  return (
    <div>
      <IntestazionePagina kicker="Strumenti" titolo="Impostazioni" sottotitolo="Sessione, utenti e permessi, esportazioni e copie di sicurezza." />
      <div className="grid items-start gap-8" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))' }}>
        <div className="flex flex-col gap-8">
          {sessioneBox}

          {admin && <>
          <Riquadro className="px-[22px] py-5 text-sm">
            <h4 className="mb-2">Esportazione Excel di consultazione</h4>
            <p className="text-neutro-700">Un unico file Excel, leggibile da chiunque anche senza conoscere la situazione: un foglio per sezione (riepilogo per società, società, immobili, conduttori, condomini, contratti attivi e cessati, ISTAT e imposta di registro, canoni {anno} mese per mese, movimenti {anno}, bollettini condominiali, riepilogo condominio, piani di rientro). Nomi al posto dei codici, importi in euro, date italiane.</p>
            <Bottone className="mt-4" disabled={inCorso} onClick={() => sessione && esegui(() => esportaConsultazione(sessione.token, anno))}><Download size={16} /> Scarica l'Excel di consultazione</Bottone>
          </Riquadro>

          <Riquadro className="px-[22px] py-5 text-sm">
            <h4 className="mb-2">Backup e ripristino</h4>
            <p className="text-neutro-700">Il backup è un file tecnico (.json) con tutti i dati esatti, compresi quelli eliminati: serve per ripristinare la piattaforma o per caricarla su un nuovo repository. Non è pensato per la lettura. Gli allegati (PDF) non sono nel file: restano nel repository dati.</p>
            <div className="mt-4 flex flex-wrap gap-2.5">
              <Bottone variante="secondario" disabled={inCorso} onClick={() => sessione && esegui(() => creaBackup(sessione.token, sessione.nome))}>Scarica backup (.json)</Bottone>
              <label className={`btn btn-pericolo ${inCorso ? 'pointer-events-none opacity-45' : ''}`}>
                Ripristina da backup…<input type="file" accept=".json" className="hidden" disabled={inCorso} onChange={(e) => ripristina(e.target.files?.[0])} />
              </label>
            </div>
            {esito && <div className="mt-4"><Avviso tipo={esito.startsWith('Errore') ? 'errore' : 'ok'}>{esito}</Avviso></div>}
          </Riquadro>
          </>}

          {MODO_DEMO && admin && (
            <Riquadro className="px-[22px] py-5 text-sm">
              <h4 className="mb-2">Modalità dimostrativa</h4>
              <p className="text-neutro-800">I dati sono salvati solo in questo browser. Puoi cancellarli tutti e ripartire da zero (ad esempio per rifare l'importazione dall'Excel con le impostazioni aggiornate).</p>
              <Bottone variante="pericolo" className="mt-4" onClick={() => { if (window.confirm('Cancellare tutti i dati dimostrativi di questo browser?')) { Object.keys(localStorage).filter((k) => k.startsWith('gestione-immobili.demo.')).forEach((k) => localStorage.removeItem(k)); svuotaCache(); setEsito('Dati dimostrativi cancellati. Vai su "Importa da Excel" per ricaricarli.') } }}>Svuota dati dimostrativi</Bottone>
            </Riquadro>
          )}
        </div>

        <div className="flex flex-col gap-8">
          <Riquadro className="px-[22px] py-5 text-sm">
            <h4 className="mb-2">Utenti e permessi</h4>
            <p className="text-neutro-700">Ogni persona entra con la propria password e vede solo le sezioni consentite. {admin ? 'Per cambiare permessi o password: modificare il file app/src/utenti.json, eseguire `npm run cifra-token` e ripubblicare (vedi docs/GUIDA_SETUP.md).' : 'Per modifiche rivolgersi all\u2019amministratore.'}</p>
            <div className="mt-4 overflow-x-auto">
              <table className="tabella !text-[13px]">
                <thead><tr><th className="!px-2">Sezione</th>{UTENTI.map((u) => <th key={u.id} className="!px-2">{u.nome}{u.ruolo === 'admin' ? ' (admin)' : ''}</th>)}</tr></thead>
                <tbody>{SEZIONI.map((s) => <tr key={s}><td className="!px-2 !py-2">{ETICHETTE_SEZIONE[s]}</td>{UTENTI.map((u) => { const l = u.sezioni[s]; return <td key={u.id} className="!px-2 !py-2"><Etichetta tono={l === 'modifica' ? 'verde' : l === 'lettura' ? 'giallo' : 'grigio'}>{l === 'modifica' ? 'Modifica' : l === 'lettura' ? 'Sola lettura' : 'Non accessibile'}</Etichetta></td> })}</tr>)}</tbody>
              </table>
            </div>
          </Riquadro>

          {admin && (
            <Riquadro className="px-[22px] py-5 text-sm">
              <h4 className="mb-2">Rinnovo del token o cambio password</h4>
              <ol className="list-decimal space-y-1.5 pl-5 text-sm text-neutro-800">
                <li>Su GitHub: Settings → Developer settings → Fine-grained tokens → Generate new token (solo repository <code>{CONFIG.repoDati}</code>, Contents: Read and write).</li>
                <li>Sul Mac, nel Terminale, dentro la cartella <code>app</code>: <code>npm run cifra-token</code>.</li>
                <li><code>git add -A && git commit -m "Rinnovo token" && git push</code>: il sito si aggiorna da solo.</li>
                <li>Comunica a ogni persona la sua nuova password (non via email in chiaro).</li>
              </ol>
              <p className="mt-3 text-neutro-700">Dettagli in <code>docs/LIMITI_E_BACKUP.md</code> del progetto.</p>
            </Riquadro>
          )}
        </div>
      </div>
    </div>
  )
}
