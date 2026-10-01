/** Calcoli della sezione Fornitori: stato delle fatture, totali, mensilità delle royalty. Importi in centesimi. */
import type { Contribuente, FatturaFornitore, TariffaRoyalty } from './tipi'
import { aggiungiGiorni } from './ravvedimento'
import { oggiIso } from './utils/formato'
import { campiNuovo } from './store'

export type StatoFattura = 'pagata' | 'insoluta' | 'da_pagare'

/** Fornitori delle royalty con la scheda a parte. */
export const FORNITORI_ROYALTY = ['Tecnocasa', 'Tecnomedia'] as const

/** Scadenza della fattura: quella indicata, altrimenti data fattura + 30 giorni. */
export function scadenzaFattura(f: Pick<FatturaFornitore, 'scadenza' | 'data_fattura'>): string {
  return f.scadenza || (f.data_fattura ? aggiungiGiorni(f.data_fattura, 30) : '')
}

/** Pagata; insoluta se non pagata e scaduta; altrimenti da pagare. */
export function statoFattura(f: FatturaFornitore, oggi = oggiIso()): StatoFattura {
  if (f.pagata) return 'pagata'
  const s = scadenzaFattura(f)
  return s && s < oggi ? 'insoluta' : 'da_pagare'
}

/** Stato senza distinguere le insolute (scheda Studi e sue stampe): pagata o da pagare. */
export const statoSemplice = (f: FatturaFornitore): 'pagata' | 'da_pagare' => (f.pagata ? 'pagata' : 'da_pagare')

export const ETICHETTE_STATO: Record<StatoFattura, { testo: string; tono: 'verde' | 'rosso' | 'blu' }> = {
  pagata: { testo: 'Pagata', tono: 'verde' }, insoluta: { testo: 'Insoluta', tono: 'rosso' }, da_pagare: { testo: 'Da pagare', tono: 'blu' },
}

/** Somma degli importi. */
export const sommaImporti = (fatture: FatturaFornitore[]) => fatture.reduce((s, f) => s + (f.importo_cent ?? 0), 0)

/** Vero se la fattura è del fornitore indicato (nome uguale senza maiuscole/spazi, o che lo contiene: "Tecnocasa S.p.A."). */
export function delFornitore(f: FatturaFornitore, nome: string): boolean {
  const a = f.fornitore.trim().toLowerCase(), b = nome.trim().toLowerCase()
  return a === b || a.startsWith(b + ' ') || a.startsWith(b + '.') || a.startsWith(b + ',')
}

/**
 * Stato di una mensilità di royalty di un ufficio, dalle fatture con quella competenza:
 * nessuna fattura → null; altrimenti il caso peggiore tra le fatture (insoluta > da pagare > pagata).
 */
export function statoMensilita(fatture: FatturaFornitore[], oggi = oggiIso()): StatoFattura | null {
  if (!fatture.length) return null
  const stati = fatture.map((f) => statoFattura(f, oggi))
  return stati.includes('insoluta') ? 'insoluta' : stati.includes('da_pagare') ? 'da_pagare' : 'pagata'
}

/** Fattura vuota (nuovo inserimento), con eventuali dati già compilati. */
export function nuovaFattura(nome: string, base: Partial<FatturaFornitore> = {}): FatturaFornitore {
  return {
    ...campiNuovo(nome), contribuente_id: '', fornitore: '', tipologia: '', numero: '', data_fattura: '', scadenza: '', competenza: '',
    importo_cent: null, pagata: false, pagata_il: '', note: '', ...base,
  }
}


/** Studi mostrati nella sezione Fornitori (non rimossi). */
export const studioInFornitori = (c: Contribuente) => !c.fornitori_rimosso

/** Vero se lo studio paga le royalty del fornitore indicato (per default sì, finché non viene tolto dalla griglia). */
export const pagaRoyalty = (c: Contribuente, fornitore: string) => !(c.senza_royalty ?? []).includes(fornitore)

/* ---------------------------- importo mensile delle royalty ---------------------------- */

/** IVA e totale di un importo mensile (se è stato inserito il totale con IVA vale quello, al centesimo). */
export function totaliTariffa(t: TariffaRoyalty): { iva_cent: number; totale_cent: number } {
  if (t.totale_cent != null) return { iva_cent: t.totale_cent - t.imponibile_cent, totale_cent: t.totale_cent }
  const iva = Math.round(t.imponibile_cent * t.iva_percento / 100)
  return { iva_cent: iva, totale_cent: t.imponibile_cent + iva }
}

