import { useNavigate } from 'react-router-dom'
import { CONFIG } from '../config'
import { giorniAllaScadenza } from '../lib/auth'
import { useSessione } from '../lib/sessione'
import { formattaData, formattaDataOra } from '../lib/utils/formato'

export default function Impostazioni() {
  const { sessione, esci } = useSessione()
  const navigate = useNavigate()
  const giorni = giorniAllaScadenza(sessione?.scadenzaToken ?? null)

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
