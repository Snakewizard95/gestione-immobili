/**
 * Finestre "Prepara F24" e "Prepara lettera ISTAT", usate dalla sezione Documenti e comunicazioni
 * e dalle scorciatoie nel registro annuale del contratto.
 */
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { FileDown, Printer } from 'lucide-react'
import { contestoDi, preparaF24, preparaLetteraIstat, tassiLegali, type ContestoAnnualita } from '../lib/documenti'
import { formattaPercentuale } from '../lib/ravvedimento'
import { apriOScaricaPdf, creaF24ElidePdf } from '../lib/f24pdf'
import { puoModificare } from '../lib/permessi'
import { useSessioneAttiva, useUtente } from '../lib/sessione'
import { aggiorna, attivi, campiModifica, campiNuovo } from '../lib/store'
import { inCedolare, type Annualita, type Comunicazione, type Conduttore, type Contratto, type Immobile, type Societa, type TassoLegale } from '../lib/tipi'
import { useCollezioni } from '../lib/useCollezioni'
import { formattaData, formattaEuro, oggiIso } from '../lib/utils/formato'
import { Avviso, Bottone, Caricamento, Copia, Etichetta, Finestra, Riquadro } from './ui'

/** Carica tutto ciò che serve ai documenti e restituisce il contesto di un'annualità. */
export function useDatiDocumenti() {
  const col = useCollezioni(['annualita', 'contratti', 'immobili', 'societa', 'conduttori', 'tassi_legali', 'comunicazioni'])
  const dati = {
    annualita: attivi(col.dati<Annualita>('annualita')), contratti: attivi(col.dati<Contratto>('contratti')),
    immobili: attivi(col.dati<Immobile>('immobili')), societa: attivi(col.dati<Societa>('societa')), conduttori: attivi(col.dati<Conduttore>('conduttori')),
  }
  return {
    ...col, ...dati,
    tassi: tassiLegali(col.dati<TassoLegale>('tassi_legali')),
    tassiSalvati: attivi(col.dati<TassoLegale>('tassi_legali')),
    comunicazioni: attivi(col.dati<Comunicazione>('comunicazioni')),
    contesto: (annualitaId: string) => contestoDi(annualitaId, dati),
  }
}

const descrizione = (ctx: ContestoAnnualita) => `${ctx.immobile?.indirizzo ?? '—'} / ${ctx.conduttore?.denominazione ?? '—'}`

function Mancanti({ voci, cosa }: { voci: string[]; cosa: string }) {
  if (voci.length === 0) return null
  return (
    <div className="mb-5">
      <Avviso tipo="attenzione">
        <strong>Mancano alcuni dati per {cosa}:</strong>
        <ul className="mt-1 list-disc pl-5">{voci.map((v) => <li key={v}>{v}</li>)}</ul>
      </Avviso>
    </div>
  )
}

function Riga({ etichetta, valore, copia }: { etichetta: string; valore: ReactNode; copia?: string }) {
  return (
    <div className="flex items-center gap-3 border-b border-riga py-1.5 last:border-0">
      <span className="w-52 flex-none text-[13px] text-neutro-700">{etichetta}</span>
      <span className="num min-w-0 flex-1 font-medium">{valore || '—'}</span>
      {copia !== undefined && <Copia testo={copia} />}
    </div>
  )
}

/* =============================== F24 =============================== */

