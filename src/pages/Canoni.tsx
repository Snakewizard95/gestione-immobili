/**
 * Canoni e incassi.
 * Scheda "Griglia mensile": per ogni contratto attivo, i 12 mesi dell'anno scelto; ogni cella è il canone
 * del mese (da incassare / parziale / incassato). Cliccando si registra l'incasso, la fattura e le note.
 * Scheda "Tutti i movimenti": elenco completo (canoni, rimborsi spese condominiali, rimborsi imposta di
 * registro, depositi, altro) con filtri e totali.
 */
import { useState } from 'react'
import { Eye, EyeOff, FileSpreadsheet, Plus } from 'lucide-react'
import { righeDaCampi, scaricaExcel } from '../lib/esporta'
import { SoloSeModifica } from '../components/SoloLettura'
import Allegati from '../components/Allegati'
import Modulo, { type CampoDef } from '../components/Modulo'
import { Avviso, BarraRicerca, Bottone, Caricamento, Etichetta, Finestra, Gruppo, IntestazionePagina, Riquadro, Segmentato, Tabella, TavolaKpi, filtraTesto } from '../components/ui'
import { useSessioneAttiva } from '../lib/sessione'
import { aggiorna, attivi, campiModifica, campiNuovo } from '../lib/store'
import { canoneMensilePer, canoneScaduto, descriviCanone, scadenzaCanone, scaglioniAnno, totaliAnnoContratto } from '../lib/canone'
import { MODALITA_INCASSO, STATI_MOVIMENTO, TIPI_MOVIMENTO, etichettaDi, statoIva, type Annualita, type Conduttore, type Contratto, type Immobile, type Movimento, type Societa } from '../lib/tipi'
import { useCollezioni } from '../lib/useCollezioni'
import { formattaData, formattaEuro } from '../lib/utils/formato'

const MESI = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic']
const r0 = (n: number) => Math.round(n)
/** Importo compatto per le celle: "1.220" oppure "1.220,50" */
const MIGLIAIA = { useGrouping: 'always' } as Intl.NumberFormatOptions
const compatto = (cent: number | null | undefined) => cent == null ? '' : (cent % 100 === 0 ? (cent / 100).toLocaleString('it-IT', MIGLIAIA) : (cent / 100).toLocaleString('it-IT', { ...MIGLIAIA, minimumFractionDigits: 2 }))

function calcolaIva(v: Partial<Movimento>): Partial<Movimento> {
  if (v.imponibile_cent == null) return {}
  const iva = r0(v.imponibile_cent * ((v.iva_percento ?? 0) / 100))
  return { iva_cent: iva, dovuto_cent: v.imponibile_cent + iva }
}

function derivati(v: Partial<Movimento>, campo: string): Partial<Movimento> {
  let out: Partial<Movimento> = {}
  if (campo === 'imponibile_cent' || campo === 'iva_percento') out = calcolaIva(v)
  const dovuto = out.dovuto_cent ?? v.dovuto_cent
  if (['incassato_cent', 'imponibile_cent', 'iva_percento', 'data_incasso'].includes(campo) && v.stato !== 'stornato') {
    const inc = v.incassato_cent ?? 0
    if (campo === 'data_incasso' && v.data_incasso && !v.incassato_cent && dovuto != null) { out.incassato_cent = dovuto; out.stato = 'incassato' }
    else if (dovuto != null) out.stato = inc <= 0 ? 'da_incassare' : inc < dovuto ? 'parziale' : 'incassato'
  }
  return out
}

type Cella = { contratto: Contratto; mese: string; movimento: Movimento | null }

