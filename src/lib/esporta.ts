/** Esportazione in Excel (.xlsx) degli elenchi, con intestazioni in italiano e importi in euro. */
import * as XLSX from 'xlsx'
import type { CampoDef } from '../components/Modulo'
import type { Opzione } from './tipi'
import { formattaData } from './utils/formato'

export interface Foglio { nome: string; righe: Record<string, unknown>[] }

function nomeFoglioSicuro(n: string): string { return n.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) }

/** Scarica un file Excel con uno o più fogli. */
export function scaricaExcel(nomeFile: string, fogli: Foglio[]): void {
  const wb = XLSX.utils.book_new()
  for (const f of fogli) {
    const ws = XLSX.utils.json_to_sheet(f.righe.length ? f.righe : [{ '(nessun dato)': '' }])
    // Larghezza colonne in base al contenuto
    const chiavi = Object.keys(f.righe[0] ?? {})
    ws['!cols'] = chiavi.map((k) => ({ wch: Math.min(60, Math.max(k.length, ...f.righe.map((r) => String(r[k] ?? '').length)) + 2) }))
    XLSX.utils.book_append_sheet(wb, ws, nomeFoglioSicuro(f.nome))
  }
  const data = new Date().toISOString().slice(0, 10)
  XLSX.writeFile(wb, `${nomeFile}_${data}.xlsx`)
}

/** Converte un valore secondo il tipo di campo: euro in numero, date gg/mm/aaaa, select con l'etichetta. */
export function valorePerExcel(tipo: string, v: unknown, opzioni?: Opzione[]): unknown {
  if (v === null || v === undefined || v === '') return ''
  if (tipo === 'euro') return typeof v === 'number' ? v / 100 : v
  if (tipo === 'data') return formattaData(String(v))
  if (tipo === 'select') return opzioni?.find((o) => o.valore === v)?.etichetta ?? v
  if (tipo === 'multiselect') return Array.isArray(v) ? v.length : v
  return v
}

/**
 * Trasforma record in righe Excel usando le definizioni dei campi del modulo (etichette e tipi),
 * con colonne aggiuntive iniziali (es. Società, Immobile, Conduttore) fornite da `extra`.
 */
export function righeDaCampi<T extends object>(record: T[], campi: CampoDef<T>[], extra?: (r: T) => Record<string, unknown>): Record<string, unknown>[] {
  return record.map((r) => {
    const riga: Record<string, unknown> = { ...(extra?.(r) ?? {}) }
    for (const c of campi) riga[c.etichetta] = valorePerExcel(c.tipo, (r as Record<string, unknown>)[c.nome], c.opzioni)
    return riga
  })
}
