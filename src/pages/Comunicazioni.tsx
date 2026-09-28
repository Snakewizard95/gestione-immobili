/**
 * Documenti e comunicazioni: F24 dell'imposta di registro (con ravvedimento operoso), lettere di aumento ISTAT,
 * calcolatore del ravvedimento con la tabella dei tassi legali, storico dei documenti pagati / inviati.
 */
import { useState } from 'react'
import { FileText, Receipt } from 'lucide-react'
import { FinestraF24, FinestraLetteraIstat, StatoVersamento, useDatiDocumenti } from '../components/Documenti'
import { SoloSeModifica } from '../components/SoloLettura'
import { Avviso, BarraRicerca, Bottone, Caricamento, Copia, Etichetta, IntestazionePagina, Riquadro, Segmentato, Tabella, filtraTesto } from '../components/ui'
import { calcolaRavvedimento, formattaPercentuale, scadenzaVersamento } from '../lib/ravvedimento'
import { useSessioneAttiva } from '../lib/sessione'
import { aggiorna, campiModifica, campiNuovo } from '../lib/store'
import { TIPI_COMUNICAZIONE, etichettaDi, inCedolare, type Annualita, type TassoLegale } from '../lib/tipi'
import { analizzaEuro, formattaData, formattaEuro, oggiIso } from '../lib/utils/formato'

type Scheda = 'f24' | 'istat' | 'calcolo' | 'storico'
type Riga = Annualita & { immobile: string; societa: string; conduttore: string; scadenza: string }

