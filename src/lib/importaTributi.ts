/**
 * Importazione iniziale dei tributi rateizzati dai due file Excel di Davide:
 *
 * 1. "Tributi in Sospeso 2026*.xlsx"
 *    - foglio "Anagrafica": Società | Responsabile | Email | Email CC  → contribuenti
 *    - foglio "Definiti": solo il blocco a sinistra "Rateizzi Effettuati" (B–G)
 *    Il foglio "In Sospeso" (avvisi in attesa di decisione, segnalazioni IVA) e il blocco "Scaduti" NON vengono
 *    importati: restano gestiti nell'Excel (scelta di Davide del 30/09/2026).
 * 2. "Rateizzi_Avvisi_Bonari.xlsx"
 *    - un foglio per società (il primo, "Riepilogo", serve solo per il controllo dei totali)
 *    - ogni piano: riga "  <tributo> (<anno>)  –  N rate  –  Quota Cap.: …", riga intestazioni "N. | Scadenza | …",
 *      righe delle rate (N., Scadenza, Quota Cap., Sanzioni, Interessi, Totale, Pagata? Sì/No), riga "Subtotale piano"
 *
 * 3. (facoltativa) la cartella "Rateizzi Avvisi Bonari": un PDF "Determinazione dei versamenti rateali" per ogni
 *    piano, in <Società>/<Anno>/<Tributo>/. Società e tributo si ricavano dai nomi delle cartelle; il piano viene
 *    aggiunto se manca, completa una pratica con "rate decise" oppure viene saltato se è già presente.
 *
 * Gli importi vengono presi così come sono (niente ricalcolo) e convertiti in centesimi.
 */
import * as XLSX from 'xlsx'
import { campiNuovo } from './store'
import type { Contribuente, PraticaTributo, RataTributo } from './tipi'
import type { PianoPdf } from './pdfRateizzo'
import { rateDaPdf } from './rateTributi'
import { daPdf, importoDelPiano, stessoPiano, unisciPiani } from './tributi'

type Cella = unknown
type Riga = Cella[]

/* ---------------------------- utilità ---------------------------- */

/** Nome "normalizzato" per i confronti: minuscolo, senza accenti né punteggiatura. */
export function normalizzaNome(s: unknown): string {
  return String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[.,'`’\-_/]/g, ' ').replace(/\s+/g, ' ').trim()
}

/** Tributo normalizzato: "IVA II TRIM. 2024" e "iva II trim 24" diventano entrambi "iva ii trim 24". */
export function normalizzaTributo(s: unknown): string {
  return normalizzaNome(s).replace(/\b20(\d\d)\b/g, '$1').replace(/\btrimestre\b/g, 'trim')
}

/** Nomi usati negli Excel e nelle mail che corrispondono a un nome dell'Anagrafica (dalla procedura "richieste rate"). */
const ALIAS: Record<string, string> = {
  're di roma': 'San Giovanni Re di Roma', 's g re di roma': 'San Giovanni Re di Roma', 'sg re di roma': 'San Giovanni Re di Roma',
  's g re': 'San Giovanni Re di Roma', 'sg re': 'San Giovanni Re di Roma',
  'magna': 'Magna Grecia', 'colli': 'Colli Portuensi', 's g metronio': 'Metronio', 'sg metronio': 'Metronio',
  'san donato': 'San Donato 1', 'donato 1': 'San Donato 1',
  'imm san donato': 'Immobiliare San Donato', 'imm donato': 'Immobiliare San Donato', 'imm s donato': 'Immobiliare San Donato',
  'collatino verderocca': 'Collatino', 'prati delle vittorie': 'Prati', 'alga': 'Al.ga', 'milano imm': 'Milano Imm.',
  'gruppo cec impresa': 'Impresa', 'circ appia': 'Circ. Appia',
  'marconi': 'Marconi Gubbio', 'marconi gub': 'Marconi Gubbio', 'gubbio': 'Marconi Gubbio',
  'beato angelico': 'Beato', 'somalia': 'Somalia Libia',
}

const cent = (v: Cella): number => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 100) : 0)
const testo = (v: Cella): string => (v === null || v === undefined ? '' : String(v).trim())

/** Numero seriale di Excel → data ISO (null se non è una data plausibile: vuota, #VALUE!, anno 1900). */
function dataIso(v: Cella): string | null {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 3000) return null // 3000 ≈ anno 1908: esclude gli "zero" di Excel
  const ms = Date.UTC(1899, 11, 30) + Math.round(v) * 86_400_000
  return new Date(ms).toISOString().slice(0, 10)
}

