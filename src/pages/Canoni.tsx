/**
 * Canoni e incassi.
 * Scheda "Griglia mensile": per ogni contratto attivo, i 12 mesi dell'anno scelto; ogni cella è il canone
 * del mese (da incassare / parziale / incassato). Cliccando si registra l'incasso, la fattura e le note.
 * Scheda "Tutti i movimenti": elenco completo (canoni, rimborsi spese condominiali, rimborsi imposta di
 * registro, depositi, altro) con filtri e totali.
 */
import { useState } from 'react'
import { ChevronDown, ChevronRight, Plus } from 'lucide-react'
import Allegati from '../components/Allegati'
import Modulo, { type CampoDef } from '../components/Modulo'
import { Avviso, BarraRicerca, Bottone, Caricamento, Etichetta, Finestra, Tabella, filtraTesto } from '../components/ui'
import { useSessioneAttiva } from '../lib/sessione'
import { aggiorna, attivi, campiModifica, campiNuovo } from '../lib/store'
import { MODALITA_INCASSO, STATI_MOVIMENTO, TIPI_MOVIMENTO, etichettaDi, statoIva, type Conduttore, type Contratto, type Immobile, type Movimento, type Societa } from '../lib/tipi'
import { useCollezioni } from '../lib/useCollezioni'
import { formattaData, formattaEuro } from '../lib/utils/formato'