export default function PaginaComunicazioni() {
  const d = useDatiDocumenti()
  const [scheda, setScheda] = useState<Scheda>('f24')
  const [ricerca, setRicerca] = useState('')
  const [mostraTutte, setMostraTutte] = useState<'da_fare' | 'tutte'>('da_fare')
  const [f24, setF24] = useState<string | null>(null)
  const [lettera, setLettera] = useState<string | null>(null)
  const oggi = oggiIso()

  // Annualità con i dati descrittivi (escluse le cedolari secche: niente imposta e niente ISTAT)
  const righe: Riga[] = d.annualita.map((a) => {
    const ctx = d.contesto(a.id)!
    return { ...a, immobile: ctx.immobile?.indirizzo ?? '—', societa: ctx.societa?.ragione_sociale ?? '—', conduttore: ctx.conduttore?.denominazione ?? '—', scadenza: a.data_inizio ? scadenzaVersamento(a.data_inizio) : '' }
  }).filter((r) => !inCedolare(d.contratti.find((c) => c.id === r.contratto_id)))

  const perF24 = filtraTesto(righe.filter((r) => (r.imposta_cent ?? 0) > 0 && r.data_inizio && (mostraTutte === 'tutte' || r.imposta_pagata !== 'si')), ricerca)
    .sort((a, b) => a.scadenza.localeCompare(b.scadenza))
  const perIstat = filtraTesto(righe.filter((r) => r.istat_applicato === 'si' && (mostraTutte === 'tutte' || !r.istat_data_lettera)), ricerca)
    .sort((a, b) => a.data_inizio.localeCompare(b.data_inizio))
  const nF24 = righe.filter((r) => (r.imposta_cent ?? 0) > 0 && r.data_inizio && r.imposta_pagata !== 'si').length
  const nIstat = righe.filter((r) => r.istat_applicato === 'si' && !r.istat_data_lettera).length

  const colImmobile = { chiave: 'imm', etichetta: 'Immobile', render: (r: Riga) => <div><div className="font-medium">{r.immobile}</div><div className="text-xs text-neutro-700">{r.societa}</div></div> }
  const colConduttore = { chiave: 'con', etichetta: 'Conduttore', render: (r: Riga) => r.conduttore }

  return (
    <div>
      <IntestazionePagina kicker="Adempimenti" titolo="Documenti e comunicazioni"
        sottotitolo="F24 dell'imposta di registro con ravvedimento operoso, lettere di aumento ISTAT e testi da inviare ai conduttori, preparati dai dati della piattaforma." />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Segmentato valore={scheda} onChange={setScheda} opzioni={[
          { valore: 'f24', etichetta: `Imposta di registro (F24)${nF24 ? ` · ${nF24}` : ''}` },
          { valore: 'istat', etichetta: `Lettere ISTAT${nIstat ? ` · ${nIstat}` : ''}` },
          { valore: 'calcolo', etichetta: 'Calcolo ravvedimento' },
          { valore: 'storico', etichetta: `Storico (${d.comunicazioni.length})` },
        ]} />
        {(scheda === 'f24' || scheda === 'istat') && <>
          <Segmentato valore={mostraTutte} onChange={setMostraTutte} opzioni={[{ valore: 'da_fare', etichetta: 'Da fare' }, { valore: 'tutte', etichetta: 'Tutte' }]} />
          <BarraRicerca valore={ricerca} onChange={setRicerca} segnaposto="Cerca immobile, conduttore, società…" />
        </>}
      </div>

      {d.errore && <div className="mb-4"><Avviso tipo="errore">{d.errore}</Avviso></div>}
      {d.caricamento && !d.errore ? <Caricamento /> : scheda === 'f24' ? (
        <Tabella<Riga> righe={perF24} onRiga={(r) => setF24(r.id)} vuoto={mostraTutte === 'da_fare' ? 'Nessuna imposta di registro da pagare.' : 'Nessuna annualità con imposta registrata.'} colonne={[
          colImmobile, colConduttore,
          { chiave: 'anno', etichetta: 'Annualità', render: (r) => <span className="num font-titolo text-[17px] font-semibold">{r.anno}</span> },
          { chiave: 'ini', etichetta: 'Inizio', render: (r) => <span className="num">{formattaData(r.data_inizio)}</span> },
          { chiave: 'sca', etichetta: 'Scadenza', render: (r) => <span className="num">{formattaData(r.scadenza)}</span> },
          { chiave: 'imp', etichetta: 'Imposta', allinea: 'dx', render: (r) => <span className="font-medium">{formattaEuro(r.imposta_cent)}</span> },
          { chiave: 'st', etichetta: 'Stato', render: (r) => <StatoVersamento scadenza={r.scadenza} oggi={oggi} pagata={r.imposta_pagata === 'si'} dataPagamento={r.imposta_data_pagamento} /> },
          { chiave: 'az', etichetta: '', render: (r) => <Bottone variante="secondario" piccolo onClick={(e) => { e.stopPropagation(); setF24(r.id) }}><Receipt size={14} /> Prepara F24</Bottone> },
        ]} />
      ) : scheda === 'istat' ? (
        <Tabella<Riga> righe={perIstat} onRiga={(r) => setLettera(r.id)} vuoto={mostraTutte === 'da_fare' ? 'Nessuna lettera ISTAT da inviare.' : 'Nessuna annualità con ISTAT applicato.'} colonne={[
          colImmobile, colConduttore,
          { chiave: 'dal', etichetta: 'Aumento dal', render: (r) => <span className="num">{formattaData(r.data_inizio)}</span> },
          { chiave: 'var', etichetta: 'Variazione', allinea: 'dx', render: (r) => r.istat_indice_percento != null ? `${formattaPercentuale(r.istat_indice_percento)} al ${r.istat_quota_percento ?? 100}%` : '—' },
          { chiave: 'nuovo', etichetta: 'Nuovo canone mensile', allinea: 'dx', render: (r) => <span className="font-medium">{formattaEuro(r.canone_mensile_nuovo_cent)}</span> },
          { chiave: 'let', etichetta: 'Lettera', render: (r) => r.istat_data_lettera ? <Etichetta tono="verde">Inviata · {formattaData(r.istat_data_lettera)}</Etichetta> : <Etichetta tono="giallo">Da inviare</Etichetta> },
          { chiave: 'az', etichetta: '', render: (r) => <Bottone variante="secondario" piccolo onClick={(e) => { e.stopPropagation(); setLettera(r.id) }}><FileText size={14} /> Prepara lettera</Bottone> },
        ]} />
      ) : scheda === 'calcolo' ? (
        <CalcoloRavvedimento righe={righe.filter((r) => (r.imposta_cent ?? 0) > 0 && r.data_inizio)} tassi={d.tassi} tassiSalvati={d.tassiSalvati} onPreparaF24={setF24} />
      ) : (
        <Tabella righe={[...d.comunicazioni].sort((a, b) => b.data.localeCompare(a.data) || b.creato_il.localeCompare(a.creato_il))} vuoto="Nessun documento segnato come pagato o inviato." colonne={[
          { chiave: 'data', etichetta: 'Data', render: (c) => <span className="num whitespace-nowrap">{formattaData(c.data)}</span> },
          { chiave: 'tipo', etichetta: 'Tipo', render: (c) => <Etichetta tono={c.tipo === 'f24' ? 'blu' : 'grigio'}>{etichettaDi(TIPI_COMUNICAZIONE, c.tipo)}</Etichetta> },
          { chiave: 'imm', etichetta: 'Contratto', render: (c) => { const ctx = d.contesto(c.annualita_id); return <div><div className="font-medium">{ctx?.immobile?.indirizzo ?? '—'}</div><div className="text-xs text-neutro-700">{ctx?.conduttore?.denominazione ?? ''}</div></div> } },
          { chiave: 'ogg', etichetta: 'Oggetto', render: (c) => <div><div>{c.oggetto}</div><div className="text-xs text-neutro-700">{c.dettagli}</div></div> },
          { chiave: 'dest', etichetta: 'Destinatario', render: (c) => <span className="text-[13px]">{c.destinatario}</span> },
          { chiave: 'chi', etichetta: 'Chi', render: (c) => c.creato_da },
        ]} />
      )}

      <FinestraF24 annualitaId={f24} onChiudi={() => setF24(null)} />
      <FinestraLetteraIstat annualitaId={lettera} onChiudi={() => setLettera(null)} />
    </div>
  )
}

