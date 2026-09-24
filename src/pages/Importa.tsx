import { useEffect, useState } from 'react'
import { Avviso, Bottone, Tabella } from '../components/ui'
import { MODO_DEMO } from '../lib/github'
import { analizzaRendimentiAffitti, preparaImportazione, type PianoImportazione, type RigaImportata } from '../lib/importaExcel'
import { useSessioneAttiva } from '../lib/sessione'
import { aggiorna, attivi } from '../lib/store'
import type { Conduttore, Contratto, Immobile, Societa } from '../lib/tipi'
import { useCollezioni } from '../lib/useCollezioni'
import { formattaEuro } from '../lib/utils/formato'

const FILE_LOCALE = '/dati-excel/affitti aggiornati.xlsx' // servito solo dal server di sviluppo sul Mac

export default function PaginaImporta() {
  const { token, nome } = useSessioneAttiva()
  const { dati, caricamento } = useCollezioni(['societa', 'immobili', 'conduttori', 'contratti'])
  const [righe, setRighe] = useState<RigaImportata[] | null>(null)
  const [avvisi, setAvvisi] = useState<string[]>([])
  const [piano, setPiano] = useState<PianoImportazione | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [esito, setEsito] = useState<string | null>(null)
  const [inCorso, setInCorso] = useState(false)
  const [fileLocale, setFileLocale] = useState(false)

  useEffect(() => {
    if (!import.meta.env.DEV) return
    fetch(FILE_LOCALE, { method: 'HEAD' }).then((r) => setFileLocale(r.ok)).catch(() => setFileLocale(false))
  }, [])

  function analizza(buffer: ArrayBuffer) {
    setErrore(null); setEsito(null)
    try {
      const ris = analizzaRendimentiAffitti(buffer)
      setRighe(ris.righe); setAvvisi(ris.avvisi)
      setPiano(preparaImportazione(ris.righe, {
        societa: attivi(dati<Societa>('societa')), immobili: attivi(dati<Immobile>('immobili')),
        conduttori: attivi(dati<Conduttore>('conduttori')), contratti: attivi(dati<Contratto>('contratti')),
      }, nome))
    } catch (e) { setErrore('Impossibile leggere il file: ' + (e as Error).message) }
  }

  async function daFile(f: File | undefined) { if (f) analizza(await f.arrayBuffer()) }
  async function daLocale() {
    const r = await fetch(FILE_LOCALE)
    if (!r.ok) { setErrore('File di esempio non trovato nella cartella dati-excel.'); return }
    analizza(await r.arrayBuffer())
  }

  async function importa() {
    if (!piano) return
    setInCorso(true); setErrore(null)
    try {
      const m = `${nome}: importazione da Excel`
      if (piano.societa.length) await aggiorna<Societa>(token, 'societa', (r) => [...r, ...piano.societa], `${m} (società)`)
      if (piano.conduttori.length) await aggiorna<Conduttore>(token, 'conduttori', (r) => [...r, ...piano.conduttori], `${m} (conduttori)`)
      if (piano.immobili.length) await aggiorna<Immobile>(token, 'immobili', (r) => [...r, ...piano.immobili], `${m} (immobili)`)
      if (piano.contratti.length) await aggiorna<Contratto>(token, 'contratti', (r) => [...r, ...piano.contratti], `${m} (contratti)`)
      setEsito(`Importazione completata: ${piano.societa.length} società, ${piano.immobili.length} immobili, ${piano.conduttori.length} conduttori, ${piano.contratti.length} contratti.`)
      setRighe(null); setPiano(null)
    } catch (e) { setErrore((e as Error).message) } finally { setInCorso(false) }
  }

  const totale = (k: keyof RigaImportata) => righe?.reduce((s, r) => s + (r[k] as number), 0) ?? 0

  return (
    <div>
      <h1 className="text-2xl font-semibold">Importa da Excel</h1>
      <p className="mt-1 text-gray-500">Formato riconosciuto: foglio "Rendimenti Affitti". Vengono lette le colonne Proprietà, Immobile, Conduttore, Affitto e Imposta Registro; le altre vengono ignorate.</p>

      <div className="mt-6 flex flex-wrap items-center gap-3 rounded-xl bg-white p-5 shadow-sm">
        <label className="cursor-pointer rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50">
          Scegli file Excel…
          <input type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => daFile(e.target.files?.[0])} disabled={caricamento} />
        </label>
        {fileLocale && MODO_DEMO && <Bottone variante="secondario" onClick={daLocale} disabled={caricamento}>Carica "affitti aggiornati.xlsx" dalla cartella del progetto</Bottone>}
      </div>

      {errore && <div className="mt-4"><Avviso tipo="errore">{errore}</Avviso></div>}
      {esito && <div className="mt-4"><Avviso tipo="ok">{esito}</Avviso></div>}
      {avvisi.length > 0 && <div className="mt-4"><Avviso tipo="attenzione"><ul className="list-disc pl-5">{avvisi.map((a, i) => <li key={i}>{a}</li>)}</ul></Avviso></div>}

      {righe && piano && (
        <div className="mt-6">
          <div className="grid gap-3 sm:grid-cols-4">
            {[['Società nuove', piano.societa.length], ['Immobili nuovi', piano.immobili.length], ['Conduttori nuovi', piano.conduttori.length], ['Contratti nuovi', piano.contratti.length]].map(([t, n]) => (
              <div key={t as string} className="rounded-xl bg-white p-4 shadow-sm"><div className="text-sm text-gray-500">{t}</div><div className="text-2xl font-semibold">{n}</div></div>
            ))}
          </div>
          {piano.saltati.length > 0 && <div className="mt-3"><Avviso tipo="info">{piano.saltati.length} elementi già presenti verranno saltati.</Avviso></div>}
          <div className="mt-4 flex items-center justify-between">
            <span className="text-sm text-gray-500">{righe.length} righe lette · affitti annui {formattaEuro(totale('affitto_cent'))} · imposta di registro {formattaEuro(totale('imposta_registro_cent'))}</span>
            <Bottone onClick={importa} disabled={inCorso || (piano.societa.length + piano.immobili.length + piano.conduttori.length + piano.contratti.length === 0)}>
              {inCorso ? 'Importazione…' : 'Conferma importazione'}
            </Bottone>
          </div>
          <div className="mt-3">
            <Tabella righe={righe.map((r, i) => ({ ...r, id: String(i) }))} colonne={[
              { chiave: 's', etichetta: 'Società', render: (r) => r.societa },
              { chiave: 'i', etichetta: 'Immobile', render: (r) => r.immobile },
              { chiave: 'c', etichetta: 'Conduttore', render: (r) => r.conduttore ?? <span className="text-gray-400">libero</span> },
              { chiave: 'a', etichetta: 'Affitto annuo', allinea: 'dx', render: (r) => formattaEuro(r.affitto_cent) },
              { chiave: 'r', etichetta: 'Imp. registro', allinea: 'dx', render: (r) => formattaEuro(r.imposta_registro_cent) },
            ]} />
          </div>
        </div>
      )}
    </div>
  )
}
