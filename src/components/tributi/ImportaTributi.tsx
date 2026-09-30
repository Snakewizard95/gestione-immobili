/**
 * Importazione dei tributi rateizzati dai due file Excel ("Tributi in Sospeso" e "Rateizzi_Avvisi_Bonari") e/o dalla
 * cartella "Rateizzi Avvisi Bonari" con i PDF dei piani: anteprima con il controllo dei totali rispetto al foglio
 * "Riepilogo" e l'esito di ogni PDF (nuovo, completa, già presente), poi conferma. Si può ripetere: niente doppioni.
 */
import { useEffect, useState } from 'react'
import { FileSpreadsheet, FolderOpen, Upload } from 'lucide-react'
import { MODO_DEMO } from '../../lib/github'
import { preparaImportazioneTributi, type EsitoPdf, type FileTributi, type PdfCartella, type PianoImportazioneTributi } from '../../lib/importaTributi'
import { leggiPdfRateizzo } from '../../lib/pdfRateizzo'
import { useSessioneAttiva } from '../../lib/sessione'
import { aggiorna, attivi, campiModifica } from '../../lib/store'
import type { Contribuente, PraticaTributo } from '../../lib/tipi'
import { useCollezioni } from '../../lib/useCollezioni'
import { formattaEuro } from '../../lib/utils/formato'
import { useSoloLettura } from '../SoloLettura'
import { Avviso, Bottone, Etichetta, Tabella, TavolaKpi } from '../ui'

// Copie dei file di Davide nella cartella del progetto (servite solo dal server di sviluppo sul Mac)
const LOCALE_SOSPESO = '/dati-excel/tributi/Tributi in Sospeso 2026 - BOZZA Anagrafica.xlsx'
const LOCALE_RATEIZZI = '/dati-excel/tributi/Rateizzi_Avvisi_Bonari.xlsx'

type Chiave = 'sospeso' | 'rateizzi'

/** PDF da non leggere nella cartella: F24 delle singole rate, prospetti mensili, copie di sicurezza. */
const DA_SALTARE = /(^|\/)(f24_[^/]*|SLEF24[^/]*)$|(^|\/)(F24 Mensili|_backup)\//i

const ESITI: Record<EsitoPdf['esito'], { testo: string; tono: 'verde' | 'blu' | 'grigio' }> = {
  nuovo: { testo: 'Nuovo', tono: 'verde' }, completa: { testo: 'Completa', tono: 'blu' }, gia_presente: { testo: 'Già presente', tono: 'grigio' }, doppione: { testo: 'Doppione', tono: 'grigio' },
}