const eData = (v: Cella) => dataIso(v) !== null

function leggiFoglio(wb: XLSX.WorkBook, nome: string): Riga[] | null {
  const ws = wb.Sheets[nome]
  if (!ws?.['!ref']) return null
  // Lettura sempre dalla colonna A: se la A è vuota, l'area del foglio può partire dalla B e sposterebbe gli indici
  const area = XLSX.utils.decode_range(ws['!ref'])
  const range = XLSX.utils.encode_range({ s: { r: area.s.r, c: 0 }, e: area.e })
  return XLSX.utils.sheet_to_json<Riga>(ws, { header: 1, defval: null, raw: true, blankrows: false, range })
}

/* ---------------------------- risultato ---------------------------- */

export interface ControlloSocieta {
  foglio: string
  contribuente: string
  piani: number
  totale_cent: number          // calcolato dalle rate importate
  pagato_cent: number
  riepilogo_totale_cent: number | null   // dal foglio "Riepilogo" dell'Excel
  riepilogo_pagato_cent: number | null
}

export interface EsitoPdf {
  percorso: string
  societa: string
  tributo: string
  importo_cent: number
  n_rate: number
  esito: 'nuovo' | 'completa' | 'aggiorna' | 'gia_presente' | 'doppione'
  dettaglio: string
}

export interface PianoImportazioneTributi {
  contribuenti: Contribuente[]          // nuovi
  pratiche: PraticaTributo[]            // nuove
  aggiornate: PraticaTributo[]          // già presenti nei dati, completate con il piano letto dal PDF
  esitiPdf: EsitoPdf[]
  aliasAggiunti: Array<{ id: string; alias: string[] }>  // alias nuovi per contribuenti già presenti
  controlli: ControlloSocieta[]
  avvisi: string[]
  saltate: number                       // pratiche già presenti
}

/* ---------------------------- abbinamento nomi ---------------------------- */

class Rubrica {
  private elenco: Contribuente[]
  private nuovi: Contribuente[] = []
  private alias = new Map<string, Set<string>>()   // id → alias nuovi
  private utente: string
  creatiDaFogli: string[] = []

  constructor(esistenti: Contribuente[], utente: string) { this.elenco = [...esistenti]; this.utente = utente }

  get tuttiNuovi() { return this.nuovi }
  get aliasNuovi() {
    return [...this.alias.entries()]
      .filter(([id]) => !this.nuovi.some((c) => c.id === id))
      .map(([id, s]) => ({ id, alias: [...s] }))
  }

  aggiungi(c: Contribuente) { this.elenco.push(c); this.nuovi.push(c) }

  private chiavi(c: Contribuente): string[] { return [c.nome, ...(c.alias ?? [])].map(normalizzaNome) }

  /** Trova il contribuente per nome (nome, alias, tabella ALIAS, poi inizio del nome se c'è un solo candidato). */
  trova(nomeGrezzo: string): Contribuente | null {
    const n = normalizzaNome(nomeGrezzo)
    if (!n) return null
    let c = this.elenco.find((x) => this.chiavi(x).includes(n))
    if (!c && ALIAS[n]) { const a = normalizzaNome(ALIAS[n]); c = this.elenco.find((x) => this.chiavi(x).includes(a)) }
    if (!c) {
      const cand = this.elenco.filter((x) => this.chiavi(x).some((k) => k.startsWith(n + ' ') || n.startsWith(k + ' ')))
      if (cand.length === 1) c = cand[0]
    }
    if (c) this.ricordaAlias(c, nomeGrezzo)
    return c ?? null
  }

  private ricordaAlias(c: Contribuente, nomeGrezzo: string) {
    const pulito = nomeGrezzo.trim().replace(/\s+/g, ' ')
    if (!pulito || this.chiavi(c).includes(normalizzaNome(pulito))) return
    // Gli alias si salvano una sola volta per forma normalizzata (non "MONTESACRO" e "montesacro")
    const set = this.alias.get(c.id) ?? new Set<string>()
    if ([...set].some((a) => normalizzaNome(a) === normalizzaNome(pulito))) return
    set.add(pulito)
    this.alias.set(c.id, set)
    if (this.nuovi.includes(c)) c.alias = [...(c.alias ?? []), pulito]
  }