/* ======================== Calcolatore del ravvedimento ======================== */

function CalcoloRavvedimento({ righe, tassi, tassiSalvati, onPreparaF24 }: { righe: Riga[]; tassi: Record<number, number>; tassiSalvati: TassoLegale[]; onPreparaF24: (id: string) => void }) {
  const [annualitaId, setAnnualitaId] = useState('')
  const [impostaTesto, setImpostaTesto] = useState('')
  const [inizio, setInizio] = useState('')
  const [pagamento, setPagamento] = useState(oggiIso())

  function scegli(id: string) {
    setAnnualitaId(id)
    const r = righe.find((x) => x.id === id)
    if (r) { setImpostaTesto(((r.imposta_cent ?? 0) / 100).toFixed(2).replace('.', ',')); setInizio(r.data_inizio) }
  }
  const imposta = analizzaEuro(impostaTesto)
  const scadenza = inizio ? scadenzaVersamento(inizio) : ''
  const r = imposta && scadenza && pagamento ? calcolaRavvedimento(imposta, scadenza, pagamento, tassi) : null
  const eur = (c: number) => (c / 100).toFixed(2).replace('.', ',')

  return (
    <div className="grid items-start gap-8" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))' }}>
      <Riquadro className="px-[22px] py-5">
        <h4 className="mb-4">Dati del versamento</h4>
        <label className="mb-4 block"><span className="etichetta-campo">Annualità registrata (facoltativo: compila i campi da sola)</span>
          <select className="input" value={annualitaId} onChange={(e) => scegli(e.target.value)}>
            <option value="">— inserimento a mano —</option>
            {righe.map((x) => <option key={x.id} value={x.id}>{x.immobile} · {x.conduttore} · {x.anno}{x.imposta_pagata === 'si' ? ' (pagata)' : ''}</option>)}
          </select>
        </label>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block"><span className="etichetta-campo">Imposta dovuta</span>
            <input className="input num text-right" inputMode="decimal" value={impostaTesto} placeholder="0,00" onChange={(e) => { setImpostaTesto(e.target.value); setAnnualitaId('') }} />
          </label>
          <label className="block"><span className="etichetta-campo">Inizio annualità</span>
            <input type="date" className="input" value={inizio} onChange={(e) => { setInizio(e.target.value); setAnnualitaId('') }} />
          </label>
          <label className="block"><span className="etichetta-campo">Data di pagamento</span>
            <input type="date" className="input" value={pagamento} onChange={(e) => setPagamento(e.target.value || oggiIso())} />
          </label>
        </div>
        <p className="mt-3 text-xs text-neutro-700">La scadenza è 30 giorni dopo l'inizio dell'annualità (anniversario della decorrenza); se cade di sabato, domenica o in un festivo slitta al primo giorno lavorativo. Vale per le annualità successive, non per la prima registrazione del contratto.</p>
      </Riquadro>

      <Riquadro className="px-[22px] py-5">
        <h4 className="mb-4">Risultato</h4>
        {!r ? <p className="text-neutro-700">Inserisci imposta e inizio annualità, oppure scegli un'annualità registrata.</p> : (
          <>
            <dl className="mb-4 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm">
              <dt className="text-neutro-700">Scadenza del versamento</dt><dd className="num">{formattaData(r.scadenza)}</dd>
              <dt className="text-neutro-700">Giorni di ritardo</dt><dd className="num">{r.giorniRitardo}</dd>
              <dt className="text-neutro-700">Anno di riferimento F24</dt><dd className="num">{r.annoRiferimento}</dd>
            </dl>
            {r.giorniRitardo > 0 && <p className="mb-4 text-[13px] text-neutro-700">{r.fascia.descrizione}: sanzione del {formattaPercentuale(r.fascia.percentuale)} dell'imposta.</p>}
            {r.tassiMancanti.length > 0 && <div className="mb-4"><Avviso tipo="errore">Manca il tasso legale per l'anno {r.tassiMancanti.join(', ')}: aggiungilo nella tabella qui sotto. Gli interessi non sono calcolabili.</Avviso></div>}
            <table className="tabella mb-3 !text-[13px]">
              <thead><tr><th>Codice</th><th>Voce</th><th className="text-right">Importo</th><th /></tr></thead>
              <tbody>
                <tr><td><strong>1501</strong></td><td>Imposta di registro</td><td className="num text-right">{formattaEuro(r.imposta_cent)}</td><td><Copia testo={eur(r.imposta_cent)} /></td></tr>
                <tr><td><strong>1509</strong></td><td>Sanzione da ravvedimento</td><td className="num text-right">{formattaEuro(r.sanzione_cent)}</td><td><Copia testo={eur(r.sanzione_cent)} /></td></tr>
                <tr><td><strong>1510</strong></td><td>Interessi da ravvedimento{r.dettaglioInteressi.length > 0 && <div className="text-xs text-neutro-700">{r.dettaglioInteressi.map((q) => `${q.anno}: ${q.giorni} gg × ${formattaPercentuale(q.tasso)} = ${formattaEuro(q.interessi_cent)}`).join(' · ')}</div>}</td><td className="num text-right">{formattaEuro(r.interessi_cent)}</td><td><Copia testo={eur(r.interessi_cent)} /></td></tr>
                <tr className="totale"><td colSpan={2}>Totale da versare</td><td className="num text-right">{formattaEuro(r.totale_cent)}</td><td><Copia testo={eur(r.totale_cent)} /></td></tr>
              </tbody>
            </table>
            <p className="mb-4 text-xs text-neutro-700">Calcolo indicativo: verificare con il commercialista prima del pagamento.</p>
            {annualitaId && <Bottone onClick={() => onPreparaF24(annualitaId)}><Receipt size={16} /> Prepara F24 di questa annualità</Bottone>}
          </>
        )}
      </Riquadro>

      <TabellaTassi tassi={tassi} salvati={tassiSalvati} />
    </div>
  )
}

