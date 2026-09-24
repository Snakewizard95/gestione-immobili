/**
 * Importazione del foglio "Rendimenti Affitti" (formato del file di Davide).
 * Le colonne Condominio, IMU, Mutuo/Leasing e Valore di Mercato vengono ignorate (scelta di Davide).
 * Struttura: blocchi per società, ognuno con riga di intestazione
 *   Proprietà | Immobile | Conduttore | Affitto | Condominio | Mutuo/Leasing | Imposta Registro | IMU | (vuota) | Valore di Mercato | Rendimento
 * seguita da righe immobile e da una riga TOTALE. Conduttore "//" o vuoto = immobile libero.
 */
import * as XLSX from 'xlsx'
import type { Conduttore, Contratto, Immobile, Societa } from './tipi'
import { campiNuovo } from './store'

export interface RigaImportata {
  societa: string
  immobile: string
  conduttore: string | null
  affitto_cent: number
  imposta_registro_cent: number
}

export interface RisultatoAnalisi {
  righe: RigaImportata[]
  avvisi: string[]
}

function centesimi(v: unknown): number {
  if (typeof v === 'number') return Math.round(v * 100)
  if (typeof v === 'string') {
    const p = v.replace(/[€\s]/g, '').replace(/,/g, '')
    const n = Number(p)
    return Number.isFinite(n) ? Math.round(n * 100) : 0
  }
  return 0
}

