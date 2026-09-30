/**
 * Dettaglio di una pratica (avviso bonario, cartella, rottamazione): dati principali, tabella delle rate
 * con "pagata sì/no" e totali di capitale, sanzioni, interessi, pagato e residuo.
 */
import { useState } from 'react'
import { Check, Pencil, Plus } from 'lucide-react'
import Allegati from '../Allegati'
import { useSessioneAttiva } from '../../lib/sessione'
import { CATEGORIE_ALLEGATO_TRIBUTI, STATI_PRATICA, TIPI_PRATICA, etichettaDi, type Contribuente, type PraticaTributo, type RataTributo } from '../../lib/tipi'
import { impostaRatePagate, riepilogoRate, statoEffettivo } from '../../lib/tributi'
import { formattaData, formattaEuro, oggiIso } from '../../lib/utils/formato'
import { useSoloLettura } from '../SoloLettura'
import { Avviso, Bottone, Etichetta, TavolaKpi } from '../ui'
import { EtichettaStato } from './comuni'

export default function SchedaPiano({ pratica, contribuente, onModifica }: { pratica: PraticaTributo; contribuente?: Contribuente; onModifica?: () => void }) {
  const { token, nome } = useSessioneAttiva()
  const soloLettura = useSoloLettura()
  const [errore, setErrore] = useState<string | null>(null)
  const [inCorso, setInCorso] = useState<number | null>(null)
  const oggi = oggiIso()
  const r = riepilogoRate(pratica.rate, oggi)

  /** Segna una rata pagata (con la data di oggi) o la riporta a "da pagare". */
  async function cambiaPagata(rata: RataTributo) {
    setErrore(null); setInCorso(rata.numero)
    const pagata = !rata.pagata
    try {
      await impostaRatePagate(token, nome, [{ praticaId: pratica.id, numero: rata.numero, scadenza: rata.scadenza }], pagata, `${contribuente?.nome ?? ''} ${pratica.tributo}`)
    } catch (e) { setErrore((e as Error).message) } finally { setInCorso(null) }
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-2 text-[13px] text-neutro-700">
        <Etichetta tono="blu">{etichettaDi(TIPI_PRATICA, pratica.tipo)}</Etichetta>
        <EtichettaStato pratica={pratica} />
        {pratica.data_notifica && <span>Notificato il {formattaData(pratica.data_notifica)}</span>}
        {pratica.importo_cent != null && <span>· Importo avviso {formattaEuro(pratica.importo_cent)}</span>}
        {pratica.numero_atto && <span>· Atto n. {pratica.numero_atto}</span>}
      </div>

      {pratica.rate.length > 0 ? (
        <>
          <TavolaKpi celle={[
            { titolo: 'Totale piano', valore: formattaEuro(r.totale.totale_cent), nota: `${r.rate} rate` },
            { titolo: 'Pagato', valore: formattaEuro(r.pagato.totale_cent), nota: `${r.ratePagate} rate pagate` },
            r.scadute.length
              ? { titolo: 'Da pagare', valore: formattaEuro(r.residuo.totale_cent), nota: `${r.scadute.length} ${r.scadute.length === 1 ? 'rata scaduta' : 'rate scadute'}: rischio decadenza del piano`, tono: 'rosso' as const }
              : { titolo: 'Da pagare', valore: formattaEuro(r.residuo.totale_cent), nota: r.prossima ? `Prossima: ${formattaData(r.prossima.scadenza)}` : undefined },
          ]} />
          <div className="-mt-4 overflow-x-auto">
            <table className="tabella">
              <thead>
                <tr>
                  <th>N.</th><th>Scadenza</th><th className="text-right">Quota capitale</th><th className="text-right">Sanzioni</th>
                  <th className="text-right">Interessi</th><th className="text-right">Totale rata</th><th>Stato</th>
                </tr>
              </thead>
              <tbody>
                {pratica.rate.map((x) => {
                  const scaduta = !x.pagata && x.scadenza < oggi
                  return (
                    <tr key={`${x.numero}-${x.scadenza}`}>
                      <td className="num">{x.numero}</td>
                      <td className="num">{formattaData(x.scadenza)}</td>
                      <td className="num text-right">{formattaEuro(x.quota_capitale_cent)}</td>
                      <td className="num text-right">{formattaEuro(x.sanzioni_cent)}</td>
                      <td className="num text-right">{formattaEuro(x.interessi_cent)}</td>
                      <td className="num text-right font-semibold">{formattaEuro(x.totale_cent)}</td>
                      <td>
                        <button type="button" disabled={soloLettura || inCorso !== null} onClick={() => cambiaPagata(x)}
                          title={soloLettura ? undefined : x.pagata ? 'Clicca per riportarla a "da pagare"' : 'Clicca per segnarla pagata oggi'}
                          className="disabled:cursor-default">
                          {x.pagata
                            ? <Etichetta tono="verde"><Check size={12} className="inline" /> Pagata{x.pagata_il ? ` il ${formattaData(x.pagata_il)}` : ''}</Etichetta>
                            : scaduta ? <Etichetta tono="rosso">Scaduta</Etichetta> : <Etichetta tono="grigio">Da pagare</Etichetta>}
                        </button>
                      </td>
                    </tr>
                  )
                })}
                <tr className="totale">
                  <td colSpan={2}>Totale</td>
                  <td className="num text-right">{formattaEuro(r.totale.quota_capitale_cent)}</td>
                  <td className="num text-right">{formattaEuro(r.totale.sanzioni_cent)}</td>
                  <td className="num text-right">{formattaEuro(r.totale.interessi_cent)}</td>
                  <td className="num text-right">{formattaEuro(r.totale.totale_cent)}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
          {!soloLettura && <p className="mt-3 text-[13px] text-neutro-700">Clicca sullo stato di una rata per segnarla pagata (con la data di oggi) o per annullare.</p>}
        </>
      ) : (
        <Avviso tipo="info">
          Nessuna rata inserita per questa pratica ({etichettaDi(STATI_PRATICA, statoEffettivo(pratica)).toLowerCase()}
          {pratica.rate_concordate ? `, ${pratica.rate_concordate} rate concordate` : ''}).
        </Avviso>
      )}

      {errore && <div className="mt-4"><Avviso tipo="errore">{errore}</Avviso></div>}
      {pratica.note && <p className="mt-5 text-[13px] text-neutro-700">Note: {pratica.note}</p>}
      {!soloLettura && onModifica && (
        <div className="mt-5 flex justify-end">
          <Bottone variante={pratica.rate.length ? 'secondario' : 'primario'} onClick={onModifica}>
            {pratica.rate.length ? <><Pencil size={15} /> Modifica piano</> : <><Plus size={15} /> Inserisci il piano (anche da PDF)</>}
          </Bottone>
        </div>
      )}
      <div className="mt-6 border-t border-divisore pt-5">
        <Allegati collezione="pratiche_tributi" recordId={pratica.id} categorie={CATEGORIE_ALLEGATO_TRIBUTI} descrizione={`${contribuente?.nome ?? ''} ${pratica.tributo}`} />
      </div>
    </div>
  )
}
