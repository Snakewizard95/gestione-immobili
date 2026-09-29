/**
 * Ravvedimento operoso per il TARDIVO VERSAMENTO dell'imposta di registro delle annualità successive
 * dei contratti di locazione (F24 Elide: 1501 imposta, 1509 sanzione, 1510 interessi).
 *
 * Regole (verificate a settembre 2026, da far confermare al commercialista; dettagli in docs/RAVVEDIMENTO.md):
 * - Scadenza: 30 giorni dall'inizio dell'annualità (anniversario della decorrenza). Se cade di sabato,
 *   domenica o in un giorno festivo nazionale slitta al primo giorno lavorativo successivo.
 * - Sanzione piena per omesso/tardivo versamento: 25% per le scadenze dal 1/9/2024 (D.Lgs. 87/2024),
 *   30% per quelle precedenti; dimezzata se il ritardo non supera 90 giorni e, entro 14 giorni,
 *   ulteriormente ridotta a 1/15 per ogni giorno di ritardo.
 * - Riduzioni da ravvedimento (art. 13 D.Lgs. 472/1997): 1/10 entro 30 giorni, 1/9 entro 90 giorni,
 *   1/8 entro un anno, 1/7 entro due anni, 1/6 oltre.
 * - Interessi al tasso legale, giorno per giorno, dal giorno successivo alla scadenza al giorno del pagamento.
 * NON riguarda la tardiva PRIMA registrazione del contratto, che ha sanzioni diverse.
 */

/** Tassi legali annui (%) già noti. Quelli salvati nell'app (Documenti → Calcolo ravvedimento) li sostituiscono o li integrano. */
export const TASSI_LEGALI_INIZIALI: Record<number, number> = {
  2019: 0.8, 2020: 0.05, 2021: 0.01, 2022: 1.25, 2023: 5, 2024: 2.5, 2025: 2, 2026: 1.6,
}

/** Giorni concessi per il versamento dall'inizio dell'annualità */
export const GIORNI_PER_VERSARE = 30
/** Data da cui vale la sanzione base del 25% invece del 30% */
export const INIZIO_NUOVO_REGIME = '2024-09-01'
const SANZIONE_BASE_NUOVA = 25
const SANZIONE_BASE_VECCHIA = 30

export const CODICE_IMPOSTA = '1501'
export const CODICE_IMPOSTA_PROROGA = '1504'
export const CODICE_SANZIONE = '1509'
export const CODICE_INTERESSI = '1510'

const GIORNO_MS = 86_400_000
const inData = (iso: string) => new Date(iso + 'T00:00:00Z')
const iso = (d: Date) => d.toISOString().slice(0, 10)
export const aggiungiGiorni = (data: string, n: number) => iso(new Date(inData(data).getTime() + n * GIORNO_MS))
export const giorniTra = (da: string, a: string) => Math.round((inData(a).getTime() - inData(da).getTime()) / GIORNO_MS)

/** Domenica di Pasqua (algoritmo di Gauss/Meeus) per calcolare il Lunedì dell'Angelo. */
function pasqua(anno: number): string {
  const a = anno % 19, b = Math.floor(anno / 100), c = anno % 100, d = Math.floor(b / 4), e = b % 4
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451)
  const mese = Math.floor((h + l - 7 * m + 114) / 31), giorno = ((h + l - 7 * m + 114) % 31) + 1
  return `${anno}-${String(mese).padStart(2, '0')}-${String(giorno).padStart(2, '0')}`
}

/** Festivi nazionali italiani (quelli che fanno slittare le scadenze fiscali). */
function festivo(data: string): boolean {
  const md = data.slice(5)
  const fissi = ['01-01', '01-06', '04-25', '05-01', '06-02', '08-15', '11-01', '12-08', '12-25', '12-26']
  return fissi.includes(md) || data === aggiungiGiorni(pasqua(Number(data.slice(0, 4))), 1)
}

/** Primo giorno lavorativo a partire dalla data indicata (inclusa). */
export function primoLavorativo(data: string): string {
  let d = data
  for (let i = 0; i < 10; i++) {
    const giorno = inData(d).getUTCDay()
    if (giorno !== 0 && giorno !== 6 && !festivo(d)) return d
    d = aggiungiGiorni(d, 1)
  }
  return d
}

/** Scadenza del versamento per un'annualità che inizia il giorno indicato. */
export function scadenzaVersamento(inizioAnnualita: string): string {
  return primoLavorativo(aggiungiGiorni(inizioAnnualita, GIORNI_PER_VERSARE))
}