  /** Contribuente il cui nome (o alias) compare come parole intere nel testo (es. "STUDIO SOMALIA LIBIA SRL"); il più lungo vince. */
  trovaNelTesto(testo: string): Contribuente | null {
    const t = ' ' + normalizzaNome(testo) + ' '
    let migliore: Contribuente | null = null, lung = 0, pari = false
    for (const c of this.elenco) {
      for (const k of [...this.chiavi(c), normalizzaNome(c.ragione_sociale)]) {
        if (k.length < 3 || !t.includes(' ' + k + ' ')) continue
        if (k.length > lung) { migliore = c; lung = k.length; pari = false } else if (k.length === lung && migliore?.id !== c.id) pari = true
      }
    }
    return pari ? null : migliore
  }

  /** Trova o crea (con avviso) un contribuente non presente in Anagrafica. */
  trovaOCrea(nomeGrezzo: string, provenienza: string): Contribuente {
    const c = this.trova(nomeGrezzo)
    if (c) return c
    const nuovo = vuotoContribuente(this.utente, nomeGrezzo.trim().replace(/\s+/g, ' '))
    nuovo.note = `Creato dall'importazione (${provenienza}): non era nel foglio Anagrafica. Completare responsabile ed email.`
    this.aggiungi(nuovo)
    this.creatiDaFogli.push(`${nuovo.nome} (${provenienza})`)
    return nuovo
  }
}

export function vuotoContribuente(utente: string, nome: string): Contribuente {
  return {
    ...campiNuovo(utente), nome, alias: [], ragione_sociale: '', codice_fiscale: '', partita_iva: '',
    responsabile: '', email: '', email_cc: '', studio: '', societa_id: '', conduttore_id: '', note: '',
  }
}

export function vuotaPratica(utente: string, contribuente_id: string): PraticaTributo {
  return {
    ...campiNuovo(utente), contribuente_id, tipo: 'avviso_bonario', tributo: '', anno_rateizzo: null, numero_atto: '',
    data_notifica: '', termine_pagamento: '', importo_cent: null, gia_versato_cent: null, stato: 'da_decidere',
    rate_concordate: null, notificato_il: '', sollecito_il: '', periodicita: 'trimestrale', rate: [], note: '',
  }
}

/* ---------------------------- file 1: Tributi in Sospeso ---------------------------- */

function leggiAnagrafica(wb: XLSX.WorkBook, rubrica: Rubrica, utente: string, avvisi: string[]) {
  const righe = leggiFoglio(wb, 'Anagrafica')
  if (!righe) { avvisi.push('Foglio "Anagrafica" non trovato: i contribuenti verranno creati dai nomi dei fogli.'); return }
  for (const r of righe.slice(1)) {
    const nome = testo(r[0])
    if (!nome) continue
    const esistente = rubrica.trova(nome)
    if (esistente) continue
    const c = vuotoContribuente(utente, nome)
    c.responsabile = testo(r[1]); c.email = testo(r[2]); c.email_cc = testo(r[3])
    rubrica.aggiungi(c)
  }
}

function leggiDefiniti(wb: XLSX.WorkBook, rubrica: Rubrica, utente: string): PraticaTributo[] {
  const righe = leggiFoglio(wb, 'Definiti')
  if (!righe) return []
  const out: PraticaTributo[] = []
  for (const r of righe.slice(2)) {
    // Blocco sinistro: Rateizzi Effettuati (B Società, C Importo, D Notifica, E Tributo, F Scadenza, G Rate)
    if (testo(r[1]) && typeof r[2] === 'number') {
      const c = rubrica.trovaOCrea(testo(r[1]), 'foglio Definiti')
      const p = vuotaPratica(utente, c.id)
      p.importo_cent = cent(r[2]); p.data_notifica = dataIso(r[3]) ?? ''; p.tributo = testo(r[4])
      p.termine_pagamento = dataIso(r[5]) ?? ''
      const rate = r[6]
      const note = ['Importato da "Definiti" (Rateizzi Effettuati).']
      if (typeof rate === 'number' && rate === 1) { p.stato = 'pagato_unica'; p.rate_concordate = 1 }
      else if (typeof rate === 'number' && rate > 1) { p.stato = 'rate_concordate'; p.rate_concordate = rate }
      else if (/sgrav/i.test(testo(rate))) { p.stato = 'ricorso'; note.push(`Nell'Excel: "${testo(rate)}".`) }
      else { p.stato = 'rate_concordate'; note.push(testo(rate) ? `Rate nell'Excel: "${testo(rate)}".` : 'Numero di rate non indicato nell\'Excel.') }
      if (/decadut/i.test(p.tributo)) p.tipo = 'cartella'
      p.note = note.join(' ')
      out.push(p)
    }
  }
  return out
}

