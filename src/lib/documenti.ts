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

/** Dato mancante o errato, con la pagina dove correggerlo. */
export interface Problema { testo: string; percorso: string }

/* ============================== F24 ============================== */

/** Codice identificativo del contratto registrato: solo lettere e cifre, maiuscole (es. "TXX26T001234000XY"). */
export const normalizzaCodiceContratto = (x: string | undefined) => (x ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
/** Vero se il codice fiscale ha un formato valido: 16 caratteri (persona) o 11 cifre (società / partita IVA). */
export const codiceFiscaleValido = (cf: string) => /^[A-Z]{6}[0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]$/.test(cf) || /^\d{11}$/.test(cf)

/**
 * Domicilio fiscale ricavato dal campo libero "Sede legale" quando i campi dedicati sono vuoti.
 * Riconosce "Via Roma 1, 00100 Roma (RM)", "Via Roma 1, Roma RM", "Via Roma 1 - Roma"; altrimenti usa tutto come comune.
 */
export function domicilioDaSede(sede: string | undefined): { comune: string; prov: string; indirizzo: string } {
  const t = (sede ?? '').trim()
  if (!t) return { comune: '', prov: '', indirizzo: '' }
  const parti = t.split(/\s*[,–-]\s+/)
  if (parti.length < 2) return { comune: t, prov: '', indirizzo: '' }
  const ultima = parti.pop()!.replace(/^\d{5}\s+/, '')
  const m = ultima.match(/^(.*?)[\s(]+([A-Za-z]{2})\)?$/)
  return { indirizzo: parti.join(', '), comune: (m ? m[1] : ultima).trim(), prov: m ? m[2].toUpperCase() : '' }
}

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
  domicilioDaSede: boolean  // vero se il domicilio è stato ricavato dal campo "Sede legale"
}

export function contribuenteDi(s: Societa | undefined): ContribuenteF24 {
  const cf = codiceFiscaleDi(s)
  const persona = s?.tipo === 'persona'
  const daCf = persona ? datiDaCodiceFiscale(cf) : null
  const daSede = domicilioDaSede(s?.sede)
  return {
    codiceFiscale: cf, persona,
    cognomeODenominazione: ((persona ? s?.f24_cognome : '') || s?.ragione_sociale || '').toUpperCase(),
    nome: (persona ? s?.f24_nome ?? '' : '').toUpperCase(),
    dataNascita: persona ? s?.f24_data_nascita || daCf?.dataNascita || '' : '',
    sesso: persona ? s?.f24_sesso || daCf?.sesso || '' : '',
    comuneNascita: (persona ? s?.f24_comune_nascita ?? '' : '').toUpperCase(),
    provNascita: (persona ? s?.f24_prov_nascita ?? '' : '').toUpperCase(),
    domicilioComune: (s?.domicilio_comune || daSede.comune).toUpperCase(),
    domicilioProv: (s?.domicilio_prov || daSede.prov).toUpperCase(),
    domicilioIndirizzo: (s?.domicilio_indirizzo || daSede.indirizzo).toUpperCase(),
    domicilioDaSede: !s?.domicilio_comune && !s?.domicilio_indirizzo && !!s?.sede,
  }
}

export interface DatiF24 {
  ravvedimento: Ravvedimento
  contribuente: ContribuenteF24
  secondoCodiceFiscale: string
  codiceIdentificativo: string   // 63 = controparte: accompagna il codice fiscale / P. IVA del coobbligato (conduttore)
  codiceContratto: string
  righe: RigaF24[]
  mancanti: Problema[]
}

