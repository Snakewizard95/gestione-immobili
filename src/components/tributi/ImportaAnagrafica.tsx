/**
 * Importa → "Responsabili tributi": legge SOLO il foglio "Anagrafica" del file "Tributi in Sospeso" e collega
 * responsabile, email ed email in copia alle società; piani e avvisi non vengono toccati (niente doppioni).
 */
import { useEffect, useState } from 'react'
import { FileSpreadsheet, Upload } from 'lucide-react'
import { MODO_DEMO } from '../../lib/github'
import { preparaAnagrafica, type PianoAnagrafica, type RigaAnagrafica } from '../../lib/importaTributi'
import { useSessioneAttiva } from '../../lib/sessione'
import { aggiorna, attivi } from '../../lib/store'
import type { Contribuente } from '../../lib/tipi'
import { useCollezioni } from '../../lib/useCollezioni'
import { useSoloLettura } from '../SoloLettura'
import { Avviso, Bottone, Etichetta, Segmentato, Tabella, TavolaKpi } from '../ui'

const LOCALE = '/dati-excel/tributi/Tributi in Sospeso 2026 - BOZZA Anagrafica.xlsx'
const ESITI: Record<RigaAnagrafica['esito'], { testo: string; tono: 'verde' | 'blu' | 'grigio' }> = {
  aggiornata: { testo: 'Aggiornata', tono: 'blu' }, nuova: { testo: 'Nuova società', tono: 'verde' }, invariata: { testo: 'Già uguale', tono: 'grigio' },
}

