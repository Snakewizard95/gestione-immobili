/**
 * Scheda sintetica stampabile dei tributi di un ufficio (o di tutti gli uffici di un responsabile, una pagina per
 * ufficio): situazione, rate saltate da riconteggiare, prossime scadenze, piani attivi, piani ancora da inserire.
 * Si salva in PDF con "Stampa → Salva come PDF".
 */
import { Fragment, useState, type ReactNode } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Printer } from 'lucide-react'
import { Bottone, Caricamento } from '../components/ui'
import logo from '../assets/logo-gruppo.png'
import { attivi } from '../lib/store'
import { STATI_PRATICA, TIPI_PRATICA, etichettaDi, type Contribuente, type PraticaTributo } from '../lib/tipi'
import { daInserire, decaduto, gestita, inCorso, ordinaVoci, residuoDecaduto, riepilogoPratiche, riepilogoRate, situazioneRata, statoEffettivo, termineRegolarizzazione, totaliDi, tutteLeRate, vociCalendario, type Totali, type VoceCalendario } from '../lib/tributi'
import { useCollezioni } from '../lib/useCollezioni'
import { aggiungiMesi, formattaData, formattaDataOra, formattaEuro, oggiIso } from '../lib/utils/formato'
import { giorniTra } from '../lib/ravvedimento'

function Sezione({ titolo, nota, children }: { titolo: string; nota?: string; children: ReactNode }) {
  return (
    <section className="mt-6 border-t border-divisore pt-4">
      <div className="mb-1 text-[10px] uppercase tracking-[0.14em] text-accento-700">{titolo}</div>
      {nota && <p className="mb-2 text-[11.5px] text-neutro-700">{nota}</p>}
      {children}
    </section>
  )
}

function Tab({ intestazioni, righe, dx, totale }: { intestazioni: string[]; righe: ReactNode[][]; dx?: number[]; totale?: ReactNode[] }) {
  if (righe.length === 0) return <p className="text-[12.5px] text-neutro-700">Nessuna.</p>
  const cl = (j: number) => `px-2 py-1.5 ${dx?.includes(j) ? 'text-right tabular-nums' : ''}`
  return (
    <table className="w-full border-collapse text-[12px]">
      <thead><tr className="border-b border-divisore text-left text-[10px] uppercase tracking-[0.08em] text-attenuato">{intestazioni.map((h, i) => <th key={h} className={`px-2 py-1.5 font-medium ${dx?.includes(i) ? 'text-right' : ''}`}>{h}</th>)}</tr></thead>
      <tbody>
        {righe.map((r, i) => <tr key={i} className="border-b border-riga">{r.map((c, j) => <td key={j} className={cl(j)}>{c}</td>)}</tr>)}
        {totale && <tr className="border-t-2 border-testo font-semibold">{totale.map((c, j) => <td key={j} className={cl(j)}>{c}</td>)}</tr>}
      </tbody>
    </table>
  )
}

/** Riquadro della situazione: titolo, importo, scomposizione. */
function Box({ titolo, t, nota, rosso }: { titolo: string; t?: Totali; nota?: ReactNode; rosso?: boolean }) {
  return (
    <div className={`border px-3 py-2.5 ${rosso ? 'border-err-bordo bg-err-fondo text-err-testo' : 'border-divisore'}`}>
      <div className="text-[10px] uppercase tracking-[0.08em]">{titolo}</div>
      {t && <div className="num mt-1 font-titolo text-[22px] font-semibold leading-none">{formattaEuro(t.totale_cent)}</div>}
      {t && <div className="num mt-1 text-[10.5px]">Cap. {formattaEuro(t.quota_capitale_cent)} · Sanz. {formattaEuro(t.sanzioni_cent)} · Int. {formattaEuro(t.interessi_cent)}</div>}
      {nota && <div className="mt-1 text-[11px]">{nota}</div>}
    </div>
  )
}

