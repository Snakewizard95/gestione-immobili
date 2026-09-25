/**
 * Modulo generico guidato da una descrizione dei campi. Usato da tutte le anagrafiche e dai contratti.
 * Gli importi vengono mostrati in euro e salvati in centesimi; le date usano il selettore del browser.
 */
import { useState, type FormEvent } from 'react'
import type { Opzione } from '../lib/tipi'
import { analizzaEuro, formattaEuro } from '../lib/utils/formato'
import { Avviso, Bottone, Segmentato } from './ui'
import { useSoloLettura } from './SoloLettura'

export type TipoCampo = 'testo' | 'textarea' | 'numero' | 'euro' | 'data' | 'select' | 'percentuale' | 'multiselect'

export interface CampoDef<T> {
  nome: keyof T & string
  etichetta: string
  tipo: TipoCampo
  opzioni?: Opzione[]
  obbligatorio?: boolean
  intera?: boolean          // occupa tutta la larghezza
  sezione?: string          // titolo di sezione mostrato prima del campo
  aiuto?: string
  soloLettura?: boolean
  colonne?: 2 | 3 | 4       // solo sul campo che apre una sezione: colonne della griglia di quella sezione (predefinito 2)
  stile?: 'radio'           // per i select: mostra le opzioni come pallini invece del menu a tendina
  doppia?: boolean          // occupa due colonne della griglia
}

type Valori = Record<string, unknown>

interface Props<T> {
  campi: CampoDef<T>[]
  iniziale: Partial<T>
  onSalva: (valori: Partial<T>) => Promise<void>
  onAnnulla: () => void
  onElimina?: () => Promise<void>
  /** Ricalcola valori derivati a ogni modifica (es. canone annuale = mensile × 12) */
  derivati?: (v: Partial<T>, campoModificato: string) => Partial<T>
  etichettaSalva?: string
}

function CampoEuro({ valore, onChange, disabilitato }: { valore: number | null; onChange: (c: number | null) => void; disabilitato?: boolean }) {
  const [testo, setTesto] = useState(valore === null || valore === undefined ? '' : (valore / 100).toFixed(2).replace('.', ','))
  const [fuoco, setFuoco] = useState(false)
  const mostrato = fuoco ? testo : (valore === null || valore === undefined ? '' : formattaEuro(valore))
  return (
    <input value={mostrato} disabled={disabilitato} inputMode="decimal"
      onFocus={() => { setFuoco(true); setTesto(valore === null || valore === undefined ? '' : (valore / 100).toFixed(2).replace('.', ',')) }}
      onChange={(e) => { setTesto(e.target.value); onChange(analizzaEuro(e.target.value)) }}
      onBlur={() => setFuoco(false)}
      className="input num text-right" />
  )
}

