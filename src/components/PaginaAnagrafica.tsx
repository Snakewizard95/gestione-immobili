/** Pagina standard "elenco + scheda" per le anagrafiche (società, immobili, conduttori, condomini). */
import { useState, type ReactNode } from 'react'
import { FileSpreadsheet, Plus } from 'lucide-react'
import { useSessioneAttiva } from '../lib/sessione'
import { aggiorna, attivi, campiModifica, campiNuovo, type NomeCollezione, type RecordBase } from '../lib/store'
import { useCollezioni } from '../lib/useCollezioni'
import Modulo, { type CampoDef } from './Modulo'
import { SoloSeModifica } from './SoloLettura'
import { righeDaCampi, scaricaExcel } from '../lib/esporta'
import { Avviso, BarraRicerca, Bottone, Caricamento, Finestra, Tabella, filtraTesto, type Colonna } from './ui'

interface Props<T extends RecordBase> {
  titolo: string
  singolare: string                 // es. "società" → "Nuova società", "Modifica società"
  collezione: NomeCollezione
  dipendenze?: NomeCollezione[]     // altre collezioni da caricare (per i riferimenti)
  campi: (dati: <R extends RecordBase>(n: NomeCollezione) => R[]) => CampoDef<T>[]
  colonne: (dati: <R extends RecordBase>(n: NomeCollezione) => R[]) => Colonna<T>[]
  descrivi: (r: T) => string        // nome del record nei messaggi di salvataggio
  testoRicerca?: (r: T, dati: <R extends RecordBase>(n: NomeCollezione) => R[]) => string
  vuotoNuovo: Partial<T>
  derivati?: (v: Partial<T>, campo: string) => Partial<T>
  intestazioneExtra?: ReactNode
  genere?: 'm' | 'f'
  /** Aggiunge al modulo valori non salvati nel record (es. elenco immobili collegati) */
  prepara?: (r: Partial<T>, dati: <R extends RecordBase>(n: NomeCollezione) => R[]) => Record<string, unknown>
  /** Eseguito dopo il salvataggio del record, con l'id del record e tutti i valori del modulo */
  dopoSalva?: (id: string, valori: Record<string, unknown>) => Promise<void>
  /** Nomi dei campi del modulo da NON salvare nel record */
  campiVirtuali?: string[]
  /** Colonne aggiuntive nell'esportazione Excel (es. nome della società al posto dell'id) */
  extraExcel?: (r: T, dati: <R extends RecordBase>(n: NomeCollezione) => R[]) => Record<string, unknown>
  /** Colonna con azioni per riga (es. stampa scheda) */
  azioniRiga?: (r: T) => ReactNode
}

export default function PaginaAnagrafica<T extends RecordBase>(p: Props<T>) {
  const { token, nome } = useSessioneAttiva()
  const { dati, caricamento, errore } = useCollezioni([p.collezione, ...(p.dipendenze ?? [])])
  const [ricerca, setRicerca] = useState('')
  const [aperto, setAperto] = useState<Partial<T> | null>(null)

  const righe = filtraTesto(attivi(dati<T>(p.collezione)), ricerca, (r) => p.testoRicerca?.(r, dati) ?? '')
  const nuovo = p.genere === 'f' ? 'Nuova' : 'Nuovo'

  async function salva(tutti: Partial<T>) {
    const valori = { ...tutti } as Record<string, unknown>
    for (const k of p.campiVirtuali ?? []) delete valori[k]
    const esistente = !!valori.id
    const nuovi = esistente ? null : campiNuovo(nome)
    await aggiorna<T>(token, p.collezione, (rec) => {
      if (esistente) return rec.map((r) => (r.id === valori.id ? { ...r, ...valori, ...campiModifica(nome) } as T : r))
      return [...rec, { ...p.vuotoNuovo, ...valori, ...nuovi } as T]
    }, `${nome}: ${esistente ? 'modifica' : 'nuovo'} ${p.singolare} ${p.descrivi(valori as T)}`)
    if (p.dopoSalva) await p.dopoSalva((valori.id as string) ?? nuovi!.id, tutti as Record<string, unknown>)
    setAperto(null)
  }

  async function elimina() {
    if (!aperto?.id) return
    await aggiorna<T>(token, p.collezione, (rec) => rec.map((r) => (r.id === aperto.id ? { ...r, eliminato_il: new Date().toISOString(), ...campiModifica(nome) } : r)),
      `${nome}: elimina ${p.singolare} ${p.descrivi(aperto as T)}`)
    setAperto(null)
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{p.titolo}</h1>
        <SoloSeModifica><Bottone onClick={() => setAperto({ ...p.vuotoNuovo })}><span className="flex items-center gap-1"><Plus size={16} /> {nuovo} {p.singolare}</span></Bottone></SoloSeModifica>
      </div>
      {p.intestazioneExtra}
      <div className="mt-4 flex items-center justify-between gap-3">
        <BarraRicerca valore={ricerca} onChange={setRicerca} />
        <span className="ml-auto text-sm text-gray-500">{righe.length} elementi</span>
        <Bottone variante="secondario" onClick={() => scaricaExcel(p.titolo.replace(/[^\w]+/g, '_'), [{ nome: p.titolo, righe: righeDaCampi(righe, p.campi(dati).filter((c) => !(p.campiVirtuali ?? []).includes(c.nome)), (r) => p.extraExcel?.(r, dati) ?? {}) }])}>
          <span className="flex items-center gap-1"><FileSpreadsheet size={16} /> Esporta Excel</span>
        </Bottone>
      </div>
      <div className="mt-4">
        {errore && <Avviso tipo="errore">{errore}</Avviso>}
        {caricamento && !errore ? <Caricamento /> : <Tabella colonne={p.azioniRiga ? [...p.colonne(dati), { chiave: '_azioni', etichetta: '', render: (r: T) => <span onClick={(e) => e.stopPropagation()}>{p.azioniRiga!(r)}</span> }] : p.colonne(dati)} righe={righe} onRiga={(r) => setAperto(r)} vuoto={`Nessun elemento. Premi "${nuovo} ${p.singolare}" per iniziare.`} />}
      </div>
      <Finestra titolo={aperto?.id ? `Modifica ${p.singolare}` : `${nuovo} ${p.singolare}`} aperta={aperto !== null} onChiudi={() => setAperto(null)} larga>
        {aperto && <Modulo<T> campi={p.campi(dati)} iniziale={{ ...aperto, ...(p.prepara?.(aperto, dati) ?? {}) } as Partial<T>} onSalva={salva} onAnnulla={() => setAperto(null)} onElimina={aperto.id ? elimina : undefined} derivati={p.derivati} />}
      </Finestra>
    </div>
  )
}