function SchedaUfficio({ c, pratiche, mesi, prima }: { c: Contribuente; pratiche: PraticaTributo[]; mesi: number; prima: boolean }) {
  const oggi = oggiIso()
  const fine = aggiungiMesi(oggi, mesi)
  const mie = pratiche.filter((p) => p.contribuente_id === c.id)
  const attivi_ = mie.filter(inCorso).sort((a, b) => a.tributo.localeCompare(b.tributo))
  const rate = tutteLeRate(attivi_)
  const saltate = rate.filter((x) => !x.rata.pagata && x.rata.scadenza < oggi)
  const prossime = rate.filter((x) => !x.rata.pagata && x.rata.scadenza >= oggi && x.rata.scadenza <= fine)
  const sospese = mie.filter(daInserire)
  const decaduti = mie.filter(decaduto)
  const r = riepilogoPratiche(attivi_, oggi)
  const tProssime = totaliDi(prossime.map((x) => x.rata))
  const tSaltate = totaliDi(saltate.map((x) => x.rata))

  return (
    <div className={`pagina-stampa ombra-md mx-auto my-8 max-w-[794px] bg-white px-6 py-10 text-sm md:px-[52px] md:py-12 print:my-0 ${prima ? '' : 'interrompi-prima'}`}>
      <header className="flex items-start justify-between gap-6 border-b-2 border-testo pb-4">
        <div className="min-w-0">
          <div className="kicker">Scheda tributi rateizzati</div>
          <h1 className="mt-1 text-[34px]">{c.nome}</h1>
          <div className="mt-1 text-[13px] text-neutro-700">{[c.ragione_sociale, c.responsabile && `Responsabile: ${c.responsabile}`].filter(Boolean).join(' · ')}</div>
        </div>
        <div className="flex-none text-right text-xs text-neutro-700">
          <img src={logo} alt="Gruppo CEC Bigoli" className="mb-2 ml-auto h-11 w-[170px] object-cover" />
          Situazione al {formattaDataOra(new Date().toISOString())}
        </div>
      </header>

      <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Box titolo="Debito residuo" t={r.residuo} nota={`${attivi_.length} piani attivi`} />
        <Box titolo={`Prossimi ${mesi} mesi`} t={tProssime} nota={`${prossime.length} rate`} />
        <Box titolo="Rate saltate" t={saltate.length ? tSaltate : undefined} nota={saltate.length ? `${saltate.length} da riconteggiare` : 'Nessuna: in regola'} rosso={saltate.length > 0} />
        <Box titolo="Piani da inserire" nota={sospese.length ? `${sospese.length} con rate decise${sospese.some((p) => p.importo_cent) ? ` · ${formattaEuro(sospese.reduce((s, p) => s + (p.importo_cent ?? 0), 0))}` : ''}` : 'Nessuno'} rosso={false} />
      </div>

      {saltate.length > 0 && (
        <Sezione titolo="Rate saltate da riconteggiare"
          nota="Rate scadute che non risultano pagate. Se sono state pagate va comunicato; altrimenti vanno ricalcolate con sanzione e interessi (ravvedimento). Per gli avvisi bonari il pagamento va fatto entro la scadenza della rata successiva, altrimenti il piano decade.">
          <Tab intestazioni={['Tributo', 'Rata', 'Scadenza', 'Giorni di ritardo', 'Importo rata', 'Regolarizzare entro']} dx={[3, 4]}
            righe={saltate.map((x) => {
              const entro = termineRegolarizzazione(x.pratica, x.rata)
              return [x.pratica.tributo, `${x.rata.numero}/${x.pratica.rate.length}`, formattaData(x.rata.scadenza), giorniTra(x.rata.scadenza, oggi),
                formattaEuro(x.rata.totale_cent), entro ? <span key="e" className={entro < oggi ? 'font-semibold text-err-testo' : ''}>{formattaData(entro)}{entro < oggi ? ' (superato)' : ''}</span> : '—']
            })}
            totale={['Totale', '', '', '', formattaEuro(tSaltate.totale_cent), '']} />
        </Sezione>
      )}

      <Sezione titolo={`Prossime scadenze (fino al ${formattaData(fine)})`}>
        <Tab intestazioni={['Scadenza', 'Tributo', 'Rata', 'Capitale', 'Sanzioni', 'Interessi', 'Totale']} dx={[3, 4, 5, 6]}
          righe={prossime.map((x) => [formattaData(x.rata.scadenza), x.pratica.tributo, `${x.rata.numero}/${x.pratica.rate.length}`,
            formattaEuro(x.rata.quota_capitale_cent), formattaEuro(x.rata.sanzioni_cent), formattaEuro(x.rata.interessi_cent), <b key="t">{formattaEuro(x.rata.totale_cent)}</b>])}
          totale={['Totale', '', '', formattaEuro(tProssime.quota_capitale_cent), formattaEuro(tProssime.sanzioni_cent), formattaEuro(tProssime.interessi_cent), formattaEuro(tProssime.totale_cent)]} />
      </Sezione>

      <Sezione titolo="Piani attivi">
        <Tab intestazioni={['Tributo', 'Tipo', 'Rate pagate', 'Totale piano', 'Pagato', 'Da pagare', 'Ultima rata']} dx={[3, 4, 5]}
          righe={attivi_.map((p) => {
            const rp = riepilogoRate(p.rate, oggi)
            return [p.tributo, etichettaDi(TIPI_PRATICA, p.tipo), `${rp.ratePagate}/${rp.rate}`, formattaEuro(rp.totale.totale_cent), formattaEuro(rp.pagato.totale_cent),
              <b key="d">{formattaEuro(rp.residuo.totale_cent)}</b>, formattaData(p.rate[p.rate.length - 1]?.scadenza)]
          })}
          totale={['Totale', '', '', formattaEuro(r.totale.totale_cent), formattaEuro(r.pagato.totale_cent), formattaEuro(r.residuo.totale_cent), '']} />
        {attivi_.length > 0 && (
          <p className="mt-2 text-[11.5px] text-neutro-700">
            Da pagare: capitale {formattaEuro(r.residuo.quota_capitale_cent)} · sanzioni {formattaEuro(r.residuo.sanzioni_cent)} · interessi {formattaEuro(r.residuo.interessi_cent)}
          </p>
        )}
      </Sezione>

      {decaduti.length > 0 && (
        <Sezione titolo="Piani decaduti: cartella esattoriale in arrivo"
          nota="Le rate non pagate di questi piani non sono più scadenze. La cartella avrà un importo diverso (imposta residua, sanzioni piene, interessi e oneri di riscossione).">
          <Tab intestazioni={['Tributo', 'Decaduto il', 'Rate non pagate', 'Non pagato', 'Cartella']} dx={[2, 3]}
            righe={decaduti.map((p) => [p.tributo, formattaData(p.decaduto_il), p.rate.filter((x) => !x.pagata).length, formattaEuro(residuoDecaduto(p).totale_cent),
              p.cartella_arrivata_il ? `arrivata il ${formattaData(p.cartella_arrivata_il)}` : 'in arrivo'])} />
        </Sezione>
      )}

      {sospese.length > 0 && (
        <Sezione titolo="Rate decise, piano da inserire">
          <Tab intestazioni={['Tributo', 'Tipo', 'Notificato', 'Importo', 'Termine', 'Stato']} dx={[3]}
            righe={sospese.map((p) => [p.tributo || '—', etichettaDi(TIPI_PRATICA, p.tipo), formattaData(p.data_notifica), formattaEuro(p.importo_cent), formattaData(p.termine_pagamento),
              <Fragment key="s">{p.stato === 'rate_concordate' ? `Piano da inserire${p.rate_concordate ? ` (${p.rate_concordate} rate)` : ''}` : etichettaDi(STATI_PRATICA, statoEffettivo(p))}</Fragment>])} />
        </Sezione>
      )}

      <p className="mt-8 border-t border-divisore pt-3 text-[10.5px] text-neutro-600">
        Prospetto riassuntivo a uso interno: fanno fede i documenti dell'Agenzia delle Entrate e dell'Agenzia Entrate-Riscossione.
      </p>
    </div>
  )
}

