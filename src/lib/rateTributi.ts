/**
 * Calcolo automatico delle rate di un piano (regole in docs/TRIBUTI.md). Verificato sui prospetti dell'Agenzia:
 * - quota di ogni rata = importo ÷ n. rate in centesimi; l'eventuale resto va sulla prima rata;
 * - prima rata alla data indicata; le successive all'ultimo giorno del trimestre (o del mese), spostate al primo
 *   giorno lavorativo se cadono di sabato, domenica o festivo, e al 20 agosto se finiscono tra l'1 e il 20 agosto;
 * - interessi (codice 9002) dalla seconda rata: quota × tasso × giorni / 365, con i giorni contati dall'ultimo giorno
 *   del mese successivo all'elaborazione della comunicazione fino alla fine del trimestre "teorica" (non spostata);
 *   avvisi bonari: 3,5% annuo. Regola verificata su 164 prospetti dell'Agenzia;
 * - la quota 9001 comprende imposta e sanzioni: si divide con la percentuale di sanzione indicata
 *   (10% = imposta = quota ÷ 1,10, come nell'Excel di Davide).
 */
import type { RataTributo } from './tipi'
import type { PianoPdf } from './pdfRateizzo'
import { giorniTra, primoLavorativo } from './ravvedimento'

export interface ParametriPiano {
  importo_cent: number        // importo da rateizzare (imposta + sanzioni, senza interessi)
  n_rate: number
  prima_scadenza: string      // ISO
  periodicita: 'trimestrale' | 'mensile'
  tasso_percento: number      // interessi annui (3,5 per gli avvisi bonari)
  decorrenza_interessi: string // ISO: gli interessi si contano dal giorno dopo
  sanzioni_percento: number   // sanzione in % dell'imposta (10 = come nell'Excel)
}

const due = (n: number) => String(n).padStart(2, '0')

/** Ultimo giorno del mese che si trova `mesi` mesi dopo quello della data. */
function fineMeseDopo(data: string, mesi: number): string {
  const [a, m] = data.split('-').map(Number)
  const d = new Date(Date.UTC(a, m - 1 + mesi + 1, 0))
  return `${d.getUTCFullYear()}-${due(d.getUTCMonth() + 1)}-${due(d.getUTCDate())}`
}

/** Divide una quota 9001 in imposta e sanzioni secondo la percentuale di sanzione. */
export function dividiQuota(quota_cent: number, sanzioni_percento: number): { quota_capitale_cent: number; sanzioni_cent: number } {
  const capitale = Math.round(quota_cent / (1 + sanzioni_percento / 100))
  return { quota_capitale_cent: capitale, sanzioni_cent: quota_cent - capitale }
}

/** Data da cui si contano gli interessi: ultimo giorno del mese successivo all'elaborazione della comunicazione. */
export function decorrenzaDaElaborazione(elaborazione: string): string {
  return fineMeseDopo(elaborazione, 1)
}

/** Scadenza effettiva: primo giorno lavorativo; se cade tra l'1 e il 20 agosto slitta al 20 agosto. */
function scadenzaEffettiva(teorica: string): string {
  const d = primoLavorativo(teorica)
  const md = d.slice(5)
  return md >= '08-01' && md < '08-20' ? primoLavorativo(`${d.slice(0, 4)}-08-20`) : d
}

/** Genera le rate del piano. */
export function calcolaRate(p: ParametriPiano): RataTributo[] {
  const n = Math.max(1, Math.floor(p.n_rate))
  const base = Math.floor(p.importo_cent / n)
  const passo = p.periodicita === 'mensile' ? 1 : 3
  const rate: RataTributo[] = []
  for (let k = 1; k <= n; k++) {
    const quota = k === 1 ? p.importo_cent - base * (n - 1) : base
    const teorica = fineMeseDopo(p.prima_scadenza, passo * (k - 1))
    const scadenza = k === 1 ? p.prima_scadenza : scadenzaEffettiva(teorica)
    const giorni = k === 1 ? 0 : Math.max(0, giorniTra(p.decorrenza_interessi, teorica))
    const interessi = Math.round((quota * p.tasso_percento / 100 * giorni) / 365)
    const { quota_capitale_cent, sanzioni_cent } = dividiQuota(quota, p.sanzioni_percento)
    rate.push({ numero: k, scadenza, quota_capitale_cent, sanzioni_cent, interessi_cent: interessi, totale_cent: quota + interessi, pagata: false, pagata_il: '', note: '' })
  }
  return rate
}

/** Rate dal PDF dell'Agenzia (importi presi così come sono; la quota 9001 divisa in imposta e sanzioni). */
export function rateDaPdf(pdf: PianoPdf, sanzioni_percento: number): RataTributo[] {
  return pdf.righe.map((r) => {
    const { quota_capitale_cent, sanzioni_cent } = dividiQuota(r.capitale_cent, sanzioni_percento)
    return { numero: r.numero, scadenza: r.scadenza, quota_capitale_cent, sanzioni_cent, interessi_cent: r.interessi_cent, totale_cent: r.capitale_cent + r.interessi_cent, pagata: false, pagata_il: '', note: '' }
  })
}
