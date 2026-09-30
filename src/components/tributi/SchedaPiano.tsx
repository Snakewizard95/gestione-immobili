/**
 * Dettaglio di una pratica (avviso bonario, cartella, rottamazione): dati principali, tabella delle rate
 * con "pagata sì/no" e totali di capitale, sanzioni, interessi, pagato e residuo.
 */
import { useState } from 'react'
import { Check, FileWarning, Pencil, Plus, Trash2, Undo2 } from 'lucide-react'
import { aggiorna, campiModifica } from '../../lib/store'
import Allegati from '../Allegati'
import { useSessioneAttiva } from '../../lib/sessione'
import { CATEGORIE_ALLEGATO_TRIBUTI, STATI_PRATICA, TIPI_PRATICA, etichettaDi, type Contribuente, type PraticaTributo, type RataTributo } from '../../lib/tipi'
import { decaduto, impostaRatePagate, residuoDecaduto, riepilogoRate, situazioneRata, statoEffettivo } from '../../lib/tributi'
import { formattaData, formattaEuro, oggiIso } from '../../lib/utils/formato'
import { useSoloLettura } from '../SoloLettura'
import { Avviso, Bottone, Etichetta, TavolaKpi } from '../ui'
import { EtichettaStato } from './comuni'

export default function SchedaPiano({ pratica, contribuente, onModifica, onCartellaArrivata }: {
  pratica: PraticaTributo; contribuente?: Contribuente; onModifica?: () => void
  /** Dopo aver segnato l'arrivo della cartella: apre l'inserimento del piano della cartella */
  onCartellaArrivata?: () => void
}) {
  const { token, nome } = useSessioneAttiva()
  const soloLettura = useSoloLettura()
  const [errore, setErrore] = useState<string | null>(null)
  const [confermaElimina, setConfermaElimina] = useState(false)
  const [decadenza, setDecadenza] = useState<string | null>(null)   // data in inserimento per "Segna come decaduto"
  const [inCorso, setInCorso] = useState<number | null>(null)
  const oggi = oggiIso()
  const r = riepilogoRate(pratica.rate, oggi)

  /** Elimina la pratica ("soft": resta nella storia delle modifiche). La finestra si chiude da sola. */
  async function elimina() {
    setErrore(null); setInCorso(-1)
    try {
      await aggiorna<PraticaTributo>(token, 'pratiche_tributi', (rec) => rec.map((p) => (p.id === pratica.id ? { ...p, eliminato_il: new Date().toISOString(), ...campiModifica(nome) } : p)),
        `${nome}: elimina piano ${contribuente?.nome ?? ''} ${pratica.tributo}`)
    } catch (e) { setErrore((e as Error).message); setInCorso(null) }
  }

  const eDecaduto = decaduto(pratica)
  const resDec = residuoDecaduto(pratica)

  /** Aggiorna campi della pratica con un solo salvataggio. */
  async function salvaCampi(campi: Partial<PraticaTributo>, azione: string) {
    setErrore(null); setInCorso(-1)
    try {
      await aggiorna<PraticaTributo>(token, 'pratiche_tributi', (rec) => rec.map((p) => (p.id === pratica.id ? { ...p, ...campi, ...campiModifica(nome) } : p)),
        `${nome}: ${azione} ${contribuente?.nome ?? ''} ${pratica.tributo}`)
      return true
    } catch (e) { setErrore((e as Error).message); return false } finally { setInCorso(null) }
  }

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
            eDecaduto
              ? { titolo: 'Non pagato (va in cartella)', valore: formattaEuro(resDec.totale_cent), nota: `${pratica.rate.filter((x) => !x.pagata).length} rate non più in scadenza`, tono: 'rosso' as const }
              : r.scadute.length
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
                  const sit = situazioneRata(pratica, x, oggi)
                  return (
                    <tr key={`${x.numero}-${x.scadenza}`}>
                      <td className="num">{x.numero}</td>
                      <td className="num">{formattaData(x.scadenza)}</td>
                      <td className="num text-right">{formattaEuro(x.quota_capitale_cent)}</td>
                      <td className="num text-right">{formattaEuro(x.sanzioni_cent)}</td>
                      <td className="num text-right">{formattaEuro(x.interessi_cent)}</td>
                      <td className="num text-right font-semibold">{formattaEuro(x.totale_cent)}</td>
                      <td>
                        <button type="button" disabled={soloLettura || inCorso !== null || (eDecaduto && !x.pagata)} onClick={() => cambiaPagata(x)}
                          title={soloLettura ? undefined : x.pagata ? 'Clicca per riportarla a "da pagare"' : 'Clicca per segnarla pagata oggi'}
                          className="disabled:cursor-default">
                          {x.pagata
                            ? <Etichetta tono="verde"><Check size={12} className="inline" /> Pagata{x.pagata_il ? ` il ${formattaData(x.pagata_il)}` : ''}</Etichetta>
                            : eDecaduto ? <Etichetta tono="grigio">Decaduta</Etichetta>
                            : sit.tipo === 'da_recuperare' ? <Etichetta tono="giallo">Non pagata · da recuperare entro {formattaData(sit.entro)}</Etichetta>
                            : sit.tipo === 'oltre_termine' ? <Etichetta tono="rosso">{pratica.tipo === 'avviso_bonario' ? 'Termine superato: rischio decadenza' : 'Scaduta'}</Etichetta>
                            : <Etichetta tono="grigio">Da pagare</Etichetta>}
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

      {eDecaduto && (
        <div className="mt-5">
          <Avviso tipo="attenzione">
            <div className="font-semibold">Piano decaduto{pratica.decaduto_il ? ` il ${formattaData(pratica.decaduto_il)}` : ''}{pratica.cartella_arrivata_il ? ` · cartella arrivata il ${formattaData(pratica.cartella_arrivata_il)}` : ' · cartella esattoriale in arrivo'}</div>
            <div className="mt-1">
              Le rate non pagate non sono più scadenze. Restavano da pagare {formattaEuro(resDec.totale_cent)}: imposta {formattaEuro(resDec.quota_capitale_cent)},
              sanzioni {formattaEuro(resDec.sanzioni_cent)}, interessi {formattaEuro(resDec.interessi_cent)}. La cartella avrà un importo diverso: di solito imposta
              residua, sanzioni piene (non più ridotte) e interessi, più gli oneri di riscossione.
            </div>
            {!soloLettura && (
              <div className="mt-3 flex flex-wrap gap-2">
                {!pratica.cartella_arrivata_il && onCartellaArrivata && (
                  <Bottone piccolo disabled={inCorso !== null} onClick={async () => { if (await salvaCampi({ cartella_arrivata_il: oggi }, 'cartella arrivata per il piano decaduto')) onCartellaArrivata() }}>
                    Cartella arrivata: inserisci il piano della cartella
                  </Bottone>
                )}
                <Bottone variante="secondario" piccolo disabled={inCorso !== null} onClick={() => salvaCampi({ stato: 'rateizzato', decaduto_il: '', cartella_arrivata_il: '' }, 'annulla decadenza del piano')}>
                  <Undo2 size={14} /> Annulla la decadenza
                </Bottone>
              </div>
            )}
          </Avviso>
        </div>
      )}

      {errore && <div className="mt-4"><Avviso tipo="errore">{errore}</Avviso></div>}
      {pratica.note && <p className="mt-5 text-[13px] text-neutro-700">Note: {pratica.note}</p>}
      {!soloLettura && (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          {decadenza !== null ? (
            <span className="flex flex-wrap items-center gap-2 text-[13px]">
              Decaduto il <input type="date" value={decadenza} onChange={(e) => setDecadenza(e.target.value)} className="input w-auto !min-h-[32px] !py-1" />
              <Bottone variante="pericolo" disabled={inCorso !== null || !decadenza} onClick={async () => { if (await salvaCampi({ stato: 'decaduto', decaduto_il: decadenza!, cartella_arrivata_il: '' }, 'piano decaduto')) setDecadenza(null) }}>Conferma decadenza</Bottone>
              <Bottone variante="secondario" onClick={() => setDecadenza(null)}>Annulla</Bottone>
            </span>
          ) : !confermaElimina
            ? <span className="flex flex-wrap gap-1">
                <Bottone variante="ghost" className="!text-accento-900" onClick={() => setConfermaElimina(true)}><Trash2 size={15} /> Elimina piano</Bottone>
                {!eDecaduto && pratica.rate.some((x) => !x.pagata) && (
                  <Bottone variante="ghost" className="!text-accento-900" onClick={() => setDecadenza(oggi)} title="Le rate non pagate escono dalle scadenze: arriverà una cartella esattoriale">
                    <FileWarning size={15} /> Segna come decaduto
                  </Bottone>
                )}
              </span>
            : (
              <span className="flex flex-wrap items-center gap-2 text-[13px]">
                Eliminare il piano {pratica.tributo} di {contribuente?.nome}{pratica.rate.length ? ` con tutte le sue ${pratica.rate.length} rate` : ''}?
                <Bottone variante="pericolo" disabled={inCorso !== null} onClick={elimina}>Sì, elimina</Bottone>
                <Bottone variante="secondario" onClick={() => setConfermaElimina(false)}>No</Bottone>
              </span>
            )}
          {onModifica && (
            <Bottone variante={pratica.rate.length ? 'secondario' : 'primario'} onClick={onModifica}>
              {pratica.rate.length ? <><Pencil size={15} /> Modifica piano</> : <><Plus size={15} /> Inserisci il piano (anche da PDF)</>}
            </Bottone>
          )}
        </div>
      )}
      <div className="mt-6 border-t border-divisore pt-5">
        <Allegati collezione="pratiche_tributi" recordId={pratica.id} categorie={CATEGORIE_ALLEGATO_TRIBUTI} descrizione={`${contribuente?.nome ?? ''} ${pratica.tributo}`} />
      </div>
    </div>
  )
}