/** Tassi legali per anno: quelli noti sono già inseriti; chi può modificare aggiunge o corregge un anno. */
function TabellaTassi({ tassi, salvati }: { tassi: Record<number, number>; salvati: TassoLegale[] }) {
  const { token, nome } = useSessioneAttiva()
  const [anno, setAnno] = useState(String(new Date().getFullYear() + 1))
  const [tasso, setTasso] = useState('')
  const [errore, setErrore] = useState<string | null>(null)
  const [inCorso, setInCorso] = useState(false)
  const anni = Object.keys(tassi).map(Number).sort((a, b) => b - a)
  const annoCorrente = new Date().getFullYear()

  async function salva() {
    const a = Number(anno), t = Number(tasso.replace(',', '.'))
    if (!Number.isInteger(a) || a < 2000 || a > 2100) { setErrore('Anno non valido.'); return }
    if (!Number.isFinite(t) || t < 0 || t > 20 || tasso.trim() === '') { setErrore('Tasso non valido: scrivilo in percentuale, es. 1,6'); return }
    setErrore(null); setInCorso(true)
    try {
      await aggiorna<TassoLegale>(token, 'tassi_legali', (rec) => {
        const esistente = rec.find((x) => x.anno === a && !x.eliminato_il)
        return esistente ? rec.map((x) => (x === esistente ? { ...x, tasso_percento: t, ...campiModifica(nome) } : x)) : [...rec, { ...campiNuovo(nome), anno: a, tasso_percento: t } as TassoLegale]
      }, `${nome}: tasso legale ${a} = ${String(t).replace('.', ',')}%`)
      setTasso('')
    } catch (e) { setErrore((e as Error).message) } finally { setInCorso(false) }
  }

  return (
    <Riquadro className="px-[22px] py-5">
      <h4 className="mb-2">Tassi d'interesse legale</h4>
      <p className="mb-4 text-[13px] text-neutro-700">Usati per gli interessi (codice 1510). Il tasso di ogni anno è fissato con decreto del Ministero dell'Economia entro il 15 dicembre dell'anno precedente: a gennaio aggiungi quello nuovo.</p>
      {tassi[annoCorrente] === undefined && <div className="mb-4"><Avviso tipo="attenzione">Manca il tasso legale del {annoCorrente}.</Avviso></div>}
      <table className="tabella mb-4 !text-[13px]">
        <thead><tr><th>Anno</th><th className="text-right">Tasso</th><th>Origine</th></tr></thead>
        <tbody>{anni.map((a) => (
          <tr key={a}><td className="num">{a}</td><td className="num text-right font-medium">{formattaPercentuale(tassi[a])}</td>
            <td className="text-xs text-neutro-700">{salvati.some((x) => x.anno === a) ? 'inserito nell’app' : 'valore di partenza'}</td></tr>
        ))}</tbody>
      </table>
      <SoloSeModifica>
        <div className="flex flex-wrap items-end gap-3">
          <label className="block"><span className="etichetta-campo">Anno</span><input className="input num w-24" inputMode="numeric" value={anno} onChange={(e) => setAnno(e.target.value)} /></label>
          <label className="block"><span className="etichetta-campo">Tasso %</span><input className="input num w-24 text-right" inputMode="decimal" value={tasso} placeholder="1,6" onChange={(e) => setTasso(e.target.value)} /></label>
          <Bottone disabled={inCorso} onClick={salva}>{inCorso ? 'Salvataggio…' : 'Salva tasso'}</Bottone>
        </div>
        {errore && <div className="mt-3"><Avviso tipo="errore">{errore}</Avviso></div>}
      </SoloSeModifica>
    </Riquadro>
  )
}
