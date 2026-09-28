/**
 * Dati e testi dei documenti preparati dalla sezione "Documenti e comunicazioni":
 * prospetto F24 Elide per l'imposta di registro (con ravvedimento) e lettera di aumento ISTAT.
 * Funzioni pure: ricevono i record già caricati e restituiscono dati pronti da mostrare o stampare.
 */
import { CODICE_IMPOSTA, CODICE_INTERESSI, CODICE_SANZIONE, TASSI_LEGALI_INIZIALI, calcolaRavvedimento, scadenzaVersamento, type Ravvedimento } from './ravvedimento'
import { attivi } from './store'
import { statoIva, type Annualita, type Conduttore, type Contratto, type Immobile, type Societa, type TassoLegale } from './tipi'
import { formattaData, formattaEuro } from './utils/formato'

/** Tassi legali da usare: valori già noti + quelli salvati nell'app (che hanno la precedenza). */
export function tassiLegali(salvati: TassoLegale[]): Record<number, number> {
  const out: Record<number, number> = { ...TASSI_LEGALI_INIZIALI }
  for (const t of attivi(salvati)) out[t.anno] = t.tasso_percento
  return out
}

/** Tutto ciò che serve per un documento di un'annualità. */
export interface ContestoAnnualita {
  annualita: Annualita
  contratto: Contratto | undefined
  immobile: Immobile | undefined
  societa: Societa | undefined
  conduttore: Conduttore | undefined
}

export function contestoDi(annualitaId: string, dati: { annualita: Annualita[]; contratti: Contratto[]; immobili: Immobile[]; societa: Societa[]; conduttori: Conduttore[] }): ContestoAnnualita | null {
  const annualita = dati.annualita.find((a) => a.id === annualitaId)
  if (!annualita) return null
  const contratto = dati.contratti.find((c) => c.id === annualita.contratto_id)
  const immobile = dati.immobili.find((i) => i.id === contratto?.immobile_id)
  return {
    annualita, contratto, immobile,
    societa: dati.societa.find((s) => s.id === immobile?.societa_id),
    conduttore: dati.conduttori.find((k) => k.id === contratto?.conduttore_id),
  }
}

/** Codice fiscale da usare in F24: il codice fiscale, oppure la partita IVA (per le società coincidono di norma). */
export const codiceFiscaleDi = (x: { codice_fiscale?: string; partita_iva?: string } | undefined) => (x?.codice_fiscale || x?.partita_iva || '').trim().toUpperCase()

/* ============================== F24 ============================== */

export interface RigaF24 { tipo: string; elementi: string; codice: string; anno: number; importo_cent: number; descrizione: string }

/** Carattere di omocodia → cifra (codice fiscale) */
const OMOCODIA: Record<string, string> = { L: '0', M: '1', N: '2', P: '3', Q: '4', R: '5', S: '6', T: '7', U: '8', V: '9' }
/** Data di nascita (AAAA-MM-GG) e sesso ricavati da un codice fiscale di persona fisica; null se non è un CF personale valido. */
export function datiDaCodiceFiscale(cf: string): { dataNascita: string; sesso: 'M' | 'F' } | null {
  const c = cf.trim().toUpperCase()
  if (!/^[A-Z]{6}[0-9LMNPQRSTUV]{2}[ABCDEHLMPRST][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]$/.test(c)) return null
  const n = (x: string) => Number([...x].map((ch) => OMOCODIA[ch] ?? ch).join(''))
  const aa = n(c.slice(6, 8)), mese = 'ABCDEHLMPRST'.indexOf(c[8]) + 1
  let gg = n(c.slice(9, 11))
  const sesso = gg > 40 ? 'F' : 'M'
  if (gg > 40) gg -= 40
  const anno = aa > new Date().getFullYear() % 100 ? 1900 + aa : 2000 + aa
  return { dataNascita: `${anno}-${String(mese).padStart(2, '0')}-${String(gg).padStart(2, '0')}`, sesso }
}

/** Dati della sezione "Contribuente" del modello F24. */
export interface ContribuenteF24 {
  codiceFiscale: string
  persona: boolean
  cognomeODenominazione: string
  nome: string
  dataNascita: string     // AAAA-MM-GG
  sesso: string
  comuneNascita: string
  provNascita: string
  domicilioComune: string
  domicilioProv: string
  domicilioIndirizzo: string
}

