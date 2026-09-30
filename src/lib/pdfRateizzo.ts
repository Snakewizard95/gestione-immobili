/**
 * Lettura del PDF "Determinazione dei versamenti rateali" dell'Agenzia delle Entrate (servizio online per gli
 * avvisi bonari). Il PDF contiene:
 *   Data elaborazione comunicazione: GG/MM/AAAA
 *   Data ricevimento comunicazione:  GG/MM/AAAA
 *   Dilazionamento del pagamento di € 5.380,95 in 5 rate e interessi dovuti
 *   Rata | Data scad. | Cod. trib. capitale | Importo capitale | Cod. trib. interessi | Importo interessi
 *   1      27/03/2026   9001                  € 1.076,19          9002                  € 0,00
 * Il nome della società NON è nel PDF: si sceglie nel modulo (o si riconosce dall'importo).
 *
 * Secondo formato riconosciuto: il prospetto "Determinazione dei versamenti rateali" prodotto dal programma del
 * commercialista, con "Azienda: 992 - STUDIO SOMALIA LIBIA SRL", date di elaborazione e ricevimento,
 * "Sezione/tributo: ERARIO/9001", "Codice tributo interessi: 9002", "Importo totale da rateizzare" e la tabella
 *   RATA | DATA VERS. | IMPO. DOVUTO | INTERESSI (vuoti sulla prima rata) | TOTALE | TIPO VERS. | DELEGA | DATA INTE. | VERSATO
 * La libreria pdf.js (gratuita) viene caricata solo quando serve; si usa la versione "legacy" per i browser datati.
 */

export interface RigaPdf {
  numero: number
  scadenza: string            // ISO
  codice_capitale: string     // 9001 = imposta + sanzioni
  capitale_cent: number
  codice_interessi: string    // 9002
  interessi_cent: number
}

export interface PianoPdf {
  formato: 'agenzia' | 'commercialista'
  azienda: string             // solo formato commercialista, es. "STUDIO SOMALIA LIBIA SRL" (senza il codice)
  data_elaborazione: string   // ISO o ''
  data_ricevimento: string    // ISO o ''
  importo_cent: number        // importo dilazionato (somma delle quote 9001)
  n_rate: number
  righe: RigaPdf[]
  avvisi: string[]
}

const iso = (d: string) => { const [g, m, a] = d.split('/'); return `${a}-${m}-${g}` }
const cent = (s: string) => Math.round(Number(s.replace(/\./g, '').replace(',', '.')) * 100)
const RE_DATA = /^\d\d\/\d\d\/\d{4}$/
const RE_IMPORTO = /^-?[\d.]+,\d\d$/

/** Estrae il testo del PDF (tutte le pagine), una riga per elemento di testo. */
async function testoPdf(buffer: ArrayBuffer): Promise<string> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const worker = (await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = worker
  const compito = pdfjs.getDocument({ data: new Uint8Array(buffer) })
  const doc = await compito.promise
  const parti: string[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const pagina = await doc.getPage(i)
    const contenuto = await pagina.getTextContent()
    for (const it of contenuto.items) if ('str' in it && it.str.trim()) parti.push(it.str.trim())
  }
  await compito.destroy()
  return parti.join('\n')
}

/** Controlli comuni ai due formati. */
function controlla(righe: RigaPdf[], importo: number, n: number, avvisi: string[]): void {
  const somma = righe.reduce((s, r) => s + r.capitale_cent, 0)
  if (n !== righe.length) avvisi.push(`Il PDF indica ${n} rate ma ne ho lette ${righe.length}: controlla la tabella.`)
  if (Math.abs(somma - importo) > 1) avvisi.push('La somma delle quote non corrisponde all\'importo indicato nel PDF: controlla la tabella.')
  if (righe.some((r) => r.codice_capitale !== '9001' || r.codice_interessi !== '9002')) avvisi.push('Codici tributo diversi da 9001 / 9002: la divisione tra imposta e sanzioni potrebbe non essere corretta.')
}

/**
 * Formato del programma del commercialista. Nel testo estratto le etichette vengono prima dei valori:
 * "Importo totale da rateizzare :", poi azienda (fino alla prima data), data elaborazione, data ricevimento,
 * "ERARIO/9001", "9002", importo; poi, dopo "VERSATO", le righe: n, data, importo, [interessi], totale, data interessi, [versato].
 */