/* ---------------------------- file 2: Rateizzi_Avvisi_Bonari ---------------------------- */

const RE_PIANO = /^\s*(.+?)\s*(?:\((\d{4})\))?\s*[–-]\s*(\d+)\s*rate\b/i

function periodicitaDaRate(rate: RataTributo[]): string {
  if (rate.length < 2) return 'trimestrale'
  const gap = (new Date(rate[rate.length - 1].scadenza).getTime() - new Date(rate[0].scadenza).getTime()) / 86_400_000 / (rate.length - 1)
  return gap < 50 ? 'mensile' : gap < 120 ? 'trimestrale' : 'personalizzata'
}

function leggiPiani(wb: XLSX.WorkBook, rubrica: Rubrica, utente: string, avvisi: string[]): { pratiche: PraticaTributo[]; controlli: ControlloSocieta[] } {
  const pratiche: PraticaTributo[] = []
  const controlli: ControlloSocieta[] = []

  // Totali del foglio Riepilogo: Ufficio | N. Piani | N. Rate | QC | Sanz | Int | Totale | QC pag | S pag | I pag | Tot pagato | …
  const riep = new Map<string, { tot: number; pag: number }>()
  for (const r of leggiFoglio(wb, 'Riepilogo') ?? []) {
    if (testo(r[0]) && typeof r[6] === 'number' && typeof r[10] === 'number') riep.set(normalizzaNome(r[0]), { tot: cent(r[6]), pag: cent(r[10]) })
  }

  for (const foglio of wb.SheetNames) {
    if (normalizzaNome(foglio) === 'riepilogo') continue
    const righe = leggiFoglio(wb, foglio) ?? []
    const c = rubrica.trovaOCrea(foglio, 'file Rateizzi')
    let corrente: PraticaTributo | null = null
    let dichiarate = 0
    const chiudi = () => {
      if (!corrente) return
      if (corrente.rate.length !== dichiarate) avvisi.push(`${foglio} – "${corrente.tributo}": dichiarate ${dichiarate} rate, lette ${corrente.rate.length}.`)
      corrente.periodicita = periodicitaDaRate(corrente.rate)
      corrente.stato = corrente.rate.length > 0 && corrente.rate.every((x) => x.pagata) ? 'estinto' : 'rateizzato'
      corrente.importo_cent = corrente.rate.reduce((s, x) => s + x.quota_capitale_cent + x.sanzioni_cent, 0)
      const scad = corrente.rate[0]?.scadenza
      if (scad && !corrente.anno_rateizzo) corrente.anno_rateizzo = Number(scad.slice(0, 4))
      pratiche.push(corrente)
      corrente = null
    }
    for (const r of righe) {
      const a = r[0]
      const m = typeof a === 'string' ? RE_PIANO.exec(a) : null
      if (m && typeof a === 'string' && a.startsWith(' ')) {
        chiudi()
        corrente = vuotaPratica(utente, c.id)
        corrente.tributo = m[1].replace(/\s+/g, ' ').trim()
        corrente.anno_rateizzo = m[2] ? Number(m[2]) : null
        corrente.rate_concordate = Number(m[3])
        corrente.note = `Importato dal file Rateizzi (foglio "${foglio}").`
        corrente.tipo = /piano rateale/i.test(corrente.tributo) ? 'cartella' : 'avviso_bonario'
        dichiarate = Number(m[3])
        continue
      }
      if (!corrente) continue
      if (typeof a === 'string' && /subtotale/i.test(a)) { chiudi(); continue }
      if (typeof a === 'number' && eData(r[1])) {
        const pag = testo(r[6]).toLowerCase()
        corrente.rate.push({
          numero: a, scadenza: dataIso(r[1])!, quota_capitale_cent: cent(r[2]), sanzioni_cent: cent(r[3]),
          interessi_cent: cent(r[4]), totale_cent: cent(r[5]), pagata: pag === 'sì' || pag === 'si', pagata_il: '', note: '',
        })
      }
    }
    chiudi()
    const mie = pratiche.filter((p) => p.contribuente_id === c.id && p.note.includes(`"${foglio}"`))
    const rr = riep.get(normalizzaNome(foglio))
    controlli.push({
      foglio, contribuente: c.nome, piani: mie.length,
      totale_cent: mie.reduce((s, p) => s + p.rate.reduce((t, x) => t + x.totale_cent, 0), 0),
      pagato_cent: mie.reduce((s, p) => s + p.rate.filter((x) => x.pagata).reduce((t, x) => t + x.totale_cent, 0), 0),
      riepilogo_totale_cent: rr?.tot ?? null, riepilogo_pagato_cent: rr?.pag ?? null,
    })
  }
  return { pratiche, controlli }
}