export interface FasciaSanzione { percentuale: number; descrizione: string }

/** Percentuale di sanzione ridotta da ravvedimento, in base ai giorni di ritardo e al regime della scadenza. */
export function percentualeSanzione(giorniRitardo: number, scadenza: string): FasciaSanzione {
  if (giorniRitardo <= 0) return { percentuale: 0, descrizione: 'Pagamento nei termini: nessuna sanzione' }
  const base = scadenza >= INIZIO_NUOVO_REGIME ? SANZIONE_BASE_NUOVA : SANZIONE_BASE_VECCHIA
  const regime = `sanzione base ${base}%`
  if (giorniRitardo <= 14) return { percentuale: (base / 2 / 15) * giorniRitardo / 10, descrizione: `Entro 14 giorni (${regime}, dimezzata, 1/15 per giorno, ridotta a 1/10)` }
  if (giorniRitardo <= 30) return { percentuale: base / 2 / 10, descrizione: `Da 15 a 30 giorni (${regime}, dimezzata, ridotta a 1/10)` }
  if (giorniRitardo <= 90) return { percentuale: base / 2 / 9, descrizione: `Da 31 a 90 giorni (${regime}, dimezzata, ridotta a 1/9)` }
  if (giorniRitardo <= 365) return { percentuale: base / 8, descrizione: `Entro un anno (${regime}, ridotta a 1/8)` }
  if (giorniRitardo <= 730) return { percentuale: base / 7, descrizione: `Entro due anni (${regime}, ridotta a 1/7)` }
  return { percentuale: base / 6, descrizione: `Oltre due anni (${regime}, ridotta a 1/6)` }
}

export interface QuotaInteressi { anno: number; giorni: number; tasso: number; interessi_cent: number }

export interface Ravvedimento {
  scadenza: string
  pagamento: string
  giorniRitardo: number
  annoRiferimento: number
  imposta_cent: number
  fascia: FasciaSanzione
  sanzione_cent: number
  interessi_cent: number
  dettaglioInteressi: QuotaInteressi[]
  totale_cent: number
  /** Anni del periodo di ritardo per cui manca il tasso legale: se non vuoto il calcolo non è affidabile */
  tassiMancanti: number[]
}

/**
 * Calcola sanzione e interessi per un versamento dell'imposta `imposta_cent` con scadenza `scadenza`
 * effettuato il giorno `pagamento`. `tassi` = tasso legale annuo (%) per anno.
 */
export function calcolaRavvedimento(imposta_cent: number, scadenza: string, pagamento: string, tassi: Record<number, number>): Ravvedimento {
  const giorniRitardo = Math.max(0, giorniTra(scadenza, pagamento))
  const fascia = percentualeSanzione(giorniRitardo, scadenza)
  const sanzione_cent = Math.round(imposta_cent * fascia.percentuale / 100)

  // Interessi: giorni di ritardo divisi per anno solare, ciascuno al tasso legale di quell'anno (base 365)
  const perAnno = new Map<number, number>()
  for (let i = 1; i <= giorniRitardo; i++) {
    const anno = Number(aggiungiGiorni(scadenza, i).slice(0, 4))
    perAnno.set(anno, (perAnno.get(anno) ?? 0) + 1)
  }
  const tassiMancanti: number[] = []
  const dettaglioInteressi: QuotaInteressi[] = [...perAnno.entries()].map(([anno, giorni]) => {
    const tasso = tassi[anno]
    if (tasso === undefined) { tassiMancanti.push(anno); return { anno, giorni, tasso: 0, interessi_cent: 0 } }
    return { anno, giorni, tasso, interessi_cent: imposta_cent * tasso * giorni / 36500 }
  })
  const interessi_cent = Math.round(dettaglioInteressi.reduce((t, q) => t + q.interessi_cent, 0))
  for (const q of dettaglioInteressi) q.interessi_cent = Math.round(q.interessi_cent)

  return {
    scadenza, pagamento, giorniRitardo, annoRiferimento: Number(scadenza.slice(0, 4)), imposta_cent,
    fascia, sanzione_cent, interessi_cent, dettaglioInteressi, totale_cent: imposta_cent + sanzione_cent + interessi_cent, tassiMancanti,
  }
}

/** Percentuale leggibile con fino a 4 decimali: 0.08333 → "0,0833%" */
export function formattaPercentuale(p: number): string {
  return `${p.toLocaleString('it-IT', { maximumFractionDigits: 4 })}%`
}