/** Scompone un totale con IVA in imponibile e IVA (l'IVA è la differenza, così la somma torna sempre al centesimo). */
export function scomponiTotale(totale_cent: number, iva_percento: number): { imponibile_cent: number; iva_cent: number } {
  const imponibile = Math.round(totale_cent * 100 / (100 + iva_percento))
  return { imponibile_cent: imponibile, iva_cent: totale_cent - imponibile }
}

/** Storico degli importi mensili di uno studio per un fornitore, dal più vecchio. */
export function storicoTariffe(c: Contribuente, fornitore: string): TariffaRoyalty[] {
  return [...(c.royalty_importi?.[fornitore] ?? [])].sort((a, b) => a.dal.localeCompare(b.dal))
}

/** Importo mensile valido in un mese (AAAA-MM): l'ultimo cambio con "dal" non successivo al mese. */
export function tariffaDel(c: Contribuente, fornitore: string, mese: string): TariffaRoyalty | null {
  return storicoTariffe(c, fornitore).filter((t) => t.dal <= mese).at(-1) ?? null
}

/** Ultimo giorno del mese AAAA-MM (scadenza della mensilità). */
export function fineMese(mese: string): string {
  const [a, m] = mese.split('-').map(Number)
  const d = new Date(Date.UTC(a, m, 0))
  return d.toISOString().slice(0, 10)
}

export interface Mensilita {
  stato: StatoFattura | null     // null: nessun importo impostato e nessuna fattura
  importo_cent: number | null
  fatture: FatturaFornitore[]
  tariffa: TariffaRoyalty | null
}

/**
 * Mensilità di royalty di uno studio. Con una fattura registrata vale la fattura (il suo importo resta quello di quel
 * mese anche se l'importo mensile cambia). Senza fattura vale l'importo mensile in vigore: da pagare fino alla fine del
 * mese, poi insoluta finché non viene segnata pagata.
 */
export function mensilita(c: Contribuente, fornitore: string, mese: string, fatture: FatturaFornitore[], oggi = oggiIso()): Mensilita {
  const ff = fatture.filter((f) => f.contribuente_id === c.id && delFornitore(f, fornitore) && f.competenza === mese)
  const tariffa = tariffaDel(c, fornitore, mese)
  if (ff.length) return { stato: statoMensilita(ff, oggi), importo_cent: sommaImporti(ff), fatture: ff, tariffa }
  if (!tariffa) return { stato: null, importo_cent: null, fatture: [], tariffa: null }
  return { stato: fineMese(mese) < oggi ? 'insoluta' : 'da_pagare', importo_cent: totaliTariffa(tariffa).totale_cent, fatture: [], tariffa }
}

/** Prefisso dell'id delle mensilità di royalty non ancora registrate (righe calcolate, non salvate). */
export const PREFISSO_ROYALTY = 'royalty:'
export const eCalcolata = (f: Pick<FatturaFornitore, 'id'>) => f.id.startsWith(PREFISSO_ROYALTY)

/**
 * Mensilità di royalty di uno studio non ancora registrate, dal primo importo impostato fino al mese corrente,
 * come "fatture" calcolate (importo in vigore, scadenza a fine mese): servono per mostrarle nella tabella dello studio
 * insieme alle altre fatture. Spuntandole "Pagata" diventano registrazioni vere.
 */
export function royaltyDaRegistrare(c: Contribuente, fatture: FatturaFornitore[], oggi = oggiIso()): FatturaFornitore[] {
  const meseCorrente = oggi.slice(0, 7)
  const out: FatturaFornitore[] = []
  for (const fornitore of FORNITORI_ROYALTY) {
    if (!pagaRoyalty(c, fornitore)) continue
    const primo = storicoTariffe(c, fornitore)[0]?.dal
    if (!primo) continue
    for (let m = primo; m <= meseCorrente; m = meseDopo(m)) {
      const x = mensilita(c, fornitore, m, fatture, oggi)
      if (x.fatture.length || !x.stato || x.importo_cent === null) continue
      out.push({
        id: `${PREFISSO_ROYALTY}${c.id}:${fornitore}:${m}`, creato_il: '', creato_da: '', modificato_il: '', modificato_da: '', eliminato_il: null,
        contribuente_id: c.id, fornitore, tipologia: 'royalty', numero: '', data_fattura: '', scadenza: fineMese(m), competenza: m,
        importo_cent: x.importo_cent, pagata: false, pagata_il: '', note: '',
      })
    }
  }
  return out
}

function meseDopo(m: string): string {
  const [a, n] = m.split('-').map(Number)
  return n === 12 ? `${a + 1}-01` : `${a}-${String(n + 1).padStart(2, '0')}`
}
