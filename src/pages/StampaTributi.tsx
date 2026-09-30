/**
 * Scheda sintetica stampabile dei tributi di un ufficio (o di tutti gli uffici di un responsabile, una pagina per
 * ufficio): situazione, rate saltate da riconteggiare, prossime scadenze, piani attivi, piani ancora da inserire.
 * Si salva in PDF con "Stampa → Salva come PDF".
 */
import { Fragment, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Printer } from 'lucide-react'
import { Bottone, Caricamento } from '../components/ui'
import logo from '../assets/logo-gruppo.png'
import { attivi } from '../lib/store'
import { STATI_PRATICA, TIPI_PRATICA, etichettaDi, type Contribuente, type PraticaTributo } from '../lib/tipi'
import { daInserire, gestita, inCorso, riepilogoPratiche, riepilogoRate, statoEffettivo, termineRegolarizzazione, totaliDi, tutteLeRate, type Totali } from '../lib/tributi'
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
    ? contribuenti.filter((c) => c.responsabile === nomeValore && pratiche.some((p) => p.contribuente_id === c.id && (inCorso(p) || daInserire(p))))
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
