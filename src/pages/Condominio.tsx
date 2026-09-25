/**
 * Oneri condominiali: per ogni immobile in condominio, le voci (rate, conguagli, lavori straordinari)
 * comunicate dall'amministratore volta per volta, con scadenza, pagamento, quota riaddebitabile al
 * conduttore e allegati (bollettini, verbali assembleari, riparti).
 */
import { useState } from 'react'
import { FileSpreadsheet, Plus } from 'lucide-react'
import { righeDaCampi, scaricaExcel } from '../lib/esporta'
import { SoloSeModifica } from '../components/SoloLettura'
import Allegati from '../components/Allegati'
import Modulo, { type CampoDef } from '../components/Modulo'
import { Avviso, BarraRicerca, Bottone, Caricamento, Etichetta, Finestra, Gruppo, IntestazionePagina, Riquadro, Segmentato, Tabella, TavolaKpi, filtraTesto } from '../components/ui'
import { useSessioneAttiva } from '../lib/sessione'
import { aggiorna, attivi, campiModifica, campiNuovo } from '../lib/store'
import { A_CARICO, PERIODICITA_PIANO, SI_NO, STATI_PIANO, TIPI_VOCE_CONDOMINIO, etichettaDi, type Condominio, type Conduttore, type Contratto, type Immobile, type PianoRientro, type Societa, type VoceCondominiale } from '../lib/tipi'
import { useCollezioni } from '../lib/useCollezioni'
import { aggiungiMesi, formattaData, formattaEuro } from '../lib/utils/formato'

