/** Regole dell'imposta di registro proposte dall'app (modificabili nelle schede). */
import type { Contratto } from './tipi'

/** Aliquota e base imponibile proposte in base al tipo di contratto (modificabili nella scheda). */
export function regoleImposta(c: Contratto): { percento: number; base: number } {
  const usoDiverso = ['commerciale_6_6', 'commerciale_9_9', 'uso_diverso'].includes(c.tipologia)
  if (usoDiverso) return { percento: c.regime_iva === 'con_iva' ? 1 : 2, base: 100 }
  if (c.tipologia === 'abitativo_3_2') return { percento: 2, base: 70 }
  return { percento: 2, base: 100 }
}

/** Data di inizio dell'annualità: giorno e mese della decorrenza del contratto, con l'anno scelto. */
export function inizioAnnualita(c: Contratto, anno: number | null | undefined): string {
  if (!c.data_decorrenza || !anno) return ''
  return `${anno}-${c.data_decorrenza.slice(5, 10)}`
}

