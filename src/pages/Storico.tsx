import { useEffect, useState } from 'react'
import { Avviso, Caricamento, Tabella } from '../components/ui'
import { listaCommit, type Commit } from '../lib/github'
import { useSessioneAttiva } from '../lib/sessione'
import { formattaDataOra } from '../lib/utils/formato'

export default function PaginaStorico() {
  const { token } = useSessioneAttiva()
  const [commit, setCommit] = useState<Commit[] | null>(null)
  const [errore, setErrore] = useState<string | null>(null)

  useEffect(() => {
    listaCommit(token, undefined, 100).then(setCommit).catch((e) => setErrore((e as Error).message))
  }, [token])

  return (
    <div>
      <h1 className="text-2xl font-semibold">Storico modifiche</h1>
      <p className="mt-1 text-gray-500">Ogni salvataggio è registrato con nome, data e descrizione. Nulla viene mai perso.</p>
      <div className="mt-6">
        {errore && <Avviso tipo="errore">{errore}</Avviso>}
        {!commit && !errore ? <Caricamento /> : commit && (
          <Tabella righe={commit.map((c) => ({ ...c, id: c.sha }))} vuoto="Nessuna modifica registrata finora." colonne={[
            { chiave: 'd', etichetta: 'Data e ora', render: (c) => formattaDataOra(c.data) },
            { chiave: 'a', etichetta: 'Chi', render: (c) => c.autore },
            { chiave: 'm', etichetta: 'Cosa', render: (c) => c.messaggio.split('\n')[0] },
          ]} />
        )}
      </div>
    </div>
  )
}
