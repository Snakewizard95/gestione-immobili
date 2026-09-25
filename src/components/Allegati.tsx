/**
 * Elenco e caricamento allegati per una scheda (contratto, annualità, onere condominiale…).
 * I file vengono salvati nel repository dati in allegati/AAAA/<id>-<nomefile>; in modalità
 * dimostrativa restano nel browser (con limite di dimensione ridotto).
 */
import { useRef, useState } from 'react'
import { FileText, Paperclip, Trash2, Upload } from 'lucide-react'
import { CONFIG } from '../config'
import { MODO_DEMO, caricaAllegato, eliminaFile, scaricaAllegato } from '../lib/github'
import { useSessioneAttiva } from '../lib/sessione'
import { aggiorna, attivi, campiModifica, campiNuovo, type NomeCollezione } from '../lib/store'
import { CATEGORIE_ALLEGATO, etichettaDi, type Allegato, type Opzione } from '../lib/tipi'
import { useCollezioni } from '../lib/useCollezioni'
import { formattaByte, formattaData } from '../lib/utils/formato'
import { Avviso, Bottone, Riquadro } from './ui'
import { useSoloLettura } from './SoloLettura'

const LIMITE_DEMO = 2 * 1024 * 1024

interface Props {
  collezione: NomeCollezione
  recordId: string
  categorie?: Opzione[]
  descrizione: string   // per il messaggio di salvataggio, es. "contratto Via Roma 12"
  compatto?: boolean   // non più usato: aspetto unico in tutte le sezioni
}

function nomeSicuro(nome: string): string {
  return nome.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 80)
}

export default function Allegati({ collezione, recordId, categorie = CATEGORIE_ALLEGATO, descrizione }: Props) {
  const { token, nome } = useSessioneAttiva()
  const { dati } = useCollezioni(['allegati'])
  const [categoria, setCategoria] = useState(categorie[0]?.valore ?? 'altro')
  const [errore, setErrore] = useState<string | null>(null)
  const [inCorso, setInCorso] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const soloLettura = useSoloLettura()
  const [sopra, setSopra] = useState(false)

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
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Paperclip size={16} className="text-neutro-600" />
        <h6 className="m-0 text-accento-700">Allegati ({elenco.length})</h6>
      </div>
      {errore && <div className="mb-3"><Avviso tipo="attenzione">{errore}</Avviso></div>}
      {elenco.length > 0 && (
        <Riquadro className="mb-3">
          {elenco.map((a, i) => (
            <div key={a.id} className={`flex items-center gap-3 px-3.5 py-2.5 ${i < elenco.length - 1 ? 'border-b border-divisore' : ''}`}>
              <FileText size={18} className="flex-none text-accento-700" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{a.nome_file}</div>
                <div className="text-xs text-neutro-700">{etichettaDi(categorie, a.categoria)} · {formattaByte(a.dimensione_byte)} · {formattaData(a.creato_il)} · {a.creato_da}</div>
              </div>
              <Bottone variante="ghost" piccolo onClick={() => apri(a)}>Apri</Bottone>
              {!soloLettura && <button onClick={() => elimina(a)} title="Elimina" aria-label={`Elimina ${a.nome_file}`} className="btn btn-ghost btn-piccolo !text-neutro-700 hover:!text-err-testo"><Trash2 size={15} /></button>}
            </div>
          ))}
        </Riquadro>
      )}
      {!soloLettura && (
        <div
          onDragOver={(e) => { e.preventDefault(); setSopra(true) }}
          onDragLeave={() => setSopra(false)}
          onDrop={(e) => { e.preventDefault(); setSopra(false); if (!inCorso) carica(e.dataTransfer.files?.[0]) }}
          className={`flex flex-wrap items-center gap-3 border border-dashed px-4 py-4 text-[13px] ${sopra ? 'border-accento bg-[rgba(89,128,166,0.08)]' : 'border-neutro-400'}`}>
          <Upload size={18} className="flex-none text-accento-700" />
          <span className="min-w-0 flex-1 text-neutro-700">
            {inCorso ?? <>Trascina qui il documento, oppure <button type="button" className="text-accento-700 underline" onClick={() => inputRef.current?.click()}>scegli un file</button>.</>}
          </span>
          <label className="flex items-center gap-2 text-xs text-neutro-700">Tipo
            <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className="input w-auto !min-h-[30px] !py-1 text-[13px]">
              {categorie.map((c) => <option key={c.valore} value={c.valore}>{c.etichetta}</option>)}
            </select>
          </label>
          <input ref={inputRef} type="file" className="hidden" disabled={!!inCorso} onChange={(e) => carica(e.target.files?.[0])} accept=".pdf,.jpg,.jpeg,.png,.xlsx,.docx,.p7m" />
        </div>
      )}
      {soloLettura && elenco.length === 0 && <p className="text-[13px] text-neutro-700">Nessun documento allegato.</p>}
    </div>
  )
}
