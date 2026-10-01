/**
 * Scheda "Decaduti": piani segnati come decaduti. Le loro rate non pagate non sono più scadenze (non compaiono nel
 * calendario né nei totali da pagare) e resteranno qui finché non arriva la cartella esattoriale.
 * "Cartella arrivata" registra la data e apre l'inserimento del piano della cartella; "Annulla" riporta il piano tra quelli in corso.
 */
import { useState } from 'react'
import { useSessioneAttiva } from '../../lib/sessione'
import { aggiorna, campiModifica } from '../../lib/store'
import type { Contribuente, PraticaTributo } from '../../lib/tipi'
import { decaduto, residuoDecaduto, totaliDi } from '../../lib/tributi'
import { formattaData, formattaEuro, oggiIso } from '../../lib/utils/formato'
import { SoloSeModifica } from '../SoloLettura'
import { Avviso, Bottone, Etichetta, Segmentato, Tabella, TavolaKpi, Vuoto } from '../ui'

type Filtro = 'in_arrivo' | 'arrivata' | 'tutti'

export default function Decaduti({ contribuenti, pratiche, onApriPratica, onInserisciCartella }: {
  contribuenti: Contribuente[]; pratiche: PraticaTributo[]
  onApriPratica: (id: string) => void
  /** Apre l'inserimento del piano della cartella per il piano decaduto indicato */
  onInserisciCartella: (p: PraticaTributo) => void
}) {
  const { token, nome } = useSessioneAttiva()
  const [filtro, setFiltro] = useState<Filtro>('in_arrivo')
  const [errore, setErrore] = useState<string | null>(null)
  const [inCorso, setInCorso] = useState(false)
  const oggi = oggiIso()

  const cDi = (p: PraticaTributo) => contribuenti.find((c) => c.id === p.contribuente_id)
  const tutti = pratiche.filter(decaduto)
  const inArrivo = tutti.filter((p) => !p.cartella_arrivata_il)
  const arrivate = tutti.filter((p) => p.cartella_arrivata_il)
  const mostrati = (filtro === 'in_arrivo' ? inArrivo : filtro === 'arrivata' ? arrivate : tutti)
    .sort((a, b) => (b.decaduto_il ?? '').localeCompare(a.decaduto_il ?? '') || (cDi(a)?.nome ?? '').localeCompare(cDi(b)?.nome ?? '', 'it'))
  const nonPagatoInArrivo = totaliDi(inArrivo.flatMap((p) => p.rate.filter((r) => !r.pagata)))

  async function salva(p: PraticaTributo, campi: Partial<PraticaTributo>, azione: string) {
    setErrore(null); setInCorso(true)
    try {
      await aggiorna<PraticaTributo>(token, 'pratiche_tributi', (rec) => rec.map((x) => (x.id === p.id ? { ...x, ...campi, ...campiModifica(nome) } : x)),
        `${nome}: ${azione} ${cDi(p)?.nome ?? ''} ${p.tributo}`)
      return true
    } catch (e) { setErrore((e as Error).message); return false } finally { setInCorso(false) }
  }

  if (tutti.length === 0) {
    return <Vuoto>Nessun piano decaduto. Per segnarne uno, apri il piano (da Piani o dal Calendario) e premi <b>Segna come decaduto</b>.</Vuoto>
  }

  return (
    <div>
      <TavolaKpi celle={[
        { titolo: 'Cartelle in arrivo', valore: inArrivo.length, nota: 'piani decaduti in attesa della cartella' },
        { titolo: 'Non pagato dei piani decaduti', valore: formattaEuro(nonPagatoInArrivo.totale_cent), nota: `Imposta ${formattaEuro(nonPagatoInArrivo.quota_capitale_cent)} · Sanzioni ${formattaEuro(nonPagatoInArrivo.sanzioni_cent)} · Interessi ${formattaEuro(nonPagatoInArrivo.interessi_cent)}` },
        { titolo: 'Cartelle arrivate', valore: arrivate.length, nota: 'con il piano della cartella da gestire in Piani' },
      ]} />
      <p className="mb-4 text-[13px] text-neutro-700">
        Le rate non pagate di questi piani non sono più scadenze: non compaiono nel calendario né nei totali da pagare. La cartella avrà un importo
        diverso (di solito imposta residua, sanzioni piene, interessi e oneri di riscossione). Clicca su una riga per aprire il piano.
      </p>
      <div className="mb-4">
        <Segmentato valore={filtro} onChange={setFiltro} opzioni={[
          { valore: 'in_arrivo', etichetta: `Cartella in arrivo (${inArrivo.length})` },
          { valore: 'arrivata', etichetta: `Cartella arrivata (${arrivate.length})` },
          { valore: 'tutti', etichetta: `Tutti (${tutti.length})` },
        ]} />
      </div>
      {errore && <div className="mb-4"><Avviso tipo="errore">{errore}</Avviso></div>}
      <Tabella righe={mostrati} onRiga={(p) => onApriPratica(p.id)} vuoto="Nessun piano con questo filtro." colonne={[
        { chiave: 's', etichetta: 'Società', render: (p) => <span className="font-medium">{cDi(p)?.nome ?? '—'}</span> },
        { chiave: 'r', etichetta: 'Responsabile', render: (p) => cDi(p)?.responsabile || '—' },
        { chiave: 't', etichetta: 'Tributo', render: (p) => p.tributo },
        { chiave: 'd', etichetta: 'Decaduto il', render: (p) => formattaData(p.decaduto_il) },
        { chiave: 'n', etichetta: 'Rate non pagate', allinea: 'dx', render: (p) => `${p.rate.filter((r) => !r.pagata).length}/${p.rate.length}` },
        { chiave: 'i', etichetta: 'Non pagato', allinea: 'dx', render: (p) => { const t = residuoDecaduto(p); return (
          <span className="flex flex-col items-end"><b>{formattaEuro(t.totale_cent)}</b>
            <span className="whitespace-nowrap text-[11px] font-normal text-neutro-700">Imp. {formattaEuro(t.quota_capitale_cent)} · Sanz. {formattaEuro(t.sanzioni_cent)} · Int. {formattaEuro(t.interessi_cent)}</span>
          </span>) } },
        { chiave: 'c', etichetta: 'Cartella', render: (p) => p.cartella_arrivata_il
          ? <Etichetta tono="verde">Arrivata il {formattaData(p.cartella_arrivata_il)}</Etichetta>
          : <Etichetta tono="giallo">In arrivo</Etichetta> },
        { chiave: 'a', etichetta: '', render: (p) => (
          <SoloSeModifica>
            <span className="flex flex-wrap gap-1.5" onClick={(e) => e.stopPropagation()}>
              {!p.cartella_arrivata_il
                ? <Bottone piccolo disabled={inCorso} onClick={async () => { if (await salva(p, { cartella_arrivata_il: oggi }, 'cartella arrivata per il piano decaduto')) onInserisciCartella(p) }}>Cartella arrivata</Bottone>
                : <Bottone variante="ghost" piccolo disabled={inCorso} onClick={() => salva(p, { cartella_arrivata_il: '' }, 'cartella non ancora arrivata')}>Cartella non arrivata</Bottone>}
              <Bottone variante="ghost" piccolo disabled={inCorso} title="Riporta il piano tra quelli in corso"
                onClick={() => { if (window.confirm(`Annullare la decadenza di "${p.tributo}" (${cDi(p)?.nome})? Le rate non pagate torneranno nel calendario.`)) salva(p, { stato: 'rateizzato', decaduto_il: '', cartella_arrivata_il: '' }, 'annulla decadenza del piano') }}>
                Annulla decadenza
              </Bottone>
            </span>
          </SoloSeModifica>
        ) },
      ]} />
    </div>
  )
}
