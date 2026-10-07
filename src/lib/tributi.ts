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
  decaduto: Totali              // rate non pagate dei piani decaduti: non più da pagare a rate, finiranno in una cartella
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
  const r: Riepilogo = { totale: zero(), pagato: zero(), residuo: zero(), rate: rate.length, ratePagate: 0, scadute: [], prossima: null, decaduto: zero() }
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

/**
 * Riepilogo di più pratiche insieme (es. tutte quelle di una società). Le rate non pagate dei piani decaduti
 * non contano come "da pagare" né come scadute: finiscono in `decaduto` (arriverà una cartella).
 */
export function riepilogoPratiche(pratiche: PraticaTributo[], oggi = oggiIso()): Riepilogo {
  const r = riepilogoRate(pratiche.filter((p) => !decaduto(p)).flatMap((p) => p.rate), oggi)
  for (const x of pratiche.filter(decaduto).flatMap((p) => p.rate)) {
    somma(r.totale, x); r.rate++
    if (x.pagata) { somma(r.pagato, x); r.ratePagate++ } else somma(r.decaduto, x)
  }
  return r
}

/** Piano decaduto (rate non pagate in tempo): le rate rimaste non sono più scadenze, arriverà una cartella. */
export const decaduto = (p: PraticaTributo) => p.stato === 'decaduto'

/** Piano decaduto per cui la cartella esattoriale non è ancora arrivata. */
export const inAttesaCartella = (p: PraticaTributo) => decaduto(p) && !p.cartella_arrivata_il

