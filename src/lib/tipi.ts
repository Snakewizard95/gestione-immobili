/** Tipi dei record delle collezioni (vedi docs/MODELLO_DATI.md). Importi in centesimi interi. */
import type { RecordBase } from './store'

export type Opzione = { valore: string; etichetta: string }

export interface Societa extends RecordBase {
  ragione_sociale: string
  tipo: 'societa' | 'persona'
  partita_iva: string
  codice_fiscale: string
  sede: string
  pec: string
  note: string
}

export interface Conduttore extends RecordBase {
  denominazione: string
  tipo: 'societa' | 'persona'
  codice_fiscale: string
  partita_iva: string
  indirizzo: string
  telefono: string
  email: string
  pec: string
  note: string
}

export interface Condominio extends RecordBase {
  denominazione: string
  indirizzo: string
  codice_fiscale: string
  amministratore_nome: string
  amministratore_telefono: string
  amministratore_email: string
  amministratore_pec: string
  iban: string
  iban_intestatario: string
  note: string
}

export const TIPOLOGIE_IMMOBILE: Opzione[] = [
  { valore: 'abitativo', etichetta: 'Abitativo' }, { valore: 'ufficio', etichetta: 'Ufficio' },
  { valore: 'negozio', etichetta: 'Negozio / commerciale' }, { valore: 'capannone', etichetta: 'Capannone / industriale' },
  { valore: 'box', etichetta: 'Box / posto auto' }, { valore: 'terreno', etichetta: 'Terreno' }, { valore: 'altro', etichetta: 'Altro' },
]
export const STATI_IMMOBILE: Opzione[] = [
  { valore: 'locato', etichetta: 'Locato' }, { valore: 'libero', etichetta: 'Libero' }, { valore: 'non_locabile', etichetta: 'Non locabile' },
]

export interface Immobile extends RecordBase {
  societa_id: string
  indirizzo: string
  comune: string
  provincia: string
  tipologia: string
  foglio: string
  particella: string
  subalterno: string
  categoria: string
  rendita_cent: number | null
  superficie_mq: number | null
  condominio_id: string
  millesimi: number | null
  stato: string
  note: string
}

export const TIPOLOGIE_CONTRATTO: Opzione[] = [
  { valore: 'abitativo_4_4', etichetta: 'Abitativo libero 4+4' }, { valore: 'abitativo_3_2', etichetta: 'Abitativo concordato 3+2' },
  { valore: 'transitorio', etichetta: 'Transitorio' }, { valore: 'commerciale_6_6', etichetta: 'Commerciale 6+6' },
  { valore: 'commerciale_9_9', etichetta: 'Commerciale 9+9' }, { valore: 'uso_diverso', etichetta: 'Uso diverso' }, { valore: 'altro', etichetta: 'Altro' },
]
export const STATI_CONTRATTO: Opzione[] = [
  { valore: 'attivo', etichetta: 'Attivo' }, { valore: 'in_disdetta', etichetta: 'In disdetta' }, { valore: 'cessato', etichetta: 'Cessato' },
]
export const PERIODICITA: Opzione[] = [
  { valore: 'mensile', etichetta: 'Mensile' }, { valore: 'bimestrale', etichetta: 'Bimestrale' }, { valore: 'trimestrale', etichetta: 'Trimestrale' },
  { valore: 'semestrale', etichetta: 'Semestrale' }, { valore: 'annuale', etichetta: 'Annuale' },
]
export const REGIMI_IVA: Opzione[] = [{ valore: 'con_iva', etichetta: 'Sì: canone soggetto a IVA' }, { valore: 'esente', etichetta: 'No: esente / fuori campo IVA' }]
export const MODALITA_REGISTRAZIONE: Opzione[] = [{ valore: 'rli', etichetta: 'RLI telematico' }, { valore: 'f24_elide', etichetta: 'F24 Elide' }]
export const SI_NO: Opzione[] = [{ valore: 'si', etichetta: 'Sì' }, { valore: 'no', etichetta: 'No' }]

