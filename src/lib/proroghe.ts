/**
 * Proroghe dei contratti di locazione (rinnovo alla scadenza, anche tacito): imposta di registro con codice 1504.
 *
 * Regole (scheda Agenzia delle Entrate "Proroga del contratto"): l'imposta va versata entro 30 giorni dalla
 * scadenza del contratto (o della proroga precedente), con aliquota sul canone annuo aggiornato (es. 2%);
 * si può versare per singola annualità. Se si paga con F24 va presentato anche il modello RLI all'ufficio
 * entro 30 giorni. Le annualità successive della proroga si pagano con il codice 1501.
 *
 * Qui la proroga è rappresentata come un'annualità con `proroga = 'si'` che inizia alla data di scadenza.
 */
import { regoleImposta } from './imposta'
import { canoneMensilePer } from './canone'
import { aggiungiGiorni, scadenzaVersamento } from './ravvedimento'
import { inCedolare, type Annualita, type Contratto } from './tipi'

/** Anni di ogni rinnovo per tipo di contratto (null = nessun rinnovo automatico, es. transitorio). */
export const ANNI_RINNOVO: Record<string, number | null> = {
  abitativo_4_4: 4, abitativo_3_2: 2, commerciale_6_6: 6, commerciale_9_9: 9, transitorio: null,
}
/** Giorni di anticipo con cui una proroga compare nell'elenco. */
export const GIORNI_ANTICIPO = 30

const piuAnni = (data: string, anni: number) => `${Number(data.slice(0, 4)) + anni}${data.slice(4)}`

export interface ProrogaAttesa {
  id: string                 // "proroga:<contratto>:<data>" oppure l'id dell'annualità già registrata
  contratto: Contratto
  data: string               // scadenza del periodo precedente = inizio della proroga
  fine: string               // fine del nuovo periodo
  anni: number
  scadenzaVersamento: string
  annualita: Annualita       // annualità registrata o da registrare (con proroga = 'si')
  registrata: boolean        // vero se esiste già un'annualità che inizia in quella data
  pagata: boolean
}

/** Anni del rinnovo per il contratto: dal tipo di contratto, altrimenti la durata indicata. */
export function anniRinnovo(c: Contratto): number | null {
  if (c.tipologia in ANNI_RINNOVO) return ANNI_RINNOVO[c.tipologia]
  return c.durata_anni && c.durata_anni > 0 ? c.durata_anni : null
}

/** Annualità (non ancora salvata) per la prima annualità della proroga che inizia in `data`. */
function annualitaDiProroga(c: Contratto, tutte: Annualita[], data: string): Annualita {
  const k = canoneMensilePer(c, tutte, data.slice(0, 7))
  const mensile = k.imponibile_cent ?? c.canone_mensile_cent ?? (c.canone_annuale_cent != null ? Math.round(c.canone_annuale_cent / 12) : 0)
  const regole = regoleImposta(c)
  const annuo = mensile * 12
  const imposta = Math.round(annuo * (regole.base / 100) * (regole.percento / 100))
  return {
    id: `proroga:${c.id}:${data}`, creato_il: '', creato_da: '', modificato_il: '', modificato_da: '', eliminato_il: null,
    contratto_id: c.id, anno: Number(data.slice(0, 4)), data_inizio: data,
    istat_applicato: 'no', istat_indice_percento: null, istat_quota_percento: null,
    canone_mensile_precedente_cent: mensile, aumento_mensile_cent: 0, canone_mensile_nuovo_cent: mensile,
    canone_precedente_cent: annuo, aumento_cent: 0, canone_nuovo_cent: annuo, istat_data_lettera: '', aggiorna_canone: 'no',
    imposta_percento: regole.percento, base_imponibile_percento: regole.base, imposta_cent: imposta,
    imposta_pagata: 'no', imposta_data_pagamento: '', imposta_modalita: 'f24_elide',
    quota_conduttore_cent: Math.round(imposta / 2), rimborso_ricevuto: 'no', rimborso_data: '',
    proroga: 'si', note: `Prima annualità della proroga dal ${data.split('-').reverse().join('/')} (codice 1504)`,
  }
}

/**
 * Proroghe da pagare: tutte le scadenze già passate non registrate/pagate e quelle entro i prossimi 30 giorni.
 * Con `tutte = true` restituisce anche quelle già pagate. Esclusi: contratti cessati prima della scadenza,
 * in cedolare secca (nessuna imposta), senza prima scadenza o senza rinnovo (es. transitori).
 */
export function proroghePreviste(contratti: Contratto[], annualita: Annualita[], oggi: string, tutte = false): ProrogaAttesa[] {
  const limite = aggiungiGiorni(oggi, GIORNI_ANTICIPO)
  const out: ProrogaAttesa[] = []
  for (const c of contratti) {
    const anni = anniRinnovo(c)
    if (!c.prima_scadenza || !anni || inCedolare(c)) continue
    for (let data = c.prima_scadenza, i = 0; data <= limite && i < 20; data = piuAnni(data, anni), i++) {
      if (c.data_decorrenza && data <= c.data_decorrenza) continue
      if (c.stato === 'cessato' && (!c.data_cessazione || c.data_cessazione <= data)) break
      if (c.stato === 'in_disdetta' && data > oggi) break
      const esistente = annualita.find((a) => a.contratto_id === c.id && a.data_inizio === data)
      const pagata = esistente?.imposta_pagata === 'si'
      if (pagata && !tutte) continue
      out.push({
        id: esistente?.id ?? `proroga:${c.id}:${data}`, contratto: c, data, fine: piuAnni(data, anni), anni,
        scadenzaVersamento: scadenzaVersamento(data),
        annualita: esistente ? { ...esistente, proroga: 'si' } : annualitaDiProroga(c, annualita, data),
        registrata: !!esistente, pagata,
      })
    }
  }
  return out.sort((a, b) => a.data.localeCompare(b.data))
}

/** Contratti attivi per cui non si possono calcolare le proroghe (manca la prima scadenza). */
export function contrattiSenzaScadenza(contratti: Contratto[]): Contratto[] {
  return contratti.filter((c) => c.stato !== 'cessato' && !inCedolare(c) && anniRinnovo(c) !== null && !c.prima_scadenza)
}