export default function StampaTributi() {
  const { tipo, valore } = useParams()
  const { dati, caricamento } = useCollezioni(['contribuenti', 'pratiche_tributi'])
  const [mesi, setMesi] = useState(6)
  const contribuenti = attivi(dati<Contribuente>('contribuenti')).sort((a, b) => a.nome.localeCompare(b.nome, 'it'))
  const pratiche = attivi(dati<PraticaTributo>('pratiche_tributi')).filter(gestita)
  const nomeValore = decodeURIComponent(valore ?? '')
  const scelti = tipo === 'responsabile'
    ? contribuenti.filter((c) => c.responsabile === nomeValore && pratiche.some((p) => p.contribuente_id === c.id && (inCorso(p) || daInserire(p) || decaduto(p))))
    : contribuenti.filter((c) => c.id === nomeValore)

  if (caricamento && scelti.length === 0) return <div className="p-10"><Caricamento /></div>

  return (
    <div className="min-h-screen bg-sfondo print:bg-white">
      <div className="no-stampa sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-divisore bg-sfondo px-6 py-3">
        <Link to="/tributi" className="btn btn-ghost no-underline"><ArrowLeft size={16} /> Torna ai tributi</Link>
        <span className="text-[13px] text-neutro-700">
          {tipo === 'responsabile' ? `Responsabile ${nomeValore}: ${scelti.length} ${scelti.length === 1 ? 'ufficio' : 'uffici'} (uno per pagina)` : ''}
        </span>
        <span className="ml-auto text-[13px] text-neutro-700">Prossime scadenze per:</span>
        <select value={mesi} onChange={(e) => setMesi(Number(e.target.value))} className="input w-28">
          {[3, 6, 12].map((n) => <option key={n} value={n}>{n} mesi</option>)}
        </select>
        <Bottone onClick={() => window.print()} disabled={scelti.length === 0}><Printer size={16} /> Stampa / salva PDF</Bottone>
      </div>
      {scelti.length === 0
        ? <div className="p-10">Nessun ufficio da stampare. <Link to="/tributi" className="underline">Torna ai tributi</Link></div>
        : scelti.map((c, i) => <SchedaUfficio key={c.id} c={c} pratiche={pratiche} mesi={mesi} prima={i === 0} />)}
    </div>
  )
}