const MESI = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic']
const r0 = (n: number) => Math.round(n)

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
  const { dati, caricamento, errore } = useCollezioni(['movimenti', 'contratti', 'immobili', 'conduttori', 'societa', 'allegati'])
  const [scheda, setScheda] = useState<'griglia' | 'elenco'>('griglia')
  const [anno, setAnno] = useState(new Date().getFullYear())
  const [ricerca, setRicerca] = useState('')
  const [filtroStato, setFiltroStato] = useState('')
  const [aperto, setAperto] = useState<Partial<Movimento> | null>(null)
  const [chiusi, setChiusi] = useState<Set<string>>(new Set())

  const movimenti = attivi(dati<Movimento>('movimenti'))
  const contratti = attivi(dati<Contratto>('contratti'))
  const immobili = attivi(dati<Immobile>('immobili'))
  const conduttori = attivi(dati<Conduttore>('conduttori'))
  const societa = attivi(dati<Societa>('societa'))

  const descrivi = (c: Contratto | undefined) => {
    const imm = immobili.find((i) => i.id === c?.immobile_id)
    return { societa: societa.find((s) => s.id === imm?.societa_id)?.ragione_sociale ?? '—', immobile: imm?.indirizzo ?? '—', conduttore: conduttori.find((x) => x.id === c?.conduttore_id)?.denominazione ?? '—' }
  }
  const contrattoDi = (id: string) => contratti.find((c) => c.id === id)

  /** Nuovo movimento "canone" per un contratto e un mese, precompilato dal contratto (canone mensile + IVA). */
  function nuovoCanone(c: Contratto, mese: string): Partial<Movimento> {
    const iva = statoIva(c).soggetto ? (c.iva_percento ?? 22) : 0
    const base: Partial<Movimento> = {
      contratto_id: c.id, tipo: 'canone', competenza: mese, descrizione: `Canone ${MESI[Number(mese.slice(5, 7)) - 1]} ${mese.slice(0, 4)}`,
      imponibile_cent: c.canone_mensile_cent, iva_percento: iva, incassato_cent: null, data_incasso: '', modalita: 'bonifico',
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
    { nome: 'imponibile_cent', etichetta: 'Imponibile', tipo: 'euro', sezione: 'Importi', obbligatorio: true },
    { nome: 'iva_percento', etichetta: 'IVA (%)', tipo: 'numero', aiuto: 'Presa dal flag IVA del contratto; 0 se non soggetto' },
    { nome: 'iva_cent', etichetta: 'IVA', tipo: 'euro', soloLettura: true },
    { nome: 'dovuto_cent', etichetta: 'Totale dovuto', tipo: 'euro', soloLettura: true },
    { nome: 'incassato_cent', etichetta: 'Importo incassato', tipo: 'euro', sezione: 'Incasso', aiuto: 'Inserendo solo la data, viene incassato l’intero dovuto' },
    { nome: 'data_incasso', etichetta: 'Data incasso', tipo: 'data' },
    { nome: 'modalita', etichetta: 'Modalità', tipo: 'select', opzioni: MODALITA_INCASSO },
    { nome: 'stato', etichetta: 'Stato', tipo: 'select', opzioni: STATI_MOVIMENTO, obbligatorio: true },
    { nome: 'numero_fattura', etichetta: 'Numero fattura', tipo: 'testo', sezione: 'Fattura' },
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

  // ---- Griglia mensile ----
  const attiviC = filtraTesto(contratti.filter((c) => c.stato !== 'cessato').map((c) => ({ ...c, ...descrivi(c) })), ricerca)
  const gruppi = new Map<string, typeof attiviC>()
  for (const c of attiviC) gruppi.set(c.societa, [...(gruppi.get(c.societa) ?? []), c])
  const mesiAnno = MESI.map((_, i) => `${anno}-${String(i + 1).padStart(2, '0')}`)
  const oggiMese = new Date().toISOString().slice(0, 7)
  const cella = (c: Contratto, mese: string): Cella => ({ contratto: c, mese, movimento: movimenti.find((m) => m.contratto_id === c.id && m.tipo === 'canone' && m.competenza === mese) ?? null })
  const inizioContratto = (c: Contratto) => c.data_decorrenza ? c.data_decorrenza.slice(0, 7) : ''
  const fineContratto = (c: Contratto) => c.data_cessazione ? c.data_cessazione.slice(0, 7) : ''

  const canoniAnno = movimenti.filter((m) => m.tipo === 'canone' && m.competenza.startsWith(String(anno)))
  const totDovuto = canoniAnno.reduce((s, m) => s + (m.dovuto_cent ?? 0), 0)
  const totIncassato = canoniAnno.reduce((s, m) => s + (m.incassato_cent ?? 0), 0)
  const insoluti = canoniAnno.filter((m) => m.stato === 'da_incassare' || m.stato === 'parziale').reduce((s, m) => s + ((m.dovuto_cent ?? 0) - (m.incassato_cent ?? 0)), 0)

  // ---- Elenco movimenti ----
  const elenco = filtraTesto(movimenti.map((m) => ({ ...m, ...descrivi(contrattoDi(m.contratto_id)), tipoTesto: etichettaDi(TIPI_MOVIMENTO, m.tipo) })), ricerca)
    .filter((m) => m.competenza.startsWith(String(anno)))
    .filter((m) => !filtroStato || m.stato === filtroStato)
    .sort((a, b) => b.competenza.localeCompare(a.competenza) || a.societa.localeCompare(b.societa))

  const tonoStato = (s: string) => (s === 'incassato' ? 'verde' : s === 'parziale' ? 'giallo' : s === 'stornato' ? 'grigio' : 'rosso')
  const sel = 'rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm'
  const anni = [anno - 2, anno - 1, anno, anno + 1].filter((a, i, arr) => arr.indexOf(a) === i)
  const apertoDesc = aperto ? descrivi(contrattoDi(aperto.contratto_id ?? '')) : null

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Canoni e incassi</h1>
        <Bottone onClick={() => setAperto(nuovoGenerico())}><span className="flex items-center gap-1"><Plus size={16} /> Nuovo movimento (rimborso, deposito…)</span></Bottone>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg border border-gray-300 bg-white p-0.5 text-sm">
          {([['griglia', 'Griglia mensile canoni'], ['elenco', `Tutti i movimenti ${anno}`]] as const).map(([k, t]) => (
            <button key={k} onClick={() => setScheda(k)} className={`rounded-md px-3 py-1.5 ${scheda === k ? 'text-white' : 'text-gray-600'}`} style={scheda === k ? { background: 'var(--colore-primario)' } : undefined}>{t}</button>
          ))}
        </div>
        <select value={anno} onChange={(e) => setAnno(Number(e.target.value))} className={sel}>{anni.map((a) => <option key={a} value={a}>{a}</option>)}</select>
        <BarraRicerca valore={ricerca} onChange={setRicerca} segnaposto="Cerca società, immobile, conduttore…" />
        {scheda === 'elenco' && <select value={filtroStato} onChange={(e) => setFiltroStato(e.target.value)} className={sel}><option value="">Tutti gli stati</option>{STATI_MOVIMENTO.map((o) => <option key={o.valore} value={o.valore}>{o.etichetta}</option>)}</select>}
        <span className="ml-auto text-sm text-gray-500">Canoni {anno}: dovuto {formattaEuro(totDovuto)} · incassato <strong>{formattaEuro(totIncassato)}</strong> · insoluto <strong className={insoluti > 0 ? 'text-red-600' : ''}>{formattaEuro(insoluti)}</strong></span>
      </div>

      <div className="mt-4">
        {errore && <Avviso tipo="errore">{errore}</Avviso>}
        {caricamento && !errore ? <Caricamento /> : scheda === 'griglia' ? (
          <>
            <p className="mb-3 text-xs text-gray-500">Clicca una cella per registrare l'incasso del mese. Grigio chiaro = mese futuro o prima della decorrenza · bianco = da registrare · rosso = scaduto non incassato · giallo = parziale · verde = incassato.</p>
            {[...gruppi.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([soc, cs]) => (
              <div key={soc} className="mb-4">
                <button onClick={() => setChiusi((s) => { const n = new Set(s); if (n.has(soc)) n.delete(soc); else n.add(soc); return n })} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-white">
                  {chiusi.has(soc) ? <ChevronRight size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
                  <span className="text-base font-semibold">{soc}</span><span className="text-sm text-gray-500">{cs.length} contratti</span>
                </button>
                {!chiusi.has(soc) && (
                  <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
                    <table className="w-full text-xs">
                      <thead><tr className="border-b bg-gray-50 text-left uppercase tracking-wide text-gray-500">
                        <th className="px-3 py-2 font-semibold">Immobile / conduttore</th><th className="px-2 py-2 text-right font-semibold">Mensile</th>
                        {MESI.map((m) => <th key={m} className="px-1 py-2 text-center font-semibold">{m}</th>)}
                      </tr></thead>
                      <tbody>
                        {cs.sort((a, b) => a.immobile.localeCompare(b.immobile)).map((c) => (
                          <tr key={c.id} className="border-b last:border-0">
                            <td className="px-3 py-2"><div className="font-medium">{c.immobile}</div><div className="text-gray-500">{c.conduttore} <Etichetta tono={statoIva(c).tono}>{statoIva(c).testo}</Etichetta></div></td>
                            <td className="px-2 py-2 text-right tabular-nums">{formattaEuro(c.canone_mensile_cent)}</td>
                            {mesiAnno.map((mese) => {
                              const { movimento: m } = cella(c, mese)
                              const fuori = (inizioContratto(c) && mese < inizioContratto(c)) || (fineContratto(c) && mese > fineContratto(c))
                              const futuro = mese > oggiMese
                              let cls = 'bg-white hover:bg-gray-100', testo: React.ReactNode = '·'
                              if (m) {
                                cls = m.stato === 'incassato' ? 'bg-green-100 hover:bg-green-200' : m.stato === 'parziale' ? 'bg-amber-100 hover:bg-amber-200' : m.stato === 'stornato' ? 'bg-gray-200' : 'bg-red-100 hover:bg-red-200'
                                testo = m.stato === 'incassato' ? '✓' : m.stato === 'parziale' ? formattaEuro(m.incassato_cent).replace(' €', '') : m.stato === 'stornato' ? '—' : '!'
                              } else if (fuori) { cls = 'bg-gray-50 text-gray-300'; testo = '' }
                              else if (futuro) { cls = 'bg-gray-50 text-gray-300 hover:bg-gray-100' }
                              else { cls = 'bg-red-50 hover:bg-red-100 text-red-400'; testo = '!' }
                              return (
                                <td key={mese} className="p-0.5">
                                  <button title={m ? `${etichettaDi(STATI_MOVIMENTO, m.stato)} · fattura ${m.numero_fattura || '—'}` : `Registra canone ${mese}`} disabled={!!fuori && !m}
                                    onClick={() => setAperto(m ?? nuovoCanone(c, mese))} className={`h-9 w-full rounded ${cls} disabled:cursor-default`}>{testo}</button>
                                </td>
                              )
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
            {attiviC.length === 0 && <Avviso tipo="info">Nessun contratto attivo.</Avviso>}
          </>
        ) : (
          <Tabella righe={elenco} onRiga={(m) => setAperto(movimenti.find((x) => x.id === m.id) ?? null)} vuoto="Nessun movimento per i filtri scelti." colonne={[
            { chiave: 'comp', etichetta: 'Competenza', render: (m) => m.competenza.length === 7 ? `${MESI[Number(m.competenza.slice(5)) - 1]} ${m.competenza.slice(0, 4)}` : formattaData(m.competenza) },
            { chiave: 'tipo', etichetta: 'Tipo', render: (m) => m.tipoTesto },
            { chiave: 'soc', etichetta: 'Società', render: (m) => m.societa },
            { chiave: 'imm', etichetta: 'Immobile', render: (m) => <span className="font-medium">{m.immobile}</span> },
            { chiave: 'con', etichetta: 'Conduttore', render: (m) => m.conduttore },
            { chiave: 'imp', etichetta: 'Imponibile', allinea: 'dx', render: (m) => formattaEuro(m.imponibile_cent) },
            { chiave: 'iva', etichetta: 'IVA', allinea: 'dx', render: (m) => m.iva_percento ? `${formattaEuro(m.iva_cent)} (${m.iva_percento}%)` : '—' },
            { chiave: 'dov', etichetta: 'Dovuto', allinea: 'dx', render: (m) => <span className="font-medium">{formattaEuro(m.dovuto_cent)}</span> },
            { chiave: 'inc', etichetta: 'Incassato', allinea: 'dx', render: (m) => `${formattaEuro(m.incassato_cent)}${m.data_incasso ? ' · ' + formattaData(m.data_incasso) : ''}` },
            { chiave: 'fat', etichetta: 'Fattura', render: (m) => m.numero_fattura ? `${m.numero_fattura} del ${formattaData(m.data_fattura)}` : '—' },
            { chiave: 'st', etichetta: 'Stato', render: (m) => <Etichetta tono={tonoStato(m.stato)}>{etichettaDi(STATI_MOVIMENTO, m.stato)}</Etichetta> },
          ]} />
        )}
      </div>

      <Finestra titolo={aperto?.id ? `${etichettaDi(TIPI_MOVIMENTO, aperto.tipo)} — ${apertoDesc?.immobile} / ${apertoDesc?.conduttore}` : 'Nuovo movimento'} aperta={aperto !== null} onChiudi={() => setAperto(null)} larga>
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