export default function ImportaAnagrafica() {
  const { token, nome } = useSessioneAttiva()
  const { dati, caricamento } = useCollezioni(['contribuenti'])
  const soloLettura = useSoloLettura()
  const [nomeFile, setNomeFile] = useState('')
  const [piano, setPiano] = useState<PianoAnagrafica | null>(null)
  const [filtro, setFiltro] = useState<'modifiche' | 'tutte'>('modifiche')
  const [errore, setErrore] = useState<string | null>(null)
  const [esito, setEsito] = useState<string | null>(null)
  const [inCorso, setInCorso] = useState(false)
  const [locale, setLocale] = useState(false)

  useEffect(() => {
    if (!import.meta.env.DEV) return
    fetch(LOCALE, { method: 'HEAD' }).then((r) => setLocale(r.ok)).catch(() => setLocale(false))
  }, [])

  function analizza(buffer: ArrayBuffer, nomeF: string) {
    setErrore(null); setEsito(null); setNomeFile(nomeF)
    try { setPiano(preparaAnagrafica(buffer, attivi(dati<Contribuente>('contribuenti')), nome)) }
    catch (e) { setPiano(null); setErrore('Impossibile leggere il file: ' + (e as Error).message) }
  }

  async function conferma() {
    if (!piano) return
    setInCorso(true); setErrore(null)
    try {
      await aggiorna<Contribuente>(token, 'contribuenti', (rec) => [
        ...rec.map((c) => piano.aggiornati.find((a) => a.id === c.id) ?? c),
        ...piano.nuovi,
      ], `${nome}: aggiorna responsabili ed email dal foglio Anagrafica`)
      setEsito(`Fatto: ${piano.righe.filter((r) => r.esito === 'aggiornata').length} società aggiornate e ${piano.nuovi.length} aggiunte. Piani e avvisi non sono stati toccati.`)
      setPiano(null)
    } catch (e) { setErrore((e as Error).message) } finally { setInCorso(false) }
  }

  const disabilitato = caricamento || soloLettura
  const righe = piano ? (filtro === 'modifiche' ? piano.righe.filter((r) => r.esito !== 'invariata') : piano.righe) : []

  return (
    <div>
      {soloLettura && <div className="mb-5"><Avviso tipo="info">Hai accesso in sola lettura: l'importazione è riservata a chi può modificare i dati.</Avviso></div>}
      <div className="blueprint flex flex-wrap items-center gap-4 !border-dashed p-6">
        <i className="corner tl" /><i className="corner tr" /><i className="corner bl" /><i className="corner br" />
        <FileSpreadsheet size={28} className="flex-none text-accento-700" />
        <div className="min-w-0 flex-1">
          <div className="font-medium">File "Tributi in Sospeso" (solo il foglio Anagrafica)</div>
          <div className="text-[13px] text-neutro-700">{nomeFile ? <>Scelto: <b>{nomeFile}</b></> : 'Si leggono solo le colonne Società, Responsabile, Email ed Email CC. Gli altri fogli (In Sospeso, Definiti) vengono ignorati.'}</div>
        </div>
        {locale && MODO_DEMO && <Bottone variante="ghost" disabled={disabilitato} onClick={async () => { const r = await fetch(LOCALE); if (r.ok) analizza(await r.arrayBuffer(), LOCALE.split('/').pop()!) }}>Dalla cartella del progetto</Bottone>}
        <label className={`btn btn-secondario ${disabilitato ? 'pointer-events-none opacity-45' : ''}`}>
          <Upload size={16} /> Scegli file…
          <input type="file" accept=".xlsx,.xls" className="hidden" disabled={disabilitato}
            onChange={async (e) => { const f = e.target.files?.[0]; if (f) analizza(await f.arrayBuffer(), f.name); e.target.value = '' }} />
        </label>
      </div>

      {errore && <div className="mt-5"><Avviso tipo="errore">{errore}</Avviso></div>}
      {esito && <div className="mt-5"><Avviso tipo="ok">{esito}</Avviso></div>}

      {piano && (
        <div className="mt-8">
          <TavolaKpi celle={[
            { titolo: 'Società aggiornate', valore: piano.righe.filter((r) => r.esito === 'aggiornata').length, nota: 'responsabile o email cambiati' },
            { titolo: 'Società nuove', valore: piano.nuovi.length, nota: 'nell\'Anagrafica ma non ancora nella piattaforma (senza piani)' },
            { titolo: 'Già uguali', valore: piano.righe.filter((r) => r.esito === 'invariata').length },
          ]} />
          {piano.avvisi.map((a, i) => <div key={i} className="-mt-3 mb-5"><Avviso tipo="attenzione">{a}</Avviso></div>)}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <Segmentato valore={filtro} onChange={setFiltro} opzioni={[{ valore: 'modifiche', etichetta: 'Solo le modifiche' }, { valore: 'tutte', etichetta: `Tutte (${piano.righe.length})` }]} />
            <Bottone disabled={inCorso || soloLettura || (piano.nuovi.length + piano.aggiornati.length === 0)} onClick={conferma}>
              {inCorso ? 'Salvataggio…' : 'Conferma'}
            </Bottone>
          </div>
          <Tabella righe={righe.map((r, i) => ({ ...r, id: String(i) }))} vuoto="Nessuna modifica: l'anagrafica è già allineata." colonne={[
            { chiave: 'e', etichetta: 'Esito', render: (r) => <Etichetta tono={ESITI[r.esito].tono}>{ESITI[r.esito].testo}</Etichetta> },
            { chiave: 'n', etichetta: 'Nel foglio Anagrafica', render: (r) => <span className="font-medium">{r.nome}</span> },
            { chiave: 's', etichetta: 'Società nella piattaforma', render: (r) => r.societa },
            { chiave: 'r', etichetta: 'Responsabile', render: (r) => r.responsabile || '—' },
            { chiave: 'm', etichetta: 'Email', render: (r) => r.email || '—' },
            { chiave: 'c', etichetta: 'Cosa cambia', render: (r) => <span className="text-[12px] text-neutro-700">{r.cambi.join(' · ') || (r.esito === 'nuova' ? 'Viene aggiunta' : '—')}</span> },
          ]} />
        </div>
      )}
    </div>
  )
}