/* ---------------------------- unione ---------------------------- */

/** Chiave per riconoscere la stessa pratica (per non creare doppioni tra fogli o reimportando). */
const chiavePratica = (p: Pick<PraticaTributo, 'contribuente_id' | 'tributo'>) => `${p.contribuente_id}|${normalizzaTributo(p.tributo)}`

/** Vero se una riga del foglio "Definiti" corrisponde a un piano già letto dal file Rateizzi. */
function stessaPratica(riga: PraticaTributo, piano: PraticaTributo): boolean {
  if (riga.contribuente_id !== piano.contribuente_id) return false
  if (normalizzaTributo(riga.tributo) === normalizzaTributo(piano.tributo) && (!riga.importo_cent || !piano.importo_cent || Math.abs(riga.importo_cent - piano.importo_cent) <= 100)) return true
  // Stesso importo (entro 1 €) anche se il tributo è scritto in modo diverso
  return !!riga.importo_cent && !!piano.importo_cent && Math.abs(riga.importo_cent - piano.importo_cent) <= 100
}

/** Un PDF di piano letto dalla cartella: percorso relativo (es. "Rateizzi Avvisi Bonari/Ippocrate/2026/IVA IV TRIM 25/…pdf") e contenuto. */
export interface PdfCartella { percorso: string; pdf: PianoPdf }

export interface FileTributi { sospeso?: ArrayBuffer; rateizzi?: ArrayBuffer; pdf?: PdfCartella[] }


/**
 * Aggiunge i piani letti dai PDF della cartella: società dalla prima cartella del percorso che corrisponde a una
 * società (o dal campo "Azienda" del PDF del commercialista), tributo dalla cartella che contiene il file, anno dalla
 * cartella AAAA. Un piano già presente (stessa società e stesso importo, o stessa prima rata e numero di rate) viene
 * saltato; una pratica con "rate decise" della stessa società e con lo stesso importo (o lo stesso tributo) viene completata.
 */