export function contribuenteDi(s: Societa | undefined): ContribuenteF24 {
  const cf = codiceFiscaleDi(s)
  const persona = s?.tipo === 'persona'
  const daCf = persona ? datiDaCodiceFiscale(cf) : null
  return {
    codiceFiscale: cf, persona,
    cognomeODenominazione: ((persona ? s?.f24_cognome : '') || s?.ragione_sociale || '').toUpperCase(),
    nome: (persona ? s?.f24_nome ?? '' : '').toUpperCase(),
    dataNascita: persona ? s?.f24_data_nascita || daCf?.dataNascita || '' : '',
    sesso: persona ? s?.f24_sesso || daCf?.sesso || '' : '',
    comuneNascita: (persona ? s?.f24_comune_nascita ?? '' : '').toUpperCase(),
    provNascita: (persona ? s?.f24_prov_nascita ?? '' : '').toUpperCase(),
    domicilioComune: (s?.domicilio_comune ?? '').toUpperCase(),
    domicilioProv: (s?.domicilio_prov ?? '').toUpperCase(),
    domicilioIndirizzo: (s?.domicilio_indirizzo ?? '').toUpperCase(),
  }
}

export interface DatiF24 {
  ravvedimento: Ravvedimento
  contribuente: ContribuenteF24
  secondoCodiceFiscale: string
  codiceIdentificativo: string   // 63 = controparte: accompagna il codice fiscale / P. IVA del coobbligato (conduttore)
  codiceContratto: string
  righe: RigaF24[]
  mancanti: string[]
}

/** Prospetto F24 Elide per l'annualità, con ravvedimento se `pagamento` è oltre la scadenza. */
export function preparaF24(ctx: ContestoAnnualita, pagamento: string, tassi: Record<number, number>): DatiF24 {
  const { annualita: a, contratto: c, societa: s, conduttore: k } = ctx
  const imposta = a.imposta_cent ?? 0
  const scadenza = scadenzaVersamento(a.data_inizio)
  const r = calcolaRavvedimento(imposta, scadenza, pagamento, tassi)
  const codiceContratto = (c?.reg_codice ?? '').trim().toUpperCase()
  const righe: RigaF24[] = [{ tipo: 'F', elementi: codiceContratto, codice: CODICE_IMPOSTA, anno: r.annoRiferimento, importo_cent: imposta, descrizione: 'Imposta di registro, annualità successiva' }]
  if (r.sanzione_cent > 0) righe.push({ tipo: 'F', elementi: codiceContratto, codice: CODICE_SANZIONE, anno: r.annoRiferimento, importo_cent: r.sanzione_cent, descrizione: 'Sanzione da ravvedimento per tardivo versamento' })
  if (r.interessi_cent > 0) righe.push({ tipo: 'F', elementi: codiceContratto, codice: CODICE_INTERESSI, anno: r.annoRiferimento, importo_cent: r.interessi_cent, descrizione: 'Interessi da ravvedimento per tardivo versamento' })

  const mancanti: string[] = []
  const contribuente = contribuenteDi(s)
  const soc = `(Anagrafiche → Società → "${s?.ragione_sociale ?? '?'}")`
  if (!contribuente.codiceFiscale) mancanti.push(`Codice fiscale / partita IVA del proprietario ${soc}`)
  if (!contribuente.domicilioComune || !contribuente.domicilioIndirizzo) mancanti.push(`Domicilio fiscale (comune, provincia, via) nei "Dati per il modello F24" ${soc}`)
  if (contribuente.persona && (!s?.f24_cognome || !s?.f24_nome)) mancanti.push(`Cognome e nome separati del proprietario persona fisica ${soc}`)
  if (contribuente.persona && !contribuente.comuneNascita) mancanti.push(`Comune di nascita del proprietario persona fisica ${soc}`)
  if (contribuente.persona && (!contribuente.dataNascita || !contribuente.sesso)) mancanti.push(`Data di nascita e sesso del proprietario (non ricavabili dal codice fiscale) ${soc}`)
  if (!codiceFiscaleDi(k)) mancanti.push(`Codice fiscale o partita IVA del conduttore "${k?.denominazione ?? '?'}", da indicare come coobbligato (Anagrafiche → Conduttori)`)
  if (!codiceContratto) mancanti.push('Codice identificativo del contratto registrato (Contratti → Registrazione)')
  if (!imposta) mancanti.push("Importo dell'imposta dell'annualità (Registro annuale)")
  if (!a.data_inizio) mancanti.push("Inizio dell'annualità (Registro annuale)")
  if (r.tassiMancanti.length) mancanti.push(`Tasso legale dell'anno ${r.tassiMancanti.join(', ')} (Documenti → Calcolo ravvedimento)`)

  return {
    ravvedimento: r,
    contribuente,
    secondoCodiceFiscale: codiceFiscaleDi(k), codiceIdentificativo: '63', codiceContratto, righe, mancanti,
  }
}

/* ========================= Lettera ISTAT ========================= */

const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre']
/** "2026-05" → "maggio 2026" */
export const meseEsteso = (am: string) => (/^\d{4}-\d{2}/.test(am) ? `${MESI[Number(am.slice(5, 7)) - 1]} ${am.slice(0, 4)}` : am)
const numero = (n: number | null | undefined) => (n == null ? '—' : n.toLocaleString('it-IT', { maximumFractionDigits: 3 }))