export default function ImportaTributi() {
  const { token, nome } = useSessioneAttiva()
  const { dati, caricamento } = useCollezioni(['contribuenti', 'pratiche_tributi'])
  const soloLettura = useSoloLettura()
  const [file, setFile] = useState<FileTributi>({})
  const [nomi, setNomi] = useState<Record<Chiave, string>>({ sospeso: '', rateizzi: '' })
  const [piano, setPiano] = useState<PianoImportazioneTributi | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [esito, setEsito] = useState<string | null>(null)
  const [inCorso, setInCorso] = useState(false)
  const [locali, setLocali] = useState(false)
  const [cartella, setCartella] = useState<{ nome: string; letti: number; altri: number } | null>(null)
  const [lettura, setLettura] = useState<string | null>(null)

  useEffect(() => {
    if (!import.meta.env.DEV) return
    fetch(LOCALE_RATEIZZI, { method: 'HEAD' }).then((r) => setLocali(r.ok)).catch(() => setLocali(false))
  }, [])

  function analizza(f: FileTributi) {
    setErrore(null); setEsito(null)
    try {
      setPiano(preparaImportazioneTributi(f, {
        contribuenti: attivi(dati<Contribuente>('contribuenti')), pratiche: attivi(dati<PraticaTributo>('pratiche_tributi')),
      }, nome))
    } catch (e) { setPiano(null); setErrore('Impossibile leggere il file: ' + (e as Error).message) }
  }

  async function scegli(chiave: Chiave, f: File | undefined) {
    if (!f) return
    const nuovo = { ...file, [chiave]: await f.arrayBuffer() }
    setFile(nuovo); setNomi((n) => ({ ...n, [chiave]: f.name })); analizza(nuovo)
  }

  /** Legge tutti i PDF di piano della cartella scelta (gli altri PDF, es. gli avvisi, vengono ignorati). */
  async function scegliCartella(elenco: FileList | null) {
    if (!elenco?.length) return
    setErrore(null); setEsito(null)
    const pdf = [...elenco].filter((f) => /\.pdf$/i.test(f.name) && !DA_SALTARE.test(f.webkitRelativePath || f.name) && f.size < 20 * 1024 * 1024)
    const letti: PdfCartella[] = []
    let altri = 0
    for (let i = 0; i < pdf.length; i++) {
      setLettura(`Lettura dei PDF: ${i + 1} di ${pdf.length}…`)
      try { letti.push({ percorso: pdf[i].webkitRelativePath || pdf[i].name, pdf: await leggiPdfRateizzo(pdf[i]) }) } catch { altri++ }
    }
    setLettura(null)
    setCartella({ nome: (pdf[0]?.webkitRelativePath || '').split('/')[0] || 'cartella', letti: letti.length, altri })
    const nuovo = { ...file, pdf: letti }
    setFile(nuovo); analizza(nuovo)
  }

  async function daCartella() {
    setErrore(null)
    const [a, b] = await Promise.all([fetch(LOCALE_SOSPESO), fetch(LOCALE_RATEIZZI)])
    if (!a.ok || !b.ok) { setErrore('File non trovati nella cartella dati-excel/tributi del progetto.'); return }
    const nuovo = { ...file, sospeso: await a.arrayBuffer(), rateizzi: await b.arrayBuffer() }
    setFile(nuovo); setNomi({ sospeso: LOCALE_SOSPESO.split('/').pop()!, rateizzi: LOCALE_RATEIZZI.split('/').pop()! }); analizza(nuovo)
  }

  async function importa() {
    if (!piano) return
    setInCorso(true); setErrore(null)
    try {
      const m = `${nome}: importazione tributi da Excel`
      if (piano.contribuenti.length || piano.aliasAggiunti.length) {
        await aggiorna<Contribuente>(token, 'contribuenti', (rec) => [
          ...rec.map((c) => {
            const a = piano.aliasAggiunti.find((x) => x.id === c.id)
            return a ? { ...c, alias: [...(c.alias ?? []), ...a.alias], ...campiModifica(nome) } : c
          }),
          ...piano.contribuenti,
        ], `${m} (società)`)
      }
      if (piano.pratiche.length || piano.aggiornate.length) {
        await aggiorna<PraticaTributo>(token, 'pratiche_tributi', (rec) => [
          ...rec.map((p) => piano.aggiornate.find((a) => a.id === p.id) ?? p),
          ...piano.pratiche,
        ], `${m} (pratiche e rate)`)
      }
      setEsito(`Importazione completata: ${piano.contribuenti.length} società, ${piano.pratiche.length} pratiche nuove (${piano.pratiche.filter((p) => p.rate.length).length} con il piano delle rate) e ${piano.aggiornate.length} pratiche completate con il piano del PDF. Le trovi in "Tributi rateizzati".`)
      setPiano(null); setFile({}); setNomi({ sospeso: '', rateizzi: '' }); setCartella(null)
    } catch (e) { setErrore((e as Error).message) } finally { setInCorso(false) }
  }

  const differenze = piano?.controlli.filter((c) => c.riepilogo_totale_cent !== null && (c.totale_cent !== c.riepilogo_totale_cent || c.pagato_cent !== c.riepilogo_pagato_cent)) ?? []
  const disabilitato = caricamento || soloLettura

  const sceltaFile = (chiave: Chiave, titolo: string, spiegazione: string) => (
    <div className="blueprint flex flex-wrap items-center gap-4 !border-dashed p-6">
      <i className="corner tl" /><i className="corner tr" /><i className="corner bl" /><i className="corner br" />
      <FileSpreadsheet size={28} className="flex-none text-accento-700" />
      <div className="min-w-0 flex-1">
        <div className="font-medium">{titolo}</div>
        <div className="text-[13px] text-neutro-700">{nomi[chiave] ? <>Scelto: <b>{nomi[chiave]}</b></> : spiegazione}</div>
      </div>
      <label className={`btn btn-secondario ${disabilitato ? 'pointer-events-none opacity-45' : ''}`}>
        <Upload size={16} /> Scegli file…
        <input type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => scegli(chiave, e.target.files?.[0])} disabled={disabilitato} />
      </label>
    </div>
  )

  return (
    <div>
      {soloLettura && <div className="mb-5"><Avviso tipo="info">Hai accesso in sola lettura: l'importazione è riservata a chi può modificare i dati.</Avviso></div>}
      <div className="grid gap-4">
        {sceltaFile('sospeso', '1. Tributi in Sospeso', 'Si leggono solo "Anagrafica" (società, responsabili, email) e i "Rateizzi Effettuati" del foglio "Definiti": avvisi in attesa e segnalazioni IVA restano nell\'Excel.')}
        {sceltaFile('rateizzi', '2. Rateizzi Avvisi Bonari', 'Un foglio per società con i piani di rate; il foglio "Riepilogo" serve per il controllo dei totali.')}
        <div className="blueprint flex flex-wrap items-center gap-4 !border-dashed p-6">
          <i className="corner tl" /><i className="corner tr" /><i className="corner bl" /><i className="corner br" />
          <FolderOpen size={28} className="flex-none text-accento-700" />
          <div className="min-w-0 flex-1">
            <div className="font-medium">3. Cartella dei rateizzi (PDF dei piani)</div>
            <div className="text-[13px] text-neutro-700">
              {lettura ?? (cartella
                ? <>Cartella <b>{cartella.nome}</b>: {cartella.letti} piani letti{cartella.altri ? `, ${cartella.altri} altri PDF ignorati (avvisi, documenti)` : ''}.</>
                : 'Scegli la cartella "Rateizzi Avvisi Bonari": vengono letti tutti i PDF "Determinazione dei versamenti rateali" (società e tributo dai nomi delle cartelle). I PDF servono solo per leggere i dati: non vengono caricati.')}
            </div>
          </div>
          <label className={`btn btn-secondario ${disabilitato || !!lettura ? 'pointer-events-none opacity-45' : ''}`}>
            <FolderOpen size={16} /> Scegli cartella…
            <input type="file" multiple className="hidden" disabled={disabilitato || !!lettura} onChange={(e) => scegliCartella(e.target.files)}
              {...({ webkitdirectory: '', directory: '' } as Record<string, string>)} />
          </label>
        </div>
      </div>
      {locali && MODO_DEMO && (
        <div className="mt-3"><Bottone variante="ghost" onClick={daCartella} disabled={disabilitato}>Carica entrambi i file dalla cartella del progetto (dati-excel/tributi)</Bottone></div>
      )}

      {errore && <div className="mt-5"><Avviso tipo="errore">{errore}</Avviso></div>}
      {esito && <div className="mt-5"><Avviso tipo="ok">{esito}</Avviso></div>}

      {piano && (
        <div className="mt-8">
          <TavolaKpi celle={[
            { titolo: 'Società nuove', valore: piano.contribuenti.length },
            { titolo: 'Pratiche nuove', valore: piano.pratiche.length, nota: `${piano.pratiche.filter((p) => p.rate.length).length} con il piano delle rate` },
            ...(piano.esitiPdf.length ? [{ titolo: 'Piani dai PDF', valore: piano.esitiPdf.filter((x) => x.esito === 'nuovo' || x.esito === 'completa').length, nota: `${piano.esitiPdf.filter((x) => x.esito === 'nuovo').length} nuovi, ${piano.esitiPdf.filter((x) => x.esito === 'completa').length} completano "rate decise", ${piano.esitiPdf.filter((x) => x.esito === 'gia_presente').length} già presenti` }] : []),
            { titolo: 'Già presenti', valore: piano.saltate, nota: 'verranno saltate' },
            { titolo: 'Controllo totali', valore: differenze.length ? `${differenze.length} diff.` : 'OK', nota: differenze.length ? 'società con totali diversi dal Riepilogo' : 'uguali al foglio Riepilogo', tono: differenze.length ? 'rosso' : undefined },
          ]} />
          {piano.avvisi.length > 0 && <div className="-mt-3 mb-5"><Avviso tipo="attenzione"><ul className="list-disc pl-5">{piano.avvisi.map((a, i) => <li key={i}>{a}</li>)}</ul></Avviso></div>}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <span className="text-[13px] text-neutro-700">Confronto tra le rate lette e il foglio "Riepilogo" dell'Excel, società per società.</span>
            <Bottone onClick={importa} disabled={inCorso || soloLettura || (piano.contribuenti.length + piano.pratiche.length + piano.aggiornate.length === 0)}>
              {inCorso ? 'Importazione…' : 'Conferma importazione'}
            </Bottone>
          </div>
          {piano.esitiPdf.length > 0 && (
            <div className="mb-6">
              <h6 className="mb-2 text-accento-700">Piani letti dalla cartella</h6>
              <Tabella righe={[...piano.esitiPdf].sort((a, b) => ['nuovo', 'completa', 'doppione', 'gia_presente'].indexOf(a.esito) - ['nuovo', 'completa', 'doppione', 'gia_presente'].indexOf(b.esito) || a.societa.localeCompare(b.societa, 'it')).map((x, i) => ({ ...x, id: String(i) }))} colonne={[
                { chiave: 'e', etichetta: 'Esito', render: (x) => <Etichetta tono={ESITI[x.esito].tono}>{ESITI[x.esito].testo}</Etichetta> },
                { chiave: 's', etichetta: 'Società', render: (x) => <span className="font-medium">{x.societa}</span> },
                { chiave: 't', etichetta: 'Tributo', render: (x) => x.tributo },
                { chiave: 'i', etichetta: 'Importo', allinea: 'dx', render: (x) => formattaEuro(x.importo_cent) },
                { chiave: 'n', etichetta: 'Rate', allinea: 'dx', render: (x) => x.n_rate },
                { chiave: 'd', etichetta: 'Dettaglio', render: (x) => <span className="text-[12px] text-neutro-700" title={x.percorso}>{x.dettaglio}</span> },
              ]} />
            </div>
          )}
          {piano.controlli.length > 0 && (
            <Tabella righe={piano.controlli.map((c) => ({ ...c, id: c.foglio }))} colonne={[
              { chiave: 'f', etichetta: 'Foglio Excel', render: (c) => c.foglio },
              { chiave: 's', etichetta: 'Società', render: (c) => c.contribuente },
              { chiave: 'p', etichetta: 'Piani', allinea: 'dx', render: (c) => c.piani },
              { chiave: 't', etichetta: 'Totale letto', allinea: 'dx', render: (c) => formattaEuro(c.totale_cent) },
              { chiave: 'rt', etichetta: 'Totale Riepilogo', allinea: 'dx', render: (c) => formattaEuro(c.riepilogo_totale_cent) },
              { chiave: 'pg', etichetta: 'Pagato letto', allinea: 'dx', render: (c) => formattaEuro(c.pagato_cent) },
              { chiave: 'rp', etichetta: 'Pagato Riepilogo', allinea: 'dx', render: (c) => formattaEuro(c.riepilogo_pagato_cent) },
              { chiave: 'e', etichetta: 'Esito', render: (c) => c.riepilogo_totale_cent === null ? <Etichetta>Non nel Riepilogo</Etichetta>
                : c.totale_cent === c.riepilogo_totale_cent && c.pagato_cent === c.riepilogo_pagato_cent ? <Etichetta tono="verde">OK</Etichetta> : <Etichetta tono="rosso">Diverso</Etichetta> },
            ]} />
          )}
        </div>
      )}
    </div>
  )
}
