/** Backup completo in JSON (tutte le collezioni, inclusi i record eliminati) e ripristino. */
import { aggiorna, carica, type NomeCollezione, type RecordBase } from './store'

export const COLLEZIONI: NomeCollezione[] = ['societa', 'immobili', 'conduttori', 'condomini', 'contratti', 'annualita', 'movimenti', 'voci_condominiali', 'piani_rientro', 'allegati']

export interface Backup { versione: 1; creato_il: string; creato_da: string; collezioni: Record<string, RecordBase[]> }

export async function creaBackup(token: string, nome: string): Promise<void> {
  const collezioni: Record<string, RecordBase[]> = {}
  for (const n of COLLEZIONI) collezioni[n] = await carica<RecordBase>(token, n, true)
  const b: Backup = { versione: 1, creato_il: new Date().toISOString(), creato_da: nome, collezioni }
  const blob = new Blob([JSON.stringify(b, null, 2)], { type: 'application/json' })
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `backup-gestione-immobili-${new Date().toISOString().slice(0, 10)}.json`; a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000)
}

/** Sostituisce TUTTI i dati con quelli del file di backup (gli allegati fisici non sono inclusi: restano nel repository). */
export async function ripristinaBackup(token: string, nome: string, file: File): Promise<string> {
  const b = JSON.parse(await file.text()) as Backup
  if (b.versione !== 1 || !b.collezioni) throw new Error('Il file non è un backup valido di Gestione Immobili.')
  let n = 0
  for (const c of COLLEZIONI) {
    const rec = b.collezioni[c]
    if (!Array.isArray(rec)) continue
    await aggiorna<RecordBase>(token, c, () => rec, `${nome}: ripristino da backup del ${b.creato_il.slice(0, 10)} (${c})`)
    n += rec.length
  }
  return `Ripristinati ${n} record da un backup del ${b.creato_il.slice(0, 10)} creato da ${b.creato_da}.`
}
