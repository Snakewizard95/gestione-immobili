/**
 * Oneri condominiali: per ogni immobile in condominio, le voci (rate, conguagli, lavori straordinari)
 * comunicate dall'amministratore volta per volta, con scadenza, pagamento, quota riaddebitabile al
 * conduttore e allegati (bollettini, verbali assembleari, riparti).
 */
import { useState } from 'react'
import { ChevronDown, ChevronRight, FileSpreadsheet, Plus } from 'lucide-react'
import { righeDaCampi, scaricaExcel } from '../lib/esporta'
import Allegati from '../components/Allegati'
import Modulo, { type CampoDef } from '../components/Modulo'
import { Avviso, BarraRicerca, Bottone, Caricamento, Etichetta, Finestra, Tabella, filtraTesto } from '../components/ui'
import { useSessioneAttiva } from '../lib/sessione'
import { aggiorna, attivi, campiModifica, campiNuovo } from '../lib/store'
import { A_CARICO, PERIODICITA_PIANO, SI_NO, STATI_PIANO, TIPI_VOCE_CONDOMINIO, etichettaDi, type Condominio, type Conduttore, type Contratto, type Immobile, type PianoRientro, type Societa, type VoceCondominiale } from '../lib/tipi'
import { useCollezioni } from '../lib/useCollezioni'
import { aggiungiMesi, formattaData, formattaEuro } from '../lib/utils/formato'

const CATEGORIE = [
  { valore: 'bollettino', etichetta: 'Bollettino / avviso di pagamento' }, { valore: 'bilancio_condominiale', etichetta: 'Verbale assemblea / bilancio / riparto' },
  { valore: 'ricevuta', etichetta: 'Ricevuta pagamento' }, { valore: 'altro', etichetta: 'Altro' },
]

function derivati(v: Partial<VoceCondominiale>, campo: string): Partial<VoceCondominiale> {
  const out: Partial<VoceCondominiale> = {}
  if (campo === 'a_carico' || (campo === 'importo_cent' && v.a_carico !== 'misto')) {
    if (v.a_carico === 'conduttore') out.quota_conduttore_cent = v.importo_cent ?? null
    if (v.a_carico === 'proprieta') out.quota_conduttore_cent = 0
  }
  if (campo === 'data_pagamento' && v.data_pagamento) out.pagata = 'si'
  if (campo === 'data_riaddebito' && v.data_riaddebito) out.riaddebitata = 'si'
  return out
}

