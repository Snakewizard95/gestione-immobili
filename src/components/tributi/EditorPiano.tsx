/**
 * Inserimento e modifica di un piano di rateizzo:
 * 1. (facoltativo) caricando il PDF "Determinazione dei versamenti rateali": rate, importo e date vengono letti dal
 *    PDF e l'avviso in attesa con lo stesso importo viene riconosciuto da solo. Del PDF si salvano solo i dati:
 *    il file non viene conservato, per risparmiare spazio (scelta di Davide);
 * 2. dati dell'avviso, con la possibilità di aggiungere al volo una società che non è in elenco;
 * 3. rate calcolate in automatico (regole dell'Agenzia) oppure scritte / corrette a mano.
 */
import { useRef, useState } from 'react'
import { FileUp, Plus, Trash2 } from 'lucide-react'
import { normalizzaNome, vuotaPratica, vuotoContribuente } from '../../lib/importaTributi'
import { leggiPdfRateizzo, type PianoPdf } from '../../lib/pdfRateizzo'
import { calcolaRate, decorrenzaDaElaborazione, dividiQuota, rateDaPdf } from '../../lib/rateTributi'
import { useSessioneAttiva } from '../../lib/sessione'
import { aggiorna, campiModifica } from '../../lib/store'
import { TIPI_PRATICA, etichettaDi, type Contribuente, type PraticaTributo, type RataTributo } from '../../lib/tipi'
import { aggiungiGiorni } from '../../lib/ravvedimento'
import { analizzaEuro, formattaData, formattaEuro } from '../../lib/utils/formato'
import { Avviso, Bottone, Segmentato } from '../ui'

const NUOVA = '__nuova'
const FORME_GIURIDICHE = new Set(['srl', 'srls', 'spa', 'sas', 'snc', 'sapa', 'scarl', 'ss'])

/** "STUDIO SOMALIA LIBIA SRL" → "Studio Somalia Libia SRL" */
const nomeLeggibile = (s: string) => s.toLowerCase().split(/\s+/).map((w) => (FORME_GIURIDICHE.has(w.replace(/\./g, '')) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1))).join(' ')

/** Contribuente il cui nome (o ragione sociale o alias) compare come parole intere nel testo; il più lungo vince. */
function trovaPerNome(testo: string, contribuenti: Contribuente[]): Contribuente | null {
  const t = ' ' + normalizzaNome(testo) + ' '
  let migliore: { c: Contribuente; l: number } | null = null
  let pari = false
  for (const c of contribuenti) {
    for (const n of [c.nome, c.ragione_sociale, ...(c.alias ?? [])]) {
      const k = normalizzaNome(n)
      if (k.length < 3 || !t.includes(' ' + k + ' ')) continue
      if (!migliore || k.length > migliore.l) { migliore = { c, l: k.length }; pari = false }
      else if (k.length === migliore.l && migliore.c.id !== c.id) pari = true
    }
  }
  return migliore && !pari ? migliore.c : null
}

/** Campo importo: mostra euro, salva centesimi mentre si scrive. */
function InputEuro({ valore, onChange, className = '' }: { valore: number | null; onChange: (c: number | null) => void; className?: string }) {
  const [testo, setTesto] = useState<string | null>(null)
  const mostrato = testo ?? (valore === null ? '' : (valore / 100).toFixed(2).replace('.', ','))
  return (
    <input value={mostrato} inputMode="decimal" className={`input num text-right ${className}`}
      onFocus={() => setTesto(mostrato)} onChange={(e) => { setTesto(e.target.value); onChange(analizzaEuro(e.target.value)) }}
      onBlur={() => setTesto(null)} />
  )
}

const Campo = ({ etichetta, children, aiuto, largo }: { etichetta: string; children: React.ReactNode; aiuto?: string; largo?: boolean }) => (
  <label className={`block ${largo ? 'sm:col-span-2' : ''}`}>
    <span className="etichetta-campo">{etichetta}</span>
    {children}
    {aiuto && <span className="mt-1 block text-xs text-neutro-700">{aiuto}</span>}
  </label>
)