/** Legge il file e restituisce le righe riconosciute (senza toccare i dati). */
export function analizzaRendimentiAffitti(buffer: ArrayBuffer): RisultatoAnalisi {
  const wb = XLSX.read(buffer, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const righeRaw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' , raw: true })
  const righe: RigaImportata[] = []
  const avvisi: string[] = []
  const visti = new Map<string, number>()

  for (const r of righeRaw) {
    const [prop, imm, cond, aff, , , imposta] = r as unknown[]
    const societa = String(prop ?? '').trim()
    const immobile = String(imm ?? '').trim().replace(/\s+/g, ' ')
    if (!societa || !immobile || societa === 'Proprietà') continue
    const conduttoreRaw = String(cond ?? '').trim()
    const conduttore = conduttoreRaw === '' || conduttoreRaw === '//' || conduttoreRaw.toUpperCase() === 'TOTALE' ? null : conduttoreRaw
    const chiave = `${societa}|${immobile}`
    const n = (visti.get(chiave) ?? 0) + 1
    visti.set(chiave, n)
    const immobileUnico = n > 1 ? `${immobile} (${n})` : immobile
    if (n > 1) avvisi.push(`"${immobile}" (${societa}) compare più volte: importato come "${immobileUnico}".`)
    righe.push({
      societa, immobile: immobileUnico, conduttore,
      affitto_cent: centesimi(aff), imposta_registro_cent: centesimi(imposta),
    })
  }
  if (righe.length === 0) avvisi.push('Nessuna riga riconosciuta: il file non sembra nel formato "Rendimenti Affitti".')
  return { righe, avvisi }
}

export interface PianoImportazione {
  societa: Societa[]
  immobili: Immobile[]
  conduttori: Conduttore[]
  contratti: Contratto[]
  saltati: string[]
}

/**
 * Prepara i record da aggiungere, evitando i duplicati rispetto ai dati già presenti
 * (confronto per nome: società, indirizzo immobile, denominazione conduttore).
 */
export function preparaImportazione(
  righe: RigaImportata[],
  esistenti: { societa: Societa[]; immobili: Immobile[]; conduttori: Conduttore[]; contratti: Contratto[] },
  utente: string,
): PianoImportazione {
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')
  const piano: PianoImportazione = { societa: [], immobili: [], conduttori: [], contratti: [], saltati: [] }

  const trovaSocieta = (nome: string) => [...esistenti.societa, ...piano.societa].find((s) => norm(s.ragione_sociale) === norm(nome))
  const trovaConduttore = (nome: string) => [...esistenti.conduttori, ...piano.conduttori].find((c) => norm(c.denominazione) === norm(nome))
  const trovaImmobile = (societaId: string, indirizzo: string) => [...esistenti.immobili, ...piano.immobili].find((i) => i.societa_id === societaId && norm(i.indirizzo) === norm(indirizzo))

  for (const r of righe) {
    let soc = trovaSocieta(r.societa)
    if (!soc) {
      // Tutte importate come società: se una proprietà è una persona fisica, correggere il tipo nella scheda
      soc = { ...campiNuovo(utente), ragione_sociale: r.societa, tipo: 'societa', partita_iva: '', codice_fiscale: '', sede: '', pec: '', note: 'Importato da Excel' }
      piano.societa.push(soc)
    }

    let imm = trovaImmobile(soc.id, r.immobile)
    if (imm) {
      piano.saltati.push(`Immobile già presente: ${r.immobile} (${r.societa})`)
    } else {
      const comune = /\bMI\b|\(MI\)|Milano/i.test(r.immobile) ? 'Milano' : /Roma/i.test(r.immobile) ? 'Roma' : /Barcellona/i.test(r.societa) ? 'Barcellona' : ''
      const box = /\bbox\b/i.test(r.immobile)
      imm = {
        ...campiNuovo(utente), societa_id: soc.id, indirizzo: r.immobile, comune, provincia: comune === 'Milano' ? 'MI' : comune === 'Roma' ? 'RM' : '',
        tipologia: box ? 'box' : '', foglio: '', particella: '', subalterno: '', categoria: '', rendita_cent: null, superficie_mq: null,
        condominio_id: '', millesimi: null, stato: r.conduttore ? 'locato' : 'libero',
        note: 'Importato da Excel',
      }
      piano.immobili.push(imm)
    }

    if (!r.conduttore && r.affitto_cent > 0) {
      piano.saltati.push(`"${r.immobile}" (${r.societa}) ha un affitto di ${(r.affitto_cent / 100).toLocaleString('it-IT')} € ma nessun conduttore: nessun contratto creato, da verificare.`)
    }
    if (!r.conduttore || r.affitto_cent === 0) continue
    let con = trovaConduttore(r.conduttore)
    if (!con) {
      const societaNome = /s\.?r\.?l|s\.?p\.?a|srls|studio|banca|gruppo|service|imm\.|prog|st\./i.test(r.conduttore) || r.conduttore === r.conduttore.toUpperCase()
      con = { ...campiNuovo(utente), denominazione: r.conduttore, tipo: societaNome ? 'societa' : 'persona', codice_fiscale: '', partita_iva: '', indirizzo: '', telefono: '', email: '', pec: '', note: 'Importato da Excel' }
      piano.conduttori.push(con)
    }
    const immId = imm.id
    const giaContratto = [...esistenti.contratti, ...piano.contratti].some((c) => c.immobile_id === immId && c.conduttore_id === con!.id && c.stato !== 'cessato')
    if (giaContratto) { piano.saltati.push(`Contratto già presente: ${r.immobile} / ${r.conduttore}`); continue }
    piano.contratti.push({
      ...campiNuovo(utente), immobile_id: immId, conduttore_id: con.id, tipologia: '', stato: 'attivo',
      data_sottoscrizione: '', data_decorrenza: '', durata_anni: null, prima_scadenza: '', rinnovo_automatico: 'si', preavviso_mesi: 6,
      data_cessazione: '', motivo_cessazione: '', canone_mensile_cent: Math.round(r.affitto_cent / 12), canone_annuale_cent: r.affitto_cent,
      periodicita: 'mensile', giorno_scadenza: 5, deposito_cent: null, deposito_modalita: '', deposito_restituito_il: '', regime_iva: '', iva_percento: 22,
      istat_attivo: 'si', istat_percentuale: 75, istat_mese: '', reg_data: '', reg_ufficio: '', reg_codice: '', reg_modalita: '',
      reg_imposta_cent: null, reg_quota_conduttore_cent: null, imposta_registro_annuale_cent: r.imposta_registro_cent || null,
      note: 'Importato da Excel: completare scadenze e registrazione',
    })
  }
  return piano
}
