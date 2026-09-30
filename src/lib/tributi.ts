/** Calcoli comuni della sezione Tributi rateizzati (totali, pagato, residuo, rate scadute). Importi in centesimi. */
import type { Contribuente, PraticaTributo, RataTributo } from './tipi'
import { aggiorna, campiModifica } from './store'
import { oggiIso } from './utils/formato'

export interface Totali {
  quota_capitale_cent: number
  sanzioni_cent: number
  interessi_cent: number
  totale_cent: number
}

export interface Riepilogo {
  totale: Totali
  pagato: Totali
  residuo: Totali
  rate: number
  ratePagate: number
  scadute: RataTributo[]        // scadute e non pagate
  prossima: RataTributo | null  // prima rata non pagata con scadenza da oggi in poi
}

const zero = (): Totali => ({ quota_capitale_cent: 0, sanzioni_cent: 0, interessi_cent: 0, totale_cent: 0 })

function somma(t: Totali, r: RataTributo): void {
  t.quota_capitale_cent += r.quota_capitale_cent
  t.sanzioni_cent += r.sanzioni_cent
  t.interessi_cent += r.interessi_cent
  t.totale_cent += r.totale_cent
}

export function sommaTotali(a: Totali, b: Totali): Totali {
  return {
    quota_capitale_cent: a.quota_capitale_cent + b.quota_capitale_cent, sanzioni_cent: a.sanzioni_cent + b.sanzioni_cent,
    interessi_cent: a.interessi_cent + b.interessi_cent, totale_cent: a.totale_cent + b.totale_cent,
  }
}

/** Totali, pagato e residuo di un elenco di rate. */
export function riepilogoRate(rate: RataTributo[], oggi = oggiIso()): Riepilogo {
  const r: Riepilogo = { totale: zero(), pagato: zero(), residuo: zero(), rate: rate.length, ratePagate: 0, scadute: [], prossima: null }
  for (const x of rate) {
    somma(r.totale, x)
    if (x.pagata) { somma(r.pagato, x); r.ratePagate++ } else {
      somma(r.residuo, x)
      if (x.scadenza < oggi) r.scadute.push(x)
      else if (!r.prossima || x.scadenza < r.prossima.scadenza) r.prossima = x
    }
  }
  return r
}

/** Riepilogo di più pratiche insieme (es. tutte quelle di una società). */
export function riepilogoPratiche(pratiche: PraticaTributo[], oggi = oggiIso()): Riepilogo {
  const tutte = pratiche.flatMap((p) => p.rate)
  return riepilogoRate(tutte, oggi)
}

/** Pratiche con un piano di rate (in corso o estinto). */
export const conPiano = (p: PraticaTributo) => p.rate.length > 0

/** Piano in corso: ha rate e almeno una non pagata (o stato non chiuso). */
export const inCorso = (p: PraticaTributo) => p.rate.length > 0 && p.rate.some((r) => !r.pagata) && p.stato !== 'decaduto'

/** Stato mostrato: "estinto" quando tutte le rate risultano pagate, anche se non è stato aggiornato a mano. */
export function statoEffettivo(p: PraticaTributo): string {
  if (p.rate.length > 0 && p.rate.every((r) => r.pagata) && (p.stato === 'rateizzato' || p.stato === 'rate_concordate')) return 'estinto'
  if (p.rate.length > 0 && p.stato === 'estinto' && p.rate.some((r) => !r.pagata)) return 'rateizzato'
  return p.stato
}

/** Rate già decise ma piano non ancora inserito. */
export const daInserire = (p: PraticaTributo) => p.stato === 'rate_concordate' && p.rate.length === 0

/**
 * Pratiche gestite dalla piattaforma: solo i rateizzi. Avvisi in attesa di decisione e segnalazioni IVA restano
 * nell'Excel "Tributi in Sospeso" (scelta di Davide del 30/09/2026): se presenti nei dati vengono ignorati.
 */