function aggiungiPianiDaPdf(
  elenco: PdfCartella[], rubrica: Rubrica, nuove: PraticaTributo[], esistenti: PraticaTributo[], aggiornate: PraticaTributo[], utente: string,
): EsitoPdf[] {
  const esiti: EsitoPdf[] = []
  const visti = new Set<string>()
  const tutte = () => [...nuove, ...esistenti.filter((p) => !p.eliminato_il && !aggiornate.some((a) => a.id === p.id)), ...aggiornate]
  for (const { percorso, pdf } of [...elenco].sort((a, b) => a.percorso.localeCompare(b.percorso))) {
    const parti = percorso.split('/').filter(Boolean)
    const cartelle = parti.slice(0, -1)
    // Società: la prima cartella che corrisponde a una società nota; altrimenti il nome dell'azienda nel PDF
    let c: Contribuente | null = null
    let iSoc = -1
    for (let i = 0; i < cartelle.length && !c; i++) { c = rubrica.trova(cartelle[i]); if (c) iSoc = i }
    if (!c && pdf.azienda) c = rubrica.trovaNelTesto(pdf.azienda)
    if (!c) {
      const nome = cartelle.length >= 2 ? cartelle[1] : cartelle[0] ?? pdf.azienda ?? 'Senza nome'
      c = rubrica.trovaOCrea(nome, 'cartella dei PDF'); iSoc = cartelle.indexOf(nome)
    }
    const sotto = cartelle.slice(iSoc + 1)
    const anno = sotto.find((x) => /^20\d\d$/.test(x))
    const cartellaTributo = sotto.filter((x) => !/^20\d\d$/.test(x)).at(-1)
    const tributo = (cartellaTributo ?? parti.at(-1)!.replace(/\.pdf$/i, '')).replace(/:/g, '/').replace(/\s+/g, ' ').trim()
    const base = { percorso, societa: c.nome, tributo, importo_cent: pdf.importo_cent, n_rate: pdf.n_rate }
    const primo = pdf.righe[0]?.scadenza ?? ''

    const chiave = `${c.id}|${pdf.importo_cent}|${primo}`
    if (visti.has(chiave)) { esiti.push({ ...base, esito: 'doppione', dettaglio: 'Stesso piano già letto da un altro PDF' }); continue }
    visti.add(chiave)

    const mie = tutte().filter((p) => p.contribuente_id === c!.id)
    const rate = rateDaPdf(pdf, 10)
    const gia = mie.find((p) => stessoPiano(p, { contribuente_id: c!.id, rate }))
    if (gia && daPdf(gia)) { esiti.push({ ...base, esito: 'gia_presente', dettaglio: `Già presente: ${gia.tributo}` }); continue }
    if (gia) {
      // Piano già presente dall'Excel: si aggiorna con i dati del PDF (più precisi), tenendo le rate già segnate pagate
      const aggiornato = unisciPiani({
        ...gia, rate, importo_cent: pdf.importo_cent, data_elaborazione: pdf.data_elaborazione, data_notifica: gia.data_notifica || pdf.data_ricevimento,
        note: [gia.note, `Aggiornato con il PDF "${percorso}".`].filter(Boolean).join(' '), modificato_il: new Date().toISOString(), modificato_da: utente,
      }, [gia])
      const i = nuove.findIndex((p) => p.id === gia.id)
      if (i >= 0) nuove[i] = aggiornato
      else { const k = aggiornate.findIndex((p) => p.id === gia.id); if (k >= 0) aggiornate[k] = aggiornato; else aggiornate.push(aggiornato) }
      esiti.push({ ...base, esito: 'aggiorna', dettaglio: `Aggiorna "${gia.tributo}" con i dati del PDF (pagamenti mantenuti)` })
      continue
    }

    const inAttesa = mie.filter((p) => p.stato === 'rate_concordate' && p.rate.length === 0)
    const daCompletare = inAttesa.find((p) => p.importo_cent !== null && Math.abs(p.importo_cent - pdf.importo_cent) <= 100)
      ?? inAttesa.find((p) => normalizzaTributo(p.tributo) === normalizzaTributo(tributo) && (!p.rate_concordate || p.rate_concordate === pdf.n_rate))
    const completa = (p: PraticaTributo): PraticaTributo => {
      const note = [p.note, `Piano letto dal PDF "${percorso}".`]
      if (p.importo_cent !== null && Math.abs(p.importo_cent - pdf.importo_cent) > 100) note.push(`Importo corretto dal PDF: nell'Excel era ${(p.importo_cent / 100).toLocaleString('it-IT', { minimumFractionDigits: 2 })} €.`)
      return {
        ...p, rate, stato: 'rateizzato', rate_concordate: pdf.n_rate, importo_cent: pdf.importo_cent, periodicita: 'trimestrale',
        data_notifica: p.data_notifica || pdf.data_ricevimento, data_elaborazione: pdf.data_elaborazione,
        anno_rateizzo: p.anno_rateizzo ?? (anno ? Number(anno) : Number(primo.slice(0, 4))), note: note.filter(Boolean).join(' '),
        modificato_il: new Date().toISOString(), modificato_da: utente,
      }
    }
    if (daCompletare) {
      const i = nuove.findIndex((p) => p.id === daCompletare.id)
      if (i >= 0) nuove[i] = completa(daCompletare)
      else aggiornate.push(completa(daCompletare))
      esiti.push({ ...base, esito: 'completa', dettaglio: `Completa "${daCompletare.tributo}" (rate decise)` })
      continue
    }
    const p = vuotaPratica(utente, c.id)
    Object.assign(p, {
      tipo: 'avviso_bonario', tributo, anno_rateizzo: anno ? Number(anno) : Number(primo.slice(0, 4)), data_notifica: pdf.data_ricevimento,
      data_elaborazione: pdf.data_elaborazione, importo_cent: pdf.importo_cent, stato: 'rateizzato', rate_concordate: pdf.n_rate,
      periodicita: 'trimestrale', rate, note: `Importato dal PDF "${percorso}".`,
    })
    nuove.push(p)
    esiti.push({ ...base, esito: 'nuovo', dettaglio: 'Piano nuovo' })
  }
  return esiti
}