/** Aggiunge giorni a una data ISO */
const aggiungiGiorni = (iso: string, giorni: number) => new Date(new Date(iso + 'T00:00:00Z').getTime() + giorni * 86_400_000).toISOString().slice(0, 10)

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
    { nome: 'data_comunicazione', etichetta: 'Data comunicazione amministratore', tipo: 'data', sezione: 'Importo e scadenza', colonne: 3 },
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
  const sel = 'input w-auto'
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

  // ---- Numeri in alto ----
  const GIORNI_URGENTE = 7
  const tra7 = aggiungiGiorni(oggi, GIORNI_URGENTE)
  const daPagareVoci = voci.filter((v) => v.pagata !== 'si' && !v.in_piano_id)
  const urgenti = daPagareVoci.filter((v) => v.scadenza && v.scadenza <= tra7)
  const quoteDaChiedere = voci.filter((v) => (v.quota_conduttore_cent ?? 0) > 0 && v.riaddebitata !== 'si')
  const pianiInCorso = piani.filter((p) => p.stato === 'attivo')
  const residuoPiani = pianiInCorso.reduce((t, p) => t + rateDelPiano(p.id).filter((r) => r.pagata !== 'si').reduce((x, r) => x + (r.importo_cent ?? 0), 0), 0)
  const esporta = () => scaricaExcel('Oneri_condominiali', [
    { nome: 'Bollettini e rate', righe: righeDaCampi(filtrate, campi.filter((c) => !['immobile_id', 'condominio_id'].includes(c.nome)), (v) => ({ 'Società': v.societa, 'Immobile': v.immobile, 'Condominio': v.condominio })) },
    { nome: 'Riepilogo immobili', righe: riepiloghi.map((r) => ({ 'Situazione': livelloTesto(r.livello), 'Società': r.societa, 'Immobile': r.imm.indirizzo, 'Condominio': r.condominio?.denominazione ?? '', 'Amministratore': r.condominio?.amministratore_nome ?? '', 'IBAN': r.condominio?.iban ?? '', 'Voci': r.n, 'Totale': r.totale / 100, 'Pagato': r.pagato / 100, 'Da pagare': r.daPagare / 100, 'Scaduto': r.scaduto / 100, 'Scaduto dal': formattaData(r.piuVecchia), 'In piano': r.inPiano / 100, 'Da incassare dal conduttore': r.daRiaddebitare / 100 })) },
    { nome: 'Piani di rientro', righe: piani.map((p) => ({ 'Stato': etichettaDi(STATI_PIANO, p.stato), 'Immobile': immobili.find((i) => i.id === p.immobile_id)?.indirizzo ?? '', 'Accordo del': formattaData(p.data_accordo), 'Descrizione': p.descrizione, 'Totale': (p.importo_totale_cent ?? 0) / 100, 'Rate': p.numero_rate ?? '', 'Importo rata': (p.importo_rata_cent ?? 0) / 100, 'Prima scadenza': formattaData(p.prima_scadenza), 'Periodicità': etichettaDi(PERIODICITA_PIANO, p.periodicita) })) },
  ])
  const tonoPiano = (st: string) => (st === 'attivo' ? 'giallo' : st === 'concluso' ? 'verde' : 'grigio')

  return (
    <div>
      <IntestazionePagina kicker="Spese" titolo="Condominio" sottotitolo="Bollettini, rate e conguagli comunicati dagli amministratori, con la quota da riaddebitare ai conduttori."
        azioni={<>
          <Bottone variante="secondario" onClick={esporta}><FileSpreadsheet size={16} /> Esporta Excel</Bottone>
          <SoloSeModifica><Bottone onClick={() => setAperta(nuova())}><Plus size={16} /> Nuovo bollettino</Bottone></SoloSeModifica>
        </>} />

      {!caricamento && (
        <TavolaKpi celle={[
          { titolo: 'Da pagare', valore: formattaEuro(daPagareVoci.reduce((t, v) => t + (v.importo_cent ?? 0), 0)), nota: `${daPagareVoci.length} ${daPagareVoci.length === 1 ? 'bollettino' : 'bollettini'}${urgenti.length ? `, di cui ${urgenti.length} entro il ${formattaData(tra7).slice(0, 5)}` : ''}` },
          { titolo: 'Da riaddebitare ai conduttori', valore: formattaEuro(quoteDaChiedere.reduce((t, v) => t + (v.quota_conduttore_cent ?? 0), 0)), nota: `${quoteDaChiedere.length} ${quoteDaChiedere.length === 1 ? 'quota non ancora richiesta' : 'quote non ancora richieste'}` },
          { titolo: 'Piani di rientro', valore: `${pianiInCorso.length} in corso`, nota: `residuo ${formattaEuro(residuoPiani)}` },
        ]} />
      )}

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Segmentato valore={scheda} onChange={setScheda} opzioni={[{ valore: 'voci', etichetta: 'Bollettini e rate' }, { valore: 'riepilogo', etichetta: 'Riepilogo per immobile' }, { valore: 'piani', etichetta: `Piani di rientro (${pianiInCorso.length})` }]} />
        <BarraRicerca valore={ricerca} onChange={setRicerca} segnaposto="Cerca società, immobile, condominio…" />
        {scheda === 'voci' && <><select value={esercizio} onChange={(e) => setEsercizio(e.target.value)} className={sel}><option value="">Tutti gli esercizi</option>{esercizi.map((e) => <option key={e} value={e}>{e}</option>)}</select>
        <select value={filtro} onChange={(e) => setFiltro(e.target.value as typeof filtro)} className={sel}><option value="tutte">Tutte le voci</option><option value="da_pagare">Da pagare</option><option value="da_riaddebitare">Da riaddebitare al conduttore</option></select>
        <span className="ml-auto text-[13px] text-neutro-700">da pagare <strong className={`num ${totDaPagare > 0 ? 'text-err-testo' : 'text-testo'}`}>{formattaEuro(totDaPagare)}</strong> · da incassare dai conduttori <strong className="num text-testo">{formattaEuro(totDaRiaddebitare)}</strong></span></>}
      </div>

      <div>
        {errore && <div className="mb-4"><Avviso tipo="errore">{errore}</Avviso></div>}
        {caricamento && !errore ? <Caricamento /> : scheda === 'riepilogo' ? (
          <>
            <TavolaKpi celle={[
              { titolo: 'Da pagare (non in piano)', valore: formattaEuro(totRiep.daPagare) },
              { titolo: 'di cui già scaduto', valore: formattaEuro(totRiep.scaduto), tono: totRiep.scaduto > 0 ? 'rosso' : undefined },
              { titolo: 'In piani di rientro', valore: formattaEuro(totRiep.inPiano) },
              { titolo: 'Da incassare dai conduttori', valore: formattaEuro(totRiep.daRiaddebitare) },
            ]} />
            <Tabella<Riepilogo> righe={filtraTesto(riepiloghi.map((r) => ({ ...r, indirizzo: r.imm.indirizzo, cond: r.condominio?.denominazione ?? '', amm: r.condominio?.amministratore_nome ?? '' })), ricerca)} onRiga={(r) => { setScheda('voci'); setRicerca(r.imm.indirizzo) }} vuoto="Nessun immobile collegato a un condominio." colonne={[
              { chiave: 'liv', etichetta: 'Situazione', render: (r) => <Etichetta tono={livelloTono(r.livello)}>{livelloTesto(r.livello)}</Etichetta> },
              { chiave: 'imm', etichetta: 'Immobile', render: (r) => <div><div className="font-medium">{r.imm.indirizzo}</div><div className="text-xs text-neutro-700">{r.societa}</div></div> },
              { chiave: 'cond', etichetta: 'Condominio / amministratore', render: (r) => r.condominio ? <div><div>{r.condominio.denominazione}</div><div className="text-xs text-neutro-700">{r.condominio.amministratore_nome}{r.condominio.amministratore_telefono ? ' · ' + r.condominio.amministratore_telefono : ''}</div></div> : <Etichetta tono="giallo">non indicato</Etichetta> },
              { chiave: 'n', etichetta: 'Voci', allinea: 'dx', render: (r) => r.n },
              { chiave: 'tot', etichetta: 'Totale', allinea: 'dx', render: (r) => formattaEuro(r.totale) },
              { chiave: 'pag', etichetta: 'Pagato', allinea: 'dx', render: (r) => <span className="text-ok-testo">{formattaEuro(r.pagato)}</span> },
              { chiave: 'dap', etichetta: 'Da pagare', allinea: 'dx', render: (r) => <span className={r.daPagare > 0 ? 'font-medium text-err-testo' : ''}>{formattaEuro(r.daPagare)}</span> },
              { chiave: 'sca', etichetta: 'Scaduto', allinea: 'dx', render: (r) => r.scaduto > 0 ? <span className="font-medium text-err-testo">{formattaEuro(r.scaduto)}<br /><span className="text-xs font-normal">dal {formattaData(r.piuVecchia)}</span></span> : '—' },
              { chiave: 'pia', etichetta: 'In piano', allinea: 'dx', render: (r) => r.inPiano > 0 ? formattaEuro(r.inPiano) : '—' },
              { chiave: 'ria', etichetta: 'Da incassare dal conduttore', allinea: 'dx', render: (r) => r.daRiaddebitare > 0 ? formattaEuro(r.daRiaddebitare) : '—' },
            ]} />
          </>
        ) : scheda === 'piani' ? (
          <>
            <SoloSeModifica>
              <Riquadro className="mb-6 flex flex-wrap items-center gap-3 px-4 py-3.5 text-sm">
                <span className="font-medium">Nuovo piano di rientro per l'immobile:</span>
                <select value={immobilePiano} onChange={(e) => setImmobilePiano(e.target.value)} className={sel}>
                  <option value="">— scegli l'immobile —</option>
                  {immobiliMostrati.sort((a, b) => a.indirizzo.localeCompare(b.indirizzo)).map((i) => <option key={i.id} value={i.id}>{i.indirizzo} — {societaDi(i)} ({vociInsolute(i.id).length} insoluti)</option>)}
                </select>
                <Bottone disabled={!immobilePiano || vociInsolute(immobilePiano).length === 0} onClick={() => setPianoAperto(nuovoPiano(immobilePiano))}>Crea piano</Bottone>
                {immobilePiano && vociInsolute(immobilePiano).length === 0 && <span className="text-neutro-700">Nessun bollettino insoluto per questo immobile: inseriscili prima in "Bollettini e rate".</span>}
              </Riquadro>
            </SoloSeModifica>
            {(() => {
              const elencoPiani = filtraTesto(piani.map((p) => { const imm = immobili.find((i) => i.id === p.immobile_id); return { ...p, immobile: imm?.indirizzo ?? '—', societa: societaDi(imm), condominio: condominioDi(p.condominio_id)?.denominazione ?? '' } }), ricerca)
              if (elencoPiani.length === 0) return <Avviso tipo="info">Nessun piano di rientro. Scegli un immobile qui sopra per crearne uno dai bollettini insoluti.</Avviso>
              return (
                <div className="flex flex-col gap-7">
                  {elencoPiani.map((p) => {
                    const rate = rateDelPiano(p.id)
                    const pagate = rate.filter((r) => r.pagata === 'si').length
                    const prossima = rate.find((r) => r.pagata !== 'si')
                    const versato = rate.filter((r) => r.pagata === 'si').reduce((t, r) => t + (r.importo_cent ?? 0), 0)
                    return (
                      <Riquadro key={p.id} className="grid cursor-pointer gap-6 p-5 hover:bg-[rgba(29,31,32,0.04)] md:grid-cols-2" onClick={() => setPianoAperto(piani.find((x) => x.id === p.id) ?? null)}>
                        <div>
                          <Etichetta tono={tonoPiano(p.stato)}>{etichettaDi(STATI_PIANO, p.stato)}</Etichetta>
                          <h4 className="mb-1 mt-2">{p.immobile}</h4>
                          <div className="mb-3 text-[13px] text-neutro-700">{p.societa}{p.condominio ? ` · ${p.condominio}` : ''}</div>
                          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[13px]">
                            <dt className="text-neutro-700">Accordo del</dt><dd>{formattaData(p.data_accordo)}</dd>
                            <dt className="text-neutro-700">Totale</dt><dd className="num">{formattaEuro(p.importo_totale_cent)}</dd>
                            <dt className="text-neutro-700">Versato</dt><dd className="num text-ok-testo">{formattaEuro(versato)}</dd>
                            <dt className="text-neutro-700">Prossima rata</dt><dd className={prossima && prossima.scadenza < oggi ? 'font-medium text-err-testo' : ''}>{prossima ? `${formattaData(prossima.scadenza)} · ${formattaEuro(prossima.importo_cent)}` : '—'}</dd>
                            {p.descrizione && <><dt className="text-neutro-700">Descrizione</dt><dd>{p.descrizione}</dd></>}
                          </dl>
                        </div>
                        <div>
                          <div className="mb-2 text-[13px] text-neutro-700">Avanzamento · {pagate} di {rate.length} rate pagate</div>
                          <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(44px, 1fr))' }}>
                            {rate.map((r, i) => (
                              <div key={r.id} title={`${r.descrizione} · ${formattaData(r.scadenza)} · ${formattaEuro(r.importo_cent)}`}
                                className={`num flex h-9 items-center justify-center text-xs ${r.pagata === 'si' ? 'bg-accento text-sfondo' : r.id === prossima?.id ? 'border border-accento-800 bg-accento-100 text-accento-800' : 'border border-dashed border-neutro-400 text-neutro-600'}`}>
                                {i + 1}
                              </div>
                            ))}
                          </div>
                        </div>
                      </Riquadro>
                    )
                  })}
                </div>
              )
            })()}
          </>
        ) : perSocieta.size === 0 ? (
          <Avviso tipo="info">Nessun immobile collegato a un condominio. Apri un immobile in Anagrafiche → Immobili e scegli il condominio, oppure premi "Nuovo bollettino".</Avviso>
        ) : [...perSocieta.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([soc, imms]) => (
          <Gruppo key={soc} titolo={soc} sottotitolo={`${imms.size} immobili`}>
            {[...imms.values()].sort((a, b) => a.imm.indirizzo.localeCompare(b.imm.indirizzo)).map(({ imm, voci: vs }) => {
              const cond = condominioDi(imm.condominio_id)
              return (
                <div key={imm.id} className="mb-6">
                  <div className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 px-1 text-sm">
                    <span className="font-medium">{imm.indirizzo}</span>
                    {cond ? <span className="text-[13px] text-neutro-700">{cond.denominazione}{cond.amministratore_nome ? ` · amm. ${cond.amministratore_nome}` : ''}{cond.amministratore_telefono ? ` · ${cond.amministratore_telefono}` : ''}</span> : <Etichetta tono="giallo">condominio non indicato</Etichetta>}
                    {conduttoreDi(imm.id) && <span className="text-[13px] text-neutro-700">· conduttore {conduttoreDi(imm.id)}</span>}
                    <SoloSeModifica><Bottone variante="ghost" piccolo className="ml-auto" onClick={() => setAperta(nuova(imm))}><Plus size={14} /> Aggiungi bollettino</Bottone></SoloSeModifica>
                  </div>
                  <Tabella righe={vs} onRiga={(v) => setAperta(voci.find((x) => x.id === v.id) ?? null)} vuoto="Nessuna voce registrata per questo immobile." colonne={[
                    { chiave: 'scad', etichetta: 'Scadenza', render: (v) => <span className={`num whitespace-nowrap ${v.pagata !== 'si' && v.scadenza && v.scadenza < oggi ? 'font-medium text-err-testo' : ''}`}>{formattaData(v.scadenza)}</span> },
                    { chiave: 'desc', etichetta: 'Descrizione', render: (v) => <div><div className="font-medium">{v.descrizione || '—'} {v.in_piano_id && <Etichetta tono="blu">in piano di rientro</Etichetta>}</div><div className="text-xs text-neutro-700">{etichettaDi(TIPI_VOCE_CONDOMINIO, v.tipo)} · esercizio {v.esercizio}{v.data_comunicazione ? ` · comunicata il ${formattaData(v.data_comunicazione)}` : ''}</div></div> },
                    { chiave: 'imp', etichetta: 'Importo', allinea: 'dx', render: (v) => <span className="whitespace-nowrap font-medium">{formattaEuro(v.importo_cent)}</span> },
                    { chiave: 'car', etichetta: 'A carico', render: (v) => etichettaDi(A_CARICO, v.a_carico).split(' (')[0] },
                    { chiave: 'quo', etichetta: 'Quota conduttore', allinea: 'dx', render: (v) => (v.quota_conduttore_cent ?? 0) > 0 ? formattaEuro(v.quota_conduttore_cent) : <span className="text-neutro-500">—</span> },
                    { chiave: 'pag', etichetta: 'Pagata', render: (v) => v.pagata === 'si' ? <Etichetta tono="verde">Sì{v.data_pagamento ? ` · ${formattaData(v.data_pagamento)}` : ''}</Etichetta> : <Etichetta tono={v.scadenza && v.scadenza <= tra7 ? 'rosso' : 'giallo'}>No</Etichetta> },
                    { chiave: 'ria', etichetta: 'Riaddebito', render: (v) => !(v.quota_conduttore_cent ?? 0) ? <Etichetta tono="grigio">Non dovuto</Etichetta> : v.riaddebitata === 'si' ? <Etichetta tono="verde">Richiesto{v.data_riaddebito ? ` il ${formattaData(v.data_riaddebito)}` : ''}</Etichetta> : <Etichetta tono="giallo">Da richiedere</Etichetta> },
                  ]} />
                </div>
              )
            })}
          </Gruppo>
        ))}
      </div>

      <Finestra kicker={aperta?.immobile_id ? societaDi(immobili.find((i) => i.id === aperta.immobile_id)) : undefined} titolo={aperta?.id ? `Bollettino — ${immobili.find((i) => i.id === aperta.immobile_id)?.indirizzo ?? ''}` : 'Nuovo bollettino'} aperta={aperta !== null} onChiudi={() => setAperta(null)} larga>
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
            {(() => { const c = condominioDi(pianoAperto.condominio_id ?? ''); return c ? <div className="mb-5"><Avviso tipo="info"><strong>{c.denominazione}</strong> · amm. {c.amministratore_nome || '—'} {c.amministratore_telefono && `· ${c.amministratore_telefono}`}{c.iban && <div className="mt-1">IBAN per i bonifici: <span className="font-mono">{c.iban}</span>{c.iban_intestatario && ` (${c.iban_intestatario})`}</div>}</Avviso></div> : null })()}
            {pianoAperto.id && <div className="mb-4"><Avviso tipo="info">Le rate del piano sono già state generate nella scheda "Bollettini e rate" (tipo "Rata di un piano di rientro"): registra lì i pagamenti. Impostando lo stato su "Concluso", i bollettini inclusi vengono segnati come pagati.</Avviso></div>}
            <Modulo<PianoRientro> campi={campiPiano(pianoAperto.immobile_id ?? '', pianoAperto.id)} iniziale={pianoAperto} onSalva={salvaPiano} onAnnulla={() => setPianoAperto(null)} onElimina={pianoAperto.id ? eliminaPiano : undefined} derivati={derivatiPiano} etichettaSalva={pianoAperto.id ? 'Salva' : 'Salva e genera le rate'} />
            {pianoAperto.id && (
              <div className="mt-6">
                <h6 className="mb-3 text-accento-700">Rate del piano</h6>
                <Tabella righe={rateDelPiano(pianoAperto.id)} onRiga={(v) => { setPianoAperto(null); setAperta(v) }} vuoto="Nessuna rata generata." colonne={[
                  { chiave: 'd', etichetta: 'Rata', render: (v) => v.descrizione },
                  { chiave: 's', etichetta: 'Scadenza', render: (v) => <span className={v.pagata !== 'si' && v.scadenza < oggi ? 'font-medium text-err-testo' : ''}>{formattaData(v.scadenza)}</span> },
                  { chiave: 'i', etichetta: 'Importo', allinea: 'dx', render: (v) => formattaEuro(v.importo_cent) },
                  { chiave: 'p', etichetta: 'Pagata', render: (v) => v.pagata === 'si' ? <Etichetta tono="verde">Sì{v.data_pagamento ? ` · ${formattaData(v.data_pagamento)}` : ''}</Etichetta> : <Etichetta tono="rosso">No</Etichetta> },
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
