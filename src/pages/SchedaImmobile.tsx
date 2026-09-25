/**
 * Scheda stampabile di un immobile (da salvare in PDF con "Stampa → Salva come PDF").
 * Contiene: dati immobile e società, condominio/amministratore, contratto attivo, registro ISTAT/imposta,
 * canoni dell'anno con insoluti, situazione condominiale, piani di rientro, contratti cessati, allegati.
 */
import { Fragment, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Printer } from 'lucide-react'
import { Bottone, Caricamento } from '../components/ui'
import logo from '../assets/logo-gruppo.png'
import { canoneMensilePer, canoneScaduto, descriviCanone, totaliAnnoContratto } from '../lib/canone'
import { attivi } from '../lib/store'
import {
  A_CARICO, MODALITA_REGISTRAZIONE, PERIODICITA, STATI_PIANO, TIPI_VOCE_CONDOMINIO, TIPOLOGIE_CONTRATTO, TIPOLOGIE_IMMOBILE, etichettaDi, statoIva,
  type Allegato, type Annualita, type Condominio, type Conduttore, type Contratto, type Immobile, type Movimento, type PianoRientro, type Societa, type VoceCondominiale,
} from '../lib/tipi'
import { useCollezioni } from '../lib/useCollezioni'
import { formattaData, formattaDataOra, formattaEuro } from '../lib/utils/formato'

const MESI = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic']

function Sezione({ titolo, children, compatta }: { titolo: string; children: React.ReactNode; compatta?: boolean }) {
  return (
    <section className={compatta ? 'py-1' : 'mt-6 border-t border-divisore pt-4'}>
      <div className="mb-2 text-[10px] uppercase tracking-[0.14em] text-accento-700">{titolo}</div>
      {children}
    </section>
  )
}
/** Elenco etichetta/valore compatto: salta i valori vuoti così le mini sezioni restano corte. */
function Campi({ voci, colonne = 1 }: { voci: Array<[string, React.ReactNode]>; colonne?: 1 | 2 }) {
  const pieni = voci.filter(([, v]) => v !== undefined && v !== '' && v !== null)
  return (
    <dl className={`grid gap-x-3 gap-y-0.5 text-xs ${colonne === 2 ? 'grid-cols-[max-content_1fr_max-content_1fr]' : 'grid-cols-[max-content_1fr]'}`}>
      {pieni.map(([k, v]) => (<Fragment key={k}><dt className="text-neutro-700">{k}</dt><dd className="font-medium">{v}</dd></Fragment>))}
      {pieni.length === 0 && <dd className="text-neutro-500">Nessun dato inserito.</dd>}
    </dl>
  )
}
function Tab({ intestazioni, righe, dx }: { intestazioni: string[]; righe: React.ReactNode[][]; dx?: number[] }) {
  if (righe.length === 0) return <p className="text-sm text-neutro-700">Nessun dato.</p>
  return (
    <table className="w-full border-collapse text-[12.5px]">
      <thead><tr className="border-b border-divisore text-left text-[10px] uppercase tracking-[0.08em] text-attenuato">{intestazioni.map((h, i) => <th key={h} className={`px-2 py-1.5 font-medium ${dx?.includes(i) ? 'text-right' : ''}`}>{h}</th>)}</tr></thead>
      <tbody>{righe.map((r, i) => <tr key={i} className="border-b border-riga last:border-0">{r.map((c, j) => <td key={j} className={`px-2 py-1.5 ${dx?.includes(j) ? 'text-right tabular-nums' : ''}`}>{c}</td>)}</tr>)}</tbody>
    </table>
  )
}