/**
 * Legge i file e prepara contribuenti e pratiche da aggiungere, senza toccare i dati.
 * `esistenti` servono per non creare doppioni se l'importazione viene ripetuta.
 */
export function preparaImportazioneTributi(
  file: FileTributi,
  esistenti: { contribuenti: Contribuente[]; pratiche: PraticaTributo[] },
  utente: string,
): PianoImportazioneTributi {
  const avvisi: string[] = []
  const rubrica = new Rubrica(esistenti.contribuenti, utente)
  let daSospeso: PraticaTributo[] = []
  let piani: PraticaTributo[] = []
  let controlli: ControlloSocieta[] = []

  // Prima l'Anagrafica (così i nomi "ufficiali" sono quelli dell'Anagrafica), poi i piani, poi le righe sciolte
  const wbS = file.sospeso ? XLSX.read(file.sospeso, { type: 'array' }) : null
  const wbR = file.rateizzi ? XLSX.read(file.rateizzi, { type: 'array' }) : null
  if (wbS) leggiAnagrafica(wbS, rubrica, utente, avvisi)
  if (wbR) ({ pratiche: piani, controlli } = leggiPiani(wbR, rubrica, utente, avvisi))
  if (wbS) daSospeso = leggiDefiniti(wbS, rubrica, utente)

  // Le righe di "Definiti" che corrispondono a un piano dettagliato completano il piano invece di duplicarlo
  const sciolte: PraticaTributo[] = []
  for (const r of daSospeso) {
    const piano = r.stato !== 'ricorso' ? piani.find((p) => stessaPratica(r, p)) : undefined
    if (piano) {
      piano.data_notifica ||= r.data_notifica
      piano.termine_pagamento ||= r.termine_pagamento
      if (r.importo_cent) piano.importo_cent = r.importo_cent
      continue
    }
    sciolte.push(r)
  }

  const tutte = [...piani, ...sciolte]
  const attive = esistenti.pratiche.filter((p) => !p.eliminato_il)
  const giaPresenti = new Set(attive.map((p) => `${chiavePratica(p)}|${p.importo_cent ?? ''}`))
  const aggiornate: PraticaTributo[] = []
  const nuove: PraticaTributo[] = []
  for (const p of tutte) {
    if (giaPresenti.has(`${chiavePratica(p)}|${p.importo_cent ?? ''}`)) continue
    if (p.rate.length) {
      // Stesso piano già presente (anche con qualche centesimo di differenza): non si duplica. Se quello presente
      // viene dal PDF (più preciso) gli si aggiungono solo le rate che l'Excel segna pagate.
      const gia = attive.find((e) => stessoPiano(e, p))
      if (gia) {
        if (daPdf(gia)) {
          const base = aggiornate.find((a) => a.id === gia.id) ?? gia
          const unito = unisciPiani(base, [p])
          if (unito.rate.some((r, i) => r.pagata !== base.rate[i].pagata)) {
            const k = aggiornate.findIndex((a) => a.id === gia.id)
            if (k >= 0) aggiornate[k] = unito; else aggiornate.push(unito)
          }
        }
        continue
      }
    } else if (p.importo_cent && attive.some((e) => e.contribuente_id === p.contribuente_id && e.rate.length > 0
      && Math.abs(importoDelPiano(e) - p.importo_cent!) <= 100)) {
      continue   // rate decise di un piano che è già stato inserito
    }
    nuove.push(p)
  }
  const saltate = tutte.length - nuove.length

  // Piani dai PDF della cartella (dopo gli Excel, così completano le "rate decise" appena lette)
  const esiti = file.pdf?.length ? aggiungiPianiDaPdf(file.pdf, rubrica, nuove, esistenti.pratiche, aggiornate, utente) : []

  if (rubrica.creatiDaFogli.length) avvisi.unshift(`Società non presenti nel foglio Anagrafica, create comunque (da completare con responsabile ed email): ${rubrica.creatiDaFogli.join(', ')}.`)
  if (!wbS && !wbR && !file.pdf?.length) avvisi.push('Nessun file da leggere.')

  return {
    contribuenti: rubrica.tuttiNuovi, pratiche: nuove, aggiornate, esitiPdf: esiti, aliasAggiunti: rubrica.aliasNuovi,
    controlli, avvisi, saltate,
  }
}