/* ---------------------------- scheda di una scadenza del calendario ---------------------------- */

const GIORNI_LUNGHI = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato']
const MESI_LUNGHI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre']

/** Stato di una voce in stampa (come nel calendario, in testo). */
function statoVoce(x: VoceCalendario, oggi: string): { testo: string; rosso?: boolean; giallo?: boolean } {
  if (x.rata.pagata) return { testo: x.rata.pagata_il ? `Pagata il ${formattaData(x.rata.pagata_il)}` : 'Pagata' }
  if (x.recupero) return { testo: 'Da saldare con riconteggio', giallo: true }
  const s = situazioneRata(x.pratica, x.rata, oggi)
  if (s.tipo === 'da_recuperare') return { testo: `Non pagata · recuperare entro ${formattaData(s.entro)}`, giallo: true }
  if (s.tipo === 'oltre_termine') return { testo: x.pratica.tipo === 'avviso_bonario' ? 'Termine superato' : 'Scaduta', rosso: true }
  return { testo: 'Da pagare' }
}

/**
 * Scheda stampabile di una scadenza del calendario: tutte le rate di quel giorno (con i recuperi delle rate saltate),
 * in ordine alfabetico di ufficio, con capitale, sanzioni, interessi, totale e stato; subtotale per ufficio e totali.
 * Rispetta i filtri del calendario (responsabile, società). A4 verticale.
 */