export default function PaginaCondominio() {
  const { token, nome } = useSessioneAttiva()
  const { dati, caricamento, errore } = useCollezioni(['voci_condominiali', 'piani_rientro', 'immobili', 'condomini', 'societa', 'contratti', 'conduttori', 'allegati'])
  const [scheda, setScheda] = useState<'voci' | 'riepilogo' | 'piani'>('voci')
  const [pianoAperto, setPianoAperto] = useState<Partial<PianoRientro> | null>(null)
  const [immobilePiano, setImmobilePiano] = useState('')
  const [ricerca, setRicerca] = useState('')
  const [esercizio, setEsercizio] = useState('')
  const [filtro, setFiltro] = useState<'tutte' | 'da_pagare' | 'da_riaddebitare'>('tutte')
  const [aperta, setAperta] = useState<Partial<VoceCondominiale> | null>(null)
  const [chiusi, setChiusi] = useState<Set<string>>(new Set())

  const voci = attivi(dati<VoceCondominiale>('voci_condominiali'))
  const piani = attivi(dati<PianoRientro>('piani_rientro'))
  const immobili = attivi(dati<Immobile>('immobili'))
  const condomini = attivi(dati<Condominio>('condomini'))
  const societa = attivi(dati<Societa>('societa'))
  const contratti = attivi(dati<Contratto>('contratti'))
  const conduttori = attivi(dati<Conduttore>('conduttori'))

  const societaDi = (imm?: Immobile) => societa.find((s) => s.id === imm?.societa_id)?.ragione_sociale ?? '—'
  const condominioDi = (id: string) => condomini.find((c) => c.id === id)
  const conduttoreDi = (immId: string) => { const c = contratti.find((x) => x.immobile_id === immId && x.stato !== 'cessato'); return conduttori.find((k) => k.id === c?.conduttore_id)?.denominazione ?? null }

  function nuova(imm?: Immobile): Partial<VoceCondominiale> {
    return { immobile_id: imm?.id ?? '', condominio_id: imm?.condominio_id ?? '', esercizio: String(new Date().getFullYear()), tipo: 'rata_ordinaria', descrizione: '', data_comunicazione: '', scadenza: '', importo_cent: null, a_carico: 'proprieta', quota_conduttore_cent: 0, pagata: 'no', data_pagamento: '', riaddebitata: 'no', data_riaddebito: '', piano_id: '', in_piano_id: '', note: '' }
  }

  const campi: CampoDef<VoceCondominiale>[] = [
    { nome: 'immobile_id', etichetta: 'Immobile', tipo: 'select', obbligatorio: true, intera: true, opzioni: immobili.map((i) => ({ valore: i.id, etichetta: `${i.indirizzo} — ${societaDi(i)}` })) },
    { nome: 'condominio_id', etichetta: 'Condominio / amministratore', tipo: 'select', opzioni: condomini.map((c) => ({ valore: c.id, etichetta: `${c.denominazione}${c.amministratore_nome ? ' · ' + c.amministratore_nome : ''}` })), aiuto: 'Se manca, crealo in Anagrafiche → Condomini' },
    { nome: 'esercizio', etichetta: 'Esercizio', tipo: 'testo', obbligatorio: true, aiuto: 'Es. 2026 oppure 2025/2026' },
    { nome: 'tipo', etichetta: 'Tipo di voce', tipo: 'select', opzioni: TIPI_VOCE_CONDOMINIO, obbligatorio: true },
    { nome: 'descrizione', etichetta: 'Descrizione', tipo: 'testo', intera: true, aiuto: 'Es. "2ª rata preventivo ordinario 2026", "Conguaglio consuntivo 2025", "Rifacimento facciata rata 3/10"' },
    { nome: 'data_comunicazione', etichetta: 'Data comunicazione amministratore', tipo: 'data', sezione: 'Importo e scadenza' },
    { nome: 'scadenza', etichetta: 'Scadenza pagamento', tipo: 'data' },
    { nome: 'importo_cent', etichetta: 'Importo', tipo: 'euro', obbligatorio: true },
    { nome: 'a_carico', etichetta: 'A carico di', tipo: 'select', opzioni: A_CARICO, aiuto: 'Di norma: ordinaria → conduttore, straordinaria → proprietà' },
    { nome: 'quota_conduttore_cent', etichetta: 'Quota riaddebitabile al conduttore', tipo: 'euro' },
    { nome: 'pagata', etichetta: 'Pagata all’amministratore', tipo: 'select', opzioni: SI_NO, sezione: 'Pagamento' },
    { nome: 'data_pagamento', etichetta: 'Data pagamento', tipo: 'data' },
    { nome: 'riaddebitata', etichetta: 'Quota conduttore incassata', tipo: 'select', opzioni: SI_NO, sezione: 'Riaddebito al conduttore' },
    { nome: 'data_riaddebito', etichetta: 'Data incasso dal conduttore', tipo: 'data', aiuto: 'Registrare anche il movimento in Canoni e incassi (rimborso spese condominiali)' },
    { nome: 'note', etichetta: 'Note', tipo: 'textarea' },
  ]

  async function salva(v: Partial<VoceCondominiale>) {
    const esistente = !!v.id
    const imm = immobili.find((i) => i.id === v.immobile_id)
    await aggiorna<VoceCondominiale>(token, 'voci_condominiali', (r) => esistente
      ? r.map((x) => (x.id === v.id ? { ...x, ...v, ...campiModifica(nome) } as VoceCondominiale : x))
      : [...r, { ...nuova(), ...v, ...campiNuovo(nome) } as VoceCondominiale],
    `${nome}: ${esistente ? 'modifica' : 'nuova'} voce condominiale "${v.descrizione || etichettaDi(TIPI_VOCE_CONDOMINIO, v.tipo)}" — ${imm?.indirizzo ?? ''}`)
    setAperta(null)
  }
  async function elimina() {
    if (!aperta?.id) return
    await aggiorna<VoceCondominiale>(token, 'voci_condominiali', (r) => r.map((x) => (x.id === aperta.id ? { ...x, eliminato_il: new Date().toISOString(), ...campiModifica(nome) } : x)), `${nome}: elimina voce condominiale "${aperta.descrizione}"`)
    setAperta(null)
  }

  const esercizi = [...new Set(voci.map((v) => v.esercizio))].sort().reverse()
  const filtrate = filtraTesto(voci.map((v) => { const imm = immobili.find((i) => i.id === v.immobile_id); return { ...v, immobile: imm?.indirizzo ?? '—', societa: societaDi(imm), condominio: condominioDi(v.condominio_id)?.denominazione ?? '' } }), ricerca)
    .filter((v) => !esercizio || v.esercizio === esercizio)
    .filter((v) => filtro === 'tutte' || (filtro === 'da_pagare' ? v.pagata !== 'si' : (v.quota_conduttore_cent ?? 0) > 0 && v.riaddebitata !== 'si'))

  // Raggruppo per società → immobile; mostro anche gli immobili in condominio senza voci
  const perSocieta = new Map<string, Map<string, { imm: Immobile; voci: typeof filtrate }>>()
  const immobiliMostrati = immobili.filter((i) => i.condominio_id || voci.some((v) => v.immobile_id === i.id))
  for (const imm of filtraTesto(immobiliMostrati.map((i) => ({ ...i, societa: societaDi(i) })), ricerca)) {
    const soc = societaDi(imm)
    if (!perSocieta.has(soc)) perSocieta.set(soc, new Map())
    perSocieta.get(soc)!.set(imm.id, { imm, voci: filtrate.filter((v) => v.immobile_id === imm.id).sort((a, b) => (b.scadenza || '').localeCompare(a.scadenza || '')) })
  }
  const totDaPagare = filtrate.filter((v) => v.pagata !== 'si').reduce((s, v) => s + (v.importo_cent ?? 0), 0)
  const totDaRiaddebitare = filtrate.filter((v) => (v.quota_conduttore_cent ?? 0) > 0 && v.riaddebitata !== 'si').reduce((s, v) => s + (v.quota_conduttore_cent ?? 0), 0)
  const sel = 'rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm'
  const oggi = new Date().toISOString().slice(0, 10)

  // ---- Riepilogo per immobile ----
  interface Riepilogo { id: string; imm: Immobile; societa: string; condominio: Condominio | undefined; n: number; totale: number; pagato: number; daPagare: number; scaduto: number; inPiano: number; daRiaddebitare: number; piuVecchia: string; livello: 'ok' | 'attenzione' | 'critico' }
  const riepiloghi: Riepilogo[] = immobiliMostrati.map((imm) => {
    const vs = voci.filter((v) => v.immobile_id === imm.id)
    const nonPagate = vs.filter((v) => v.pagata !== 'si')
    const scadute = nonPagate.filter((v) => !v.in_piano_id && v.scadenza && v.scadenza < oggi)
    const somma = (xs: VoceCondominiale[], f: (v: VoceCondominiale) => number | null) => xs.reduce((s, v) => s + (f(v) ?? 0), 0)
    const scaduto = somma(scadute, (v) => v.importo_cent)
    const inPiano = somma(nonPagate.filter((v) => v.in_piano_id), (v) => v.importo_cent)
    const daPagare = somma(nonPagate.filter((v) => !v.in_piano_id), (v) => v.importo_cent)
    return {
      id: imm.id, imm, societa: societaDi(imm), condominio: condominioDi(imm.condominio_id), n: vs.length,
      totale: somma(vs, (v) => v.importo_cent), pagato: somma(vs.filter((v) => v.pagata === 'si'), (v) => v.importo_cent), daPagare, scaduto, inPiano,
      daRiaddebitare: somma(vs.filter((v) => (v.quota_conduttore_cent ?? 0) > 0 && v.riaddebitata !== 'si'), (v) => v.quota_conduttore_cent),
      piuVecchia: scadute.map((v) => v.scadenza).sort()[0] ?? '',
      livello: (scadute.length >= 2 || (scaduto > 0 && daPagare > 0 && scaduto >= daPagare / 2) ? 'critico' : scaduto > 0 || daPagare > 0 ? 'attenzione' : 'ok') as Riepilogo['livello'],
    }
  }).sort((a, b) => (b.scaduto - a.scaduto) || (b.daPagare - a.daPagare) || a.societa.localeCompare(b.societa))
  const totRiep = riepiloghi.reduce((t, r) => ({ daPagare: t.daPagare + r.daPagare, scaduto: t.scaduto + r.scaduto, inPiano: t.inPiano + r.inPiano, daRiaddebitare: t.daRiaddebitare + r.daRiaddebitare }), { daPagare: 0, scaduto: 0, inPiano: 0, daRiaddebitare: 0 })

  // ---- Piani di rientro ----
  const vociInsolute = (immId: string, pianoId?: string) => voci.filter((v) => v.immobile_id === immId && v.pagata !== 'si' && v.tipo !== 'rata_piano' && (!v.in_piano_id || v.in_piano_id === pianoId))
  const rateDelPiano = (pianoId: string) => voci.filter((v) => v.piano_id === pianoId).sort((a, b) => a.scadenza.localeCompare(b.scadenza))

  function nuovoPiano(immId: string): Partial<PianoRientro> {
    const imm = immobili.find((i) => i.id === immId)
    return { immobile_id: immId, condominio_id: imm?.condominio_id ?? '', data_accordo: oggi, descrizione: '', voci_ids: [], importo_totale_cent: null, numero_rate: 6, importo_rata_cent: null, prima_scadenza: aggiungiMesi(oggi, 1), periodicita: 'mensile', stato: 'attivo', note: '' }
  }
  function derivatiPiano(v: Partial<PianoRientro>, campo: string): Partial<PianoRientro> {
    const out: Partial<PianoRientro> = {}
    if (campo === 'voci_ids') out.importo_totale_cent = (v.voci_ids ?? []).reduce((s, id) => s + (voci.find((x) => x.id === id)?.importo_cent ?? 0), 0)
    const tot = out.importo_totale_cent ?? v.importo_totale_cent
    if (['voci_ids', 'importo_totale_cent', 'numero_rate'].includes(campo) && tot != null && v.numero_rate) out.importo_rata_cent = Math.round(tot / v.numero_rate)
    return out
  }
  const campiPiano = (immId: string, pianoId?: string): CampoDef<PianoRientro>[] => [
    { nome: 'data_accordo', etichetta: 'Data accordo con l’amministratore', tipo: 'data', obbligatorio: true },
    { nome: 'stato', etichetta: 'Stato', tipo: 'select', opzioni: STATI_PIANO, obbligatorio: true },
    { nome: 'descrizione', etichetta: 'Descrizione', tipo: 'testo', intera: true, aiuto: 'Es. "Piano di rientro rate 2024-2025 concordato con lo studio Rossi"' },
    { nome: 'voci_ids', etichetta: 'Bollettini insoluti inclusi nel piano', tipo: 'multiselect', obbligatorio: true,
      opzioni: vociInsolute(immId, pianoId).sort((a, b) => a.scadenza.localeCompare(b.scadenza)).map((v) => ({ valore: v.id, etichetta: `${formattaData(v.scadenza)} · ${v.descrizione || etichettaDi(TIPI_VOCE_CONDOMINIO, v.tipo)} · ${formattaEuro(v.importo_cent)}${v.esercizio ? ' (es. ' + v.esercizio + ')' : ''}` })),
      aiuto: 'Compaiono i bollettini non pagati inseriti nella scheda "Bollettini e rate". Il totale si calcola da soli.' },
    { nome: 'importo_totale_cent', etichetta: 'Importo totale del piano', tipo: 'euro', sezione: 'Rate concordate', aiuto: 'Somma dei bollettini scelti; modificabile se l’accordo prevede interessi o sconti' },
    { nome: 'numero_rate', etichetta: 'Numero di rate', tipo: 'numero', obbligatorio: true },
    { nome: 'importo_rata_cent', etichetta: 'Importo di ogni rata', tipo: 'euro', aiuto: 'Totale / numero rate; l’eventuale resto va sull’ultima rata' },
    { nome: 'prima_scadenza', etichetta: 'Scadenza prima rata', tipo: 'data', obbligatorio: true },
    { nome: 'periodicita', etichetta: 'Periodicità', tipo: 'select', opzioni: PERIODICITA_PIANO },
    { nome: 'note', etichetta: 'Note', tipo: 'textarea' },
  ]
  async function salvaPiano(v: Partial<PianoRientro>) {
    const esistente = !!v.id
    const imm = immobili.find((i) => i.id === v.immobile_id)
    const nuovi = esistente ? null : campiNuovo(nome)
    const pianoId = (v.id as string) ?? nuovi!.id
    await aggiorna<PianoRientro>(token, 'piani_rientro', (r) => esistente
      ? r.map((x) => (x.id === v.id ? { ...x, ...v, ...campiModifica(nome) } as PianoRientro : x))
      : [...r, { ...nuovoPiano(v.immobile_id ?? ''), ...v, ...nuovi } as PianoRientro],
    `${nome}: ${esistente ? 'modifica' : 'nuovo'} piano di rientro ${imm?.indirizzo ?? ''} del ${formattaData(v.data_accordo)}`)
    // Segna i bollettini inclusi; alla prima creazione genera anche le rate del piano
    const passo = v.periodicita === 'trimestrale' ? 3 : v.periodicita === 'bimestrale' ? 2 : 1
    const n = v.numero_rate ?? 0, tot = v.importo_totale_cent ?? 0, rata = v.importo_rata_cent ?? Math.round(tot / Math.max(n, 1))
    const concluso = v.stato === 'concluso'
    await aggiorna<VoceCondominiale>(token, 'voci_condominiali', (r) => {
      let out = r.map((x) => {
        const inclusa = (v.voci_ids ?? []).includes(x.id)
        if (inclusa && x.in_piano_id !== pianoId) return { ...x, in_piano_id: pianoId, ...campiModifica(nome) }
        if (!inclusa && x.in_piano_id === pianoId) return { ...x, in_piano_id: '', ...campiModifica(nome) }
        if (inclusa && concluso && x.pagata !== 'si') return { ...x, pagata: 'si', data_pagamento: x.data_pagamento || oggi, note: (x.note ? x.note + ' · ' : '') + 'Saldato tramite piano di rientro', ...campiModifica(nome) }
        return x
      })
      if (!esistente && n > 0) {
        const rate: VoceCondominiale[] = Array.from({ length: n }, (_, i) => ({
          ...campiNuovo(nome), immobile_id: v.immobile_id ?? '', condominio_id: v.condominio_id ?? imm?.condominio_id ?? '', esercizio: (v.prima_scadenza ?? oggi).slice(0, 4),
          tipo: 'rata_piano', descrizione: `Rata ${i + 1}/${n} piano di rientro del ${formattaData(v.data_accordo)}`, data_comunicazione: v.data_accordo ?? '',
          scadenza: aggiungiMesi(v.prima_scadenza ?? oggi, i * passo), importo_cent: i === n - 1 ? tot - rata * (n - 1) : rata,
          a_carico: 'proprieta', quota_conduttore_cent: 0, pagata: 'no', data_pagamento: '', riaddebitata: 'no', data_riaddebito: '', piano_id: pianoId, in_piano_id: '', note: '',
        }))
        out = [...out, ...rate]
      }
      return out
    }, `${nome}: ${esistente ? 'aggiorna' : 'genera'} rate del piano di rientro ${imm?.indirizzo ?? ''}`)
    setPianoAperto(null); setImmobilePiano('')
  }
  async function eliminaPiano() {
    if (!pianoAperto?.id) return
    const id = pianoAperto.id
    await aggiorna<PianoRientro>(token, 'piani_rientro', (r) => r.map((x) => (x.id === id ? { ...x, eliminato_il: new Date().toISOString(), ...campiModifica(nome) } : x)), `${nome}: elimina piano di rientro`)
    await aggiorna<VoceCondominiale>(token, 'voci_condominiali', (r) => r.map((x) => x.in_piano_id === id ? { ...x, in_piano_id: '' } : x.piano_id === id && x.pagata !== 'si' ? { ...x, eliminato_il: new Date().toISOString(), ...campiModifica(nome) } : x), `${nome}: rimuove le rate non pagate del piano eliminato`)
    setPianoAperto(null)
  }
  const livelloTono = (l: 'ok' | 'attenzione' | 'critico') => (l === 'critico' ? 'rosso' : l === 'attenzione' ? 'giallo' : 'verde')
  const livelloTesto = (l: 'ok' | 'attenzione' | 'critico') => (l === 'critico' ? 'Critico' : l === 'attenzione' ? 'Da pagare' : 'In regola')

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Oneri condominiali</h1>
        <Bottone onClick={() => setAperta(nuova())}><span className="flex items-center gap-1"><Plus size={16} /> Nuova voce</span></Bottone>
      </div>
      <p className="mt-1 text-gray-500">Rate, conguagli e lavori straordinari comunicati dagli amministratori, immobile per immobile, con bollettini e verbali allegati.</p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg border border-gray-300 bg-white p-0.5 text-sm">
          {([['voci', 'Bollettini e rate'], ['riepilogo', 'Riepilogo per immobile'], ['piani', `Piani di rientro (${piani.filter((p) => p.stato === 'attivo').length})`]] as const).map(([k, t]) => (
            <button key={k} onClick={() => setScheda(k)} className={`rounded-md px-3 py-1.5 ${scheda === k ? 'text-white' : 'text-gray-600'}`} style={scheda === k ? { background: 'var(--colore-primario)' } : undefined}>{t}</button>
          ))}
        </div>
        <BarraRicerca valore={ricerca} onChange={setRicerca} segnaposto="Cerca società, immobile, condominio…" />
        {scheda === 'voci' && <><select value={esercizio} onChange={(e) => setEsercizio(e.target.value)} className={sel}><option value="">Tutti gli esercizi</option>{esercizi.map((e) => <option key={e} value={e}>{e}</option>)}</select>
        <select value={filtro} onChange={(e) => setFiltro(e.target.value as typeof filtro)} className={sel}><option value="tutte">Tutte le voci</option><option value="da_pagare">Da pagare</option><option value="da_riaddebitare">Da riaddebitare al conduttore</option></select></>}
        <Bottone variante="secondario" className="ml-auto" onClick={() => scaricaExcel('Oneri_condominiali', [
          { nome: 'Bollettini e rate', righe: righeDaCampi(filtrate, campi.filter((c) => !['immobile_id', 'condominio_id'].includes(c.nome)), (v) => ({ 'Società': v.societa, 'Immobile': v.immobile, 'Condominio': v.condominio })) },
          { nome: 'Riepilogo immobili', righe: riepiloghi.map((r) => ({ 'Situazione': livelloTesto(r.livello), 'Società': r.societa, 'Immobile': r.imm.indirizzo, 'Condominio': r.condominio?.denominazione ?? '', 'Amministratore': r.condominio?.amministratore_nome ?? '', 'IBAN': r.condominio?.iban ?? '', 'Voci': r.n, 'Totale': r.totale / 100, 'Pagato': r.pagato / 100, 'Da pagare': r.daPagare / 100, 'Scaduto': r.scaduto / 100, 'Scaduto dal': formattaData(r.piuVecchia), 'In piano': r.inPiano / 100, 'Da incassare dal conduttore': r.daRiaddebitare / 100 })) },
          { nome: 'Piani di rientro', righe: piani.map((p) => ({ 'Stato': etichettaDi(STATI_PIANO, p.stato), 'Immobile': immobili.find((i) => i.id === p.immobile_id)?.indirizzo ?? '', 'Accordo del': formattaData(p.data_accordo), 'Descrizione': p.descrizione, 'Totale': (p.importo_totale_cent ?? 0) / 100, 'Rate': p.numero_rate ?? '', 'Importo rata': (p.importo_rata_cent ?? 0) / 100, 'Prima scadenza': formattaData(p.prima_scadenza), 'Periodicità': etichettaDi(PERIODICITA_PIANO, p.periodicita) })) },
        ])}><span className="flex items-center gap-1"><FileSpreadsheet size={16} /> Esporta Excel</span></Bottone>
        <span className="text-sm text-gray-500">da pagare <strong className={totDaPagare > 0 ? 'text-red-600' : ''}>{formattaEuro(totDaPagare)}</strong> · da incassare dai conduttori <strong>{formattaEuro(totDaRiaddebitare)}</strong></span>
      </div>

      <div className="mt-4">
        {errore && <Avviso tipo="errore">{errore}</Avviso>}
        {caricamento && !errore ? <Caricamento /> : scheda === 'riepilogo' ? (
          <>
            <div className="mb-3 grid gap-3 sm:grid-cols-4">
              {[['Da pagare (non in piano)', totRiep.daPagare, totRiep.daPagare > 0 ? 'text-red-600' : ''], ['di cui già scaduto', totRiep.scaduto, totRiep.scaduto > 0 ? 'text-red-600' : ''], ['In piani di rientro', totRiep.inPiano, ''], ['Da incassare dai conduttori', totRiep.daRiaddebitare, '']].map(([t, n, cls]) => (
                <div key={t as string} className="rounded-xl bg-white p-4 shadow-sm"><div className="text-sm text-gray-500">{t}</div><div className={`text-xl font-semibold ${cls}`}>{formattaEuro(n as number)}</div></div>
              ))}
            </div>
            <Tabella<Riepilogo> righe={filtraTesto(riepiloghi.map((r) => ({ ...r, indirizzo: r.imm.indirizzo, cond: r.condominio?.denominazione ?? '', amm: r.condominio?.amministratore_nome ?? '' })), ricerca)} onRiga={(r) => { setScheda('voci'); setRicerca(r.imm.indirizzo) }} vuoto="Nessun immobile collegato a un condominio." colonne={[
              { chiave: 'liv', etichetta: 'Situazione', render: (r) => <Etichetta tono={livelloTono(r.livello)}>{livelloTesto(r.livello)}</Etichetta> },
              { chiave: 'soc', etichetta: 'Società', render: (r) => r.societa },
              { chiave: 'imm', etichetta: 'Immobile', render: (r) => <span className="font-medium">{r.imm.indirizzo}</span> },
              { chiave: 'cond', etichetta: 'Condominio / amministratore', render: (r) => r.condominio ? <span>{r.condominio.denominazione}<br /><span className="text-gray-500">{r.condominio.amministratore_nome}{r.condominio.amministratore_telefono ? ' · ' + r.condominio.amministratore_telefono : ''}</span></span> : <Etichetta tono="giallo">non indicato</Etichetta> },
              { chiave: 'n', etichetta: 'Voci', allinea: 'dx', render: (r) => r.n },
              { chiave: 'tot', etichetta: 'Totale', allinea: 'dx', render: (r) => formattaEuro(r.totale) },
              { chiave: 'pag', etichetta: 'Pagato', allinea: 'dx', render: (r) => <span className="text-green-700">{formattaEuro(r.pagato)}</span> },
              { chiave: 'dap', etichetta: 'Da pagare', allinea: 'dx', render: (r) => <span className={r.daPagare > 0 ? 'font-medium text-red-600' : ''}>{formattaEuro(r.daPagare)}</span> },
              { chiave: 'sca', etichetta: 'Scaduto', allinea: 'dx', render: (r) => r.scaduto > 0 ? <span className="font-medium text-red-600">{formattaEuro(r.scaduto)}<br /><span className="text-xs font-normal">dal {formattaData(r.piuVecchia)}</span></span> : '—' },
              { chiave: 'pia', etichetta: 'In piano', allinea: 'dx', render: (r) => r.inPiano > 0 ? formattaEuro(r.inPiano) : '—' },
              { chiave: 'ria', etichetta: 'Da incassare dal conduttore', allinea: 'dx', render: (r) => r.daRiaddebitare > 0 ? formattaEuro(r.daRiaddebitare) : '—' },
            ]} />
          </>
        ) : scheda === 'piani' ? (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl bg-white p-4 shadow-sm text-sm">
              <span className="font-medium">Nuovo piano di rientro per l'immobile:</span>
              <select value={immobilePiano} onChange={(e) => setImmobilePiano(e.target.value)} className={sel}>
                <option value="">— scegli l'immobile —</option>
                {immobiliMostrati.sort((a, b) => a.indirizzo.localeCompare(b.indirizzo)).map((i) => <option key={i.id} value={i.id}>{i.indirizzo} — {societaDi(i)} ({vociInsolute(i.id).length} insoluti)</option>)}
              </select>
              <Bottone disabled={!immobilePiano || vociInsolute(immobilePiano).length === 0} onClick={() => setPianoAperto(nuovoPiano(immobilePiano))}>Crea piano</Bottone>
              {immobilePiano && vociInsolute(immobilePiano).length === 0 && <span className="text-gray-500">Nessun bollettino insoluto per questo immobile: inseriscili prima in "Bollettini e rate".</span>}
            </div>
            <Tabella righe={filtraTesto(piani.map((p) => { const imm = immobili.find((i) => i.id === p.immobile_id); const rate = rateDelPiano(p.id); return { ...p, immobile: imm?.indirizzo ?? '—', societa: societaDi(imm), condominio: condominioDi(p.condominio_id)?.denominazione ?? '', ratePagate: rate.filter((r) => r.pagata === 'si').length, rateTot: rate.length, pagato: rate.filter((r) => r.pagata === 'si').reduce((s, r) => s + (r.importo_cent ?? 0), 0), prossima: rate.find((r) => r.pagata !== 'si')?.scadenza ?? '' } }), ricerca)}
              onRiga={(p) => setPianoAperto(piani.find((x) => x.id === p.id) ?? null)} vuoto="Nessun piano di rientro. Scegli un immobile qui sopra per crearne uno dai bollettini insoluti." colonne={[
              { chiave: 'st', etichetta: 'Stato', render: (p) => <Etichetta tono={p.stato === 'attivo' ? 'blu' : p.stato === 'concluso' ? 'verde' : 'grigio'}>{etichettaDi(STATI_PIANO, p.stato)}</Etichetta> },
              { chiave: 'soc', etichetta: 'Società', render: (p) => p.societa },
              { chiave: 'imm', etichetta: 'Immobile', render: (p) => <span className="font-medium">{p.immobile}</span> },
              { chiave: 'cond', etichetta: 'Condominio', render: (p) => p.condominio || '—' },
              { chiave: 'acc', etichetta: 'Accordo del', render: (p) => formattaData(p.data_accordo) },
              { chiave: 'desc', etichetta: 'Descrizione', render: (p) => p.descrizione || '—' },
              { chiave: 'tot', etichetta: 'Totale', allinea: 'dx', render: (p) => formattaEuro(p.importo_totale_cent) },
              { chiave: 'rate', etichetta: 'Rate pagate', allinea: 'dx', render: (p) => `${p.ratePagate}/${p.rateTot}` },
              { chiave: 'pag', etichetta: 'Versato', allinea: 'dx', render: (p) => <span className="text-green-700">{formattaEuro(p.pagato)}</span> },
              { chiave: 'pro', etichetta: 'Prossima rata', render: (p) => p.prossima ? <span className={p.prossima < oggi ? 'font-medium text-red-600' : ''}>{formattaData(p.prossima)}</span> : '—' },
            ]} />
          </>
        ) : perSocieta.size === 0 ? (
          <Avviso tipo="info">Nessun immobile collegato a un condominio. Apri un immobile in Anagrafiche → Immobili e scegli il condominio, oppure premi "Nuova voce".</Avviso>
        ) : [...perSocieta.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([soc, imms]) => (
          <div key={soc} className="mb-4">
            <button onClick={() => setChiusi((s) => { const n = new Set(s); if (n.has(soc)) n.delete(soc); else n.add(soc); return n })} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-white">
              {chiusi.has(soc) ? <ChevronRight size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
              <span className="text-base font-semibold">{soc}</span><span className="text-sm text-gray-500">{imms.size} immobili</span>
            </button>
            {!chiusi.has(soc) && [...imms.values()].sort((a, b) => a.imm.indirizzo.localeCompare(b.imm.indirizzo)).map(({ imm, voci: vs }) => {
              const cond = condominioDi(imm.condominio_id)
              return (
                <div key={imm.id} className="mb-3 pl-2">
                  <div className="mb-1 flex flex-wrap items-center gap-2 px-2 text-sm">
                    <span className="font-medium">{imm.indirizzo}</span>
                    {cond ? <span className="text-gray-500">{cond.denominazione}{cond.amministratore_nome ? ` · amm. ${cond.amministratore_nome}` : ''}{cond.amministratore_telefono ? ` · ${cond.amministratore_telefono}` : ''}</span> : <Etichetta tono="giallo">condominio non indicato</Etichetta>}
                    {conduttoreDi(imm.id) && <span className="text-gray-500">· conduttore {conduttoreDi(imm.id)}</span>}
                    <button onClick={() => setAperta(nuova(imm))} className="ml-auto text-xs hover:underline" style={{ color: 'var(--colore-primario)' }}>+ aggiungi voce</button>
                  </div>
                  <Tabella righe={vs} onRiga={(v) => setAperta(voci.find((x) => x.id === v.id) ?? null)} vuoto="Nessuna voce registrata per questo immobile." colonne={[
                    { chiave: 'es', etichetta: 'Esercizio', render: (v) => v.esercizio },
                    { chiave: 'tipo', etichetta: 'Tipo', render: (v) => etichettaDi(TIPI_VOCE_CONDOMINIO, v.tipo) },
                    { chiave: 'desc', etichetta: 'Descrizione', render: (v) => <span className="font-medium">{v.descrizione || '—'} {v.in_piano_id && <Etichetta tono="blu">in piano di rientro</Etichetta>}</span> },
                    { chiave: 'com', etichetta: 'Comunicata il', render: (v) => formattaData(v.data_comunicazione) },
                    { chiave: 'scad', etichetta: 'Scadenza', render: (v) => <span className={v.pagata !== 'si' && v.scadenza && v.scadenza < oggi ? 'font-medium text-red-600' : ''}>{formattaData(v.scadenza)}</span> },
                    { chiave: 'imp', etichetta: 'Importo', allinea: 'dx', render: (v) => <span className="font-medium">{formattaEuro(v.importo_cent)}</span> },
                    { chiave: 'car', etichetta: 'A carico', render: (v) => etichettaDi(A_CARICO, v.a_carico).split(' (')[0] },
                    { chiave: 'pag', etichetta: 'Pagata', render: (v) => v.pagata === 'si' ? <Etichetta tono="verde">Sì · {formattaData(v.data_pagamento)}</Etichetta> : <Etichetta tono="rosso">No</Etichetta> },
                    { chiave: 'ria', etichetta: 'Quota conduttore', render: (v) => !(v.quota_conduttore_cent ?? 0) ? <span className="text-gray-400">—</span> : v.riaddebitata === 'si' ? <Etichetta tono="verde">{formattaEuro(v.quota_conduttore_cent)} incassata</Etichetta> : <Etichetta tono="giallo">{formattaEuro(v.quota_conduttore_cent)} da incassare</Etichetta> },
                  ]} />
                </div>
              )
            })}
          </div>
        ))}
      </div>

      <Finestra titolo={aperta?.id ? `Voce condominiale — ${immobili.find((i) => i.id === aperta.immobile_id)?.indirizzo ?? ''}` : 'Nuova voce condominiale'} aperta={aperta !== null} onChiudi={() => setAperta(null)} larga>
        {aperta && (
          <>
            <Modulo<VoceCondominiale> campi={campi} iniziale={aperta} onSalva={salva} onAnnulla={() => setAperta(null)} onElimina={aperta.id ? elimina : undefined} derivati={derivati} />
            <div className="mt-6">
              {aperta.id ? <Allegati collezione="voci_condominiali" recordId={aperta.id} categorie={CATEGORIE} descrizione={`voce condominiale "${aperta.descrizione}"`} />
                : <Avviso tipo="info">Salva la voce per allegare bollettino, verbale assembleare o ricevuta.</Avviso>}
            </div>
          </>
        )}
      </Finestra>

      <Finestra titolo={pianoAperto?.id ? `Piano di rientro — ${immobili.find((i) => i.id === pianoAperto.immobile_id)?.indirizzo ?? ''}` : `Nuovo piano di rientro — ${immobili.find((i) => i.id === pianoAperto?.immobile_id)?.indirizzo ?? ''}`} aperta={pianoAperto !== null} onChiudi={() => setPianoAperto(null)} larga>
        {pianoAperto && (
          <>
            {(() => { const c = condominioDi(pianoAperto.condominio_id ?? ''); return c ? <div className="mb-4 rounded-lg bg-gray-50 px-4 py-3 text-sm"><strong>{c.denominazione}</strong> · amm. {c.amministratore_nome || '—'} {c.amministratore_telefono && `· ${c.amministratore_telefono}`}{c.iban && <div className="mt-1">IBAN per i bonifici: <span className="font-mono">{c.iban}</span>{c.iban_intestatario && ` (${c.iban_intestatario})`}</div>}</div> : null })()}
            {pianoAperto.id && <div className="mb-4"><Avviso tipo="info">Le rate del piano sono già state generate nella scheda "Bollettini e rate" (tipo "Rata di un piano di rientro"): registra lì i pagamenti. Impostando lo stato su "Concluso", i bollettini inclusi vengono segnati come pagati.</Avviso></div>}
            <Modulo<PianoRientro> campi={campiPiano(pianoAperto.immobile_id ?? '', pianoAperto.id)} iniziale={pianoAperto} onSalva={salvaPiano} onAnnulla={() => setPianoAperto(null)} onElimina={pianoAperto.id ? eliminaPiano : undefined} derivati={derivatiPiano} etichettaSalva={pianoAperto.id ? 'Salva' : 'Salva e genera le rate'} />
            {pianoAperto.id && (
              <div className="mt-6">
                <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">Rate del piano</h3>
                <Tabella righe={rateDelPiano(pianoAperto.id)} onRiga={(v) => { setPianoAperto(null); setAperta(v) }} vuoto="Nessuna rata generata." colonne={[
                  { chiave: 'd', etichetta: 'Rata', render: (v) => v.descrizione },
                  { chiave: 's', etichetta: 'Scadenza', render: (v) => <span className={v.pagata !== 'si' && v.scadenza < oggi ? 'font-medium text-red-600' : ''}>{formattaData(v.scadenza)}</span> },
                  { chiave: 'i', etichetta: 'Importo', allinea: 'dx', render: (v) => formattaEuro(v.importo_cent) },
                  { chiave: 'p', etichetta: 'Pagata', render: (v) => v.pagata === 'si' ? <Etichetta tono="verde">Sì · {formattaData(v.data_pagamento)}</Etichetta> : <Etichetta tono="rosso">No</Etichetta> },
                ]} />
                <div className="mt-6"><Allegati collezione="piani_rientro" recordId={pianoAperto.id} categorie={[{ valore: 'accordo', etichetta: 'Accordo / lettera amministratore' }, { valore: 'ricevuta', etichetta: 'Ricevuta pagamento' }, { valore: 'altro', etichetta: 'Altro' }]} descrizione="piano di rientro" /></div>
              </div>
            )}
          </>
        )}
      </Finestra>
    </div>
  )
}