/** Prospetto F24 Elide per l'annualità, con ravvedimento se `pagamento` è oltre la scadenza. */
export function preparaF24(ctx: ContestoAnnualita, pagamento: string, tassi: Record<number, number>): DatiF24 {
  const { annualita: a, contratto: c, societa: s, conduttore: k } = ctx
  const imposta = a.imposta_cent ?? 0
  const scadenza = scadenzaVersamento(a.data_inizio)
  const r = calcolaRavvedimento(imposta, scadenza, pagamento, tassi)
  const codiceContratto = normalizzaCodiceContratto(c?.reg_codice)
  const righe: RigaF24[] = [{ tipo: 'F', elementi: codiceContratto, codice: CODICE_IMPOSTA, anno: r.annoRiferimento, importo_cent: imposta, descrizione: 'Imposta di registro, annualità successiva' }]
  if (r.sanzione_cent > 0) righe.push({ tipo: 'F', elementi: codiceContratto, codice: CODICE_SANZIONE, anno: r.annoRiferimento, importo_cent: r.sanzione_cent, descrizione: 'Sanzione da ravvedimento per tardivo versamento' })
  if (r.interessi_cent > 0) righe.push({ tipo: 'F', elementi: codiceContratto, codice: CODICE_INTERESSI, anno: r.annoRiferimento, importo_cent: r.interessi_cent, descrizione: 'Interessi da ravvedimento per tardivo versamento' })

  const mancanti: Problema[] = []
  const contribuente = contribuenteDi(s)
  const nomeSoc = `"${s?.ragione_sociale ?? '?'}"`
  const aSocieta = (testo: string) => mancanti.push({ testo: `${testo} — proprietario ${nomeSoc}`, percorso: '/societa' })
  if (!contribuente.codiceFiscale) aSocieta('Manca il codice fiscale / partita IVA del contribuente')
  else if (!codiceFiscaleValido(contribuente.codiceFiscale)) aSocieta(`Codice fiscale del contribuente non valido ("${contribuente.codiceFiscale}"): 16 caratteri per le persone, 11 cifre per le società`)
  if (!contribuente.cognomeODenominazione) aSocieta('Manca la denominazione o il cognome del contribuente')
  if (!contribuente.domicilioComune) aSocieta('Manca il comune del domicilio fiscale (sezione "Dati per il modello F24" o "Sede legale")')
  if (!contribuente.domicilioIndirizzo) aSocieta('Manca via e numero civico del domicilio fiscale (sezione "Dati per il modello F24")')
  if (!contribuente.domicilioProv) aSocieta('Manca la provincia del domicilio fiscale (sezione "Dati per il modello F24")')
  if (contribuente.persona && (!s?.f24_cognome || !s?.f24_nome)) aSocieta('Mancano cognome e nome separati del contribuente persona fisica')
  if (contribuente.persona && !contribuente.comuneNascita) aSocieta('Manca il comune di nascita del contribuente persona fisica')
  if (contribuente.persona && (!contribuente.dataNascita || !contribuente.sesso)) aSocieta('Mancano data di nascita e sesso del contribuente (non ricavabili dal codice fiscale)')
  const cfConduttore = codiceFiscaleDi(k)
  if (!cfConduttore) mancanti.push({ testo: `Manca il codice fiscale o la partita IVA del conduttore "${k?.denominazione ?? '?'}" (coobbligato, codice 63)`, percorso: '/conduttori' })
  else if (!codiceFiscaleValido(cfConduttore)) mancanti.push({ testo: `Codice fiscale del conduttore non valido ("${cfConduttore}")`, percorso: '/conduttori' })
  if (!codiceContratto) mancanti.push({ testo: 'Manca il codice identificativo del contratto di locazione (va negli "elementi identificativi"): compilarlo nella scheda del contratto, sezione Registrazione', percorso: '/contratti' })
  else if (codiceContratto.length !== 17) mancanti.push({ testo: `Il codice identificativo del contratto "${codiceContratto}" ha ${codiceContratto.length} caratteri invece di 17 (es. TXX26T001234000XY): ricontrollarlo sulla ricevuta di registrazione`, percorso: '/contratti' })
  if (!imposta) mancanti.push({ testo: "Manca l'importo dell'imposta dell'annualità", percorso: '/registro' })
  if (!a.data_inizio) mancanti.push({ testo: "Manca l'inizio dell'annualità", percorso: '/registro' })
  if (r.tassiMancanti.length) mancanti.push({ testo: `Manca il tasso legale dell'anno ${r.tassiMancanti.join(', ')}`, percorso: '/comunicazioni' })

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
  mancanti: Problema[]
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

  const mancanti: Problema[] = []
  if (a.istat_indice_percento == null) mancanti.push({ testo: "Manca la variazione dell'indice ISTAT nell'annualità", percorso: '/registro' })
  if (a.canone_mensile_nuovo_cent == null || a.canone_mensile_precedente_cent == null) mancanti.push({ testo: "Manca il canone mensile prima e dopo l'ISTAT nell'annualità", percorso: '/registro' })
  if (!k?.indirizzo) mancanti.push({ testo: `Manca l'indirizzo del conduttore "${k?.denominazione ?? '?'}"`, percorso: '/conduttori' })
  if (!k?.email && !k?.pec) mancanti.push({ testo: `Mancano email e PEC del conduttore "${k?.denominazione ?? '?'}" per l'invio`, percorso: '/conduttori' })
  if (!c?.istat_mese) mancanti.push({ testo: 'Manca il mese di riferimento dell’indice ISTAT (scheda del contratto, Aggiornamento ISTAT)', percorso: '/contratti' })

  return {
    oggetto,
    destinatario: [k?.denominazione ?? '', k?.indirizzo ?? ''].filter(Boolean),
    mittente: [s?.ragione_sociale ?? '', s?.sede ?? '', codiceFiscaleDi(s) ? `C.F./P.IVA ${codiceFiscaleDi(s)}` : ''].filter(Boolean),
    paragrafi: [saluto, ...paragrafi], voci, chiusura, testoMail,
    emailConduttore: k?.email ?? '', pecConduttore: k?.pec ?? '', mancanti,
  }
}
