/** Piccoli elementi grafici condivisi dalle schede della sezione Tributi. */
import { STATI_PRATICA, etichettaDi, type PraticaTributo } from '../../lib/tipi'
import { statoEffettivo, type Totali } from '../../lib/tributi'
import { formattaEuro } from '../../lib/utils/formato'
import { Etichetta, type TonoEtichetta } from '../ui'

const TONO_STATO: Record<string, TonoEtichetta> = {
  da_decidere: 'giallo', richiesta_inviata: 'giallo', rate_concordate: 'blu', rateizzato: 'blu',
  pagato_unica: 'verde', estinto: 'verde', decaduto: 'rosso', ricorso: 'grigio',
}

export function EtichettaStato({ pratica }: { pratica: PraticaTributo }) {
  const s = statoEffettivo(pratica)
  return <Etichetta tono={TONO_STATO[s] ?? 'grigio'}>{etichettaDi(STATI_PRATICA, s)}</Etichetta>
}

/** Barra orizzontale della percentuale pagata. */
export function BarraPagato({ percentuale }: { percentuale: number }) {
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap">
      <span className="inline-block h-1.5 w-20 bg-neutro-300">
        <span className="block h-1.5 bg-accento-700" style={{ width: `${Math.min(100, Math.max(0, percentuale))}%` }} />
      </span>
      <span className="num text-[12px] text-neutro-700">{percentuale}%</span>
    </span>
  )
}

/**
 * Totale con la sua scomposizione: "14.234,07 €" e sotto "Capitale 12.672,20 · Sanzioni 1.267,23 · Interessi 294,64".
 * Usato accanto al nome dell'ufficio, nel riepilogo e nella scheda stampabile.
 */
export function Scomposizione({ etichetta, t, evidenzia, dx }: { etichetta: string; t: Totali; evidenzia?: boolean; dx?: boolean }) {
  return (
    <span className={`inline-flex flex-col ${dx ? 'items-end text-right' : ''}`}>
      <span className="whitespace-nowrap text-[13px]">
        <span className="text-neutro-700">{etichetta} </span>
        <b className={`num ${evidenzia ? 'text-[15px]' : ''}`}>{formattaEuro(t.totale_cent)}</b>
      </span>
      <span className="num whitespace-nowrap text-[11px] text-neutro-700">
        Capitale {formattaEuro(t.quota_capitale_cent)} · Sanzioni {formattaEuro(t.sanzioni_cent)} · Interessi {formattaEuro(t.interessi_cent)}
      </span>
    </span>
  )
}
