/**
 * Canone mensile in vigore in un dato mese, tenendo conto degli aumenti ISTAT registrati
 * nel registro annuale (una nuova annualità con "inizio annualità" cambia il canone da quel mese).
 */
import type { Annualita, Contratto } from './tipi'
import { statoIva } from './tipi'

export interface CanoneMese {
  imponibile_cent: number | null
  iva_percento: number
  iva_cent: number
  totale_cent: number | null
  dal: string | null   // "AAAA-MM" da cui vale questo importo (null = dall'inizio del contratto)
}

const r0 = (n: number) => Math.round(n)

function conIva(c: Contratto, imponibile: number | null, dal: string | null): CanoneMese {
  const iva_percento = statoIva(c).soggetto ? (c.iva_percento ?? 22) : 0
  if (imponibile == null) return { imponibile_cent: null, iva_percento, iva_cent: 0, totale_cent: null, dal }
  const iva_cent = r0(imponibile * (iva_percento / 100))
  return { imponibile_cent: imponibile, iva_percento, iva_cent, totale_cent: imponibile + iva_cent, dal }
}

/** Annualità del contratto con data di inizio, in ordine cronologico. */
export function annualitaDi(c: Contratto, tutte: Annualita[]): Annualita[] {
  return tutte.filter((a) => a.contratto_id === c.id && a.data_inizio && a.canone_mensile_nuovo_cent != null).sort((a, b) => a.data_inizio.localeCompare(b.data_inizio))
}

/** Canone mensile valido nel mese "AAAA-MM". */
export function canoneMensilePer(c: Contratto, tutte: Annualita[], mese: string): CanoneMese {
  const anns = annualitaDi(c, tutte)
  const applicabili = anns.filter((a) => a.data_inizio.slice(0, 7) <= mese)
  if (applicabili.length) { const u = applicabili[applicabili.length - 1]; return conIva(c, u.canone_mensile_nuovo_cent, u.data_inizio.slice(0, 7)) }
  const successiva = anns.find((a) => a.data_inizio.slice(0, 7) > mese)
  if (successiva && successiva.canone_mensile_precedente_cent != null) return conIva(c, successiva.canone_mensile_precedente_cent, null)
  return conIva(c, c.canone_mensile_cent, null)
}

/** Gli scaglioni di canone che toccano l'anno indicato (per mostrare "dal mm/aaaa" quando c'è un aumento in corso d'anno). */
export function scaglioniAnno(c: Contratto, tutte: Annualita[], anno: number): CanoneMese[] {
  const mesi = Array.from({ length: 12 }, (_, i) => `${anno}-${String(i + 1).padStart(2, '0')}`)
  const out: CanoneMese[] = []
  for (const m of mesi) {
    const k = canoneMensilePer(c, tutte, m)
    const ultimo = out[out.length - 1]
    if (!ultimo || ultimo.totale_cent !== k.totale_cent || ultimo.dal !== k.dal) out.push(k)
  }
  return out
}

/** "1.220,00 € (1.000,00 + IVA 220,00)" oppure solo il totale se non c'è IVA. */
export function descriviCanone(k: CanoneMese, formattaEuro: (n: number | null) => string): string {
  if (k.totale_cent == null) return '—'
  if (!k.iva_percento) return formattaEuro(k.totale_cent)
  return `${formattaEuro(k.totale_cent)} (${formattaEuro(k.imponibile_cent)} + IVA ${k.iva_percento}% ${formattaEuro(k.iva_cent)})`
}