export function FinestraF24({ annualitaId, onChiudi }: { annualitaId: string | null; onChiudi: () => void }) {
  const { token, nome } = useSessioneAttiva()
  const puo = puoModificare(useUtente(), 'comunicazioni')
  const d = useDatiDocumenti()
  const [pagamento, setPagamento] = useState(oggiIso())
  const [conferma, setConferma] = useState(false)
  const [inCorso, setInCorso] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)
  const [generando, setGenerando] = useState(false)
  const ctx = annualitaId ? d.contesto(annualitaId) : null

  function chiudi() { setConferma(false); setErrore(null); onChiudi() }

  let corpo: ReactNode = <Caricamento />
  let titolo = 'F24 imposta di registro'
  if (ctx) {
    const a = ctx.annualita
    const testo = descrizione(ctx)
    titolo = `F24 imposta di registro — ${ctx.immobile?.indirizzo ?? ''} · ${a.anno}`
    if (inCedolare(ctx.contratto)) {
      corpo = <Avviso tipo="ok">Contratto in cedolare secca: l'imposta di registro non è dovuta, non serve alcun F24.</Avviso>
    } else {
      const f = preparaF24(ctx, pagamento, d.tassi)
      const r = f.ravvedimento
      const pagata = a.imposta_pagata === 'si'
      async function segnaPagato() {
        setInCorso(true); setErrore(null)
        try {
          await aggiorna<Annualita>(token, 'annualita', (rec) => rec.map((x) => (x.id === a.id ? {
            ...x, imposta_pagata: 'si', imposta_data_pagamento: pagamento, imposta_modalita: 'f24_elide',
            ravvedimento_sanzione_cent: r.sanzione_cent || null, ravvedimento_interessi_cent: r.interessi_cent || null, ...campiModifica(nome),
          } : x)), `${nome}: imposta di registro ${a.anno} pagata con F24 — ${testo}`)
          const dettagli = f.righe.map((x) => `${x.codice} ${formattaEuro(x.importo_cent)}`).join(' · ') + ` · totale ${formattaEuro(r.totale_cent)}`
          const registro: Comunicazione = {
            ...campiNuovo(nome), tipo: 'f24', contratto_id: a.contratto_id, annualita_id: a.id, data: pagamento, destinatario: 'Agenzia delle Entrate (F24 Elide)',
            oggetto: `Imposta di registro annualità ${a.anno}${r.giorniRitardo > 0 ? ' con ravvedimento operoso' : ''}`, dettagli, note: '',
          }
          await aggiorna<Comunicazione>(token, 'comunicazioni', (rec) => [...rec, registro], `${nome}: registra F24 imposta di registro ${a.anno} — ${testo}`)
          chiudi()
        } catch (e) { setErrore((e as Error).message) } finally { setInCorso(false) }
      }
      corpo = (
        <>
          {pagata && <div className="mb-5"><Avviso tipo="ok">Imposta già segnata come pagata il {formattaData(a.imposta_data_pagamento)}{a.ravvedimento_sanzione_cent ? `, con ravvedimento (sanzione ${formattaEuro(a.ravvedimento_sanzione_cent)}, interessi ${formattaEuro(a.ravvedimento_interessi_cent)})` : ''}.</Avviso></div>}
          <Mancanti voci={f.mancanti} cosa="compilare l'F24" />
          <div className="mb-5 grid gap-4 sm:grid-cols-3">
            <div><span className="etichetta-campo">Inizio annualità</span><div className="num py-1.5">{formattaData(a.data_inizio)}</div></div>
            <div><span className="etichetta-campo">Scadenza del versamento</span><div className="num py-1.5">{formattaData(r.scadenza)}</div></div>
            <label className="block"><span className="etichetta-campo">Data di pagamento</span>
              <input type="date" className="input" value={pagamento} onChange={(e) => setPagamento(e.target.value || oggiIso())} />
            </label>
          </div>
          <div className="mb-5">
            {r.giorniRitardo === 0
              ? <Avviso tipo="ok">Pagamento nei termini: si versa solo l'imposta (codice 1501).</Avviso>
              : <Avviso tipo="attenzione">In ritardo di <strong>{r.giorniRitardo} giorni</strong>: ravvedimento operoso. {r.fascia.descrizione}: sanzione {formattaPercentuale(r.fascia.percentuale)} dell'imposta; interessi al tasso legale {r.dettaglioInteressi.map((q) => `${q.anno}: ${q.giorni} gg al ${formattaPercentuale(q.tasso)}`).join(', ')}.</Avviso>}
          </div>

          <h6 className="mb-2 text-accento-700">Contribuente</h6>
          <div className="mb-5">
            <Riga etichetta="Codice fiscale (locatore)" valore={f.contribuente.codiceFiscale} copia={f.contribuente.codiceFiscale} />
            <Riga etichetta={f.contribuente.persona ? 'Cognome e nome' : 'Denominazione'} valore={[f.contribuente.cognomeODenominazione, f.contribuente.nome].filter(Boolean).join(' ')} />
            <Riga etichetta="Domicilio fiscale" valore={[f.contribuente.domicilioIndirizzo, f.contribuente.domicilioComune, f.contribuente.domicilioProv].filter(Boolean).join(' · ')} />
            <Riga etichetta="Cod. fiscale / P. IVA del coobbligato (conduttore)" valore={f.secondoCodiceFiscale} copia={f.secondoCodiceFiscale} />
            <Riga etichetta="Codice identificativo del coobbligato" valore={`${f.codiceIdentificativo} (controparte)`} copia={f.codiceIdentificativo} />
          </div>

          <h6 className="mb-2 text-accento-700">Sezione Erario ed altro</h6>
          <Riquadro className="mb-3">
            <div className="overflow-x-auto">
              <table className="tabella !text-[13px]">
                <thead><tr><th>Tipo</th><th>Elementi identificativi</th><th>Codice</th><th>Anno</th><th className="text-right">Importo</th><th /></tr></thead>
                <tbody>
                  {f.righe.map((x) => (
                    <tr key={x.codice}>
                      <td>{x.tipo}</td>
                      <td className="num">{x.elementi || '—'} {x.elementi && <Copia testo={x.elementi} etichetta="" />}</td>
                      <td title={x.descrizione}><strong>{x.codice}</strong><div className="text-xs text-neutro-700">{x.descrizione}</div></td>
                      <td className="num">{x.anno}</td>
                      <td className="num text-right font-medium">{formattaEuro(x.importo_cent)}</td>
                      <td><Copia testo={(x.importo_cent / 100).toFixed(2).replace('.', ',')} /></td>
                    </tr>
                  ))}
                  <tr className="totale"><td colSpan={4}>Totale da versare</td><td className="num text-right">{formattaEuro(r.totale_cent)}</td><td /></tr>
                </tbody>
              </table>
            </div>
          </Riquadro>
          <p className="mb-5 text-xs text-neutro-700">Il pulsante crea il modello ufficiale F24 Elide dell'Agenzia delle Entrate già compilato (tre copie), da stampare e presentare in banca o in posta: restano da compilare a mano solo la banca delegata e la firma. Calcolo indicativo: verificare con il commercialista prima del pagamento.</p>
          {errore && <div className="mb-4"><Avviso tipo="errore">{errore}</Avviso></div>}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-divisore pt-5">
            <Bottone disabled={generando} onClick={async () => {
              setGenerando(true); setErrore(null)
              try { apriOScaricaPdf(await creaF24ElidePdf(f), `F24_Elide_${(ctx.immobile?.indirizzo ?? 'immobile').replace(/[^\w]+/g, '_')}_${a.anno}.pdf`) }
              catch (e) { setErrore('Impossibile creare il modello F24: ' + (e as Error).message) } finally { setGenerando(false) }
            }}><FileDown size={16} /> {generando ? 'Preparazione…' : 'Scarica il modello F24 Elide compilato'}</Bottone>
            <div className="flex flex-wrap items-center gap-2.5">
              <Bottone variante="secondario" onClick={chiudi}>Chiudi</Bottone>
              {puo && !pagata && !conferma && <Bottone variante="secondario" disabled={r.tassiMancanti.length > 0 || !a.imposta_cent} onClick={() => setConferma(true)}>Segna come pagato</Bottone>}
              {puo && !pagata && conferma && (
                <span className="flex flex-wrap items-center gap-2 text-[13px]">
                  Confermi il pagamento del {formattaData(pagamento)} per {formattaEuro(r.totale_cent)}?
                  <Bottone disabled={inCorso} onClick={segnaPagato}>{inCorso ? 'Salvataggio…' : 'Sì, pagato'}</Bottone>
                  <Bottone variante="secondario" onClick={() => setConferma(false)}>No</Bottone>
                </span>
              )}
            </div>
          </div>
        </>
      )
    }
  }
  return (
    <Finestra kicker={ctx?.societa?.ragione_sociale} titolo={titolo} aperta={annualitaId !== null} onChiudi={chiudi} larga>
      {d.errore ? <Avviso tipo="errore">{d.errore}</Avviso> : corpo}
    </Finestra>
  )
}