export interface Contratto extends RecordBase {
  immobile_id: string
  conduttore_id: string
  tipologia: string
  stato: string
  data_sottoscrizione: string
  data_decorrenza: string
  durata_anni: number | null
  prima_scadenza: string
  rinnovo_automatico: string
  preavviso_mesi: number | null
  data_cessazione: string
  motivo_cessazione: string
  canone_mensile_cent: number | null
  canone_annuale_cent: number | null
  periodicita: string
  giorno_scadenza: number | null
  gestione_incassi: string    // si | no: se 'no' il contratto non compare nella griglia Canoni e incassi
  deposito_cent: number | null
  deposito_modalita: string
  deposito_restituito_il: string
  regime_iva: string          // con_iva | esente  (flag IVA del contratto, usato in tutte le sezioni)
  iva_percento: number | null // aliquota IVA se soggetto (di norma 22)
  istat_attivo: string
  istat_percentuale: number | null
  istat_mese: string
  reg_data: string
  reg_ufficio: string
  reg_codice: string
  reg_modalita: string
  reg_imposta_cent: number | null
  reg_quota_conduttore_cent: number | null
  imposta_registro_annuale_cent: number | null
  note: string
}

/**
 * Registro storico annuale di un contratto: una riga per ogni annualità con
 * aggiornamento ISTAT, imposta di registro pagata e rimborso del 50% del conduttore.
 */
export interface Annualita extends RecordBase {
  contratto_id: string
  anno: number                          // anno di riferimento dell'annualità (es. 2026)
  data_inizio: string                   // inizio dell'annualità (anniversario della decorrenza)
  // ISTAT
  istat_applicato: string               // si | no
  istat_indice_percento: number | null  // variazione ISTAT (es. 1,2)
  istat_quota_percento: number | null   // quota applicata: 75 o 100
  canone_mensile_precedente_cent: number | null
  aumento_mensile_cent: number | null
  canone_mensile_nuovo_cent: number | null
  canone_precedente_cent: number | null // annuo, = mensile × 12
  aumento_cent: number | null           // annuo
  canone_nuovo_cent: number | null      // annuo, = mensile nuovo × 12
  istat_data_lettera: string
  aggiorna_canone: string               // si | no: aggiorna il canone nella scheda contratto
  // Imposta di registro
  imposta_percento: number | null       // aliquota: 2 (abitativi) o 1 (uso diverso con locatore IVA)
  base_imponibile_percento: number | null // 100, oppure 70 per canone concordato
  imposta_cent: number | null
  imposta_pagata: string                // si | no
  imposta_data_pagamento: string
  imposta_modalita: string              // f24_elide | rli | altro
  // Rimborso conduttore
  quota_conduttore_cent: number | null
  rimborso_ricevuto: string             // si | no
  rimborso_data: string
  note: string
}

export const CATEGORIE_ALLEGATO: Opzione[] = [
  { valore: 'contratto', etichetta: 'Contratto firmato' }, { valore: 'registrazione', etichetta: 'Ricevuta registrazione' },
  { valore: 'f24', etichetta: 'F24 / ricevuta pagamento imposta' }, { valore: 'rimborso', etichetta: 'Ricevuta rimborso conduttore' },
  { valore: 'lettera_istat', etichetta: 'Lettera aggiornamento ISTAT' }, { valore: 'bollettino', etichetta: 'Bollettino' },
  { valore: 'bilancio_condominiale', etichetta: 'Bilancio / verbale condominiale' }, { valore: 'visura', etichetta: 'Visura' },
  { valore: 'planimetria', etichetta: 'Planimetria' }, { valore: 'altro', etichetta: 'Altro' },
]

export interface Allegato extends RecordBase {
  collezione: string
  record_id: string
  categoria: string
  nome_file: string
  percorso: string
  dimensione_byte: number
  tipo_mime: string
  note: string
}

/** Stato IVA di un contratto, per mostrarlo allo stesso modo in tutte le sezioni. */
export function statoIva(c: Pick<Contratto, 'regime_iva' | 'iva_percento'> | null | undefined): { testo: string; tono: 'blu' | 'grigio' | 'giallo'; soggetto: boolean } {
  if (!c || !c.regime_iva) return { testo: 'IVA da indicare', tono: 'giallo', soggetto: false }
  if (c.regime_iva === 'con_iva') return { testo: `IVA ${c.iva_percento ?? 22}%`, tono: 'blu', soggetto: true }
  return { testo: 'No IVA', tono: 'grigio', soggetto: false }
}

export function etichettaDi(opzioni: Opzione[], valore: string | null | undefined): string {
  return opzioni.find((o) => o.valore === valore)?.etichetta ?? (valore || '—')
}

/* ============================ Canoni e incassi ============================ */

