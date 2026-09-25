import { useState } from 'react'
import { FileSpreadsheet, Plus, Printer } from 'lucide-react'
import { Link } from 'react-router-dom'
import { righeDaCampi, scaricaExcel } from '../lib/esporta'
import { SoloSeModifica } from '../components/SoloLettura'
import Allegati from '../components/Allegati'
import Modulo, { type CampoDef } from '../components/Modulo'
import RegistroAnnuale from '../components/RegistroAnnuale'
import { Avviso, BarraRicerca, Bottone, Caricamento, Etichetta, Finestra, IntestazionePagina, Segmentato, Tabella, filtraTesto } from '../components/ui'
import { useSessioneAttiva } from '../lib/sessione'
import { aggiorna, attivi, campiModifica, campiNuovo } from '../lib/store'
import {
  MODALITA_REGISTRAZIONE, PERIODICITA, REGIMI_IVA, SI_NO, STATI_CONTRATTO, TIPOLOGIE_CONTRATTO, etichettaDi, statoIva,
  type Conduttore, type Contratto, type Immobile, type Societa,
} from '../lib/tipi'
import { useCollezioni } from '../lib/useCollezioni'
import { aggiungiAnni, formattaData, formattaEuro } from '../lib/utils/formato'

const VUOTO: Partial<Contratto> = {
  immobile_id: '', conduttore_id: '', tipologia: '', stato: 'attivo', data_sottoscrizione: '', data_decorrenza: '', durata_anni: null,
  prima_scadenza: '', rinnovo_automatico: 'si', preavviso_mesi: 6, data_cessazione: '', motivo_cessazione: '',
  canone_mensile_cent: null, canone_annuale_cent: null, periodicita: 'mensile', giorno_scadenza: 10, gestione_incassi: 'si',
  deposito_cent: null, deposito_modalita: '', deposito_restituito_il: '', regime_iva: '', iva_percento: 22,
  istat_attivo: 'si', istat_percentuale: 75, istat_mese: '',
  reg_data: '', reg_ufficio: '', reg_codice: '', reg_modalita: '', reg_imposta_cent: null, reg_quota_conduttore_cent: null,
  imposta_registro_annuale_cent: null, note: '',
}

/** Calcoli automatici: canone annuale da mensile (e viceversa), prima scadenza da decorrenza + durata. */
function derivati(v: Partial<Contratto>, campo: string): Partial<Contratto> {
  const out: Partial<Contratto> = {}
  if (campo === 'canone_mensile_cent' && v.canone_mensile_cent != null) out.canone_annuale_cent = v.canone_mensile_cent * 12
  if (campo === 'canone_annuale_cent' && v.canone_annuale_cent != null) out.canone_mensile_cent = Math.round(v.canone_annuale_cent / 12)
  if ((campo === 'data_decorrenza' || campo === 'durata_anni') && v.data_decorrenza && v.durata_anni) {
    out.prima_scadenza = aggiungiAnni(v.data_decorrenza, v.durata_anni)
  }
  return out
}

type Filtro = 'tutti' | 'attivo' | 'in_disdetta' | 'cessato'
const NOMI_FILTRO: Record<Filtro, string> = { tutti: 'Tutti', attivo: 'Attivi', in_disdetta: 'In disdetta', cessato: 'Cessati' }