/* ============================ Lettera ISTAT ============================ */

export function FinestraLetteraIstat({ annualitaId, onChiudi }: { annualitaId: string | null; onChiudi: () => void }) {
  const { token, nome } = useSessioneAttiva()
  const puo = puoModificare(useUtente(), 'comunicazioni')
  const d = useDatiDocumenti()
  const [data, setData] = useState(oggiIso())
  const [inCorso, setInCorso] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)
  const ctx = annualitaId ? d.contesto(annualitaId) : null

  function chiudi() { setErrore(null); onChiudi() }

  let corpo: ReactNode = <Caricamento />
  let titolo = 'Lettera aumento ISTAT'
  if (ctx) {
    const a = ctx.annualita
    const testo = descrizione(ctx)
    titolo = `Lettera aumento ISTAT — ${ctx.immobile?.indirizzo ?? ''} · ${a.anno}`
    if (inCedolare(ctx.contratto)) {
      corpo = <Avviso tipo="info">Contratto in cedolare secca: l'aggiornamento ISTAT non si applica, non serve alcuna lettera.</Avviso>
    } else {
      const l = preparaLetteraIstat(ctx)
      const destinatario = l.pecConduttore || l.emailConduttore || ctx.conduttore?.denominazione || ''
      async function segnaInviata() {
        setInCorso(true); setErrore(null)
        try {
          await aggiorna<Annualita>(token, 'annualita', (rec) => rec.map((x) => (x.id === a.id ? { ...x, istat_data_lettera: data, ...campiModifica(nome) } : x)),
            `${nome}: lettera ISTAT ${a.anno} inviata — ${testo}`)
          const registro: Comunicazione = {
            ...campiNuovo(nome), tipo: 'lettera_istat', contratto_id: a.contratto_id, annualita_id: a.id, data, destinatario,
            oggetto: l.oggetto, dettagli: `Nuovo canone mensile ${formattaEuro(a.canone_mensile_nuovo_cent)} dal ${formattaData(a.data_inizio)}`, note: '',
          }
          await aggiorna<Comunicazione>(token, 'comunicazioni', (rec) => [...rec, registro], `${nome}: registra lettera ISTAT ${a.anno} — ${testo}`)
          chiudi()
        } catch (e) { setErrore((e as Error).message) } finally { setInCorso(false) }
      }
      corpo = (
        <>
          {a.istat_data_lettera && <div className="mb-5"><Avviso tipo="ok">Lettera già segnata come inviata il {formattaData(a.istat_data_lettera)}.</Avviso></div>}
          <Mancanti voci={l.mancanti} cosa="la lettera" />
          <div className="mb-5 grid gap-4 sm:grid-cols-3">
            <label className="block"><span className="etichetta-campo">Data della lettera</span>
              <input type="date" className="input" value={data} onChange={(e) => setData(e.target.value || oggiIso())} />
            </label>
            <div><span className="etichetta-campo">Nuovo canone mensile</span><div className="num py-1.5 font-medium">{formattaEuro(a.canone_mensile_nuovo_cent)}</div></div>
            <div><span className="etichetta-campo">Dal</span><div className="num py-1.5">{formattaData(a.data_inizio)}</div></div>
          </div>

          <h6 className="mb-2 text-accento-700">Mail o PEC da inviare</h6>
          <div className="mb-3">
            <Riga etichetta="Email del conduttore" valore={l.emailConduttore} copia={l.emailConduttore} />
            <Riga etichetta="PEC del conduttore" valore={l.pecConduttore} copia={l.pecConduttore} />
            <Riga etichetta="Oggetto" valore={l.oggetto} copia={l.oggetto} />
          </div>
          <div className="mb-2 flex items-center justify-between"><span className="etichetta-campo !mb-0">Testo</span><Copia testo={l.testoMail} etichetta="Copia testo" /></div>
          <textarea readOnly value={l.testoMail} rows={12} className="input mb-3 !text-[13px]" />
          <p className="mb-5 text-xs text-neutro-700">Incolla oggetto e testo nella tua posta (Gmail, PEC…). Per allegare la lettera firmata: apri la lettera da stampare, salvala in PDF e allegala.</p>
          {errore && <div className="mb-4"><Avviso tipo="errore">{errore}</Avviso></div>}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-divisore pt-5">
            <Link to={`/stampa/lettera-istat/${a.id}?data=${data}`} className="btn btn-secondario no-underline"><Printer size={16} /> Apri la lettera da stampare</Link>
            <div className="flex gap-2.5">
              <Bottone variante="secondario" onClick={chiudi}>Chiudi</Bottone>
              {puo && <Bottone disabled={inCorso} onClick={segnaInviata}>{inCorso ? 'Salvataggio…' : a.istat_data_lettera ? 'Segna di nuovo come inviata' : 'Segna come inviata'}</Bottone>}
            </div>
          </div>
        </>
      )
    }
  }
  return (
    <Finestra kicker={ctx?.societa?.ragione_sociale} titolo={titolo} aperta={annualitaId !== null} onChiudi={chiudi} larga>
      {d.errore ? <Avviso tipo="errore">{d.errore}</Avviso> : corpo}
    </Finestra>
  )
}

/** Etichetta dello stato del versamento di un'annualità. */
export function StatoVersamento({ scadenza, oggi, pagata, dataPagamento }: { scadenza: string; oggi: string; pagata: boolean; dataPagamento?: string }) {
  if (pagata) return <Etichetta tono="verde">Pagata{dataPagamento ? ` · ${formattaData(dataPagamento)}` : ''}</Etichetta>
  const giorni = Math.round((new Date(scadenza + 'T00:00:00Z').getTime() - new Date(oggi + 'T00:00:00Z').getTime()) / 86_400_000)
  if (giorni < 0) return <Etichetta tono="rosso">In ritardo di {-giorni} gg</Etichetta>
  return <Etichetta tono={giorni <= 7 ? 'rosso' : 'giallo'}>{giorni === 0 ? 'Scade oggi' : `Scade tra ${giorni} gg`}</Etichetta>
}
