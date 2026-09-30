/**
 * Calendario mensile delle rate: elenco dei soli giorni con rate in scadenza, con totale scomposto, uffici e stato
 * (pagato / da pagare / saltato); clic su un giorno per il dettaglio e per segnare le rate pagate.
 * Sotto: totali del mese scomposti e riepilogo del mese per società (per organizzare la cassa).
 */
import { useState } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from 'lucide-react'
import { useSessioneAttiva } from '../../lib/sessione'
import type { Contribuente, PraticaTributo } from '../../lib/tipi'
import { impostaRatePagate, rateTra, totaliDi, tutteLeRate, type RataDi } from '../../lib/tributi'
import { formattaData, formattaEuro, oggiIso } from '../../lib/utils/formato'
import { useSoloLettura } from '../SoloLettura'
import { Avviso, Bottone, Etichetta, Riquadro, Tabella, TavolaKpi, Vuoto } from '../ui'
import { Scomposizione } from './comuni'

const MESI = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre']
const GIORNI = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab']   // indice = getUTCDay()

const due = (n: number) => String(n).padStart(2, '0')
/** Euro senza decimali per l'elenco degli uffici: "1.033 €" */
const euroCorto = (c: number) => `${Math.round(c / 100).toLocaleString('it-IT', { useGrouping: 'always' } as Intl.NumberFormatOptions)} €`

