import { useState } from 'react'
import { FileSpreadsheet, Plus, Printer } from 'lucide-react'
import { Link } from 'react-router-dom'
import { righeDaCampi, scaricaExcel } from '../lib/esporta'
import Allegati from '../components/Allegati'
import Modulo, { type CampoDef } from '../components/Modulo'
import RegistroAnnuale from '../components/RegistroAnnuale'
import { Avviso, BarraRicerca, Bottone, Caricamento, Etichetta, Finestra, Tabella, filtraTesto } from '../components/ui'
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
  canone_mensile_cent: null, canone_annuale_cent: null, periodicita: 'mensile', giorno_scadenza: 5, gestione_incassi: 'si',
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

export default function PaginaContratti() {
  const { token, nome } = useSessioneAttiva()
  const { dati, caricamento, errore } = useCollezioni(['contratti', 'immobili', 'conduttori', 'societa'])
  const [ricerca, setRicerca] = useState('')
  const [scheda, setScheda] = useState<'attivi' | 'cessati'>('attivi')
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
    tutti.filter((c) => (scheda === 'attivi' ? c.stato !== 'cessato' : c.stato === 'cessato')),
    ricerca, (c) => `${descrivi(c)} ${societaDi(c)}`,
  ).sort((a, b) => societaDi(a).localeCompare(societaDi(b)) || (immobile(a.immobile_id)?.indirizzo ?? '').localeCompare(immobile(b.immobile_id)?.indirizzo ?? ''))

  const campi: CampoDef<Contratto>[] = [
    { nome: 'immobile_id', etichetta: 'Immobile', tipo: 'select', obbligatorio: true, intera: true,
      opzioni: immobili.map((i) => ({ valore: i.id, etichetta: `${i.indirizzo} — ${societa.find((s) => s.id === i.societa_id)?.ragione_sociale ?? ''}` })) },
    { nome: 'conduttore_id', etichetta: 'Conduttore', tipo: 'select', obbligatorio: true, opzioni: conduttori.map((c) => ({ valore: c.id, etichetta: c.denominazione })) },
    { nome: 'stato', etichetta: 'Stato', tipo: 'select', opzioni: STATI_CONTRATTO, obbligatorio: true },
    { nome: 'regime_iva', etichetta: 'Canone soggetto a IVA?', tipo: 'select', opzioni: REGIMI_IVA, obbligatorio: true, aiuto: 'Vale per tutte le sezioni: pagamenti, imposta di registro, riepiloghi' },
    { nome: 'iva_percento', etichetta: 'Aliquota IVA (%)', tipo: 'numero', aiuto: 'Solo se soggetto a IVA (di norma 22)' },
    { nome: 'tipologia', etichetta: 'Tipologia contratto', tipo: 'select', opzioni: TIPOLOGIE_CONTRATTO, sezione: 'Durata e scadenze' },
    { nome: 'data_sottoscrizione', etichetta: 'Data sottoscrizione', tipo: 'data' },
    { nome: 'data_decorrenza', etichetta: 'Decorrenza', tipo: 'data' },
    { nome: 'durata_anni', etichetta: 'Durata (anni)', tipo: 'numero' },
    { nome: 'prima_scadenza', etichetta: 'Prima scadenza', tipo: 'data', aiuto: 'Calcolata da decorrenza + durata, modificabile' },
    { nome: 'rinnovo_automatico', etichetta: 'Rinnovo automatico', tipo: 'select', opzioni: SI_NO },
    { nome: 'preavviso_mesi', etichetta: 'Preavviso disdetta (mesi)', tipo: 'numero' },
    { nome: 'data_cessazione', etichetta: 'Data cessazione effettiva', tipo: 'data' },
    { nome: 'motivo_cessazione', etichetta: 'Motivo cessazione', tipo: 'testo' },
    { nome: 'canone_mensile_cent', etichetta: 'Canone mensile', tipo: 'euro', sezione: 'Canone e pagamenti' },
    { nome: 'canone_annuale_cent', etichetta: 'Canone annuale', tipo: 'euro', aiuto: 'Calcolato ×12, modificabile' },
    { nome: 'periodicita', etichetta: 'Periodicità pagamento', tipo: 'select', opzioni: PERIODICITA },
    { nome: 'giorno_scadenza', etichetta: 'Giorno di scadenza pagamento', tipo: 'numero' },
    { nome: 'gestione_incassi', etichetta: 'Incassi gestiti da noi?', tipo: 'select', opzioni: SI_NO, aiuto: 'Se "No", il contratto non compare nella griglia Canoni e incassi' },
    { nome: 'deposito_cent', etichetta: 'Deposito cauzionale / caparra', tipo: 'euro', sezione: 'Deposito cauzionale' },
    { nome: 'deposito_modalita', etichetta: 'Modalità (bonifico, fideiussione…)', tipo: 'testo' },
    { nome: 'deposito_restituito_il', etichetta: 'Restituito il', tipo: 'data' },
    { nome: 'istat_attivo', etichetta: 'Aggiornamento ISTAT', tipo: 'select', opzioni: SI_NO, sezione: 'Aggiornamento ISTAT' },
    { nome: 'istat_percentuale', etichetta: 'Percentuale applicata (75 o 100)', tipo: 'numero' },
    { nome: 'istat_mese', etichetta: 'Mese di riferimento (es. 2026-05)', tipo: 'testo' },
    { nome: 'reg_data', etichetta: 'Data registrazione', tipo: 'data', sezione: 'Registrazione e imposta di registro' },
    { nome: 'reg_ufficio', etichetta: 'Ufficio', tipo: 'testo' },
    { nome: 'reg_codice', etichetta: 'Codice identificativo contratto', tipo: 'testo' },
    { nome: 'reg_modalita', etichetta: 'Modalità', tipo: 'select', opzioni: MODALITA_REGISTRAZIONE },
    { nome: 'reg_imposta_cent', etichetta: 'Imposta prima registrazione', tipo: 'euro' },
    { nome: 'reg_quota_conduttore_cent', etichetta: 'di cui a carico conduttore', tipo: 'euro' },
    { nome: 'imposta_registro_annuale_cent', etichetta: 'Imposta di registro annuale (quota locatore)', tipo: 'euro', aiuto: 'Importo dovuto ogni anno per le annualità successive' },
    { nome: 'note', etichetta: 'Note', tipo: 'textarea' },
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

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Contratti di locazione</h1>
        <Bottone onClick={() => { setTab('dati'); setAperto({ ...VUOTO }) }}><span className="flex items-center gap-1"><Plus size={16} /> Nuovo contratto</span></Bottone>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg border border-gray-300 bg-white p-0.5 text-sm">
          {(['attivi', 'cessati'] as const).map((s) => (
            <button key={s} onClick={() => setScheda(s)} className={`rounded-md px-3 py-1.5 ${scheda === s ? 'text-white' : 'text-gray-600'}`} style={scheda === s ? { background: 'var(--colore-primario)' } : undefined}>
              {s === 'attivi' ? `Attivi (${tutti.filter((c) => c.stato !== 'cessato').length})` : `Cessati (${tutti.filter((c) => c.stato === 'cessato').length})`}
            </button>
          ))}
        </div>
        <BarraRicerca valore={ricerca} onChange={setRicerca} segnaposto="Cerca per società, immobile, conduttore…" />
        <span className="ml-auto text-sm text-gray-500">{righe.length} contratti · canone annuo <strong>{formattaEuro(totaleAnnuo)}</strong></span>
        <Bottone variante="secondario" onClick={() => scaricaExcel(`Contratti_${scheda}`, [{ nome: `Contratti ${scheda}`, righe: righeDaCampi(righe, campi, (c) => ({ 'Società': societaDi(c), 'Immobile': immobile(c.immobile_id)?.indirizzo ?? '', 'Conduttore': conduttore(c.conduttore_id) })) }])}>
          <span className="flex items-center gap-1"><FileSpreadsheet size={16} /> Esporta Excel</span>
        </Bottone>
      </div>
      <div className="mt-4">
        {errore && <Avviso tipo="errore">{errore}</Avviso>}
        {caricamento && !errore ? <Caricamento /> : (
          <Tabella<Contratto> righe={righe} onRiga={(r) => { setTab('dati'); setAperto(r) }} vuoto="Nessun contratto in questo elenco."
            colonne={[
              { chiave: 'soc', etichetta: 'Società', render: (c) => societaDi(c) },
              { chiave: 'imm', etichetta: 'Immobile', render: (c) => <span className="font-medium">{immobile(c.immobile_id)?.indirizzo ?? '—'}</span> },
              { chiave: 'con', etichetta: 'Conduttore', render: (c) => conduttore(c.conduttore_id) },
              { chiave: 'tip', etichetta: 'Tipologia', render: (c) => etichettaDi(TIPOLOGIE_CONTRATTO, c.tipologia) },
              { chiave: 'iva', etichetta: 'IVA', render: (c) => { const s = statoIva(c); return <Etichetta tono={s.tono}>{s.testo}</Etichetta> } },
              { chiave: 'mens', etichetta: 'Canone mensile', allinea: 'dx', render: (c) => formattaEuro(c.canone_mensile_cent) },
              { chiave: 'ann', etichetta: 'Canone annuale', allinea: 'dx', render: (c) => formattaEuro(c.canone_annuale_cent) },
              { chiave: 'dec', etichetta: 'Decorrenza', render: (c) => formattaData(c.data_decorrenza) },
              { chiave: 'scad', etichetta: 'Prima scadenza', render: (c) => formattaData(c.prima_scadenza) },
              { chiave: 'reg', etichetta: 'Imp. registro annua', allinea: 'dx', render: (c) => formattaEuro(c.imposta_registro_annuale_cent) },
              { chiave: 'stato', etichetta: 'Stato', render: (c) => <Etichetta tono={tonoStato(c.stato)}>{etichettaDi(STATI_CONTRATTO, c.stato)}</Etichetta> },
              { chiave: 'az', etichetta: '', render: (c) => <Link to={`/stampa/immobile/${c.immobile_id}`} onClick={(e) => e.stopPropagation()} title="Scheda immobile (stampa / PDF)" className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs hover:bg-gray-50"><Printer size={14} /> Scheda</Link> },
            ]} />
        )}
      </div>
      <Finestra titolo={aperto?.id ? `Contratto — ${descrivi(aperto)}` : 'Nuovo contratto'} aperta={aperto !== null} onChiudi={() => setAperto(null)} larga>
        {aperto && (
          <>
            {aperto.id && (
              <div className="mb-5 flex gap-1 border-b text-sm">
                {([['dati', 'Dati del contratto'], ['registro', 'Registro annuale: ISTAT e imposta di registro'], ['allegati', 'Allegati']] as const).map(([k, t]) => (
                  <button key={k} onClick={() => setTab(k)} className={`-mb-px border-b-2 px-3 py-2 ${tab === k ? 'font-medium' : 'border-transparent text-gray-500 hover:text-gray-800'}`} style={tab === k ? { borderColor: 'var(--colore-primario)', color: 'var(--colore-primario)' } : undefined}>{t}</button>
                ))}
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