interface Props {
  base: PraticaTributo | null            // pratica da completare o modificare (null = nuova)
  contribuenti: Contribuente[]
  pratiche: PraticaTributo[]
  contribuenteIniziale?: string
  tipoIniziale?: string                  // es. "cartella" quando arriva la cartella di un piano decaduto
  tributoIniziale?: string
  notaIniziale?: string
  onChiudi: () => void
  onSalvato: (id: string) => void
}

export default function EditorPiano({ base: baseIniziale, contribuenti, pratiche, contribuenteIniziale, tipoIniziale, tributoIniziale, notaIniziale, onChiudi, onSalvato }: Props) {
  const { token, nome } = useSessioneAttiva()
  const [base, setBase] = useState<PraticaTributo | null>(baseIniziale)
  const [contribuenteId, setContribuenteId] = useState(baseIniziale?.contribuente_id ?? contribuenteIniziale ?? '')
  const [nuovaSoc, setNuovaSoc] = useState({ nome: '', responsabile: '', email: '', ragione_sociale: '' })
  const [tipo, setTipo] = useState(baseIniziale?.tipo ?? tipoIniziale ?? 'avviso_bonario')
  const [tributo, setTributo] = useState(baseIniziale?.tributo ?? tributoIniziale ?? '')
  const [notifica, setNotifica] = useState(baseIniziale?.data_notifica ?? '')
  const [elaborazione, setElaborazione] = useState(baseIniziale?.data_elaborazione ?? '')
  const [importo, setImporto] = useState<number | null>(baseIniziale?.importo_cent ?? null)
  const [atto, setAtto] = useState(baseIniziale?.numero_atto ?? '')
  const [termine, setTermine] = useState(baseIniziale?.termine_pagamento ?? '')
  const [note, setNote] = useState(baseIniziale?.note ?? notaIniziale ?? '')
  const [rate, setRate] = useState<RataTributo[]>(baseIniziale?.rate ?? [])
  // Parametri del calcolo automatico
  const [nRate, setNRate] = useState<number>(baseIniziale?.rate.length || baseIniziale?.rate_concordate || 10)
  const [primaScadenza, setPrimaScadenza] = useState(baseIniziale?.rate[0]?.scadenza ?? '')
  const [periodicita, setPeriodicita] = useState<'trimestrale' | 'mensile'>(baseIniziale?.periodicita === 'mensile' || tipoIniziale === 'cartella' ? 'mensile' : 'trimestrale')
  const [tasso, setTasso] = useState(3.5)
  const [sanzioniPerc, setSanzioniPerc] = useState(10)
  // PDF
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [pdf, setPdf] = useState<PianoPdf | null>(null)
  const [candidati, setCandidati] = useState<PraticaTributo[]>([])
  const [doppioni, setDoppioni] = useState<PraticaTributo[]>([])
  const inputPdf = useRef<HTMLInputElement>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [inCorso, setInCorso] = useState<string | null>(null)

  const nomeDi = (id: string) => contribuenti.find((c) => c.id === id)?.nome ?? '—'

  /** Usa una pratica esistente (avviso in attesa) come base: il piano la completerà invece di crearne una nuova. */
  function usaBase(p: PraticaTributo | null, daPdf = false) {
    setBase(p)
    if (!p) return
    setContribuenteId(p.contribuente_id); setTipo(p.tipo); setTributo(p.tributo); setAtto(p.numero_atto)
    if (p.data_notifica) setNotifica(p.data_notifica)
    if (p.rate_concordate && !daPdf && rate.length === 0) setNRate(p.rate_concordate)
    if (p.note) setNote(p.note)
  }

  async function caricaPdf(file: File | undefined) {
    if (!file) return
    setErrore(null)
    setInCorso('Lettura del PDF…')
    try {
      const letto = await leggiPdfRateizzo(file)
      setPdf(letto); setPdfFile(file)
      setImporto(letto.importo_cent); setNRate(letto.n_rate); setPrimaScadenza(letto.righe[0]?.scadenza ?? '')
      setRate(rateDaPdf(letto, sanzioniPerc)); setPeriodicita('trimestrale')
      if (letto.data_ricevimento) setNotifica(letto.data_ricevimento)
      if (letto.data_elaborazione) setElaborazione(letto.data_elaborazione)
      setTipo((t) => (t === 'avviso_bonario' || !base ? 'avviso_bonario' : t))
      // Avvisi in attesa con lo stesso importo (entro 1 €): il PDF quasi certamente è il loro piano
      const vicini = (p: PraticaTributo) => p.importo_cent !== null && Math.abs(p.importo_cent - letto.importo_cent) <= 100
      // Società: dal campo "Azienda" (PDF del commercialista) oppure dal nome del file (es. "Agenzia Entrate jonio - …")
      const perNome = trovaPerNome(letto.azienda, contribuenti) ?? (letto.azienda ? null : trovaPerNome(file.name, contribuenti))
      let inAttesa = pratiche.filter((p) => p.rate.length === 0 && vicini(p) && p.id !== base?.id)
      if (perNome && inAttesa.some((p) => p.contribuente_id === perNome.id)) inAttesa = inAttesa.filter((p) => p.contribuente_id === perNome.id)
      setDoppioni(pratiche.filter((p) => p.rate.length > 0 && vicini(p) && p.id !== base?.id && (!perNome || p.contribuente_id === perNome.id)))
      setCandidati(inAttesa)
      if (!base && inAttesa.length === 1) usaBase(inAttesa[0], true)
      else if (!base && perNome) setContribuenteId(perNome.id)
      else if (!base && letto.azienda) {
        // Società non in elenco: si propone di aggiungerla con il nome letto dal PDF
        setContribuenteId(NUOVA)
        setNuovaSoc((n) => ({ ...n, nome: n.nome || nomeLeggibile(letto.azienda.replace(/^studio\s+/i, '').replace(/\s+(s\.?r\.?l\.?s?|s\.?p\.?a\.?|s\.?a\.?s\.?|s\.?n\.?c\.?)$/i, '')), ragione_sociale: letto.azienda }))
      }
    } catch (e) { setErrore((e as Error).message) } finally { setInCorso(null); if (inputPdf.current) inputPdf.current.value = '' }
  }

  function calcola() {
    setErrore(null)
    if (!importo || importo <= 0) { setErrore('Indica l\'importo da rateizzare.'); return }
    if (!nRate || nRate < 1) { setErrore('Indica il numero di rate.'); return }
    if (!primaScadenza) { setErrore('Indica la data della prima rata.'); return }
    const partenza = elaborazione || notifica || primaScadenza
    setRate(calcolaRate({
      importo_cent: importo, n_rate: nRate, prima_scadenza: primaScadenza, periodicita, tasso_percento: tasso,
      decorrenza_interessi: decorrenzaDaElaborazione(partenza), sanzioni_percento: sanzioniPerc,
    }))
  }

  function cambiaSanzioni(perc: number) {
    setSanzioniPerc(perc)
    setRate((rr) => rr.map((r) => ({ ...r, ...dividiQuota(r.quota_capitale_cent + r.sanzioni_cent, perc) })))
  }

  function modificaRata(i: number, campo: keyof RataTributo, valore: unknown) {
    setRate((rr) => rr.map((r, k) => {
      if (k !== i) return r
      const n = { ...r, [campo]: valore } as RataTributo
      n.totale_cent = n.quota_capitale_cent + n.sanzioni_cent + n.interessi_cent
      return n
    }))
  }

  const aggiungiRata = () => setRate((rr) => [...rr, { numero: rr.length + 1, scadenza: '', quota_capitale_cent: 0, sanzioni_cent: 0, interessi_cent: 0, totale_cent: 0, pagata: false, pagata_il: '', note: '' }])
  const togliRata = (i: number) => setRate((rr) => rr.filter((_, k) => k !== i).map((r, k) => ({ ...r, numero: k + 1 })))

  const somma = (k: 'quota_capitale_cent' | 'sanzioni_cent' | 'interessi_cent' | 'totale_cent') => rate.reduce((s, r) => s + r[k], 0)
  const differenza = importo ? somma('quota_capitale_cent') + somma('sanzioni_cent') - importo : 0

  async function salva() {
    setErrore(null)
    let cid = contribuenteId
    if (!cid) { setErrore('Scegli la società (o "Aggiungi una nuova società").'); return }
    if (cid === NUOVA) {
      const n = nuovaSoc.nome.trim()
      if (!n) { setErrore('Scrivi il nome della nuova società.'); return }
      const esistente = contribuenti.find((c) => [c.nome, ...(c.alias ?? [])].some((x) => normalizzaNome(x) === normalizzaNome(n)))
      if (esistente) { setErrore(`La società "${esistente.nome}" è già in elenco: sceglila dal menu.`); return }
    }
    if (!tributo.trim()) { setErrore('Scrivi il tributo (es. "IVA IV TRIM 25").'); return }
    if (rate.some((r) => !r.scadenza || r.totale_cent <= 0)) { setErrore('Ogni rata deve avere scadenza e importo.'); return }
    setInCorso('Salvataggio…')
    try {
      if (cid === NUOVA) {
        const c = vuotoContribuente(nome, nuovaSoc.nome.trim())
        c.responsabile = nuovaSoc.responsabile.trim(); c.email = nuovaSoc.email.trim(); c.ragione_sociale = nuovaSoc.ragione_sociale.trim()
        await aggiorna<Contribuente>(token, 'contribuenti', (rec) => [...rec, c], `${nome}: nuova società tributi ${c.nome}`)
        cid = c.id
      }
      const ordinate = [...rate].sort((a, b) => a.scadenza.localeCompare(b.scadenza)).map((r, k) => ({ ...r, numero: k + 1 }))
      const tuttePagate = ordinate.length > 0 && ordinate.every((r) => r.pagata)
      const partenza: PraticaTributo = base ?? vuotaPratica(nome, cid)
      const record: PraticaTributo = {
        ...partenza, contribuente_id: cid, tipo, tributo: tributo.trim(), data_notifica: notifica, data_elaborazione: elaborazione,
        importo_cent: importo, numero_atto: atto.trim(), termine_pagamento: termine, note: note.trim(), rate: ordinate,
        periodicita: tipo === 'rottamazione' && ordinate.length ? 'personalizzata' : periodicita,
        rate_concordate: ordinate.length || partenza.rate_concordate || nRate || null,
        anno_rateizzo: partenza.anno_rateizzo ?? (ordinate[0] ? Number(ordinate[0].scadenza.slice(0, 4)) : null),
        stato: ordinate.length ? (tuttePagate ? 'estinto' : 'rateizzato') : base ? partenza.stato : 'rate_concordate',
        ...(base ? campiModifica(nome) : {}),
      }
      const nomeSoc = cid === contribuenteId ? nomeDi(cid) : nuovaSoc.nome.trim()
      await aggiorna<PraticaTributo>(token, 'pratiche_tributi', (rec) => (base ? rec.map((p) => (p.id === base.id ? record : p)) : [...rec, record]),
        `${nome}: ${base ? (baseIniziale ? 'modifica' : 'inserisce') : 'nuovo'} piano ${nomeSoc} ${record.tributo}`)
      onSalvato(record.id)
    } catch (e) { setErrore((e as Error).message) } finally { setInCorso(null) }
  }

  return (
    <div className="flex flex-col gap-7">
      {/* 1. PDF */}
      <section>
        <h6 className="mb-3 text-accento-700">1. Piano dell'Agenzia in PDF (facoltativo)</h6>
        <div className="flex flex-wrap items-center gap-3 border border-dashed border-neutro-400 px-4 py-4 text-[13px]"
          onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); if (!inCorso) caricaPdf(e.dataTransfer.files?.[0]) }}>
          <FileUp size={20} className="flex-none text-accento-700" />
          <span className="min-w-0 flex-1 text-neutro-700">
            {inCorso === 'Lettura del PDF…' ? inCorso : pdfFile
              ? <>Letto <b>{pdfFile.name}</b> ({pdf?.formato === 'commercialista' ? 'programma del commercialista' : 'Agenzia delle Entrate'}){pdf?.azienda ? <>, azienda <b>{pdf.azienda}</b></> : ''}: {pdf?.n_rate} rate, importo {formattaEuro(pdf?.importo_cent)}{pdf?.data_ricevimento ? `, ricevuto il ${formattaData(pdf.data_ricevimento)}` : ''}. Salvo solo i dati: il PDF non viene conservato.</>
              : <>Trascina qui il PDF "Determinazione dei versamenti rateali" (dell'Agenzia o del programma del commercialista), oppure <button type="button" className="text-accento-700 underline" onClick={() => inputPdf.current?.click()}>sceglilo</button>: rate e date si compilano da sole.</>}
          </span>
          {pdfFile && <Bottone variante="ghost" piccolo onClick={() => inputPdf.current?.click()}>Cambia PDF</Bottone>}
          <input ref={inputPdf} type="file" accept=".pdf" className="hidden" onChange={(e) => caricaPdf(e.target.files?.[0])} />
        </div>
        {pdf?.avvisi.map((a, i) => <div key={i} className="mt-2"><Avviso tipo="attenzione">{a}</Avviso></div>)}
        {doppioni.length > 0 && (
          <div className="mt-2"><Avviso tipo="attenzione">
            Attenzione: esiste già un piano con lo stesso importo — {doppioni.map((p) => `${nomeDi(p.contribuente_id)} · ${p.tributo}`).join('; ')}. Controlla di non inserirlo due volte.
          </Avviso></div>
        )}
        {candidati.length > 0 && (
          <div className="mt-2"><Avviso tipo={base && candidati.some((c) => c.id === base.id) ? 'ok' : 'info'}>
            <div className="mb-1">{candidati.length === 1 ? 'Questo PDF corrisponde all\'avviso in attesa:' : 'Questo PDF potrebbe corrispondere a uno di questi avvisi in attesa (stesso importo):'}</div>
            <div className="flex flex-col gap-1">
              {candidati.map((c) => (
                <label key={c.id} className="radio">
                  <input type="radio" name="candidato" checked={base?.id === c.id} onChange={() => usaBase(c, true)} />
                  <span className="dot" /><b>{nomeDi(c.contribuente_id)}</b> · {c.tributo} · {formattaEuro(c.importo_cent)}{c.rate_concordate ? ` · ${c.rate_concordate} rate concordate` : ''}
                </label>
              ))}
              {!baseIniziale && (
                <label className="radio">
                  <input type="radio" name="candidato" checked={!base} onChange={() => usaBase(null)} />
                  <span className="dot" />Nessuno: è un avviso nuovo
                </label>
              )}
            </div>
          </Avviso></div>
        )}
      </section>

      {/* 2. Dati dell'avviso */}
      <section>
        <h6 className="mb-3 text-accento-700">2. Dati dell'avviso {base && !baseIniziale && <span className="normal-case tracking-normal text-neutro-700">— completa la pratica in attesa di {nomeDi(base.contribuente_id)}</span>}</h6>
        <div className="grid grid-cols-1 gap-x-[18px] gap-y-[14px] sm:grid-cols-2 lg:grid-cols-3">
          <Campo etichetta="Società *">
            <select value={contribuenteId} onChange={(e) => setContribuenteId(e.target.value)} className="input">
              <option value="">— scegli —</option>
              <option value={NUOVA}>+ Aggiungi una nuova società…</option>
              {contribuenti.map((c) => <option key={c.id} value={c.id}>{c.nome}{c.responsabile ? ` (${c.responsabile})` : ''}</option>)}
            </select>
          </Campo>
          <Campo etichetta="Tipo"><select value={tipo} onChange={(e) => setTipo(e.target.value)} className="input">{TIPI_PRATICA.filter((o) => o.valore !== 'segnalazione_iva').map((o) => <option key={o.valore} value={o.valore}>{o.etichetta}</option>)}</select></Campo>
          <Campo etichetta="Tributo *" aiuto='Es. "IVA IV TRIM 25", "770/2024", "Redditi 2023"'><input value={tributo} onChange={(e) => setTributo(e.target.value)} className="input" /></Campo>
          {contribuenteId === NUOVA && (
            <div className="col-span-full grid grid-cols-1 gap-x-[18px] gap-y-[14px] border-l-4 border-accento bg-accento-100 px-4 py-3 sm:grid-cols-3">
              <Campo etichetta="Nome della nuova società *" aiuto="Il nome breve usato dagli studi"><input value={nuovaSoc.nome} onChange={(e) => setNuovaSoc({ ...nuovaSoc, nome: e.target.value })} className="input" /></Campo>
              <Campo etichetta="Responsabile"><input value={nuovaSoc.responsabile} onChange={(e) => setNuovaSoc({ ...nuovaSoc, responsabile: e.target.value })} className="input" /></Campo>
              <Campo etichetta="Email del responsabile"><input value={nuovaSoc.email} onChange={(e) => setNuovaSoc({ ...nuovaSoc, email: e.target.value })} className="input" /></Campo>
              <span className="col-span-full text-xs text-neutro-700">
                {nuovaSoc.ragione_sociale ? <>Nel PDF l'azienda è <b>{nuovaSoc.ragione_sociale}</b> e non è nell'elenco: controlla il nome breve proposto. </> : ''}
                Verrà aggiunta all'elenco delle società (scheda "Società"), dove potrai completarne i dati.
              </span>
            </div>
          )}
          <Campo etichetta="Data notifica / ricevimento"><input type="date" value={notifica} onChange={(e) => setNotifica(e.target.value)} className="input" /></Campo>
          <Campo etichetta="Data elaborazione comunicazione" aiuto="Dall'avviso o dal PDF: serve per gli interessi"><input type="date" value={elaborazione} onChange={(e) => setElaborazione(e.target.value)} className="input" /></Campo>
          <Campo etichetta="Importo da rateizzare" aiuto="Imposta + sanzioni, senza interessi"><InputEuro valore={importo} onChange={setImporto} /></Campo>
          <Campo etichetta="Numero avviso / cartella"><input value={atto} onChange={(e) => setAtto(e.target.value)} className="input" /></Campo>
          <Campo etichetta="Termine per pagare o rateizzare" aiuto={notifica && !termine ? 'Se vuoto si considera notifica + 60 giorni' : undefined}>
            <input type="date" value={termine} onChange={(e) => setTermine(e.target.value)} className="input" />
          </Campo>
        </div>
      </section>

      {/* 3. Rate */}
      <section>
        <h6 className="mb-3 text-accento-700">3. Rate</h6>
        <div className="grid grid-cols-2 items-end gap-x-[14px] gap-y-3 border border-divisore bg-superficie px-4 py-3 sm:grid-cols-3 lg:grid-cols-6">
          <Campo etichetta="N. rate"><input type="number" min={1} max={120} value={nRate} onChange={(e) => setNRate(Number(e.target.value))} className="input num text-right" /></Campo>
          <Campo etichetta="Prima rata">
            <input type="date" value={primaScadenza} onChange={(e) => setPrimaScadenza(e.target.value)} className="input" />
            {!primaScadenza && notifica && <button type="button" className="mt-1 text-xs text-accento-700 underline" onClick={() => setPrimaScadenza(aggiungiGiorni(notifica, 60))}>notifica + 60 giorni</button>}
          </Campo>
          <Campo etichetta="Cadenza"><Segmentato largo valore={periodicita} onChange={setPeriodicita} opzioni={[{ valore: 'trimestrale', etichetta: 'Trim.' }, { valore: 'mensile', etichetta: 'Mens.' }]} /></Campo>
          <Campo etichetta="Interessi % annui"><input type="number" step="0.01" value={tasso} onChange={(e) => setTasso(Number(e.target.value))} className="input num text-right" /></Campo>
          <Campo etichetta="Sanzioni % imposta"><input type="number" step="0.01" value={sanzioniPerc} onChange={(e) => cambiaSanzioni(Number(e.target.value))} className="input num text-right" /></Campo>
          <Bottone type="button" variante="secondario" onClick={calcola}>{rate.length ? 'Ricalcola' : 'Calcola rate'}</Bottone>
        </div>
        <p className="mt-2 text-xs text-neutro-700">
          Il calcolo segue le regole dell'Agenzia per gli avvisi bonari (verificate su 164 prospetti): rate uguali, scadenze a fine trimestre spostate al primo giorno lavorativo,
          interessi al 3,5% annuo. Per cartelle e rottamazioni controlla le rate con il prospetto ricevuto e correggile qui sotto. "Sanzioni % imposta" divide ogni quota tra imposta e sanzioni (10% come nell'Excel).
        </p>

        {rate.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="tabella">
              <thead><tr><th>N.</th><th>Scadenza</th><th className="text-right">Capitale</th><th className="text-right">Sanzioni</th><th className="text-right">Interessi</th><th className="text-right">Totale</th><th>Pagata</th><th /></tr></thead>
              <tbody>
                {rate.map((r, i) => (
                  <tr key={i}>
                    <td className="num">{i + 1}</td>
                    <td><input type="date" value={r.scadenza} onChange={(e) => modificaRata(i, 'scadenza', e.target.value)} className="input !min-h-[32px] w-[150px] !py-1" /></td>
                    <td><InputEuro valore={r.quota_capitale_cent} onChange={(c) => modificaRata(i, 'quota_capitale_cent', c ?? 0)} className="!min-h-[32px] w-[110px] !py-1" /></td>
                    <td><InputEuro valore={r.sanzioni_cent} onChange={(c) => modificaRata(i, 'sanzioni_cent', c ?? 0)} className="!min-h-[32px] w-[100px] !py-1" /></td>
                    <td><InputEuro valore={r.interessi_cent} onChange={(c) => modificaRata(i, 'interessi_cent', c ?? 0)} className="!min-h-[32px] w-[90px] !py-1" /></td>
                    <td className="num text-right font-semibold">{formattaEuro(r.totale_cent)}</td>
                    <td className="text-center"><input type="checkbox" className="accent-accento" checked={r.pagata} onChange={(e) => modificaRata(i, 'pagata', e.target.checked)} /></td>
                    <td><button type="button" onClick={() => togliRata(i)} title="Togli rata" aria-label="Togli rata" className="btn btn-ghost btn-piccolo !text-neutro-700 hover:!text-err-testo"><Trash2 size={14} /></button></td>
                  </tr>
                ))}
                <tr className="totale">
                  <td colSpan={2}>Totale</td>
                  <td className="num text-right">{formattaEuro(somma('quota_capitale_cent'))}</td>
                  <td className="num text-right">{formattaEuro(somma('sanzioni_cent'))}</td>
                  <td className="num text-right">{formattaEuro(somma('interessi_cent'))}</td>
                  <td className="num text-right">{formattaEuro(somma('totale_cent'))}</td>
                  <td colSpan={2} />
                </tr>
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <Bottone type="button" variante="ghost" piccolo onClick={aggiungiRata}><Plus size={14} /> Aggiungi una rata a mano</Bottone>
          {importo !== null && rate.length > 0 && Math.abs(differenza) > 1 && (
            <span className="text-[13px] text-att-testo">Capitale + sanzioni delle rate ({formattaEuro(importo + differenza)}) diverso dall'importo da rateizzare ({formattaEuro(importo)}).</span>
          )}
        </div>
      </section>

      <section>
        <Campo etichetta="Note" largo><textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} className="input" /></Campo>
      </section>

      {errore && <Avviso tipo="errore">{errore}</Avviso>}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-divisore pt-5">
        <span className="text-[13px] text-neutro-700">
          {base ? `Aggiorna la pratica esistente (${etichettaDi(TIPI_PRATICA, base.tipo).toLowerCase()} di ${nomeDi(base.contribuente_id)}).` : 'Crea una nuova pratica.'}
        </span>
        <div className="flex gap-2.5">
          <Bottone type="button" variante="secondario" onClick={onChiudi}>Annulla</Bottone>
          <Bottone type="button" disabled={!!inCorso} onClick={salva}>{inCorso && inCorso !== 'Lettura del PDF…' ? inCorso : 'Salva piano'}</Bottone>
        </div>
      </div>
    </div>
  )
}