export default function Calendario({ contribuenti, pratiche, onApriPratica }: { contribuenti: Contribuente[]; pratiche: PraticaTributo[]; onApriPratica: (id: string) => void }) {
  const { token, nome } = useSessioneAttiva()
  const soloLettura = useSoloLettura()
  const oggi = oggiIso()
  const [mese, setMese] = useState(oggi.slice(0, 7))            // "AAAA-MM"
  const [giorno, setGiorno] = useState<string | null>(null)
  const [responsabile, setResponsabile] = useState('')
  const [errore, setErrore] = useState<string | null>(null)
  const [inCorso, setInCorso] = useState(false)

  const [anno, m] = mese.split('-').map(Number)
  const giorniNelMese = new Date(Date.UTC(anno, m, 0)).getUTCDate()
  const primo = `${mese}-01`, ultimo = `${mese}-${due(giorniNelMese)}`

  const contribuenteDi = (id: string) => contribuenti.find((c) => c.id === id)
  const responsabili = [...new Set(contribuenti.map((c) => c.responsabile).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'it'))
  const filtrate = responsabile ? pratiche.filter((p) => contribuenteDi(p.contribuente_id)?.responsabile === responsabile) : pratiche

  const delMese = rateTra(filtrate, primo, ultimo)
  const perGiorno = new Map<string, RataDi[]>()
  delMese.forEach((x) => perGiorno.set(x.rata.scadenza, [...(perGiorno.get(x.rata.scadenza) ?? []), x]))
  const saltatePrima = tutteLeRate(filtrate).filter((x) => !x.rata.pagata && x.rata.scadenza < primo && x.rata.scadenza < oggi)

  const totMese = totaliDi(delMese.map((x) => x.rata))
  const pagatoMese = totaliDi(delMese.filter((x) => x.rata.pagata).map((x) => x.rata))
  const daPagareMese = totaliDi(delMese.filter((x) => !x.rata.pagata).map((x) => x.rata))
  const saltateMese = delMese.filter((x) => !x.rata.pagata && x.rata.scadenza < oggi)

  function cambiaMese(delta: number) {
    const d = new Date(Date.UTC(anno, m - 1 + delta, 1))
    setMese(`${d.getUTCFullYear()}-${due(d.getUTCMonth() + 1)}`); setGiorno(null)
  }

  async function segna(voci: RataDi[], pagata: boolean) {
    setErrore(null); setInCorso(true)
    try {
      await impostaRatePagate(token, nome, voci.map((x) => ({ praticaId: x.pratica.id, numero: x.rata.numero, scadenza: x.rata.scadenza })), pagata,
        voci.length === 1 ? `${contribuenteDi(voci[0].pratica.contribuente_id)?.nome ?? ''} ${voci[0].pratica.tributo}` : `scadenza ${formattaData(voci[0].rata.scadenza)}`)
    } catch (e) { setErrore((e as Error).message) } finally { setInCorso(false) }
  }

  /** Stato di un giorno: tutto pagato, scaduto con rate non pagate, oppure da pagare. */
  function statoGiorno(data: string, rate: RataDi[]): { testo: string; tono: 'verde' | 'rosso' | 'blu'; bordo: string } {
    if (rate.every((x) => x.rata.pagata)) return { testo: 'Pagato', tono: 'verde', bordo: 'border-ok-bordo' }
    if (data < oggi) return { testo: 'Scaduto', tono: 'rosso', bordo: 'border-err-bordo' }
    return { testo: 'Da pagare', tono: 'blu', bordo: 'border-accento' }
  }

  const giorniConRate = [...perGiorno.keys()].sort()

  // Riepilogo del mese per società
  const perSocieta = [...new Set(delMese.map((x) => x.pratica.contribuente_id))].map((id) => {
    const mie = delMese.filter((x) => x.pratica.contribuente_id === id)
    const c = contribuenteDi(id)
    return {
      id, nome: c?.nome ?? '—', responsabile: c?.responsabile ?? '', n: mie.length,
      date: [...new Set(mie.map((x) => x.rata.scadenza))].map((d) => formattaData(d).slice(0, 5)).join(', '),
      t: totaliDi(mie.map((x) => x.rata)), daPagare: totaliDi(mie.filter((x) => !x.rata.pagata).map((x) => x.rata)).totale_cent,
    }
  }).sort((a, b) => b.daPagare - a.daPagare || a.nome.localeCompare(b.nome, 'it'))
  type RigaSoc = (typeof perSocieta)[number]
  const rigaTot: RigaSoc = { id: '_tot', nome: 'Totale', responsabile: '', n: delMese.length, date: '', t: totMese, daPagare: daPagareMese.totale_cent }

  return (
    <div>
      {/* Barra: mese, navigazione, filtro responsabile */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => cambiaMese(-1)} className="btn btn-secondario btn-icona" aria-label="Mese precedente"><ChevronLeft size={18} /></button>
        <h2 className="m-0 min-w-[220px] text-center text-[28px]">{MESI[m - 1]} {anno}</h2>
        <button type="button" onClick={() => cambiaMese(1)} className="btn btn-secondario btn-icona" aria-label="Mese successivo"><ChevronRight size={18} /></button>
        {mese !== oggi.slice(0, 7) && <Bottone variante="ghost" onClick={() => { setMese(oggi.slice(0, 7)); setGiorno(null) }}>Torna a oggi</Bottone>}
        <select value={responsabile} onChange={(e) => { setResponsabile(e.target.value); setGiorno(null) }} className="input ml-auto w-auto">
          <option value="">Tutti i responsabili</option>
          {responsabili.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>

      {saltatePrima.length > 0 && (
        <div className="mb-5"><Avviso tipo="errore">
          Nei mesi precedenti ci sono <b>{saltatePrima.length} rate scadute non segnate come pagate</b> ({formattaEuro(totaliDi(saltatePrima.map((x) => x.rata)).totale_cent)}).
          Se sono state pagate, segnatele come pagate; altrimenti vanno riconteggiate (le trovi nella scheda stampabile di ogni ufficio).
          {' '}<button type="button" className="underline" onClick={() => { setMese(saltatePrima[0].rata.scadenza.slice(0, 7)); setGiorno(saltatePrima[0].rata.scadenza) }}>Vai alla prima ({formattaData(saltatePrima[0].rata.scadenza)})</button>
        </Avviso></div>
      )}

      <TavolaKpi celle={[
        { titolo: `In scadenza a ${MESI[m - 1].toLowerCase()}`, valore: formattaEuro(totMese.totale_cent), nota: <>{delMese.length} rate · Capitale {formattaEuro(totMese.quota_capitale_cent)} · Sanzioni {formattaEuro(totMese.sanzioni_cent)} · Interessi {formattaEuro(totMese.interessi_cent)}</> },
        { titolo: 'Già pagato', valore: formattaEuro(pagatoMese.totale_cent), nota: `${delMese.filter((x) => x.rata.pagata).length} rate` },
        saltateMese.length
          ? { titolo: 'Da pagare', valore: formattaEuro(daPagareMese.totale_cent), nota: `di cui ${saltateMese.length} rate già scadute (${formattaEuro(totaliDi(saltateMese.map((x) => x.rata)).totale_cent)})`, tono: 'rosso' as const }
          : { titolo: 'Da pagare', valore: formattaEuro(daPagareMese.totale_cent), nota: `${delMese.filter((x) => !x.rata.pagata).length} rate` },
      ]} />

      {errore && <div className="mb-4"><Avviso tipo="errore">{errore}</Avviso></div>}

      {/* Solo i giorni con rate in scadenza */}
      {giorniConRate.length === 0 ? <Vuoto>Nessuna rata in scadenza in questo mese.</Vuoto> : (
        <Riquadro>
          {giorniConRate.map((data, i) => {
            const rate = perGiorno.get(data)!
            const aperto = giorno === data
            const perUfficio = [...new Set(rate.map((x) => x.pratica.contribuente_id))].map((id) => ({
              id, nome: contribuenteDi(id)?.nome ?? '—', tot: rate.filter((x) => x.pratica.contribuente_id === id).reduce((s, x) => s + x.rata.totale_cent, 0),
            })).sort((a, b) => b.tot - a.tot)
            const st = statoGiorno(data, rate)
            const d = new Date(data + 'T00:00:00Z')
            return (
              <div key={data} className={i > 0 ? 'border-t border-divisore' : ''}>
                <button type="button" onClick={() => setGiorno(aperto ? null : data)} aria-expanded={aperto}
                  className={`flex w-full flex-wrap items-center gap-x-6 gap-y-2 border-l-4 px-4 py-3.5 text-left hover:bg-[rgba(29,31,32,0.04)] ${st.bordo} ${aperto ? 'bg-[rgba(89,128,166,0.08)]' : ''}`}>
                  <span className="flex w-[92px] flex-none items-baseline gap-2">
                    <span className={`num font-titolo text-[30px] font-semibold leading-none ${data === oggi ? 'text-accento-700' : ''}`}>{d.getUTCDate()}</span>
                    <span className="text-[11px] uppercase leading-tight tracking-[0.06em] text-neutro-700">{GIORNI[d.getUTCDay()]}<br />{MESI[m - 1].slice(0, 3)}</span>
                  </span>
                  <span className="w-[320px] flex-none"><Scomposizione etichetta="" t={totaliDi(rate.map((x) => x.rata))} evidenzia /></span>
                  <span className="flex min-w-[200px] flex-1 flex-wrap gap-x-4 gap-y-0.5 text-[13px] leading-[1.5]">
                    {perUfficio.map((u) => <span key={u.id} className="whitespace-nowrap">{u.nome} <span className="num text-neutro-700">{euroCorto(u.tot)}</span></span>)}
                  </span>
                  <span className="flex flex-none items-center gap-3">
                    <span className="text-[12px] text-neutro-700">{rate.length} {rate.length === 1 ? 'rata' : 'rate'}</span>
                    <Etichetta tono={st.tono}>{st.testo}</Etichetta>
                    {aperto ? <ChevronUp size={18} className="text-neutro-600" /> : <ChevronDown size={18} className="text-neutro-600" />}
                  </span>
                </button>
                {aperto && (
                  <div className="border-l-4 border-transparent px-4 pb-5 pt-1">
                    <div className="mb-3 flex justify-end">
                      {!soloLettura && rate.some((x) => !x.rata.pagata) && (
                        <Bottone variante="secondario" piccolo disabled={inCorso} onClick={() => segna(rate.filter((x) => !x.rata.pagata), true)}>Segna tutte pagate</Bottone>
                      )}
                    </div>
                    <Tabella righe={rate.map((x) => ({ ...x, id: `${x.pratica.id}-${x.rata.numero}` }))} onRiga={(x) => onApriPratica(x.pratica.id)} colonne={[
                      { chiave: 's', etichetta: 'Società', render: (x) => <span className="font-medium">{contribuenteDi(x.pratica.contribuente_id)?.nome}</span> },
                      { chiave: 'r', etichetta: 'Responsabile', render: (x) => contribuenteDi(x.pratica.contribuente_id)?.responsabile || '—' },
                      { chiave: 't', etichetta: 'Tributo', render: (x) => x.pratica.tributo },
                      { chiave: 'n', etichetta: 'Rata', render: (x) => `${x.rata.numero}/${x.pratica.rate.length}` },
                      { chiave: 'c', etichetta: 'Capitale', allinea: 'dx', render: (x) => formattaEuro(x.rata.quota_capitale_cent) },
                      { chiave: 'sa', etichetta: 'Sanzioni', allinea: 'dx', render: (x) => formattaEuro(x.rata.sanzioni_cent) },
                      { chiave: 'i', etichetta: 'Interessi', allinea: 'dx', render: (x) => formattaEuro(x.rata.interessi_cent) },
                      { chiave: 'to', etichetta: 'Totale', allinea: 'dx', render: (x) => <b>{formattaEuro(x.rata.totale_cent)}</b> },
                      { chiave: 'st', etichetta: 'Stato', render: (x) => (
                        <span onClick={(e) => e.stopPropagation()}>
                          <button type="button" disabled={soloLettura || inCorso} onClick={() => segna([x], !x.rata.pagata)} className="disabled:cursor-default"
                            title={soloLettura ? undefined : x.rata.pagata ? 'Clicca per riportarla a "da pagare"' : 'Clicca per segnarla pagata'}>
                            {x.rata.pagata ? <Etichetta tono="verde">Pagata</Etichetta> : x.rata.scadenza < oggi ? <Etichetta tono="rosso">Scaduta</Etichetta> : <Etichetta>Da pagare</Etichetta>}
                          </button>
                        </span>
                      ) },
                    ]} />
                    <p className="mt-2 text-[13px] text-neutro-700">Clicca su una riga per aprire il piano; clicca sullo stato per segnare la rata pagata o annullare.</p>
                  </div>
                )}
              </div>
            )
          })}
        </Riquadro>
      )}
      <p className="mt-2 text-xs text-neutro-700">Sono elencati solo i giorni con rate in scadenza. Clicca su un giorno per vedere le rate e segnarle pagate.</p>

      {/* Riepilogo del mese per società */}
      <div className="mt-10">
        <h3 className="m-0 mb-1">{MESI[m - 1]} {anno}: cosa deve pagare ogni società</h3>
        <p className="mb-4 text-[13px] text-neutro-700">Per organizzare la cassa: quanto serve a ciascuna società nel mese, scomposto in capitale, sanzioni e interessi.</p>
        <Tabella<RigaSoc> righe={perSocieta} rigaTotale={perSocieta.length ? rigaTot : undefined} vuoto="Nessuna rata in scadenza in questo mese." colonne={[
          { chiave: 'n', etichetta: 'Società', render: (x) => <span className="font-medium">{x.nome}</span> },
          { chiave: 'r', etichetta: 'Responsabile', render: (x) => x.responsabile || (x.id === '_tot' ? '' : '—') },
          { chiave: 'd', etichetta: 'Scadenze', render: (x) => x.date },
          { chiave: 'q', etichetta: 'Rate', allinea: 'dx', render: (x) => x.n },
          { chiave: 'c', etichetta: 'Capitale', allinea: 'dx', render: (x) => formattaEuro(x.t.quota_capitale_cent) },
          { chiave: 's', etichetta: 'Sanzioni', allinea: 'dx', render: (x) => formattaEuro(x.t.sanzioni_cent) },
          { chiave: 'i', etichetta: 'Interessi', allinea: 'dx', render: (x) => formattaEuro(x.t.interessi_cent) },
          { chiave: 't', etichetta: 'Totale', allinea: 'dx', render: (x) => formattaEuro(x.t.totale_cent) },
          { chiave: 'p', etichetta: 'Ancora da pagare', allinea: 'dx', render: (x) => <b>{formattaEuro(x.daPagare)}</b> },
        ]} />
      </div>
    </div>
  )
}