export default function SchedaImmobile() {
  const { id } = useParams()
  const { dati, caricamento } = useCollezioni(['immobili', 'societa', 'condomini', 'contratti', 'conduttori', 'annualita', 'movimenti', 'voci_condominiali', 'piani_rientro', 'allegati'])
  const [anno, setAnno] = useState(new Date().getFullYear())
  const oggi = new Date().toISOString().slice(0, 10)

  const imm = attivi(dati<Immobile>('immobili')).find((i) => i.id === id)
  if (caricamento && !imm) return <div className="p-10"><Caricamento /></div>
  if (!imm) return <div className="p-10">Immobile non trovato. <Link to="/immobili" className="underline">Torna agli immobili</Link></div>

  const soc = attivi(dati<Societa>('societa')).find((s) => s.id === imm.societa_id)
  const cond = attivi(dati<Condominio>('condomini')).find((c) => c.id === imm.condominio_id)
  const conduttori = attivi(dati<Conduttore>('conduttori'))
  const contratti = attivi(dati<Contratto>('contratti')).filter((c) => c.immobile_id === imm.id)
  const attivo = contratti.find((c) => c.stato !== 'cessato')
  const cessati = contratti.filter((c) => c.stato === 'cessato')
  const annualita = attivi(dati<Annualita>('annualita'))
  const annAttivo = attivo ? annualita.filter((a) => a.contratto_id === attivo.id).sort((a, b) => a.anno - b.anno) : []
  const movimenti = attivi(dati<Movimento>('movimenti')).filter((m) => contratti.some((c) => c.id === m.contratto_id))
  const canoniAnno = movimenti.filter((m) => m.tipo === 'canone' && m.competenza.startsWith(String(anno)))
  const altriMov = movimenti.filter((m) => m.tipo !== 'canone' && m.competenza.startsWith(String(anno)))
  const voci = attivi(dati<VoceCondominiale>('voci_condominiali')).filter((v) => v.immobile_id === imm.id).sort((a, b) => (b.scadenza || '').localeCompare(a.scadenza || ''))
  const piani = attivi(dati<PianoRientro>('piani_rientro')).filter((p) => p.immobile_id === imm.id)
  const allegati = attivi(dati<Allegato>('allegati')).filter((a) => a.record_id === imm.id || contratti.some((c) => c.id === a.record_id) || annAttivo.some((x) => x.id === a.record_id) || voci.some((v) => v.id === a.record_id) || piani.some((p) => p.id === a.record_id))
  const cond_ = (cid: string) => conduttori.find((k) => k.id === cid)
  const somma = (xs: Array<number | null | undefined>) => xs.reduce<number>((s, n) => s + (n ?? 0), 0)

  const totAnno = attivo ? totaliAnnoContratto(attivo, annualita, movimenti, anno, oggi) : { dovuto: 0, incassato: 0, mesiNonIncassati: [] as string[] }
  const dovutoAnno = totAnno.dovuto
  const incassatoAnno = totAnno.incassato
  const insolutiMesi = totAnno.mesiNonIncassati
  const vociNonPagate = voci.filter((v) => v.pagata !== 'si')
  const scaduto = somma(vociNonPagate.filter((v) => !v.in_piano_id && v.scadenza && v.scadenza < oggi).map((v) => v.importo_cent))
  const daRiaddebitare = somma(voci.filter((v) => (v.quota_conduttore_cent ?? 0) > 0 && v.riaddebitata !== 'si').map((v) => v.quota_conduttore_cent))
  const impostaNonPagata = annAttivo.filter((a) => a.imposta_pagata !== 'si')
  const rimborsiMancanti = annAttivo.filter((a) => a.rimborso_ricevuto !== 'si' && (a.quota_conduttore_cent ?? 0) > 0)

  return (
    <div className="min-h-screen bg-sfondo print:bg-white">
      <div className="no-stampa sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-divisore bg-sfondo px-6 py-3">
        <Link to="/immobili" className="btn btn-ghost no-underline"><ArrowLeft size={16} /> Torna agli immobili</Link>
        <span className="ml-auto text-[13px] text-neutro-700">Anno canoni:</span>
        <select value={anno} onChange={(e) => setAnno(Number(e.target.value))} className="input w-24">{[anno - 2, anno - 1, anno, anno + 1].map((a) => <option key={a} value={a}>{a}</option>)}</select>
        <Bottone onClick={() => window.print()}><Printer size={16} /> Stampa / salva PDF</Bottone>
      </div>

      <div className="pagina-stampa ombra-md mx-auto my-8 max-w-[794px] bg-white px-6 py-10 text-sm md:px-[60px] md:py-14 print:my-0">
        <header className="flex items-start justify-between gap-6 border-b-2 border-testo pb-5">
          <div className="min-w-0">
            <div className="kicker">Scheda immobile · {soc?.ragione_sociale ?? '—'}</div>
            <h1 className="mt-1 text-[36px]">{imm.indirizzo}</h1>
            <div className="mt-1 text-sm text-neutro-700">{[[imm.comune, imm.provincia].filter(Boolean).join(' '), etichettaDi(TIPOLOGIE_IMMOBILE, imm.tipologia), imm.superficie_mq ? `${imm.superficie_mq} mq` : ''].filter(Boolean).join(' · ')}</div>
          </div>
          <div className="flex-none text-right text-xs text-neutro-700">
            <img src={logo} alt="Gruppo CEC Bigoli" className="mb-2 ml-auto h-11 w-[170px] object-cover" />
            Stampata il {formattaDataOra(new Date().toISOString())}
          </div>
        </header>

        {/* Riquadro situazione */}
        <div className="mt-5 grid gap-2 text-xs sm:grid-cols-4">
          {[
            ['Canoni ' + anno, `${formattaEuro(incassatoAnno)} su ${formattaEuro(dovutoAnno)}`, insolutiMesi.length ? `${insolutiMesi.length} mesi non incassati` : 'in regola', insolutiMesi.length > 0],
            ['Imposta di registro', impostaNonPagata.length ? `${impostaNonPagata.length} annualità non pagate` : 'in regola', rimborsiMancanti.length ? `${rimborsiMancanti.length} rimborsi 50% da incassare` : '', impostaNonPagata.length > 0],
            ['Condominio', vociNonPagate.length ? `${formattaEuro(somma(vociNonPagate.map((v) => v.importo_cent)))} da pagare` : 'in regola', scaduto > 0 ? `di cui scaduto ${formattaEuro(scaduto)}` : '', scaduto > 0],
            ['Da incassare dal conduttore', formattaEuro(daRiaddebitare + somma(rimborsiMancanti.map((a) => a.quota_conduttore_cent))), 'spese condominiali + imposta di registro', false],
          ].map(([t, v, s, critico]) => (
            <div key={t as string} className={`border p-2.5 ${critico ? 'border-err-bordo bg-err-fondo' : 'border-divisore'}`}>
              <div className="text-[10px] uppercase text-neutro-700">{t}</div><div className="font-semibold">{v}</div><div className={`text-[11px] ${critico ? 'text-err-testo' : 'text-neutro-700'}`}>{s}</div>
            </div>
          ))}
        </div>

        <div className="mt-6 grid gap-5 border-t border-divisore pt-4 md:grid-cols-2 md:[&>section:nth-child(2)]:border-l md:[&>section:nth-child(2)]:border-divisore md:[&>section:nth-child(2)]:pl-5 md:[&>section:nth-child(3)]:col-span-2 md:[&>section:nth-child(3)]:border-t md:[&>section:nth-child(3)]:border-divisore md:[&>section:nth-child(3)]:pt-4">
        <Sezione titolo="Immobile" compatta>
          <Campi voci={[['Società proprietaria', soc?.ragione_sociale], ['P. IVA / CF', soc?.partita_iva || soc?.codice_fiscale], ['Indirizzo', imm.indirizzo], ['Comune', [imm.comune, imm.provincia].filter(Boolean).join(' ')],
            ['Tipologia', etichettaDi(TIPOLOGIE_IMMOBILE, imm.tipologia)], ['Superficie', imm.superficie_mq ? `${imm.superficie_mq} mq` : ''], ['Catasto', [imm.foglio && `Fg. ${imm.foglio}`, imm.particella && `Part. ${imm.particella}`, imm.subalterno && `Sub. ${imm.subalterno}`, imm.categoria && `Cat. ${imm.categoria}`].filter(Boolean).join(' · ')], ['Rendita', imm.rendita_cent ? formattaEuro(imm.rendita_cent) : ''],
            ['Stato', imm.stato === 'locato' ? 'Locato' : imm.stato === 'libero' ? 'Libero' : 'Non locabile'], ['Note', imm.note]]} />
        </Sezione>

        <Sezione titolo="Condominio e amministratore" compatta>
          {cond ? <Campi voci={[['Condominio', cond.denominazione], ['CF condominio', cond.codice_fiscale], ['Indirizzo', cond.indirizzo], ['Millesimi', imm.millesimi ?? ''], ['Amministratore', cond.amministratore_nome], ['Telefono', cond.amministratore_telefono], ['Email', cond.amministratore_email], ['PEC', cond.amministratore_pec], ['IBAN', cond.iban ? <span className="font-mono">{cond.iban}</span> : ''], ['Intestatario', cond.iban_intestatario]]} /> : <p className="text-xs text-neutro-700">Immobile non collegato a un condominio.</p>}
        </Sezione>

        <Sezione titolo={attivo ? 'Contratto in essere' : 'Contratto di locazione'} compatta>
          {attivo ? (() => { const k = cond_(attivo.conduttore_id); const iva = statoIva(attivo); const kmese = canoneMensilePer(attivo, annualita, oggi.slice(0, 7)); return (
            <Campi voci={[['Conduttore', k?.denominazione], ['CF / P. IVA', k?.codice_fiscale || k?.partita_iva], ['Contatti', [k?.telefono, k?.email, k?.pec].filter(Boolean).join(' · ')], ['Stato', attivo.stato === 'in_disdetta' ? 'In disdetta' : 'Attivo'],
              ['Tipologia', etichettaDi(TIPOLOGIE_CONTRATTO, attivo.tipologia)], ['IVA', iva.testo], ['Sottoscrizione', formattaData(attivo.data_sottoscrizione)], ['Decorrenza', formattaData(attivo.data_decorrenza)],
              ['Durata', attivo.durata_anni ? `${attivo.durata_anni} anni` : ''], ['Prima scadenza', formattaData(attivo.prima_scadenza)], ['Rinnovo automatico', attivo.rinnovo_automatico === 'si' ? 'Sì' : 'No'], ['Preavviso disdetta', attivo.preavviso_mesi ? `${attivo.preavviso_mesi} mesi` : ''],
              ['Canone mensile attuale', descriviCanone(kmese, formattaEuro)], ['Canone annuo', formattaEuro(attivo.canone_annuale_cent)], ['Periodicità', etichettaDi(PERIODICITA, attivo.periodicita)], ['Giorno scadenza', attivo.giorno_scadenza ?? ''],
              ['Deposito cauzionale', attivo.deposito_cent ? `${formattaEuro(attivo.deposito_cent)}${attivo.deposito_modalita ? ' (' + attivo.deposito_modalita + ')' : ''}` : ''], ['Deposito restituito il', formattaData(attivo.deposito_restituito_il)],
              ['ISTAT', attivo.istat_attivo === 'si' ? `Sì, ${attivo.istat_percentuale ?? 75}%` : 'No'], ['Incassi gestiti da noi', attivo.gestione_incassi === 'no' ? 'No' : 'Sì'],
              ['Registrazione', [attivo.reg_data && formattaData(attivo.reg_data), attivo.reg_ufficio, attivo.reg_modalita && etichettaDi(MODALITA_REGISTRAZIONE, attivo.reg_modalita)].filter(Boolean).join(' · ')], ['Codice identificativo', attivo.reg_codice],
              ['Imposta prima registrazione', attivo.reg_imposta_cent ? `${formattaEuro(attivo.reg_imposta_cent)}${attivo.reg_quota_conduttore_cent ? ' (conduttore ' + formattaEuro(attivo.reg_quota_conduttore_cent) + ')' : ''}` : ''], ['Note', attivo.note]]} colonne={2} />
          ) })() : <p className="text-xs text-neutro-700">Nessun contratto attivo: immobile {imm.stato === 'libero' ? 'libero' : 'senza contratto registrato'}.</p>}
        </Sezione>
        </div>

        {attivo && (
          <Sezione titolo="Registro annuale: ISTAT e imposta di registro">
            <Tab intestazioni={['Anno', 'Inizio', 'ISTAT', 'Mensile prima', 'Mensile dopo', 'Imposta', 'Pagata', 'Rimborso 50%']} dx={[3, 4, 5]}
              righe={annAttivo.map((a) => [a.anno, formattaData(a.data_inizio), a.istat_applicato === 'si' && a.istat_indice_percento != null ? `${String(a.istat_indice_percento).replace('.', ',')}% (${a.istat_quota_percento ?? 100}%)` : '—', formattaEuro(a.canone_mensile_precedente_cent), formattaEuro(a.canone_mensile_nuovo_cent), formattaEuro(a.imposta_cent), a.imposta_pagata === 'si' ? `Sì ${formattaData(a.imposta_data_pagamento)}` : <span className="font-medium text-err-testo">No</span>, a.rimborso_ricevuto === 'si' ? `${formattaEuro(a.quota_conduttore_cent)} il ${formattaData(a.rimborso_data)}` : <span className="text-att-testo">da incassare {formattaEuro(a.quota_conduttore_cent)}</span>])} />
          </Sezione>
        )}

        <Sezione titolo={`Canoni ${anno}`}>
          {attivo ? (
            <>
              {(() => {
                const celle = MESI.map((nomeMese, i) => {
                  const mese = `${anno}-${String(i + 1).padStart(2, '0')}`
                  const m = canoniAnno.find((x) => x.contratto_id === attivo.id && x.competenza === mese)
                  const fuori = (attivo.data_decorrenza && mese < attivo.data_decorrenza.slice(0, 7)) || (attivo.data_cessazione && mese > attivo.data_cessazione.slice(0, 7))
                  const futuro = mese > oggi.slice(0, 7)
                  const atteso = fuori ? null : canoneMensilePer(attivo, annualita, mese).totale_cent
                  const scaduto = canoneScaduto(attivo, mese, oggi)
                  const tono = m ? (m.stato === 'incassato' ? 'bg-ok-fondo text-ok-testo' : m.stato === 'parziale' ? 'bg-att-fondo text-att-testo' : m.stato === 'stornato' ? 'bg-neutro-200 text-neutro-500' : scaduto ? 'bg-err-fondo text-err-testo' : 'text-neutro-700') : fuori ? 'text-neutro-500' : futuro || !scaduto ? 'text-neutro-500' : 'bg-err-fondo text-err-testo'
                  return { nomeMese, m, atteso, fuori, tono }
                })
                const c = (n: number | null | undefined) => (n == null ? '' : formattaEuro(n).replace(/\s?€/, ''))
                return (
                  <table className="w-full table-fixed text-center text-[10.5px] tabular-nums">
                    <thead><tr className="border-b border-divisore text-[10px] uppercase tracking-[0.08em] text-attenuato"><th className="w-20 px-1 py-1 text-left font-semibold">Mese</th>{celle.map((x) => <th key={x.nomeMese} className="px-1 py-1 font-semibold">{x.nomeMese}</th>)}</tr></thead>
                    <tbody>
                      <tr className="border-t border-riga"><td className="px-1 py-1 text-left text-neutro-700">Dovuto</td>{celle.map((x) => <td key={x.nomeMese} className="px-1 py-1 text-neutro-700">{x.fuori ? '' : c(x.m && x.m.stato !== 'stornato' ? x.m.dovuto_cent : x.atteso)}</td>)}</tr>
                      <tr className="border-t border-riga"><td className="px-1 py-1 text-left text-neutro-700">Incassato</td>{celle.map((x) => <td key={x.nomeMese} className={`px-1 py-1 font-medium ${x.tono}`}>{x.fuori ? '' : x.m ? (x.m.stato === 'stornato' ? 'stornato' : c(x.m.incassato_cent ?? 0)) : (x.atteso != null && x.tono.includes('err') ? '0' : '')}</td>)}</tr>
                      <tr className="border-t border-riga"><td className="px-1 py-1 text-left text-neutro-700">Fattura</td>{celle.map((x) => <td key={x.nomeMese} className="px-1 py-1 text-neutro-700">{x.m?.numero_fattura || ''}</td>)}</tr>
                    </tbody>
                  </table>
                )
              })()}
              <p className="mt-1 text-xs">Dovuto {formattaEuro(dovutoAnno)} · incassato <strong>{formattaEuro(incassatoAnno)}</strong>{insolutiMesi.length > 0 && <> · <span className="font-medium text-err-testo">non incassati: {insolutiMesi.map((m) => MESI[Number(m.slice(5)) - 1]).join(', ')}</span></>}</p>
              {altriMov.length > 0 && <div className="mt-3"><div className="mb-1 text-[10px] uppercase tracking-[0.14em] text-accento-700">Altri movimenti {anno}</div><Tab intestazioni={['Data', 'Tipo', 'Descrizione', 'Dovuto', 'Incassato', 'Stato']} dx={[3, 4]} righe={altriMov.map((m) => [formattaData(m.competenza), m.tipo, m.descrizione, formattaEuro(m.dovuto_cent), formattaEuro(m.incassato_cent), m.stato])} /></div>}
            </>
          ) : <p className="text-xs text-neutro-700">Nessun contratto attivo.</p>}
        </Sezione>

        <Sezione titolo="Situazione condominiale">
          {voci.length === 0 ? <p className="text-sm text-neutro-700">Nessuna voce registrata.</p> : (
            <>
              <p className="mb-1 text-xs">Totale voci {formattaEuro(somma(voci.map((v) => v.importo_cent)))} · pagato {formattaEuro(somma(voci.filter((v) => v.pagata === 'si').map((v) => v.importo_cent)))} · <span className={vociNonPagate.length ? 'font-medium text-err-testo' : ''}>da pagare {formattaEuro(somma(vociNonPagate.map((v) => v.importo_cent)))}</span>{scaduto > 0 && <> (scaduto {formattaEuro(scaduto)})</>} · da incassare dal conduttore {formattaEuro(daRiaddebitare)}</p>
              <Tab intestazioni={['Esercizio', 'Tipo', 'Descrizione', 'Scadenza', 'Importo', 'A carico', 'Pagata', 'Quota conduttore']} dx={[4]}
                righe={voci.slice(0, 25).map((v) => [v.esercizio, etichettaDi(TIPI_VOCE_CONDOMINIO, v.tipo), `${v.descrizione}${v.in_piano_id ? ' (in piano di rientro)' : ''}`, <span className={v.pagata !== 'si' && v.scadenza < oggi ? 'font-medium text-err-testo' : ''}>{formattaData(v.scadenza)}</span>, formattaEuro(v.importo_cent), etichettaDi(A_CARICO, v.a_carico).split(' (')[0], v.pagata === 'si' ? `Sì ${formattaData(v.data_pagamento)}` : <span className="font-medium text-err-testo">No</span>, (v.quota_conduttore_cent ?? 0) > 0 ? `${formattaEuro(v.quota_conduttore_cent)} ${v.riaddebitata === 'si' ? 'incassata' : 'da incassare'}` : '—'])} />
              {voci.length > 25 && <p className="mt-1 text-xs text-neutro-700">Mostrate le 25 voci più recenti su {voci.length}.</p>}
            </>
          )}
          {piani.length > 0 && <div className="mt-3"><div className="mb-1 text-[10px] uppercase tracking-[0.14em] text-accento-700">Piani di rientro</div><Tab intestazioni={['Stato', 'Accordo del', 'Descrizione', 'Totale', 'Rate', 'Prima scadenza']} dx={[3]} righe={piani.map((p) => [etichettaDi(STATI_PIANO, p.stato), formattaData(p.data_accordo), p.descrizione, formattaEuro(p.importo_totale_cent), `${p.numero_rate ?? ''} da ${formattaEuro(p.importo_rata_cent)}`, formattaData(p.prima_scadenza)])} /></div>}
        </Sezione>

        {cessati.length > 0 && (
          <Sezione titolo="Contratti cessati">
            <Tab intestazioni={['Conduttore', 'Tipologia', 'Decorrenza', 'Cessazione', 'Canone mensile', 'Motivo']} dx={[4]} righe={cessati.map((c) => [cond_(c.conduttore_id)?.denominazione ?? '—', etichettaDi(TIPOLOGIE_CONTRATTO, c.tipologia), formattaData(c.data_decorrenza), formattaData(c.data_cessazione), formattaEuro(c.canone_mensile_cent), c.motivo_cessazione])} />
          </Sezione>
        )}

        <Sezione titolo="Documenti archiviati">
          {allegati.length === 0 ? <p className="text-xs text-neutro-700">Nessun allegato.</p> : <p className="text-xs">{allegati.length} documenti: {Object.entries(allegati.reduce<Record<string, number>>((acc, a) => ({ ...acc, [a.categoria]: (acc[a.categoria] ?? 0) + 1 }), {})).map(([k, n]) => `${k} (${n})`).join(', ')}. Consultabili nella piattaforma.</p>}
        </Sezione>

        <footer className="mt-8 border-t border-divisore pt-3 text-[10px] text-neutro-600">Gestione Immobili · scheda generata automaticamente dai dati inseriti dai collaboratori · {formattaDataOra(new Date().toISOString())}</footer>
      </div>
    </div>
  )
}