export default function PaginaContratti() {
  const { token, nome } = useSessioneAttiva()
  const { dati, caricamento, errore } = useCollezioni(['contratti', 'immobili', 'conduttori', 'societa'])
  const [ricerca, setRicerca] = useState('')
  const [scheda, setScheda] = useState<Filtro>('tutti')
  const [aperto, setAperto] = useState<Partial<Contratto> | null>(null)
  const [tab, setTab] = useState<'dati' | 'registro' | 'allegati'>('dati')

  const immobili = attivi(dati<Immobile>('immobili'))
  const conduttori = attivi(dati<Conduttore>('conduttori'))
  const societa = attivi(dati<Societa>('societa'))
  const immobile = (id: string) => immobili.find((i) => i.id === id)
  const conduttore = (id: string) => conduttori.find((c) => c.id === id)?.denominazione ?? '—'
  const societaDi = (c: Contratto) => societa.find((s) => s.id === immobile(c.immobile_id)?.societa_id)?.ragione_sociale ?? '—'
  const descrivi = (c: Partial<Contratto>) => `${immobile(c.immobile_id ?? '')?.indirizzo ?? ''} / ${conduttore(c.conduttore_id ?? '')}`

  const tutti = attivi(dati<Contratto>('contratti'))
  const righe = filtraTesto(
    tutti.filter((c) => scheda === 'tutti' || c.stato === scheda),
    ricerca, (c) => `${descrivi(c)} ${societaDi(c)}`,
  ).sort((a, b) => societaDi(a).localeCompare(societaDi(b)) || (immobile(a.immobile_id)?.indirizzo ?? '').localeCompare(immobile(b.immobile_id)?.indirizzo ?? ''))

  const campi: CampoDef<Contratto>[] = [
    { nome: 'immobile_id', etichetta: 'Immobile', tipo: 'select', obbligatorio: true, sezione: 'Immobile e conduttore',
      opzioni: immobili.map((i) => ({ valore: i.id, etichetta: `${i.indirizzo} — ${societa.find((s) => s.id === i.societa_id)?.ragione_sociale ?? ''}` })) },
    { nome: 'conduttore_id', etichetta: 'Conduttore', tipo: 'select', obbligatorio: true, opzioni: conduttori.map((c) => ({ valore: c.id, etichetta: c.denominazione })) },
    { nome: 'tipologia', etichetta: 'Tipologia contratto', tipo: 'select', opzioni: TIPOLOGIE_CONTRATTO },
    { nome: 'stato', etichetta: 'Stato', tipo: 'select', opzioni: STATI_CONTRATTO, obbligatorio: true },
    { nome: 'data_sottoscrizione', etichetta: 'Data sottoscrizione', tipo: 'data', sezione: 'Durata e scadenze', colonne: 3 },
    { nome: 'data_decorrenza', etichetta: 'Decorrenza', tipo: 'data' },
    { nome: 'prima_scadenza', etichetta: 'Prima scadenza', tipo: 'data', aiuto: 'Calcolata da decorrenza + durata, modificabile' },
    { nome: 'durata_anni', etichetta: 'Durata (anni)', tipo: 'numero' },
    { nome: 'preavviso_mesi', etichetta: 'Preavviso disdetta (mesi)', tipo: 'numero' },
    { nome: 'rinnovo_automatico', etichetta: 'Rinnovo automatico', tipo: 'select', opzioni: SI_NO },
    { nome: 'data_cessazione', etichetta: 'Data cessazione effettiva', tipo: 'data' },
    { nome: 'motivo_cessazione', etichetta: 'Motivo cessazione', tipo: 'testo', doppia: true },
    { nome: 'canone_mensile_cent', etichetta: 'Canone mensile', tipo: 'euro', sezione: 'Canone e IVA', colonne: 3 },
    { nome: 'canone_annuale_cent', etichetta: 'Canone annuale', tipo: 'euro', aiuto: 'Calcolato ×12, modificabile' },
    { nome: 'periodicita', etichetta: 'Periodicità pagamento', tipo: 'select', opzioni: PERIODICITA },
    { nome: 'regime_iva', etichetta: 'Canone soggetto a IVA?', tipo: 'select', opzioni: REGIMI_IVA, obbligatorio: true, stile: 'radio', doppia: true, aiuto: 'Vale per tutte le sezioni: pagamenti, imposta di registro, riepiloghi' },
    { nome: 'iva_percento', etichetta: 'Aliquota IVA (%)', tipo: 'numero', aiuto: 'Solo se soggetto a IVA (di norma 22)' },
    { nome: 'giorno_scadenza', etichetta: 'Giorno di scadenza pagamento', tipo: 'numero', aiuto: 'Regola del gruppo: il 10 di ogni mese. Cambiarlo solo per casi particolari' },
    { nome: 'gestione_incassi', etichetta: 'Incassi gestiti da noi?', tipo: 'select', opzioni: SI_NO, doppia: true, aiuto: 'Se "No", il contratto non compare nella griglia Canoni e incassi' },
    { nome: 'deposito_cent', etichetta: 'Deposito cauzionale / caparra', tipo: 'euro', sezione: 'Deposito cauzionale', colonne: 3 },
    { nome: 'deposito_modalita', etichetta: 'Modalità (bonifico, fideiussione…)', tipo: 'testo' },
    { nome: 'deposito_restituito_il', etichetta: 'Restituito il', tipo: 'data' },
    { nome: 'istat_attivo', etichetta: 'Aggiornamento ISTAT', tipo: 'select', opzioni: SI_NO, sezione: 'Aggiornamento ISTAT', colonne: 3 },
    { nome: 'istat_percentuale', etichetta: 'Percentuale applicata (75 o 100)', tipo: 'numero' },
    { nome: 'istat_mese', etichetta: 'Mese di riferimento (es. 2026-05)', tipo: 'testo' },
    { nome: 'reg_data', etichetta: 'Data registrazione', tipo: 'data', sezione: 'Registrazione e imposta di registro', colonne: 4 },
    { nome: 'reg_ufficio', etichetta: 'Ufficio', tipo: 'testo' },
    { nome: 'reg_codice', etichetta: 'Codice identificativo', tipo: 'testo' },
    { nome: 'reg_modalita', etichetta: 'Modalità', tipo: 'select', opzioni: MODALITA_REGISTRAZIONE },
    { nome: 'reg_imposta_cent', etichetta: 'Imposta prima registrazione', tipo: 'euro' },
    { nome: 'reg_quota_conduttore_cent', etichetta: 'di cui a carico conduttore', tipo: 'euro' },
    { nome: 'imposta_registro_annuale_cent', etichetta: 'Imposta annuale (quota locatore)', tipo: 'euro', doppia: true, aiuto: 'Importo dovuto ogni anno per le annualità successive' },
    { nome: 'note', etichetta: 'Note', tipo: 'textarea', sezione: 'Note' },
  ]

  async function salva(v: Partial<Contratto>) {
    const esistente = !!v.id
    await aggiorna<Contratto>(token, 'contratti', (rec) => esistente
      ? rec.map((r) => (r.id === v.id ? { ...r, ...v, ...campiModifica(nome) } as Contratto : r))
      : [...rec, { ...VUOTO, ...v, ...campiNuovo(nome) } as Contratto],
    `${nome}: ${esistente ? 'modifica' : 'nuovo'} contratto ${descrivi(v)}`)
    setAperto(null)
  }
  async function elimina() {
    if (!aperto?.id) return
    await aggiorna<Contratto>(token, 'contratti', (rec) => rec.map((r) => (r.id === aperto.id ? { ...r, eliminato_il: new Date().toISOString(), ...campiModifica(nome) } : r)),
      `${nome}: elimina contratto ${descrivi(aperto)}`)
    setAperto(null)
  }

  const totaleAnnuo = righe.reduce((s, c) => s + (c.canone_annuale_cent ?? 0), 0)
  const tonoStato = (s: string) => (s === 'attivo' ? 'verde' : s === 'in_disdetta' ? 'giallo' : 'grigio')

  const conta = (f: Filtro) => tutti.filter((c) => f === 'tutti' || c.stato === f).length
  const esporta = () => scaricaExcel(`Contratti_${NOMI_FILTRO[scheda]}`, [{ nome: `Contratti ${NOMI_FILTRO[scheda]}`, righe: righeDaCampi(righe, campi, (c) => ({ 'Società': societaDi(c), 'Immobile': immobile(c.immobile_id)?.indirizzo ?? '', 'Conduttore': conduttore(c.conduttore_id) })) }])
  const societaAperta = aperto?.immobile_id ? societa.find((s) => s.id === immobile(aperto.immobile_id ?? '')?.societa_id)?.ragione_sociale : undefined

  return (
    <div>
      <IntestazionePagina kicker="Locazioni" titolo="Contratti" sottotitolo="Tutti i contratti di locazione delle società del gruppo."
        azioni={<>
          <Bottone variante="secondario" onClick={esporta}><FileSpreadsheet size={16} /> Esporta Excel</Bottone>
          <SoloSeModifica><Bottone onClick={() => { setTab('dati'); setAperto({ ...VUOTO }) }}><Plus size={16} /> Nuovo contratto</Bottone></SoloSeModifica>
        </>} />
      <div className="mb-4">
        <Segmentato valore={scheda} onChange={setScheda} opzioni={(Object.keys(NOMI_FILTRO) as Filtro[]).map((f) => ({ valore: f, etichetta: `${NOMI_FILTRO[f]} (${conta(f)})` }))} />
      </div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <BarraRicerca valore={ricerca} onChange={setRicerca} segnaposto="Cerca immobile, conduttore, società…" />
        <span className="ml-auto text-[13px] text-neutro-700">{righe.length} contratti · canone annuo <strong className="num">{formattaEuro(totaleAnnuo)}</strong></span>
      </div>
      {errore && <div className="mb-4"><Avviso tipo="errore">{errore}</Avviso></div>}
      {caricamento && !errore ? <Caricamento /> : (
        <Tabella<Contratto> righe={righe} onRiga={(r) => { setTab('dati'); setAperto(r) }} vuoto="Nessun contratto in questo elenco."
          colonne={[
            { chiave: 'imm', etichetta: 'Immobile', render: (c) => <div className="min-w-[160px]"><div className="font-medium">{immobile(c.immobile_id)?.indirizzo ?? '—'}</div><div className="text-xs text-neutro-700">{societaDi(c)}</div></div> },
            { chiave: 'con', etichetta: 'Conduttore', render: (c) => conduttore(c.conduttore_id) },
            { chiave: 'tip', etichetta: 'Tipo', render: (c) => <span className="text-[13px]">{etichettaDi(TIPOLOGIE_CONTRATTO, c.tipologia)}</span> },
            { chiave: 'dec', etichetta: 'Decorrenza', render: (c) => <span className="num">{formattaData(c.data_decorrenza)}</span> },
            { chiave: 'scad', etichetta: 'Scadenza', render: (c) => <span className="num">{formattaData(c.prima_scadenza)}</span> },
            { chiave: 'mens', etichetta: 'Canone mensile', allinea: 'dx', render: (c) => <span className="whitespace-nowrap font-medium">{formattaEuro(c.canone_mensile_cent)}</span> },
            { chiave: 'ann', etichetta: 'Canone annuale', allinea: 'dx', render: (c) => <span className="whitespace-nowrap">{formattaEuro(c.canone_annuale_cent)}</span> },
            { chiave: 'reg', etichetta: 'Imp. registro annua', allinea: 'dx', render: (c) => <span className="whitespace-nowrap">{formattaEuro(c.imposta_registro_annuale_cent)}</span> },
            { chiave: 'iva', etichetta: 'IVA', render: (c) => { const s = statoIva(c); return <Etichetta tono={s.tono}>{s.testo}</Etichetta> } },
            { chiave: 'stato', etichetta: 'Stato', render: (c) => <Etichetta tono={tonoStato(c.stato)}>{etichettaDi(STATI_CONTRATTO, c.stato)}</Etichetta> },
            { chiave: 'az', etichetta: '', render: (c) => <Link to={`/stampa/immobile/${c.immobile_id}`} onClick={(e) => e.stopPropagation()} title="Scheda immobile (stampa / PDF)" className="btn btn-secondario btn-piccolo no-underline"><Printer size={14} /> Scheda</Link> },
          ]} />
      )}
      <Finestra kicker={societaAperta} titolo={aperto?.id ? `Modifica contratto — ${immobile(aperto.immobile_id ?? '')?.indirizzo ?? ''}` : 'Nuovo contratto'} aperta={aperto !== null} onChiudi={() => setAperto(null)} larga>
        {aperto && (
          <>
            {aperto.id && (
              <div className="mb-6">
                <Segmentato valore={tab} onChange={setTab} opzioni={[{ valore: 'dati', etichetta: 'Dati del contratto' }, { valore: 'registro', etichetta: 'Registro annuale: ISTAT e imposta di registro' }, { valore: 'allegati', etichetta: 'Allegati' }]} />
              </div>
            )}
            {(tab === 'dati' || !aperto.id) && <Modulo<Contratto> campi={campi} iniziale={aperto} onSalva={salva} onAnnulla={() => setAperto(null)} onElimina={aperto.id ? elimina : undefined} derivati={derivati} />}
            {tab === 'registro' && aperto.id && <RegistroAnnuale contratto={tutti.find((c) => c.id === aperto.id) ?? (aperto as Contratto)} descrizione={descrivi(aperto)} />}
            {tab === 'allegati' && aperto.id && <Allegati collezione="contratti" recordId={aperto.id} descrizione={`contratto ${descrivi(aperto)}`} />}
          </>
        )}
      </Finestra>
    </div>
  )
}