const COLONNE = { 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-2 lg:grid-cols-3', 4: 'sm:grid-cols-2 lg:grid-cols-4' } as const

/** Vero se le opzioni sono esattamente Sì / No: in quel caso il campo diventa un controllo segmentato. */
const eSiNo = (o?: Opzione[]) => !!o && o.length === 2 && o[0].valore === 'si' && o[1].valore === 'no'

/** Divide l'elenco dei campi in sezioni: una nuova sezione inizia a ogni campo con "sezione". */
function inSezioni<T>(campi: CampoDef<T>[]): Array<{ titolo?: string; colonne: 2 | 3 | 4; campi: CampoDef<T>[] }> {
  const out: Array<{ titolo?: string; colonne: 2 | 3 | 4; campi: CampoDef<T>[] }> = []
  for (const c of campi) {
    if (c.sezione || out.length === 0) out.push({ titolo: c.sezione, colonne: c.colonne ?? 2, campi: [] })
    out[out.length - 1].campi.push(c)
  }
  return out
}

export default function Modulo<T>({ campi, iniziale, onSalva, onAnnulla, onElimina, derivati, etichettaSalva = 'Salva' }: Props<T>) {
  const [valori, setValori] = useState<Valori>({ ...(iniziale as Valori) })
  const [errore, setErrore] = useState<string | null>(null)
  const [inCorso, setInCorso] = useState(false)
  const [confermaElimina, setConfermaElimina] = useState(false)
  const soloLettura = useSoloLettura()

  function imposta(nome: string, v: unknown) {
    setValori((prec) => {
      const nuovo = { ...prec, [nome]: v }
      return derivati ? { ...nuovo, ...(derivati(nuovo as Partial<T>, nome) as Valori) } : nuovo
    })
  }

  async function invia(e: FormEvent) {
    e.preventDefault()
    for (const c of campi) {
      const v = valori[c.nome]
      if (c.obbligatorio && (v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0))) { setErrore(`Il campo "${c.etichetta}" è obbligatorio.`); return }
    }
    setErrore(null); setInCorso(true)
    try { await onSalva(valori as Partial<T>) } catch (err) { setErrore((err as Error).message) } finally { setInCorso(false) }
  }

  async function elimina() {
    if (!onElimina) return
    setInCorso(true)
    try { await onElimina() } catch (err) { setErrore((err as Error).message); setInCorso(false) }
  }

  function controllo(c: CampoDef<T>) {
    const v = valori[c.nome]
    if (c.tipo === 'testo') return <input value={(v as string) ?? ''} disabled={c.soloLettura} onChange={(e) => imposta(c.nome, e.target.value)} className="input" />
    if (c.tipo === 'textarea') return <textarea value={(v as string) ?? ''} rows={3} disabled={c.soloLettura} onChange={(e) => imposta(c.nome, e.target.value)} className="input" />
    if (c.tipo === 'data') return <input type="date" value={(v as string) ?? ''} disabled={c.soloLettura} onChange={(e) => imposta(c.nome, e.target.value)} className="input" />
    if (c.tipo === 'numero' || c.tipo === 'percentuale') return (
      <input type="number" step={c.tipo === 'percentuale' ? '0.01' : '1'} value={v === null || v === undefined ? '' : String(v)} disabled={c.soloLettura}
        onChange={(e) => imposta(c.nome, e.target.value === '' ? null : Number(e.target.value))} className="input num text-right" />
    )
    if (c.tipo === 'euro') return <CampoEuro valore={(v as number | null) ?? null} disabilitato={c.soloLettura} onChange={(cent) => imposta(c.nome, cent)} />
    if (c.tipo === 'select' && eSiNo(c.opzioni)) return (
      <Segmentato largo disabilitato={c.soloLettura} valore={(v as string) ?? ''} onChange={(x) => imposta(c.nome, x)}
        opzioni={(c.opzioni ?? []).map((o) => ({ valore: o.valore, etichetta: o.etichetta }))} />
    )
    if (c.tipo === 'select' && c.stile === 'radio') return (
      <div className="flex flex-col gap-2 pt-1" role="radiogroup">
        {c.opzioni?.map((o) => (
          <label key={o.valore} className="radio">
            <input type="radio" name={c.nome} checked={v === o.valore} disabled={c.soloLettura} onChange={() => imposta(c.nome, o.valore)} />
            <span className="dot" />{o.etichetta}
          </label>
        ))}
      </div>
    )
    if (c.tipo === 'select') return (
      <select value={(v as string) ?? ''} disabled={c.soloLettura} onChange={(e) => imposta(c.nome, e.target.value)} className="input">
        <option value="">— seleziona —</option>
        {c.opzioni?.map((o) => <option key={o.valore} value={o.valore}>{o.etichetta}</option>)}
      </select>
    )
    // multiselect
    const scelti = (v as string[] | undefined) ?? []
    return (
      <div className="max-h-56 overflow-y-auto border border-divisore bg-superficie p-2">
        {(c.opzioni ?? []).length === 0 && <span className="text-sm text-neutro-600">Nessuna opzione disponibile</span>}
        {(c.opzioni ?? []).map((o) => {
          const on = scelti.includes(o.valore)
          return (
            <label key={o.valore} className="flex cursor-pointer items-center gap-2 px-2 py-1 text-sm hover:bg-[rgba(29,31,32,0.04)]">
              <input type="checkbox" checked={on} disabled={c.soloLettura} className="accent-accento" onChange={() => imposta(c.nome, on ? scelti.filter((x) => x !== o.valore) : [...scelti, o.valore])} />
              {o.etichetta}
            </label>
          )
        })}
      </div>
    )
  }

  // I campi radio e segmentati non sono "label" cliccabili nel loro insieme: si usa un div
  const eGruppo = (c: CampoDef<T>) => c.tipo === 'multiselect' || (c.tipo === 'select' && (eSiNo(c.opzioni) || c.stile === 'radio'))

  return (
    <form onSubmit={invia}>
      <div className="flex flex-col gap-7">
        {inSezioni(campi).map((sez, i) => (
          <section key={i}>
            {sez.titolo && <h6 className="mb-3.5 text-accento-700">{sez.titolo}</h6>}
            <div className={`grid grid-cols-1 gap-x-[18px] gap-y-[14px] ${COLONNE[sez.colonne]}`}>
              {sez.campi.map((cOrig) => {
                const c = soloLettura ? { ...cOrig, soloLettura: true } : cOrig
                const Contenitore = eGruppo(c) ? 'div' : 'label'
                return (
                  <Contenitore key={c.nome} className={`block ${c.intera || c.tipo === 'textarea' || c.tipo === 'multiselect' ? 'col-span-full' : c.doppia ? 'sm:col-span-2' : ''}`}>
                    <span className="etichetta-campo">{c.etichetta}{c.obbligatorio && <span className="text-err-testo"> *</span>}</span>
                    {controllo(c)}
                    {c.aiuto && <span className="mt-1 block text-xs text-neutro-700">{c.aiuto}</span>}
                  </Contenitore>
                )
              })}
            </div>
          </section>
        ))}
      </div>

      {errore && <div className="mt-5"><Avviso tipo="errore">{errore}</Avviso></div>}

      {soloLettura && <div className="mt-5"><Avviso tipo="info">Hai accesso in sola lettura a questa sezione: puoi consultare ma non modificare.</Avviso></div>}
      <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-divisore pt-5">
        <div className="text-[13px] text-neutro-700">
          {!soloLettura && onElimina && !confermaElimina && <Bottone type="button" variante="ghost" className="!text-accento-900" onClick={() => setConfermaElimina(true)}>Elimina</Bottone>}
          {!soloLettura && onElimina && confermaElimina && (
            <span className="flex items-center gap-2">
              Confermi l'eliminazione? <Bottone type="button" variante="pericolo" disabled={inCorso} onClick={elimina}>Sì, elimina</Bottone>
              <Bottone type="button" variante="secondario" onClick={() => setConfermaElimina(false)}>No</Bottone>
            </span>
          )}
          {(soloLettura || !onElimina) && 'Ogni modifica viene registrata con il nome di chi la fa.'}
        </div>
        <div className="flex gap-2.5">
          <Bottone type="button" variante="secondario" onClick={onAnnulla}>{soloLettura ? 'Chiudi' : 'Annulla'}</Bottone>
          {!soloLettura && <Bottone type="submit" disabled={inCorso}>{inCorso ? 'Salvataggio…' : etichettaSalva}</Bottone>}
        </div>
      </div>
    </form>
  )
}
