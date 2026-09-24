import { useNavigate } from 'react-router-dom'
import { Bottone } from '../components/ui'
import { scaricaExcel } from '../lib/esporta'
import { carica, type NomeCollezione } from '../lib/store'
import { CONFIG } from '../config'
import { giorniAllaScadenza } from '../lib/auth'
import { useSessione } from '../lib/sessione'
import { formattaData, formattaDataOra } from '../lib/utils/formato'

export default function Impostazioni() {
  const { sessione, esci } = useSessione()
  const navigate = useNavigate()
  const giorni = giorniAllaScadenza(sessione?.scadenzaToken ?? null)

  /** Esporta tutti gli elenchi grezzi (un foglio per collezione): copia di sicurezza completa leggibile in Excel. */
  async function esportaTutto() {
    if (!sessione) return
    const nomi: NomeCollezione[] = ['societa', 'immobili', 'conduttori', 'condomini', 'contratti', 'annualita', 'movimenti', 'voci_condominiali', 'piani_rientro', 'allegati']
    const fogli = []
    for (const n of nomi) {
      const rec = await carica<{ id: string; creato_il: string; creato_da: string; modificato_il: string; modificato_da: string; eliminato_il: string | null }>(sessione.token, n)
      fogli.push({ nome: n, righe: rec.filter((r) => !r.eliminato_il).map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, k.endsWith('_cent') && typeof v === 'number' ? v / 100 : Array.isArray(v) ? v.join(';') : v]))) })
    }
    scaricaExcel('Gestione_Immobili_completo', fogli)
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
        <h2 className="font-semibold">Copia di sicurezza in Excel</h2>
        <p className="mt-2 text-gray-600">Scarica un unico file Excel con tutti gli elenchi (un foglio per ciascuno), con i nomi tecnici dei campi. Utile come backup o per analisi. Le esportazioni "leggibili" sono nei pulsanti "Esporta Excel" di ogni sezione.</p>
        <Bottone variante="secondario" className="mt-3" onClick={esportaTutto}>Esporta tutto in Excel</Bottone>
      </section>

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