export default function PaginaCanoni() {
  const { token, nome } = useSessioneAttiva()
  const { dati, caricamento, errore } = useCollezioni(['movimenti', 'contratti', 'immobili', 'conduttori', 'societa', 'allegati', 'annualita'])
  const [scheda, setScheda] = useState<'griglia' | 'elenco'>('griglia')
  const [anno, setAnno] = useState(new Date().getFullYear())
  const [ricerca, setRicerca] = useState('')
  const [filtroStato, setFiltroStato] = useState('')
  const [aperto, setAperto] = useState<Partial<Movimento> | null>(null)
  const [mostraNascosti, setMostraNascosti] = useState(false)

  const movimenti = attivi(dati<Movimento>('movimenti'))
  const contratti = attivi(dati<Contratto>('contratti'))
  const immobili = attivi(dati<Immobile>('immobili'))
  const conduttori = attivi(dati<Conduttore>('conduttori'))
  const societa = attivi(dati<Societa>('societa'))
  const annualita = attivi(dati<Annualita>('annualita'))

  const descrivi = (c: Contratto | undefined) => {
    const imm = immobili.find((i) => i.id === c?.immobile_id)
    return { societa: societa.find((s) => s.id === imm?.societa_id)?.ragione_sociale ?? '—', immobile: imm?.indirizzo ?? '—', conduttore: conduttori.find((x) => x.id === c?.conduttore_id)?.denominazione ?? '—' }
  }
  const contrattoDi = (id: string) => contratti.find((c) => c.id === id)

  /** Nuovo movimento "canone" per un contratto e un mese, precompilato dal contratto (canone mensile + IVA). */
  function nuovoCanone(c: Contratto, mese: string): Partial<Movimento> {
    const k = canoneMensilePer(c, annualita, mese)
    const base: Partial<Movimento> = {
      contratto_id: c.id, tipo: 'canone', competenza: mese, descrizione: `Canone ${MESI[Number(mese.slice(5, 7)) - 1]} ${mese.slice(0, 4)}`,
      imponibile_cent: k.imponibile_cent, iva_percento: k.iva_percento, incassato_cent: null, data_incasso: '', modalita: 'bonifico',
      numero_fattura: '', data_fattura: '', stato: 'da_incassare', note: '',
    }
    return { ...base, ...calcolaIva(base) }
  }
  function nuovoGenerico(): Partial<Movimento> {
    return { contratto_id: '', tipo: 'rimborso_condominio', competenza: new Date().toISOString().slice(0, 10), descrizione: '', imponibile_cent: null, iva_percento: 0, iva_cent: null, dovuto_cent: null, incassato_cent: null, data_incasso: '', modalita: 'bonifico', numero_fattura: '', data_fattura: '', stato: 'da_incassare', note: '' }
  }

  const campi: CampoDef<Movimento>[] = [
    { nome: 'contratto_id', etichetta: 'Contratto', tipo: 'select', obbligatorio: true, intera: true,
      opzioni: contratti.filter((c) => c.stato !== 'cessato').map((c) => { const d = descrivi(c); return { valore: c.id, etichetta: `${d.immobile} — ${d.conduttore} (${d.societa})` } }) },
    { nome: 'tipo', etichetta: 'Tipo', tipo: 'select', opzioni: TIPI_MOVIMENTO, obbligatorio: true },
    { nome: 'competenza', etichetta: 'Competenza (mese AAAA-MM o data)', tipo: 'testo', obbligatorio: true },
    { nome: 'descrizione', etichetta: 'Descrizione', tipo: 'testo', intera: true },
    { nome: 'imponibile_cent', etichetta: 'Imponibile', tipo: 'euro', sezione: 'Importi', colonne: 4, obbligatorio: true },
    { nome: 'iva_percento', etichetta: 'IVA (%)', tipo: 'numero', aiuto: 'Presa dal flag IVA del contratto; 0 se non soggetto' },
    { nome: 'iva_cent', etichetta: 'IVA', tipo: 'euro', soloLettura: true },
    { nome: 'dovuto_cent', etichetta: 'Totale dovuto', tipo: 'euro', soloLettura: true },
    { nome: 'incassato_cent', etichetta: 'Importo incassato', tipo: 'euro', sezione: 'Incasso', colonne: 4, aiuto: 'Inserendo solo la data, viene incassato l’intero dovuto' },
    { nome: 'data_incasso', etichetta: 'Data incasso', tipo: 'data' },
    { nome: 'modalita', etichetta: 'Modalità', tipo: 'select', opzioni: MODALITA_INCASSO },
    { nome: 'stato', etichetta: 'Stato', tipo: 'select', opzioni: STATI_MOVIMENTO, obbligatorio: true },
    { nome: 'numero_fattura', etichetta: 'Numero fattura', tipo: 'testo', sezione: 'Fattura', colonne: 3 },
    { nome: 'data_fattura', etichetta: 'Data fattura', tipo: 'data' },
    { nome: 'note', etichetta: 'Note', tipo: 'textarea' },
  ]

  async function salva(v: Partial<Movimento>) {
    const esistente = !!v.id
    const d = descrivi(contrattoDi(v.contratto_id ?? ''))
    await aggiorna<Movimento>(token, 'movimenti', (r) => esistente
      ? r.map((x) => (x.id === v.id ? { ...x, ...v, ...campiModifica(nome) } as Movimento : x))
      : [...r, { ...nuovoGenerico(), ...v, ...campiNuovo(nome) } as Movimento],
    `${nome}: ${esistente ? 'modifica' : 'nuovo'} ${etichettaDi(TIPI_MOVIMENTO, v.tipo).toLowerCase()} ${v.competenza} — ${d.immobile} / ${d.conduttore}`)
    setAperto(null)
  }
  async function elimina() {
    if (!aperto?.id) return
    await aggiorna<Movimento>(token, 'movimenti', (r) => r.map((x) => (x.id === aperto.id ? { ...x, eliminato_il: new Date().toISOString(), ...campiModifica(nome) } : x)), `${nome}: elimina movimento ${aperto.competenza}`)
    setAperto(null)
  }

  async function impostaGestione(c: Contratto, valore: 'si' | 'no') {
    const d = descrivi(c)
    await aggiorna<Contratto>(token, 'contratti', (r) => r.map((x) => (x.id === c.id ? { ...x, gestione_incassi: valore, ...campiModifica(nome) } : x)),
      `${nome}: ${valore === 'no' ? 'nasconde dagli incassi' : 'mostra negli incassi'} ${d.immobile} / ${d.conduttore}`)
  }

  // ---- Griglia mensile ----
  const nascosti = contratti.filter((c) => c.stato !== 'cessato' && c.gestione_incassi === 'no').length
  const attiviC = filtraTesto(contratti.filter((c) => c.stato !== 'cessato' && (mostraNascosti || c.gestione_incassi !== 'no')).map((c) => ({ ...c, ...descrivi(c) })), ricerca)
  const gruppi = new Map<string, typeof attiviC>()
  for (const c of attiviC) gruppi.set(c.societa, [...(gruppi.get(c.societa) ?? []), c])
  const mesiAnno = MESI.map((_, i) => `${anno}-${String(i + 1).padStart(2, '0')}`)
  const oggi = new Date().toISOString().slice(0, 10)
  const oggiMese = oggi.slice(0, 7)
  const cella = (c: Contratto, mese: string): Cella => ({ contratto: c, mese, movimento: movimenti.find((m) => m.contratto_id === c.id && m.tipo === 'canone' && m.competenza === mese) ?? null })
  const inizioContratto = (c: Contratto) => c.data_decorrenza ? c.data_decorrenza.slice(0, 7) : ''
  const fineContratto = (c: Contratto) => c.data_cessazione ? c.data_cessazione.slice(0, 7) : ''

  /** Dovuto = mesi già iniziati dell'anno × canone in vigore (o movimento registrato); incassato = somma degli incassi. */
  const totaliDi = (ids: string[]) => ids.reduce((t, id) => {
    const c = contratti.find((x) => x.id === id)
    if (!c) return t
    const r = totaliAnnoContratto(c, annualita, movimenti, anno, oggi)
    return { dovuto: t.dovuto + r.dovuto, incassato: t.incassato + r.incassato }
  }, { dovuto: 0, incassato: 0 })
  const totGriglia = totaliDi(attiviC.map((c) => c.id))
  const totDovuto = totGriglia.dovuto
  const totIncassato = totGriglia.incassato
  const insoluti = Math.max(0, totDovuto - totIncassato)

  // ---- Elenco movimenti ----
  const elenco = filtraTesto(movimenti.map((m) => ({ ...m, ...descrivi(contrattoDi(m.contratto_id)), tipoTesto: etichettaDi(TIPI_MOVIMENTO, m.tipo) })), ricerca)
    .filter((m) => m.competenza.startsWith(String(anno)))
    .filter((m) => !filtroStato || m.stato === filtroStato)
    .sort((a, b) => b.competenza.localeCompare(a.competenza) || a.societa.localeCompare(b.societa))

  const tonoStato = (s: string) => (s === 'incassato' ? 'verde' : s === 'parziale' ? 'giallo' : s === 'stornato' ? 'grigio' : 'rosso')
  const sel = 'input w-auto'
  // Canoni già scaduti e non incassati (del tutto o in parte), per la tavola dei totali
  const nonIncassati = attiviC.reduce((n, c) => n + mesiAnno.filter((mese) => {
    const fuori = (inizioContratto(c) && mese < inizioContratto(c)) || (fineContratto(c) && mese > fineContratto(c))
    if (fuori || !canoneScaduto(c, mese, oggi)) return false
    const m = cella(c, mese).movimento
    return !m || m.stato === 'da_incassare' || m.stato === 'parziale'
  }).length, 0)
  const esporta = () => {
    const tutti = movimenti.filter((m) => m.competenza.startsWith(String(anno)))
    const extra = (m: Movimento) => { const d = descrivi(contrattoDi(m.contratto_id)); return { 'Società': d.societa, 'Immobile': d.immobile, 'Conduttore': d.conduttore } }
    scaricaExcel(`Canoni_incassi_${anno}`, [
      { nome: `Movimenti ${anno}`, righe: righeDaCampi(tutti.sort((a, b) => a.competenza.localeCompare(b.competenza)), campi.filter((c) => c.nome !== 'contratto_id'), extra) },
      { nome: `Griglia canoni ${anno}`, righe: attiviC.map((c) => { const r: Record<string, unknown> = { 'Società': c.societa, 'Immobile': c.immobile, 'Conduttore': c.conduttore }; for (const mese of mesiAnno) { const m = cella(c, mese).movimento; r[MESI[Number(mese.slice(5)) - 1]] = m ? (m.incassato_cent ?? 0) / 100 : '' } const t = totaliDi([c.id]); r['Dovuto anno'] = t.dovuto / 100; r['Incassato anno'] = t.incassato / 100; return r }) },
    ])
  }
  const anni = [anno - 2, anno - 1, anno, anno + 1].filter((a, i, arr) => arr.indexOf(a) === i)
  const apertoDesc = aperto ? descrivi(contrattoDi(aperto.contratto_id ?? '')) : null

  return (
    <div>
      <IntestazionePagina kicker="Locazioni" titolo="Canoni e incassi" sottotitolo="Griglia mensile dei canoni e registro dei movimenti: incassi, rimborsi, depositi e fatture."
        azioni={<>
          <Bottone variante="secondario" onClick={esporta}><FileSpreadsheet size={16} /> Esporta Excel</Bottone>
          <SoloSeModifica><Bottone onClick={() => setAperto(nuovoGenerico())}><Plus size={16} /> Nuovo movimento (rimborso, deposito…)</Bottone></SoloSeModifica>
        </>} />

      <TavolaKpi celle={[
        { titolo: `Canoni dovuti ${anno} a oggi`, valore: formattaEuro(totDovuto), nota: `${attiviC.length} contratti in griglia` },
        { titolo: 'Incassato', valore: formattaEuro(totIncassato), nota: totDovuto > 0 ? `${Math.round((totIncassato / totDovuto) * 100)}% del dovuto` : '—' },
        { titolo: 'Insoluto', valore: formattaEuro(insoluti), nota: `${nonIncassati} ${nonIncassati === 1 ? 'canone non incassato' : 'canoni non incassati'}`, tono: insoluti > 0 ? 'rosso' : undefined },
      ]} />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Segmentato valore={scheda} onChange={setScheda} opzioni={[{ valore: 'griglia', etichetta: 'Griglia mensile canoni' }, { valore: 'elenco', etichetta: `Tutti i movimenti ${anno}` }]} />
        <select value={anno} onChange={(e) => setAnno(Number(e.target.value))} className={`${sel} !w-24`} aria-label="Anno">{anni.map((a) => <option key={a} value={a}>{a}</option>)}</select>
        <BarraRicerca valore={ricerca} onChange={setRicerca} segnaposto="Cerca società, immobile, conduttore…" />
        {scheda === 'elenco' && <select value={filtroStato} onChange={(e) => setFiltroStato(e.target.value)} className={sel}><option value="">Tutti gli stati</option>{STATI_MOVIMENTO.map((o) => <option key={o.valore} value={o.valore}>{o.etichetta}</option>)}</select>}
        {scheda === 'griglia' && nascosti > 0 && (
          <Bottone variante="ghost" onClick={() => setMostraNascosti(!mostraNascosti)}>
            {mostraNascosti ? <EyeOff size={16} /> : <Eye size={16} />} {mostraNascosti ? 'Nascondi' : 'Mostra'} {nascosti} contratti non gestiti da noi
          </Bottone>
        )}
      </div>

      <div>
        {errore && <div className="mb-4"><Avviso tipo="errore">{errore}</Avviso></div>}
        {caricamento && !errore ? <Caricamento /> : scheda === 'griglia' ? (
          <>
            <div className="mb-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
              {([['cella-ok', 'Incassato'], ['cella-parziale', 'Incassato in parte'], ['cella-scaduta', 'Scaduto non incassato'], ['cella-futura', 'Non ancora scaduto']] as const).map(([cls, t]) => (
                <span key={cls} className="flex items-center gap-1.5"><span className={`${cls} inline-block h-3.5 w-3.5 border`} />{t}</span>
              ))}
              <span className="text-neutro-700">I canoni scadono il 10 di ogni mese, salvo il giorno indicato nel contratto. Clicca una cella per registrare l'incasso.</span>
            </div>
            {[...gruppi.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([soc, cs]) => {
              const t = totaliDi(cs.map((c) => c.id))
              return (
                <Gruppo key={soc} titolo={soc} sottotitolo={`${cs.length} contratti`}
                  destra={<span className="num text-neutro-700">dovuto <strong className="text-testo">{formattaEuro(t.dovuto)}</strong> · incassato <strong className="text-ok-testo">{formattaEuro(t.incassato)}</strong>{t.dovuto - t.incassato > 0 && <> · insoluto <strong className="text-err-testo">{formattaEuro(t.dovuto - t.incassato)}</strong></>}</span>}>
                  <Riquadro>
                    <div className="overflow-x-auto">
                      <table className="tabella min-w-[1180px] !text-[13px]">
                        <thead><tr>
                          <th className="w-[230px]">Immobile / conduttore</th><th className="w-[170px]">Canone mensile</th>
                          {MESI.map((m) => <th key={m} className="!px-1 text-center">{m}</th>)}
                        </tr></thead>
                        <tbody>
                          {cs.sort((a, b) => a.immobile.localeCompare(b.immobile)).map((c) => (
                            <tr key={c.id}>
                              <td>
                                <div className="flex items-center gap-1 font-medium">{c.immobile}
                                  <SoloSeModifica><button title={c.gestione_incassi === 'no' ? 'Mostra di nuovo negli incassi' : 'Nascondi dagli incassi (non gestito da noi)'} onClick={() => impostaGestione(c, c.gestione_incassi === 'no' ? 'si' : 'no')} className="p-0.5 text-neutro-500 hover:bg-[rgba(29,31,32,0.04)] hover:text-testo">{c.gestione_incassi === 'no' ? <Eye size={14} /> : <EyeOff size={14} />}</button></SoloSeModifica>
                                </div>
                                <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-neutro-700">{c.conduttore} <Etichetta tono={statoIva(c).tono}>{statoIva(c).testo}</Etichetta>
                                  {c.gestione_incassi === 'no' && <Etichetta tono="grigio">non gestito da noi</Etichetta>}</div>
                              </td>
                              <td className="num">
                                {(() => {
                                  const sc = scaglioniAnno(c, annualita, anno)
                                  const k = sc[sc.length - 1] ?? canoneMensilePer(c, annualita, mesiAnno[0])
                                  const dettaglio = k.iva_percento ? `${formattaEuro(k.imponibile_cent)} + IVA ${k.iva_percento}%` : 'esente IVA'
                                  return (
                                    <div title={descriviCanone(k, formattaEuro)}>
                                      <div className="font-medium">{formattaEuro(k.totale_cent)}</div>
                                      <div className="text-xs text-neutro-700">{dettaglio}</div>
                                      {sc.length > 1 && <div className="text-xs text-neutro-700">dal {k.dal ? `${k.dal.slice(5)}/${k.dal.slice(0, 4)}` : '—'} · in precedenza {sc.slice(0, -1).map((x) => formattaEuro(x.totale_cent)).join(', ')}</div>}
                                    </div>
                                  )
                                })()}
                              </td>
            {mesiAnno.map((mese) => {
                              const { movimento: m } = cella(c, mese)
                              const fuori = (inizioContratto(c) && mese < inizioContratto(c)) || (fineContratto(c) && mese > fineContratto(c))
                              const futuro = mese > oggiMese
                              const scaduto = canoneScaduto(c, mese, oggi)
                              const atteso = canoneMensilePer(c, annualita, mese).totale_cent
                              let cls = 'cella-futura', testo: React.ReactNode = compatto(atteso)
                              if (m) {
                                cls = m.stato === 'incassato' ? 'cella-ok' : m.stato === 'parziale' ? 'cella-parziale' : m.stato === 'stornato' ? 'cella-stornata' : scaduto ? 'cella-scaduta' : 'cella-futura'
                                testo = m.stato === 'stornato' ? '—' : m.stato === 'da_incassare' ? compatto(m.dovuto_cent) : compatto(m.incassato_cent)
                              } else if (fuori) { cls = ''; testo = '' }
                              else if (futuro || !scaduto) { cls = 'cella-futura' }
                              else { cls = 'cella-scaduta' }
                              return (
                                <td key={mese} className="!px-0.5 !py-1.5">
                                  <button title={`Scadenza ${scadenzaCanone(c, mese).split('-').reverse().join('/')} · ${m ? `${etichettaDi(STATI_MOVIMENTO, m.stato)}: incassato ${formattaEuro(m.incassato_cent)} su ${formattaEuro(m.dovuto_cent)} · fattura ${m.numero_fattura || '—'}` : `atteso ${formattaEuro(atteso)} · clicca per registrare l'incasso`}`} disabled={!!fuori && !m}
                                    onClick={() => setAperto(m ?? nuovoCanone(c, mese))} className={`cella-mese ${cls}`}>{testo}</button>
                                </td>
                              )
                            })}
                          </tr>
                        ))}
                        </tbody>
                      </table>
                    </div>
                  </Riquadro>
                </Gruppo>
              )
            })}
            {attiviC.length === 0 && <Avviso tipo="info">Nessun contratto attivo.</Avviso>}
          </>
        ) : (
          <Tabella righe={elenco} onRiga={(m) => setAperto(movimenti.find((x) => x.id === m.id) ?? null)} vuoto="Nessun movimento per i filtri scelti." colonne={[
            { chiave: 'comp', etichetta: 'Competenza', render: (m) => <span className="whitespace-nowrap font-medium">{m.competenza.length === 7 ? `${MESI[Number(m.competenza.slice(5)) - 1]} ${m.competenza.slice(0, 4)}` : formattaData(m.competenza)}</span> },
            { chiave: 'tipo', etichetta: 'Tipo', render: (m) => m.tipoTesto },
            { chiave: 'imm', etichetta: 'Immobile', render: (m) => <div><div>{m.immobile}</div><div className="text-xs text-neutro-700">{m.societa}</div></div> },
            { chiave: 'con', etichetta: 'Conduttore', render: (m) => m.conduttore },
            { chiave: 'imp', etichetta: 'Imponibile', allinea: 'dx', render: (m) => formattaEuro(m.imponibile_cent) },
            { chiave: 'iva', etichetta: 'IVA', allinea: 'dx', render: (m) => <span className="text-neutro-700">{m.iva_percento ? `${formattaEuro(m.iva_cent)} (${m.iva_percento}%)` : '—'}</span> },
            { chiave: 'dov', etichetta: 'Dovuto', allinea: 'dx', render: (m) => <span className="font-medium">{formattaEuro(m.dovuto_cent)}</span> },
            { chiave: 'inc', etichetta: 'Incassato', allinea: 'dx', render: (m) => `${formattaEuro(m.incassato_cent)}${m.data_incasso ? ' · ' + formattaData(m.data_incasso) : ''}` },
            { chiave: 'fat', etichetta: 'Fattura', render: (m) => <span className="text-xs">{m.numero_fattura ? `${m.numero_fattura} del ${formattaData(m.data_fattura)}` : '—'}</span> },
            { chiave: 'st', etichetta: 'Stato', render: (m) => <Etichetta tono={tonoStato(m.stato)}>{etichettaDi(STATI_MOVIMENTO, m.stato)}</Etichetta> },
          ]} />
        )}
      </div>

      <Finestra kicker={apertoDesc && apertoDesc.societa !== '—' ? apertoDesc.societa : undefined} titolo={aperto?.id ? `${etichettaDi(TIPI_MOVIMENTO, aperto.tipo)} — ${apertoDesc?.immobile} / ${apertoDesc?.conduttore}` : 'Nuovo movimento'} aperta={aperto !== null} onChiudi={() => setAperto(null)} larga>
        {aperto && (
          <>
            <Modulo<Movimento> campi={campi} iniziale={aperto} onSalva={salva} onAnnulla={() => setAperto(null)} onElimina={aperto.id ? elimina : undefined} derivati={derivati} />
            <div className="mt-6">
              {aperto.id ? <Allegati collezione="movimenti" recordId={aperto.id} descrizione={`movimento ${aperto.competenza}`} categorie={[{ valore: 'fattura', etichetta: 'Fattura' }, { valore: 'ricevuta', etichetta: 'Ricevuta / contabile bonifico' }, { valore: 'altro', etichetta: 'Altro' }]} />
                : <Avviso tipo="info">Salva il movimento per allegare fattura o contabile del bonifico.</Avviso>}
            </div>
          </>
        )}
      </Finestra>
    </div>
  )
}
