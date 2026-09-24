/**
 * Elenco e caricamento allegati per una scheda (contratto, annualità, onere condominiale…).
 * I file vengono salvati nel repository dati in allegati/AAAA/<id>-<nomefile>; in modalità
 * dimostrativa restano nel browser (con limite di dimensione ridotto).
 */
import { useRef, useState } from 'react'
import { Download, Paperclip, Trash2 } from 'lucide-react'
import { CONFIG } from '../config'
import { MODO_DEMO, caricaAllegato, eliminaFile, scaricaAllegato } from '../lib/github'
import { useSessioneAttiva } from '../lib/sessione'
import { aggiorna, attivi, campiModifica, campiNuovo, type NomeCollezione } from '../lib/store'
import { CATEGORIE_ALLEGATO, etichettaDi, type Allegato, type Opzione } from '../lib/tipi'
import { useCollezioni } from '../lib/useCollezioni'
import { formattaByte, formattaData } from '../lib/utils/formato'
import { Avviso, Etichetta } from './ui'
import { useSoloLettura } from './SoloLettura'

const LIMITE_DEMO = 2 * 1024 * 1024

interface Props {
  collezione: NomeCollezione
  recordId: string
  categorie?: Opzione[]
  descrizione: string   // per il messaggio di salvataggio, es. "contratto Via Roma 12"
  compatto?: boolean
}

function nomeSicuro(nome: string): string {
  return nome.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 80)
}

export default function Allegati({ collezione, recordId, categorie = CATEGORIE_ALLEGATO, descrizione, compatto }: Props) {
  const { token, nome } = useSessioneAttiva()
  const { dati } = useCollezioni(['allegati'])
  const [categoria, setCategoria] = useState(categorie[0]?.valore ?? 'altro')
  const [errore, setErrore] = useState<string | null>(null)
  const [inCorso, setInCorso] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const soloLettura = useSoloLettura()

  const elenco = attivi(dati<Allegato>('allegati')).filter((a) => a.collezione === collezione && a.record_id === recordId)
    .sort((a, b) => b.creato_il.localeCompare(a.creato_il))

  async function carica(file: File | undefined) {
    if (!file) return
    setErrore(null)
    if (file.size > CONFIG.allegatoMaxByte) { setErrore(`Il file supera ${formattaByte(CONFIG.allegatoMaxByte)}: comprimerlo prima di caricarlo.`); return }
    if (MODO_DEMO && file.size > LIMITE_DEMO) { setErrore(`In modalità dimostrativa il limite è ${formattaByte(LIMITE_DEMO)} per file (il browser ha poco spazio). Online il limite sarà ${formattaByte(CONFIG.allegatoMaxByte)}.`); return }
    setInCorso('Caricamento…')
    try {
      const base = campiNuovo(nome)
      const anno = new Date().getFullYear()
      const percorso = `allegati/${anno}/${base.id.slice(0, 8)}-${nomeSicuro(file.name)}`
      await caricaAllegato(token, percorso, file, `${nome}: allegato "${file.name}" per ${descrizione}`)
      await aggiorna<Allegato>(token, 'allegati', (r) => [...r, {
        ...base, collezione, record_id: recordId, categoria, nome_file: file.name, percorso, dimensione_byte: file.size, tipo_mime: file.type, note: '',
      }], `${nome}: registra allegato "${file.name}" per ${descrizione}`)
      if (inputRef.current) inputRef.current.value = ''
      if (file.size > CONFIG.allegatoAvvisoByte) setErrore(`Caricato. Nota: il file è grande (${formattaByte(file.size)}); per i prossimi conviene scansionare a risoluzione più bassa.`)
    } catch (e) { setErrore((e as Error).message) } finally { setInCorso(null) }
  }

  async function apri(a: Allegato) {
    setErrore(null); setInCorso('Apertura…')
    try {
      const blob = await scaricaAllegato(token, a.percorso)
      const url = URL.createObjectURL(a.tipo_mime ? new Blob([blob], { type: a.tipo_mime }) : blob)
      const w = window.open(url, '_blank')
      if (!w) { const l = document.createElement('a'); l.href = url; l.download = a.nome_file; l.click() }
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (e) { setErrore((e as Error).message) } finally { setInCorso(null) }
  }

  async function elimina(a: Allegato) {
    if (!window.confirm(`Eliminare l'allegato "${a.nome_file}"?`)) return
    setErrore(null); setInCorso('Eliminazione…')
    try {
      // Il record resta nello storico (soft delete); il file viene rimosso dal repository per liberare spazio.
      await aggiorna<Allegato>(token, 'allegati', (r) => r.map((x) => (x.id === a.id ? { ...x, eliminato_il: new Date().toISOString(), ...campiModifica(nome) } : x)),
        `${nome}: elimina allegato "${a.nome_file}" di ${descrizione}`)
      try { await eliminaFile(token, a.percorso, '', `${nome}: rimuove file "${a.nome_file}"`) } catch { /* se il file non è più presente va bene comunque */ }
    } catch (e) { setErrore((e as Error).message) } finally { setInCorso(null) }
  }

  return (
    <div className={compatto ? '' : 'rounded-xl border bg-gray-50 p-4'}>
      <div className="flex flex-wrap items-center gap-2">
        <Paperclip size={16} className="text-gray-500" />
        <span className="text-sm font-medium">Allegati ({elenco.length})</span>
        {!soloLettura && <>
        <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className="ml-auto rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm">
          {categorie.map((c) => <option key={c.valore} value={c.valore}>{c.etichetta}</option>)}
        </select>
        <label className="cursor-pointer rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-100">
          {inCorso ?? 'Carica file…'}
          <input ref={inputRef} type="file" className="hidden" disabled={!!inCorso} onChange={(e) => carica(e.target.files?.[0])} accept=".pdf,.jpg,.jpeg,.png,.xlsx,.docx,.p7m" />
        </label>
        </>}
      </div>
      {errore && <div className="mt-2"><Avviso tipo="attenzione">{errore}</Avviso></div>}
      {elenco.length > 0 && (
        <ul className="mt-3 divide-y rounded-lg border bg-white text-sm">
          {elenco.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
              <Etichetta tono="blu">{etichettaDi(categorie, a.categoria)}</Etichetta>
              <button onClick={() => apri(a)} className="font-medium text-left hover:underline">{a.nome_file}</button>
              <span className="text-gray-400">{formattaByte(a.dimensione_byte)} · {formattaData(a.creato_il)} · {a.creato_da}</span>
              <span className="ml-auto flex gap-1">
                <button onClick={() => apri(a)} title="Apri / scarica" className="rounded p-1 text-gray-500 hover:bg-gray-100"><Download size={16} /></button>
                {!soloLettura && <button onClick={() => elimina(a)} title="Elimina" className="rounded p-1 text-gray-500 hover:bg-red-50 hover:text-red-600"><Trash2 size={16} /></button>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