export const gestita = (p: PraticaTributo) => p.tipo !== 'segnalazione_iva' && !['da_decidere', 'richiesta_inviata'].includes(p.stato)

/** Nome da mostrare per il contribuente. */
export function nomeContribuente(elenco: Contribuente[], id: string): string {
  return elenco.find((c) => c.id === id)?.nome ?? '—'
}

/** Percentuale pagata (0–100) sul totale delle rate. */
export function percentualePagata(r: Riepilogo): number {
  return r.totale.totale_cent > 0 ? Math.round((r.pagato.totale_cent / r.totale.totale_cent) * 100) : 0
}

/** Descrizione breve della pratica: "IVA II TRIM 25 · 10 rate". */
export function descriviPratica(p: PraticaTributo): string {
  const n = p.rate.length || p.rate_concordate
  return `${p.tributo || 'Senza descrizione'}${n ? ` · ${n} ${n === 1 ? 'rata' : 'rate'}` : ''}`
}

/* ---------------------------- scadenze e pagamenti ---------------------------- */

export interface RataDi { pratica: PraticaTributo; rata: RataTributo }

/** Tutte le rate con la pratica di appartenenza, in ordine di scadenza. */
export function tutteLeRate(pratiche: PraticaTributo[]): RataDi[] {
  return pratiche.flatMap((p) => p.rate.map((rata) => ({ pratica: p, rata }))).sort((a, b) => a.rata.scadenza.localeCompare(b.rata.scadenza))
}

/** Rate con scadenza tra `da` e `a` compresi (date ISO). */
export function rateTra(pratiche: PraticaTributo[], da: string, a: string): RataDi[] {
  return tutteLeRate(pratiche).filter((x) => x.rata.scadenza >= da && x.rata.scadenza <= a)
}

/** Totali (capitale, sanzioni, interessi, totale) di un elenco di rate. */
export function totaliDi(rate: RataTributo[]): Totali {
  const t = zero()
  rate.forEach((r) => somma(t, r))
  return t
}

/**
 * Termine per regolarizzare una rata saltata di un avviso bonario: la scadenza della rata successiva
 * (oltre si perde il beneficio della rateazione). Per le altre pratiche restituisce null.
 */
export function termineRegolarizzazione(p: PraticaTributo, rata: RataTributo): string | null {
  if (p.tipo !== 'avviso_bonario') return null
  const succ = p.rate.filter((x) => x.scadenza > rata.scadenza).sort((a, b) => a.scadenza.localeCompare(b.scadenza))[0]
  return succ?.scadenza ?? null
}

/** Segna pagate (o da pagare) alcune rate di una o più pratiche, con un solo salvataggio. */
export async function impostaRatePagate(
  token: string, nome: string, voci: Array<{ praticaId: string; numero: number; scadenza: string }>, pagata: boolean, descrizione: string,
): Promise<void> {
  const oggi = oggiIso()
  const chiave = (id: string, n: number, s: string) => `${id}|${n}|${s}`
  const scelte = new Set(voci.map((v) => chiave(v.praticaId, v.numero, v.scadenza)))
  await aggiorna<PraticaTributo>(token, 'pratiche_tributi', (rec) => rec.map((p) => {
    if (!voci.some((v) => v.praticaId === p.id)) return p
    const rate = p.rate.map((x) => (scelte.has(chiave(p.id, x.numero, x.scadenza)) ? { ...x, pagata, pagata_il: pagata ? (x.pagata_il || oggi) : '' } : x))
    const tutte = rate.length > 0 && rate.every((x) => x.pagata)
    const stato = tutte ? 'estinto' : p.stato === 'estinto' ? 'rateizzato' : p.stato
    return { ...p, rate, stato, ...campiModifica(nome) }
  }), `${nome}: ${voci.length === 1 ? 'rata' : voci.length + ' rate'} ${pagata ? 'pagat' + (voci.length === 1 ? 'a' : 'e') : 'da pagare'} — ${descrizione}`)
}