function interpretaCommercialista(parti: string[]): PianoPdf {
  const avvisi: string[] = []
  let i = parti.findIndex((p) => /^Importo totale da rateizzare/i.test(p)) + 1
  const nomeParti: string[] = []
  while (i < parti.length && !RE_DATA.test(parti[i])) nomeParti.push(parti[i++])
  const azienda = nomeParti.join(' ').replace(/\s+/g, ' ').replace(/^\d+\s*-\s*/, '').trim()
  const elab = RE_DATA.test(parti[i] ?? '') ? iso(parti[i++]) : ''
  const ricev = RE_DATA.test(parti[i] ?? '') ? iso(parti[i++]) : ''
  const codCap = /(\d{4})\s*$/.exec(parti[i] ?? '')?.[1] ?? '9001'
  if (/\//.test(parti[i] ?? '')) i++
  const codInt = /^\d{4}$/.test(parti[i] ?? '') ? parti[i++] : '9002'
  const importoTesto = RE_IMPORTO.test(parti[i] ?? '') ? parti[i++] : ''

  // Tabella: parte dopo l'intestazione "VERSATO"
  let k = parti.findIndex((p, j) => j >= i && /^VERSATO$/i.test(p))
  k = k < 0 ? i : k + 1
  const righe: RigaPdf[] = []
  while (k < parti.length) {
    const atteso = String(righe.length + 1)
    if (parti[k] !== atteso || !RE_DATA.test(parti[k + 1] ?? '')) { k++; continue }
    const scadenza = iso(parti[k + 1])
    k += 2
    const importi: number[] = []
    while (k < parti.length && RE_IMPORTO.test(parti[k])) importi.push(cent(parti[k++]))
    if (importi.length < 2) throw new Error(`Rata ${atteso}: importi non leggibili nel PDF.`)
    const [dovuto, a, b] = importi
    const interessi = importi.length >= 3 ? a : 0
    const totale = importi.length >= 3 ? b : a
    if (dovuto + interessi !== totale) avvisi.push(`Rata ${atteso}: importo + interessi diverso dal totale indicato.`)
    righe.push({ numero: Number(atteso), scadenza, codice_capitale: codCap, capitale_cent: dovuto, codice_interessi: codInt, interessi_cent: interessi })
    if (RE_DATA.test(parti[k] ?? '')) k++            // data interessi
    while (k < parti.length && RE_IMPORTO.test(parti[k])) k++ // eventuale "versato"
  }
  if (righe.length === 0) throw new Error('Nel PDF del commercialista non ho trovato la tabella delle rate.')
  const importo = importoTesto ? cent(importoTesto) : righe.reduce((s, r) => s + r.capitale_cent, 0)
  controlla(righe, importo, righe.length, avvisi)
  return { formato: 'commercialista', azienda, data_elaborazione: elab, data_ricevimento: ricev, importo_cent: importo, n_rate: righe.length, righe, avvisi }
}

/** Interpreta il testo del PDF (separato per poterlo provare senza browser). */
export function interpretaTestoRateizzo(testo: string): PianoPdf {
  const parti = testo.split('\n').map((p) => p.trim()).filter(Boolean)
  if (parti.some((p) => /^Azienda:?$/i.test(p)) && parti.some((p) => /^Importo totale da rateizzare/i.test(p))) return interpretaCommercialista(parti)
  const t = testo.replace(/ /g, ' ')
  const avvisi: string[] = []
  const elab = /Data elaborazione comunicazione:\s*(\d\d\/\d\d\/\d{4})/i.exec(t)
  const ricev = /Data ricevimento comunicazione:\s*(\d\d\/\d\d\/\d{4})/i.exec(t)
  const testa = /Dilazionamento del pagamento di\s*€\s*([\d.,]+)\s*in\s*(\d+)\s*rat/i.exec(t)
  const righe: RigaPdf[] = []
  const re = /(?:^|\s)(\d{1,3})\s+(\d\d\/\d\d\/\d{4})\s+(\d{4})\s+€\s*([\d.,]+)\s+(\d{4})\s+€\s*([\d.,]+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(t))) {
    righe.push({ numero: Number(m[1]), scadenza: iso(m[2]), codice_capitale: m[3], capitale_cent: cent(m[4]), codice_interessi: m[5], interessi_cent: cent(m[6]) })
  }
  if (righe.length === 0) throw new Error('Nel PDF non ho trovato la tabella delle rate. Formati riconosciuti: "Determinazione dei versamenti rateali" dell\'Agenzia delle Entrate o del programma del commercialista.')
  const importo = testa ? cent(testa[1]) : righe.reduce((s, r) => s + r.capitale_cent, 0)
  const n = testa ? Number(testa[2]) : righe.length
  controlla(righe, importo, n, avvisi)
  return { formato: 'agenzia', azienda: '', data_elaborazione: elab ? iso(elab[1]) : '', data_ricevimento: ricev ? iso(ricev[1]) : '', importo_cent: importo, n_rate: n, righe, avvisi }
}

/** Legge un PDF "Determinazione dei versamenti rateali". */
export async function leggiPdfRateizzo(file: File): Promise<PianoPdf> {
  let testo: string
  try { testo = await testoPdf(await file.arrayBuffer()) } catch { throw new Error('Impossibile aprire il PDF: il file potrebbe essere danneggiato o una scansione (immagine).') }
  return interpretaTestoRateizzo(testo)
}