/** Rate non pagate di un piano decaduto (quanto resta da riscuotere con la cartella, senza le maggiorazioni). */
export function residuoDecaduto(p: PraticaTributo): Totali {
  return totaliDi(p.rate.filter((r) => !r.pagata))
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

/** Tutte le rate (dei piani non decaduti) con la pratica di appartenenza, in ordine di scadenza. */
export function tutteLeRate(pratiche: PraticaTributo[]): RataDi[] {
  // I piani decaduti non hanno più scadenze
  return pratiche.filter((p) => !decaduto(p)).flatMap((p) => p.rate.map((rata) => ({ pratica: p, rata }))).sort((a, b) => a.rata.scadenza.localeCompare(b.rata.scadenza))
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

/* ---------------------------- piani doppi ---------------------------- */

/** Importo del piano calcolato dalle rate (imposta + sanzioni, senza interessi) = importo dilazionato del prospetto. */
export const importoDelPiano = (p: Pick<PraticaTributo, 'rate'>) => p.rate.reduce((s, r) => s + r.quota_capitale_cent + r.sanzioni_cent, 0)

/** Piano letto da un PDF (più preciso dell'Excel): ha la data di elaborazione o la nota di importazione dal PDF. */
export const daPdf = (p: PraticaTributo) => !!p.data_elaborazione || /dal PDF/i.test(p.note)

/**
 * Vero se due piani sono lo stesso rateizzo: stessa società, importo uguale a meno di qualche centesimo
 * (Excel e PDF arrotondano in modo diverso: tolleranza 1 €) e stesso numero di rate o stessa prima scadenza.
 * Due avvisi diversi arrivati insieme hanno le stesse date ma importi diversi: non vengono confusi.
 */
export function stessoPiano(a: Pick<PraticaTributo, 'contribuente_id' | 'rate'>, b: Pick<PraticaTributo, 'contribuente_id' | 'rate'>): boolean {
  if (a.contribuente_id !== b.contribuente_id || !a.rate.length || !b.rate.length) return false
  const ia = importoDelPiano(a), ib = importoDelPiano(b)
  if (Math.abs(ia - ib) > 100) return false
  return a.rate.length === b.rate.length || a.rate[0].scadenza === b.rate[0].scadenza
}

/** Porta sul piano `tieni` i pagamenti (e i dati mancanti) dei suoi doppioni: una rata pagata in uno dei due resta pagata. */
export function unisciPiani(tieni: PraticaTributo, altri: PraticaTributo[]): PraticaTributo {
  const rate = tieni.rate.map((r) => {
    const gemelle = altri.flatMap((a) => a.rate).filter((x) => x.numero === r.numero || x.scadenza === r.scadenza)
    const pagata = gemelle.find((x) => x.pagata)
    return r.pagata || !pagata ? r : { ...r, pagata: true, pagata_il: r.pagata_il || pagata.pagata_il }
  })
  const primo = <K extends keyof PraticaTributo>(k: K) => tieni[k] || altri.map((a) => a[k]).find(Boolean) || tieni[k]
  const tutte = rate.length > 0 && rate.every((x) => x.pagata)
  return {
    ...tieni, rate,
    data_notifica: primo('data_notifica'), termine_pagamento: primo('termine_pagamento'), numero_atto: primo('numero_atto'),
    stato: tieni.stato === 'decaduto' ? 'decaduto' : tutte ? 'estinto' : 'rateizzato',
  }
}

export interface GruppoDoppi { tieni: PraticaTributo; togli: PraticaTributo[]; ratePagateAggiunte: number }

/** Gruppi di piani doppi: si tiene la versione dal PDF (o, a parità, quella con più rate segnate pagate). */
export function trovaDoppioni(pratiche: PraticaTributo[]): GruppoDoppi[] {
  const conRate = pratiche.filter((p) => !p.eliminato_il && p.rate.length > 0)
  const visti = new Set<string>()
  const gruppi: GruppoDoppi[] = []
  for (const p of conRate) {
    if (visti.has(p.id)) continue
    const gruppo = conRate.filter((q) => !visti.has(q.id) && (q.id === p.id || stessoPiano(p, q)))
    if (gruppo.length < 2) continue
    gruppo.forEach((q) => visti.add(q.id))
    const ordinati = [...gruppo].sort((a, b) => Number(daPdf(b)) - Number(daPdf(a)) || b.rate.filter((r) => r.pagata).length - a.rate.filter((r) => r.pagata).length)
    const [tieni, ...togli] = ordinati
    const unito = unisciPiani(tieni, togli)
    gruppi.push({ tieni: unito, togli, ratePagateAggiunte: unito.rate.filter((r) => r.pagata).length - tieni.rate.filter((r) => r.pagata).length })
  }
  return gruppi
}

/* ---------------------------- rate non pagate: recupero entro la rata successiva ---------------------------- */

/**
 * Situazione di una rata. Per gli avvisi bonari una rata non pagata si può ancora versare (con riconteggio di sanzione
 * e interessi) entro la scadenza della rata successiva: finché quel termine non è passato è "da recuperare"; dopo è
 * "oltre il termine" (il piano rischia la decadenza). Per cartelle e rottamazioni resta semplicemente "scaduta".
 */
export type SituazioneRata =
  | { tipo: 'pagata' }
  | { tipo: 'da_pagare' }
  | { tipo: 'da_recuperare'; entro: string }
  | { tipo: 'oltre_termine'; entro: string | null }

export function situazioneRata(p: PraticaTributo, r: RataTributo, oggi = oggiIso()): SituazioneRata {
  if (r.pagata) return { tipo: 'pagata' }
  if (r.scadenza >= oggi) return { tipo: 'da_pagare' }
  const entro = termineRegolarizzazione(p, r)
  return entro && entro >= oggi ? { tipo: 'da_recuperare', entro } : { tipo: 'oltre_termine', entro }
}

/** Voce del calendario: una rata alla sua scadenza, oppure il recupero di una rata saltata alla scadenza della successiva. */
export interface VoceCalendario extends RataDi { data: string; recupero: boolean }

/** Ordine delle voci: per data, poi ufficio in ordine alfabetico (anche i recuperi), tributo e numero di rata. */
export function ordinaVoci(voci: VoceCalendario[], nomeUfficio: (id: string) => string): VoceCalendario[] {
  return voci.sort((p, q) => p.data.localeCompare(q.data) || nomeUfficio(p.pratica.contribuente_id).localeCompare(nomeUfficio(q.pratica.contribuente_id), 'it')
    || p.pratica.tributo.localeCompare(q.pratica.tributo, 'it') || p.rata.numero - q.rata.numero)
}

/** Voci del calendario tra due date: rate in scadenza più i recuperi delle rate saltate ancora in tempo. */
export function vociCalendario(pratiche: PraticaTributo[], da: string, a: string, oggi = oggiIso()): VoceCalendario[] {
  const tutte = tutteLeRate(pratiche)
  const voci: VoceCalendario[] = tutte.filter((x) => x.rata.scadenza >= da && x.rata.scadenza <= a).map((x) => ({ ...x, data: x.rata.scadenza, recupero: false }))
  for (const x of tutte) {
    const s = situazioneRata(x.pratica, x.rata, oggi)
    if (s.tipo === 'da_recuperare' && s.entro >= da && s.entro <= a) voci.push({ ...x, data: s.entro, recupero: true })
  }
  return voci.sort((p, q) => p.data.localeCompare(q.data) || Number(p.recupero) - Number(q.recupero))
}
