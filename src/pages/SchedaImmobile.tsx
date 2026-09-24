/**
 * Scheda stampabile di un immobile (da salvare in PDF con "Stampa → Salva come PDF").
 * Contiene: dati immobile e società, condominio/amministratore, contratto attivo, registro ISTAT/imposta,
 * canoni dell'anno con insoluti, situazione condominiale, piani di rientro, contratti cessati, allegati.
 */
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Printer } from 'lucide-react'
import { Bottone, Caricamento } from '../components/ui'
import { canoneMensilePer, descriviCanone } from '../lib/canone'
import { attivi } from '../lib/store'
import {
  A_CARICO, MODALITA_REGISTRAZIONE, PERIODICITA, STATI_PIANO, TIPI_VOCE_CONDOMINIO, TIPOLOGIE_CONTRATTO, TIPOLOGIE_IMMOBILE, etichettaDi, statoIva,
  type Allegato, type Annualita, type Condominio, type Conduttore, type Contratto, type Immobile, type Movimento, type PianoRientro, type Societa, type VoceCondominiale,
} from '../lib/tipi'
import { useCollezioni } from '../lib/useCollezioni'
import { formattaData, formattaDataOra, formattaEuro } from '../lib/utils/formato'

const MESI = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic']

function Sezione({ titolo, children }: { titolo: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="mb-2 border-b-2 pb-1 text-base font-semibold uppercase tracking-wide" style={{ borderColor: 'var(--colore-primario)', color: 'var(--colore-primario)' }}>{titolo}</h2>
      {children}
    </section>
  )
}
function Campi({ voci }: { voci: Array<[string, React.ReactNode]> }) {
  return (
    <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm sm:grid-cols-[max-content_1fr_max-content_1fr]">
      {voci.filter(([, v]) => v !== undefined).map(([k, v]) => (<><dt key={k + 'k'} className="text-gray-500">{k}</dt><dd key={k + 'v'} className="font-medium">{v === '' || v === null ? '—' : v}</dd></>))}
    </dl>
  )
}
function Tab({ intestazioni, righe, dx }: { intestazioni: string[]; righe: React.ReactNode[][]; dx?: number[] }) {
  if (righe.length === 0) return <p className="text-sm text-gray-500">Nessun dato.</p>
  return (
    <table className="w-full text-sm">
      <thead><tr className="border-b bg-gray-50 text-left text-xs uppercase text-gray-500">{intestazioni.map((h, i) => <th key={h} className={`px-2 py-1.5 font-semibold ${dx?.includes(i) ? 'text-right' : ''}`}>{h}</th>)}</tr></thead>
      <tbody>{righe.map((r, i) => <tr key={i} className="border-b last:border-0">{r.map((c, j) => <td key={j} className={`px-2 py-1.5 ${dx?.includes(j) ? 'text-right tabular-nums' : ''}`}>{c}</td>)}</tr>)}</tbody>
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

  const dovutoAnno = somma(canoniAnno.filter((m) => m.stato !== 'stornato').map((m) => m.dovuto_cent))
  const incassatoAnno = somma(canoniAnno.map((m) => m.incassato_cent))
  const insolutiMesi = attivo ? MESI.map((_, i) => `${anno}-${String(i + 1).padStart(2, '0')}`).filter((mese) => mese <= oggi.slice(0, 7) && (!attivo.data_decorrenza || mese >= attivo.data_decorrenza.slice(0, 7))).filter((mese) => { const m = canoniAnno.find((x) => x.contratto_id === attivo.id && x.competenza === mese); return !m || m.stato === 'da_incassare' || m.stato === 'parziale' }) : []
  const vociNonPagate = voci.filter((v) => v.pagata !== 'si')
  const scaduto = somma(vociNonPagate.filter((v) => !v.in_piano_id && v.scadenza && v.scadenza < oggi).map((v) => v.importo_cent))
  const daRiaddebitare = somma(voci.filter((v) => (v.quota_conduttore_cent ?? 0) > 0 && v.riaddebitata !== 'si').map((v) => v.quota_conduttore_cent))
  const impostaNonPagata = annAttivo.filter((a) => a.imposta_pagata !== 'si')
  const rimborsiMancanti = annAttivo.filter((a) => a.rimborso_ricevuto !== 'si' && (a.quota_conduttore_cent ?? 0) > 0)

  return (
    <div className="min-h-screen bg-gray-100 print:bg-white">
      <div className="no-stampa sticky top-0 z-10 flex items-center gap-3 border-b bg-white px-6 py-3 shadow-sm">
        <Link to="/immobili" className="flex items-center gap-1 text-sm text-gray-600 hover:underline"><ArrowLeft size={16} /> Torna agli immobili</Link>
        <span className="ml-auto text-sm text-gray-500">Anno canoni:</span>
        <select value={anno} onChange={(e) => setAnno(Number(e.target.value))} className="rounded-lg border border-gray-300 px-2 py-1 text-sm">{[anno - 2, anno - 1, anno, anno + 1].map((a) => <option key={a} value={a}>{a}</option>)}</select>
        <Bottone onClick={() => window.print()}><span className="flex items-center gap-1"><Printer size={16} /> Stampa / Salva PDF</span></Bottone>
      </div>

      <div className="pagina-stampa mx-auto my-6 max-w-4xl bg-white p-10 shadow print:my-0">
        <header className="flex items-start justify-between border-b-4 pb-4" style={{ borderColor: 'var(--colore-primario)' }}>
          <div>
            <div className="text-xs uppercase tracking-wide text-gray-500">Scheda immobile</div>
            <h1 className="text-2xl font-bold">{imm.indirizzo}</h1>
            <div className="text-gray-600">{[imm.comune, imm.provincia].filter(Boolean).join(' ')} · {etichettaDi(TIPOLOGIE_IMMOBILE, imm.tipologia)} · Proprietà: <strong>{soc?.ragione_sociale ?? '—'}</strong></div>
          </div>
          <div className="text-right text-xs text-gray-500">
            <div className="grid h-10 w-10 place-items-center rounded-lg font-bold text-white ml-auto mb-1" style={{ background: 'var(--colore-primario)' }}>GI</div>
            Stampata il {formattaDataOra(new Date().toISOString())}
          </div>
        </header>

        {/* Riquadro situazione */}
        <div className="mt-4 grid gap-3 sm:grid-cols-4 text-sm">
          {[
            ['Canoni ' + anno, `${formattaEuro(incassatoAnno)} su ${formattaEuro(dovutoAnno)}`, insolutiMesi.length ? `${insolutiMesi.length} mesi non incassati` : 'in regola', insolutiMesi.length > 0],
            ['Imposta di registro', impostaNonPagata.length ? `${impostaNonPagata.length} annualità non pagate` : 'in regola', rimborsiMancanti.length ? `${rimborsiMancanti.length} rimborsi 50% da incassare` : '', impostaNonPagata.length > 0],
            ['Condominio', vociNonPagate.length ? `${formattaEuro(somma(vociNonPagate.map((v) => v.importo_cent)))} da pagare` : 'in regola', scaduto > 0 ? `di cui scaduto ${formattaEuro(scaduto)}` : '', scaduto > 0],
            ['Da incassare dal conduttore', formattaEuro(daRiaddebitare + somma(rimborsiMancanti.map((a) => a.quota_conduttore_cent))), 'spese condominiali + imposta di registro', false],
          ].map(([t, v, s, critico]) => (
            <div key={t as string} className={`rounded-lg border p-3 ${critico ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-gray-50'}`}>
              <div className="text-xs uppercase text-gray-500">{t}</div><div className="font-semibold">{v}</div><div className={`text-xs ${critico ? 'text-red-700' : 'text-gray-500'}`}>{s}</div>
            </div>
          ))}
        </div>

        <Sezione titolo="Immobile">
          <Campi voci={[['Società proprietaria', soc?.ragione_sociale], ['P. IVA / CF', soc?.partita_iva || soc?.codice_fiscale], ['Indirizzo', imm.indirizzo], ['Comune', [imm.comune, imm.provincia].filter(Boolean).join(' ')],
            ['Tipologia', etichettaDi(TIPOLOGIE_IMMOBILE, imm.tipologia)], ['Superficie', imm.superficie_mq ? `${imm.superficie_mq} mq` : ''], ['Catasto', [imm.foglio && `Fg. ${imm.foglio}`, imm.particella && `Part. ${imm.particella}`, imm.subalterno && `Sub. ${imm.subalterno}`, imm.categoria && `Cat. ${imm.categoria}`].filter(Boolean).join(' · ')], ['Rendita', imm.rendita_cent ? formattaEuro(imm.rendita_cent) : ''],
            ['Stato', imm.stato === 'locato' ? 'Locato' : imm.stato === 'libero' ? 'Libero' : 'Non locabile'], ['Note', imm.note]]} />
        </Sezione>

        <Sezione titolo="Condominio e amministratore">
          {cond ? <Campi voci={[['Condominio', cond.denominazione], ['CF condominio', cond.codice_fiscale], ['Indirizzo', cond.indirizzo], ['Millesimi', imm.millesimi ?? ''], ['Amministratore', cond.amministratore_nome], ['Telefono', cond.amministratore_telefono], ['Email', cond.amministratore_email], ['PEC', cond.amministratore_pec], ['IBAN', cond.iban ? <span className="font-mono">{cond.iban}</span> : ''], ['Intestatario', cond.iban_intestatario]]} /> : <p className="text-sm text-gray-500">Immobile non collegato a un condominio.</p>}
        </Sezione>

        <Sezione titolo={attivo ? 'Contratto di locazione in essere' : 'Contratto di locazione'}>
          {attivo ? (() => { const k = cond_(attivo.conduttore_id); const iva = statoIva(attivo); const kmese = canoneMensilePer(attivo, annualita, oggi.slice(0, 7)); return (
            <Campi voci={[['Conduttore', k?.denominazione], ['CF / P. IVA', k?.codice_fiscale || k?.partita_iva], ['Contatti', [k?.telefono, k?.email, k?.pec].filter(Boolean).join(' · ')], ['Stato', attivo.stato === 'in_disdetta' ? 'In disdetta' : 'Attivo'],
              ['Tipologia', etichettaDi(TIPOLOGIE_CONTRATTO, attivo.tipologia)], ['IVA', iva.testo], ['Sottoscrizione', formattaData(attivo.data_sottoscrizione)], ['Decorrenza', formattaData(attivo.data_decorrenza)],
              ['Durata', attivo.durata_anni ? `${attivo.durata_anni} anni` : ''], ['Prima scadenza', formattaData(attivo.prima_scadenza)], ['Rinnovo automatico', attivo.rinnovo_automatico === 'si' ? 'Sì' : 'No'], ['Preavviso disdetta', attivo.preavviso_mesi ? `${attivo.preavviso_mesi} mesi` : ''],
              ['Canone mensile attuale', descriviCanone(kmese, formattaEuro)], ['Canone annuo', formattaEuro(attivo.canone_annuale_cent)], ['Periodicità', etichettaDi(PERIODICITA, attivo.periodicita)], ['Giorno scadenza', attivo.giorno_scadenza ?? ''],
              ['Deposito cauzionale', attivo.deposito_cent ? `${formattaEuro(attivo.deposito_cent)}${attivo.deposito_modalita ? ' (' + attivo.deposito_modalita + ')' : ''}` : ''], ['Deposito restituito il', formattaData(attivo.deposito_restituito_il)],
              ['ISTAT', attivo.istat_attivo === 'si' ? `Sì, ${attivo.istat_percentuale ?? 75}%` : 'No'], ['Incassi gestiti da noi', attivo.gestione_incassi === 'no' ? 'No' : 'Sì'],
              ['Registrazione', [attivo.reg_data && formattaData(attivo.reg_data), attivo.reg_ufficio, attivo.reg_modalita && etichettaDi(MODALITA_REGISTRAZIONE, attivo.reg_modalita)].filter(Boolean).join(' · ')], ['Codice identificativo', attivo.reg_codice],
              ['Imposta prima registrazione', attivo.reg_imposta_cent ? `${formattaEuro(attivo.reg_imposta_cent)}${attivo.reg_quota_conduttore_cent ? ' (conduttore ' + formattaEuro(attivo.reg_quota_conduttore_cent) + ')' : ''}` : ''], ['Note', attivo.note]]} />
          ) })() : <p className="text-sm text-gray-500">Nessun contratto attivo: immobile {imm.stato === 'libero' ? 'libero' : 'senza contratto registrato'}.</p>}
        </Sezione>

        {attivo && (
          <Sezione titolo="Registro annuale: ISTAT e imposta di registro">
            <Tab intestazioni={['Anno', 'Inizio', 'ISTAT', 'Mensile prima', 'Mensile dopo', 'Imposta', 'Pagata', 'Rimborso 50%']} dx={[3, 4, 5]}
              righe={annAttivo.map((a) => [a.anno, formattaData(a.data_inizio), a.istat_applicato === 'si' && a.istat_indice_percento != null ? `${String(a.istat_indice_percento).replace('.', ',')}% (${a.istat_quota_percento ?? 100}%)` : '—', formattaEuro(a.canone_mensile_precedente_cent), formattaEuro(a.canone_mensile_nuovo_cent), formattaEuro(a.imposta_cent), a.imposta_pagata === 'si' ? `Sì ${formattaData(a.imposta_data_pagamento)}` : <span className="font-medium text-red-600">No</span>, a.rimborso_ricevuto === 'si' ? `${formattaEuro(a.quota_conduttore_cent)} il ${formattaData(a.rimborso_data)}` : <span className="text-amber-700">da incassare {formattaEuro(a.quota_conduttore_cent)}</span>])} />
          </Sezione>
        )}

        <Sezione titolo={`Canoni ${anno}`}>
          {attivo ? (
            <>
              <div className="mb-2 grid grid-cols-6 gap-1 text-center text-xs sm:grid-cols-12">
                {MESI.map((nomeMese, i) => {
                  const mese = `${anno}-${String(i + 1).padStart(2, '0')}`
                  const m = canoniAnno.find((x) => x.contratto_id === attivo.id && x.competenza === mese)
                  const fuori = (attivo.data_decorrenza && mese < attivo.data_decorrenza.slice(0, 7)) || (attivo.data_cessazione && mese > attivo.data_cessazione.slice(0, 7))
                  const futuro = mese > oggi.slice(0, 7)
                  const cls = m ? (m.stato === 'incassato' ? 'bg-green-100 border-green-300' : m.stato === 'parziale' ? 'bg-amber-100 border-amber-300' : m.stato === 'stornato' ? 'bg-gray-100' : 'bg-red-100 border-red-300') : fuori ? 'bg-gray-50 text-gray-300' : futuro ? 'bg-gray-50 text-gray-400' : 'bg-red-50 border-red-200 text-red-500'
                  return <div key={mese} className={`rounded border p-1 ${cls}`}><div className="font-semibold">{nomeMese}</div><div className="tabular-nums">{m ? (m.stato === 'stornato' ? '—' : formattaEuro(m.stato === 'da_incassare' ? m.dovuto_cent : m.incassato_cent).replace(' €', '')) : fuori ? '' : formattaEuro(canoneMensilePer(attivo, annualita, mese).totale_cent).replace(' €', '')}</div></div>
                })}
              </div>
              <p className="text-sm">Dovuto {formattaEuro(dovutoAnno)} · incassato <strong>{formattaEuro(incassatoAnno)}</strong>{insolutiMesi.length > 0 && <> · <span className="font-medium text-red-600">mesi non incassati: {insolutiMesi.map((m) => MESI[Number(m.slice(5)) - 1]).join(', ')}</span></>}</p>
              {canoniAnno.some((m) => m.numero_fattura) && <p className="mt-1 text-xs text-gray-500">Fatture emesse: {canoniAnno.filter((m) => m.numero_fattura).sort((a, b) => a.competenza.localeCompare(b.competenza)).map((m) => `${MESI[Number(m.competenza.slice(5)) - 1]} n. ${m.numero_fattura}`).join(' · ')}</p>}
              {altriMov.length > 0 && <div className="mt-3"><div className="mb-1 text-xs font-semibold uppercase text-gray-500">Altri movimenti {anno}</div><Tab intestazioni={['Data', 'Tipo', 'Descrizione', 'Dovuto', 'Incassato', 'Stato']} dx={[3, 4]} righe={altriMov.map((m) => [formattaData(m.competenza), m.tipo, m.descrizione, formattaEuro(m.dovuto_cent), formattaEuro(m.incassato_cent), m.stato])} /></div>}
            </>
          ) : <p className="text-sm text-gray-500">Nessun contratto attivo.</p>}
        </Sezione>

        <Sezione titolo="Situazione condominiale">
          {voci.length === 0 ? <p className="text-sm text-gray-500">Nessuna voce registrata.</p> : (
            <>
              <p className="mb-2 text-sm">Totale voci {formattaEuro(somma(voci.map((v) => v.importo_cent)))} · pagato {formattaEuro(somma(voci.filter((v) => v.pagata === 'si').map((v) => v.importo_cent)))} · <span className={vociNonPagate.length ? 'font-medium text-red-600' : ''}>da pagare {formattaEuro(somma(vociNonPagate.map((v) => v.importo_cent)))}</span>{scaduto > 0 && <> (scaduto {formattaEuro(scaduto)})</>} · da incassare dal conduttore {formattaEuro(daRiaddebitare)}</p>
              <Tab intestazioni={['Esercizio', 'Tipo', 'Descrizione', 'Scadenza', 'Importo', 'A carico', 'Pagata', 'Quota conduttore']} dx={[4]}
                righe={voci.slice(0, 40).map((v) => [v.esercizio, etichettaDi(TIPI_VOCE_CONDOMINIO, v.tipo), `${v.descrizione}${v.in_piano_id ? ' (in piano di rientro)' : ''}`, <span className={v.pagata !== 'si' && v.scadenza < oggi ? 'font-medium text-red-600' : ''}>{formattaData(v.scadenza)}</span>, formattaEuro(v.importo_cent), etichettaDi(A_CARICO, v.a_carico).split(' (')[0], v.pagata === 'si' ? `Sì ${formattaData(v.data_pagamento)}` : <span className="font-medium text-red-600">No</span>, (v.quota_conduttore_cent ?? 0) > 0 ? `${formattaEuro(v.quota_conduttore_cent)} ${v.riaddebitata === 'si' ? 'incassata' : 'da incassare'}` : '—'])} />
              {voci.length > 40 && <p className="mt-1 text-xs text-gray-500">Mostrate le 40 voci più recenti su {voci.length}.</p>}
            </>
          )}
          {piani.length > 0 && <div className="mt-3"><div className="mb-1 text-xs font-semibold uppercase text-gray-500">Piani di rientro</div><Tab intestazioni={['Stato', 'Accordo del', 'Descrizione', 'Totale', 'Rate', 'Prima scadenza']} dx={[3]} righe={piani.map((p) => [etichettaDi(STATI_PIANO, p.stato), formattaData(p.data_accordo), p.descrizione, formattaEuro(p.importo_totale_cent), `${p.numero_rate ?? ''} da ${formattaEuro(p.importo_rata_cent)}`, formattaData(p.prima_scadenza)])} /></div>}
        </Sezione>

        {cessati.length > 0 && (
          <Sezione titolo="Contratti cessati">
            <Tab intestazioni={['Conduttore', 'Tipologia', 'Decorrenza', 'Cessazione', 'Canone mensile', 'Motivo']} dx={[4]} righe={cessati.map((c) => [cond_(c.conduttore_id)?.denominazione ?? '—', etichettaDi(TIPOLOGIE_CONTRATTO, c.tipologia), formattaData(c.data_decorrenza), formattaData(c.data_cessazione), formattaEuro(c.canone_mensile_cent), c.motivo_cessazione])} />
          </Sezione>
        )}

        <Sezione titolo="Documenti archiviati">
          {allegati.length === 0 ? <p className="text-sm text-gray-500">Nessun allegato.</p> : <p className="text-sm">{allegati.length} documenti: {Object.entries(allegati.reduce<Record<string, number>>((acc, a) => ({ ...acc, [a.categoria]: (acc[a.categoria] ?? 0) + 1 }), {})).map(([k, n]) => `${k} (${n})`).join(', ')}. Consultabili nella piattaforma.</p>}
        </Sezione>

        <footer className="mt-8 border-t pt-3 text-xs text-gray-400">Gestione Immobili · scheda generata automaticamente dai dati inseriti dai collaboratori · {formattaDataOra(new Date().toISOString())}</footer>
      </div>
    </div>
  )
}