export function StampaScadenzaTributi() {
  const { data = '' } = useParams()
  const [cerca] = useSearchParams()
  const responsabile = cerca.get('responsabile') ?? ''
  const societa = cerca.get('societa') ?? ''
  const { dati, caricamento } = useCollezioni(['contribuenti', 'pratiche_tributi'])
  const oggi = oggiIso()
  const contribuenti = attivi(dati<Contribuente>('contribuenti'))
  const cDi = (id: string) => contribuenti.find((c) => c.id === id)
  const pratiche = attivi(dati<PraticaTributo>('pratiche_tributi')).filter(gestita)
    .filter((p) => (!responsabile || cDi(p.contribuente_id)?.responsabile === responsabile) && (!societa || p.contribuente_id === societa))
  const voci = ordinaVoci(vociCalendario(pratiche, data, data, oggi), (id) => cDi(id)?.nome ?? '')
  const indietro = `/tributi?${new URLSearchParams({ mese: data.slice(0, 7), ...(responsabile ? { responsabile } : {}), ...(societa ? { societa } : {}) }).toString()}`

  if (caricamento && voci.length === 0) return <div className="p-10"><Caricamento /></div>

  const d = new Date(data + 'T00:00:00Z')
  const titolo = /^\d{4}-\d{2}-\d{2}$/.test(data) ? `${GIORNI_LUNGHI[d.getUTCDay()]} ${d.getUTCDate()} ${MESI_LUNGHI[d.getUTCMonth()]} ${d.getUTCFullYear()}` : data
  const tutte = totaliDi(voci.map((x) => x.rata))
  const daPagare = voci.filter((x) => !x.rata.pagata)
  const pagate = voci.filter((x) => x.rata.pagata)
  const recuperi = daPagare.filter((x) => x.recupero)
  const uffici = [...new Set(voci.map((x) => x.pratica.contribuente_id))]
  const cella = 'px-1.5 py-[5px]'
  const num = `${cella} num text-right whitespace-nowrap`

  return (
    <div className="min-h-screen bg-sfondo print:bg-white">
      <style>{'@media print { @page { size: A4 portrait; margin: 10mm; } }'}</style>
      <div className="no-stampa sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-divisore bg-sfondo px-6 py-3">
        <Link to={indietro} className="btn btn-ghost no-underline"><ArrowLeft size={16} /> Torna al calendario</Link>
        <Bottone className="ml-auto" onClick={() => window.print()} disabled={voci.length === 0}><Printer size={16} /> Stampa / salva PDF</Bottone>
      </div>
      <div className="pagina-stampa ombra-md mx-auto my-8 max-w-[794px] bg-white px-6 py-8 text-sm md:px-10 print:my-0 print:px-0 print:py-0" style={{ printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}>
        <header className="flex items-start justify-between gap-6 border-b-2 border-testo pb-3">
          <div className="min-w-0">
            <div className="kicker">Tributi rateizzati · scadenza</div>
            <h1 className="mt-1 text-[30px] first-letter:uppercase">{titolo}</h1>
            <div className="mt-1 text-[13px] text-neutro-700">
              {[`${voci.length} ${voci.length === 1 ? 'rata' : 'rate'} di ${uffici.length} ${uffici.length === 1 ? 'ufficio' : 'uffici'}`, responsabile && `Responsabile: ${responsabile}`, societa && cDi(societa)?.nome].filter(Boolean).join(' · ')}
            </div>
          </div>
          <div className="flex-none text-right text-xs text-neutro-700">
            <img src={logo} alt="Gruppo CEC Bigoli" className="mb-2 ml-auto h-11 w-[170px] object-cover" />
            Situazione al {formattaDataOra(new Date().toISOString())}
          </div>
        </header>

        {voci.length === 0 ? <p className="mt-6">Nessuna rata in questa data.</p> : <>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <Box titolo="Totale della scadenza" t={tutte} nota={`${voci.length} rate`} />
            <Box titolo="Da pagare" t={totaliDi(daPagare.map((x) => x.rata))} nota={`${daPagare.length} rate${recuperi.length ? ` (di cui ${recuperi.length === 1 ? '1 recupero' : `${recuperi.length} recuperi`}: più sanzione e interessi del riconteggio)` : ''}`} />
            <Box titolo="Già pagato" t={totaliDi(pagate.map((x) => x.rata))} nota={`${pagate.length} rate`} />
          </div>

          <table className="mt-5 w-full border-collapse text-[11.5px]">
            <thead>
              <tr className="border-b border-testo text-left text-[9.5px] uppercase tracking-[0.06em] text-attenuato">
                <th className={`${cella} font-medium`}>Ufficio</th><th className={`${cella} font-medium`}>Tributo</th><th className={`${cella} font-medium`}>Rata</th>
                <th className={`${cella} text-right font-medium`}>Capitale</th><th className={`${cella} text-right font-medium`}>Sanzioni</th>
                <th className={`${cella} text-right font-medium`}>Interessi</th><th className={`${cella} text-right font-medium`}>Totale</th><th className={`${cella} font-medium`}>Stato</th>
              </tr>
            </thead>
            {uffici.map((id) => {
              const mie = voci.filter((x) => x.pratica.contribuente_id === id)
              const t = totaliDi(mie.map((x) => x.rata))
              const c = cDi(id)
              return (
                <tbody key={id} style={{ breakInside: 'avoid' }} className="border-b border-divisore">
                  {mie.map((x, k) => {
                    const st = statoVoce(x, oggi)
                    return (
                      <tr key={`${x.pratica.id}-${x.rata.numero}${x.recupero ? '-r' : ''}`} className={`${k > 0 ? 'border-t border-riga' : ''} ${x.recupero && !x.rata.pagata ? 'bg-att-fondo' : ''}`}>
                        <td className={`${cella} align-top`}>{k === 0 && <><b className="text-[12.5px]">{c?.nome ?? '—'}</b>{c?.responsabile && <div className="text-[10.5px] text-neutro-700">{c.responsabile}</div>}</>}</td>
                        <td className={cella}>{x.pratica.tributo}</td>
                        <td className={`${cella} whitespace-nowrap`}>{x.recupero ? `Recupero ${x.rata.numero}/${x.pratica.rate.length} del ${formattaData(x.rata.scadenza)}` : `${x.rata.numero}/${x.pratica.rate.length}`}</td>
                        <td className={num}>{formattaEuro(x.rata.quota_capitale_cent)}</td>
                        <td className={num}>{formattaEuro(x.rata.sanzioni_cent)}</td>
                        <td className={num}>{formattaEuro(x.rata.interessi_cent)}</td>
                        <td className={`${num} font-semibold`}>{formattaEuro(x.rata.totale_cent)}{x.recupero && !x.rata.pagata ? ' +' : ''}</td>
                        <td className={`${cella} text-[11px] ${st.rosso ? 'font-semibold text-err-testo' : st.giallo ? 'text-att-testo' : ''}`}>{st.testo}</td>
                      </tr>
                    )
                  })}
                  {mie.length > 1 && (
                    <tr className="border-t border-riga text-neutro-700">
                      <td className={cella} /><td className={`${cella} text-[11px]`} colSpan={2}>Totale {c?.nome}</td>
                      <td className={num}>{formattaEuro(t.quota_capitale_cent)}</td><td className={num}>{formattaEuro(t.sanzioni_cent)}</td>
                      <td className={num}>{formattaEuro(t.interessi_cent)}</td><td className={`${num} font-semibold text-testo`}>{formattaEuro(t.totale_cent)}</td><td className={cella} />
                    </tr>
                  )}
                </tbody>
              )
            })}
            <tbody>
              <tr className="border-t-2 border-testo font-semibold">
                <td className={cella} colSpan={3}>Totale della scadenza</td>
                <td className={num}>{formattaEuro(tutte.quota_capitale_cent)}</td><td className={num}>{formattaEuro(tutte.sanzioni_cent)}</td>
                <td className={num}>{formattaEuro(tutte.interessi_cent)}</td><td className={num}>{formattaEuro(tutte.totale_cent)}</td><td className={cella} />
              </tr>
            </tbody>
          </table>
          {recuperi.length > 0 && (
            <p className="mt-3 text-[11px] text-neutro-700">
              Le righe evidenziate ("+") sono rate saltate da saldare entro questa data: all'importo della rata vanno aggiunti sanzione e interessi del riconteggio (ravvedimento).
            </p>
          )}
          <p className="mt-6 border-t border-divisore pt-3 text-[10.5px] text-neutro-600">
            Prospetto riassuntivo a uso interno: fanno fede i documenti dell'Agenzia delle Entrate e dell'Agenzia Entrate-Riscossione.
          </p>
        </>}
      </div>
    </div>
  )
}