export interface DatiLetteraIstat {
  oggetto: string
  destinatario: string[]        // righe dell'indirizzo
  mittente: string[]            // righe della carta intestata
  paragrafi: string[]
  voci: Array<[string, string]> // tabella del calcolo
  chiusura: string[]
  testoMail: string
  emailConduttore: string
  pecConduttore: string
  mancanti: string[]
}

/** Testi della lettera di aggiornamento ISTAT (stampa) e della mail da copiare. */
export function preparaLetteraIstat(ctx: ContestoAnnualita): DatiLetteraIstat {
  const { annualita: a, contratto: c, immobile: i, societa: s, conduttore: k } = ctx
  const indirizzoImmobile = [i?.indirizzo, i?.comune].filter(Boolean).join(', ')
  const quota = a.istat_quota_percento ?? 100
  const variazioneApplicata = a.istat_indice_percento != null ? a.istat_indice_percento * quota / 100 : null
  const iva = statoIva(c)
  const riferimento = c?.istat_mese ? ` del mese di ${meseEsteso(c.istat_mese)}` : ''
  const registrazione = c?.reg_data ? `, registrato il ${formattaData(c.reg_data)}${c.reg_codice ? ` (codice ${c.reg_codice})` : ''}` : ''
  const oggetto = `Aggiornamento ISTAT del canone di locazione – ${indirizzoImmobile || 'immobile locato'}`
  const saluto = `${k?.tipo === 'persona' ? 'Gentile' : 'Spett.le'} ${k?.denominazione ?? ''},`

  const paragrafi = [
    `con riferimento al contratto di locazione dell'immobile sito in ${indirizzoImmobile || '—'}, decorrente dal ${formattaData(c?.data_decorrenza)}${registrazione}, Le comunichiamo che, come previsto dal contratto, dal ${formattaData(a.data_inizio)} il canone viene aggiornato in base alla variazione dell'indice ISTAT dei prezzi al consumo per le famiglie di operai e impiegati (FOI)${riferimento}, nella misura del ${quota}% della variazione.`,
    `Il calcolo dell'aggiornamento è il seguente${iva.soggetto ? ' (importi al netto dell’IVA)' : ''}:`,
  ]
  const voci: Array<[string, string]> = [
    ['Variazione dell’indice ISTAT', `${numero(a.istat_indice_percento)}%`],
    ['Quota applicata', `${quota}%`],
    ['Aumento percentuale applicato', `${numero(variazioneApplicata)}%`],
    ['Canone mensile precedente', formattaEuro(a.canone_mensile_precedente_cent)],
    ['Aumento mensile', formattaEuro(a.aumento_mensile_cent)],
    ['Nuovo canone mensile', formattaEuro(a.canone_mensile_nuovo_cent)],
    ['Nuovo canone annuo', formattaEuro(a.canone_mensile_nuovo_cent != null ? a.canone_mensile_nuovo_cent * 12 : a.canone_nuovo_cent)],
  ]
  const chiusura = [
    `Il nuovo canone mensile di ${formattaEuro(a.canone_mensile_nuovo_cent)}${iva.soggetto ? ' oltre IVA' : ''} sarà dovuto a partire dalla rata di ${meseEsteso(a.data_inizio.slice(0, 7))}.`,
    'Restiamo a disposizione per ogni chiarimento.',
  ]
  const testoMail = [
    saluto, '',
    ...paragrafi, '',
    ...voci.map(([t, v]) => `- ${t}: ${v}`), '',
    ...chiusura, '',
    'Distinti saluti,',
    s?.ragione_sociale ?? '',
  ].join('\n')

  const mancanti: string[] = []
  if (a.istat_indice_percento == null) mancanti.push("Variazione dell'indice ISTAT nell'annualità (Registro annuale)")
  if (a.canone_mensile_nuovo_cent == null || a.canone_mensile_precedente_cent == null) mancanti.push("Canone mensile prima e dopo l'ISTAT nell'annualità (Registro annuale)")
  if (!k?.indirizzo) mancanti.push(`Indirizzo del conduttore "${k?.denominazione ?? '?'}" (Anagrafiche → Conduttori)`)
  if (!k?.email && !k?.pec) mancanti.push(`Email o PEC del conduttore "${k?.denominazione ?? '?'}" per l'invio (Anagrafiche → Conduttori)`)
  if (!c?.istat_mese) mancanti.push('Mese di riferimento dell’indice ISTAT (Contratti → Aggiornamento ISTAT)')

  return {
    oggetto,
    destinatario: [k?.denominazione ?? '', k?.indirizzo ?? ''].filter(Boolean),
    mittente: [s?.ragione_sociale ?? '', s?.sede ?? '', codiceFiscaleDi(s) ? `C.F./P.IVA ${codiceFiscaleDi(s)}` : ''].filter(Boolean),
    paragrafi: [saluto, ...paragrafi], voci, chiusura, testoMail,
    emailConduttore: k?.email ?? '', pecConduttore: k?.pec ?? '', mancanti,
  }
}