export const TIPI_MOVIMENTO: Opzione[] = [
  { valore: 'canone', etichetta: 'Canone di locazione' },
  { valore: 'rimborso_condominio', etichetta: 'Rimborso spese condominiali' },
  { valore: 'rimborso_registro', etichetta: 'Rimborso imposta di registro (50%)' },
  { valore: 'rimborso_altro', etichetta: 'Rimborso altre spese' },
  { valore: 'deposito', etichetta: 'Deposito cauzionale' },
  { valore: 'altro', etichetta: 'Altro' },
]
export const STATI_MOVIMENTO: Opzione[] = [
  { valore: 'da_incassare', etichetta: 'Da incassare' }, { valore: 'parziale', etichetta: 'Incassato in parte' },
  { valore: 'incassato', etichetta: 'Incassato' }, { valore: 'stornato', etichetta: 'Stornato / non dovuto' },
]
export const MODALITA_INCASSO: Opzione[] = [
  { valore: 'bonifico', etichetta: 'Bonifico' }, { valore: 'contanti', etichetta: 'Contanti' }, { valore: 'assegno', etichetta: 'Assegno' },
  { valore: 'rid', etichetta: 'Addebito diretto (RID/SDD)' }, { valore: 'compensazione', etichetta: 'Compensazione' }, { valore: 'altro', etichetta: 'Altro' },
]

/** Un movimento = una somma dovuta dal conduttore (canone di un mese, rimborso…) con il suo incasso e la fattura. */
export interface Movimento extends RecordBase {
  contratto_id: string
  tipo: string                 // TIPI_MOVIMENTO
  competenza: string           // mese di competenza "AAAA-MM" (per i canoni) o data "AAAA-MM-GG"
  descrizione: string
  imponibile_cent: number | null
  iva_percento: number | null  // copiata dal contratto al momento della creazione, modificabile
  iva_cent: number | null
  dovuto_cent: number | null   // imponibile + IVA
  incassato_cent: number | null
  data_incasso: string
  modalita: string
  numero_fattura: string
  data_fattura: string
  stato: string                // STATI_MOVIMENTO
  note: string
}

/* ============================ Condominio ============================ */

export const TIPI_VOCE_CONDOMINIO: Opzione[] = [
  { valore: 'rata_ordinaria', etichetta: 'Rata gestione ordinaria (preventivo)' },
  { valore: 'conguaglio', etichetta: 'Conguaglio consuntivo' },
  { valore: 'straordinaria', etichetta: 'Rata lavori straordinari' },
  { valore: 'fondo', etichetta: 'Fondo / accantonamento' },
  { valore: 'rata_piano', etichetta: 'Rata di un piano di rientro' },
  { valore: 'altro', etichetta: 'Altro' },
]
export const A_CARICO: Opzione[] = [
  { valore: 'proprieta', etichetta: 'Proprietà' }, { valore: 'conduttore', etichetta: 'Conduttore (riaddebitabile)' }, { valore: 'misto', etichetta: 'Misto (indicare la quota conduttore)' },
]

/** Una voce condominiale = un bollettino / rata / conguaglio comunicato dall'amministratore per un immobile. */
export interface VoceCondominiale extends RecordBase {
  immobile_id: string
  condominio_id: string
  esercizio: string            // es. "2026" o "2025/2026"
  tipo: string                 // TIPI_VOCE_CONDOMINIO
  descrizione: string          // es. "2ª rata preventivo 2026"
  data_comunicazione: string   // data del verbale / lettera dell'amministratore
  scadenza: string
  importo_cent: number | null
  a_carico: string             // A_CARICO
  quota_conduttore_cent: number | null
  pagata: string               // si | no
  data_pagamento: string
  riaddebitata: string         // si | no: quota conduttore richiesta/incassata
  data_riaddebito: string
  piano_id: string             // se la voce è una rata generata da un piano di rientro
  in_piano_id: string          // se il bollettino insoluto è stato incluso in un piano di rientro
  note: string
}

export const STATI_PIANO: Opzione[] = [
  { valore: 'attivo', etichetta: 'In corso' }, { valore: 'concluso', etichetta: 'Concluso (saldato)' }, { valore: 'annullato', etichetta: 'Annullato' },
]
export const PERIODICITA_PIANO: Opzione[] = [
  { valore: 'mensile', etichetta: 'Mensile' }, { valore: 'bimestrale', etichetta: 'Bimestrale' }, { valore: 'trimestrale', etichetta: 'Trimestrale' },
]

/** Piano di rientro concordato con l'amministratore per saldare più bollettini insoluti a rate. */
export interface PianoRientro extends RecordBase {
  immobile_id: string
  condominio_id: string
  data_accordo: string
  descrizione: string
  voci_ids: string[]           // bollettini insoluti inclusi nel piano
  importo_totale_cent: number | null
  numero_rate: number | null
  importo_rata_cent: number | null
  prima_scadenza: string
  periodicita: string          // PERIODICITA_PIANO
  stato: string                // STATI_PIANO
  note: string
}
