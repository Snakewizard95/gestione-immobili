/**
 * Modulo generico guidato da una descrizione dei campi. Usato da tutte le anagrafiche e dai contratti.
 * Gli importi vengono mostrati in euro e salvati in centesimi; le date usano il selettore del browser.
 */
import { useState, type FormEvent } from 'react'
import type { Opzione } from '../lib/tipi'
import { analizzaEuro, formattaEuro } from '../lib/utils/formato'
import { Avviso, Bottone } from './ui'

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
      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-right tabular-nums focus:outline-none focus:ring-2 disabled:bg-gray-50" />
  )
}

export default function Modulo<T>({ campi, iniziale, onSalva, onAnnulla, onElimina, derivati, etichettaSalva = 'Salva' }: Props<T>) {
  const [valori, setValori] = useState<Valori>({ ...(iniziale as Valori) })
  const [errore, setErrore] = useState<string | null>(null)
  const [inCorso, setInCorso] = useState(false)
  const [confermaElimina, setConfermaElimina] = useState(false)

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

  const base = 'mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 disabled:bg-gray-50'

  return (
    <form onSubmit={invia}>
      <div className="grid gap-4 sm:grid-cols-2">
        {campi.map((c) => {
          const v = valori[c.nome]
          return (
            <div key={c.nome} className={`${c.intera || c.tipo === 'textarea' || c.tipo === 'multiselect' ? 'sm:col-span-2' : ''} ${c.sezione ? 'sm:col-span-2' : ''}`}>
              {c.sezione && <h3 className="mb-3 mt-2 border-b pb-1 text-sm font-semibold uppercase tracking-wide text-gray-500">{c.sezione}</h3>}
              <label className={`block text-sm font-medium ${c.sezione && !c.intera ? 'sm:w-1/2 sm:pr-2' : ''}`}>
                {c.etichetta}{c.obbligatorio && <span className="text-red-500"> *</span>}
                {c.tipo === 'testo' && <input value={(v as string) ?? ''} disabled={c.soloLettura} onChange={(e) => imposta(c.nome, e.target.value)} className={base} />}
                {c.tipo === 'textarea' && <textarea value={(v as string) ?? ''} rows={3} disabled={c.soloLettura} onChange={(e) => imposta(c.nome, e.target.value)} className={base} />}
                {c.tipo === 'data' && <input type="date" value={(v as string) ?? ''} disabled={c.soloLettura} onChange={(e) => imposta(c.nome, e.target.value)} className={base} />}
                {(c.tipo === 'numero' || c.tipo === 'percentuale') && (
                  <input type="number" step={c.tipo === 'percentuale' ? '0.01' : '1'} value={v === null || v === undefined ? '' : String(v)} disabled={c.soloLettura}
                    onChange={(e) => imposta(c.nome, e.target.value === '' ? null : Number(e.target.value))} className={`${base} text-right`} />
                )}
                {c.tipo === 'euro' && <CampoEuro valore={(v as number | null) ?? null} disabilitato={c.soloLettura} onChange={(cent) => imposta(c.nome, cent)} />}
                {c.tipo === 'select' && (
                  <select value={(v as string) ?? ''} disabled={c.soloLettura} onChange={(e) => imposta(c.nome, e.target.value)} className={`${base} bg-white`}>
                    <option value="">— seleziona —</option>
                    {c.opzioni?.map((o) => <option key={o.valore} value={o.valore}>{o.etichetta}</option>)}
                  </select>
                )}
                {c.tipo === 'multiselect' && (
                  <div className="mt-1 max-h-56 overflow-y-auto rounded-lg border border-gray-300 bg-white p-2">
                    {(c.opzioni ?? []).length === 0 && <span className="text-sm text-gray-400">Nessuna opzione disponibile</span>}
                    {(c.opzioni ?? []).map((o) => {
                      const scelti = (v as string[] | undefined) ?? []
                      const on = scelti.includes(o.valore)
                      return (
                        <label key={o.valore} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm font-normal hover:bg-gray-50">
                          <input type="checkbox" checked={on} disabled={c.soloLettura} onChange={() => imposta(c.nome, on ? scelti.filter((x) => x !== o.valore) : [...scelti, o.valore])} />
                          {o.etichetta}
                        </label>
                      )
                    })}
                  </div>
                )}
                {c.aiuto && <span className="mt-1 block text-xs font-normal text-gray-500">{c.aiuto}</span>}
              </label>
            </div>
          )
        })}
      </div>

      {errore && <div className="mt-4"><Avviso tipo="errore">{errore}</Avviso></div>}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <div>
          {onElimina && !confermaElimina && <Bottone type="button" variante="pericolo" onClick={() => setConfermaElimina(true)}>Elimina</Bottone>}
          {onElimina && confermaElimina && (
            <span className="flex items-center gap-2 text-sm">
              Confermi l'eliminazione? <Bottone type="button" variante="pericolo" disabled={inCorso} onClick={elimina}>Sì, elimina</Bottone>
              <Bottone type="button" variante="secondario" onClick={() => setConfermaElimina(false)}>No</Bottone>
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <Bottone type="button" variante="secondario" onClick={onAnnulla}>Annulla</Bottone>
          <Bottone type="submit" disabled={inCorso}>{inCorso ? 'Salvataggio…' : etichettaSalva}</Bottone>
        </div>
      </div>
    </form>
  )
}
