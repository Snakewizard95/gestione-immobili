/** Formattazione italiana di importi (in centesimi) e date (ISO). */

const euro = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' })

/** 1234567 → "12.345,67 €" */
export function formattaEuro(centesimi: number | null | undefined): string {
  if (centesimi === null || centesimi === undefined) return '—'
  return euro.format(centesimi / 100)
}

/** "12.345,67" o "12345.67" → 1234567 (null se non interpretabile) */
export function analizzaEuro(testo: string): number | null {
  const pulito = testo.replace(/[€\s]/g, '').replace(/\./g, '').replace(',', '.')
  if (pulito === '' ) return null
  const n = Number(pulito)
  return Number.isFinite(n) ? Math.round(n * 100) : null
}

/** "2026-09-24" → "24/09/2026" */
export function formattaData(iso: string | null | undefined): string {
  if (!iso) return '—'
  const [a, m, g] = iso.slice(0, 10).split('-')
  return `${g}/${m}/${a}`
}

/** "2026-09-24T10:00:00Z" → "24/09/2026 12:00" (ora locale) */
export function formattaDataOra(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' })
}

/** Data di oggi in ISO (AAAA-MM-GG) */
export function oggiIso(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Aggiunge anni a una data ISO (per la prima scadenza del contratto) */
export function aggiungiAnni(iso: string, anni: number): string {
  const d = new Date(iso)
  d.setFullYear(d.getFullYear() + anni)
  return d.toISOString().slice(0, 10)
}

/** Aggiunge mesi a una data ISO (per lo scadenzario) */
export function aggiungiMesi(iso: string, mesi: number): string {
  const d = new Date(iso)
  d.setMonth(d.getMonth() + mesi)
  return d.toISOString().slice(0, 10)
}

/** Byte → "1,2 MB" */
export function formattaByte(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`
}
