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
  /** Dati per il calcolo del rendimento (dal foglio "Rendimenti Affitti") */
  valore_mercato_cent: number | null
  imu_annua_cent: number | null
  mutuo_annuo_cent: number | null
  condominio_annuo_cent: number | null
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
export const REGIMI_IVA: Opzione[] = [{ valore: 'esente', etichetta: 'Esente IVA' }, { valore: 'con_iva', etichetta: 'Con IVA (opzione)' }]
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
  deposito_cent: number | null
  deposito_modalita: string
  deposito_restituito_il: string
  regime_iva: string
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

export function etichettaDi(opzioni: Opzione[], valore: string | null | undefined): string {
  return opzioni.find((o) => o.valore === valore)?.etichetta ?? (valore || '—')
}
