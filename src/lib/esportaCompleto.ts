/**
 * Esportazione Excel "di consultazione": un unico file, un foglio per sezione, con nomi e importi
 * leggibili da chiunque (niente id tecnici). Distinta dal backup JSON usato per il ripristino.
 */
import { canoneMensilePer } from './canone'
import { scaricaExcel, type Foglio } from './esporta'
import { attivi, carica, type NomeCollezione } from './store'
import {
  A_CARICO, MODALITA_INCASSO, MODALITA_REGISTRAZIONE, PERIODICITA, PERIODICITA_PIANO, STATI_CONTRATTO, STATI_MOVIMENTO, STATI_PIANO, TIPI_MOVIMENTO, TIPI_VOCE_CONDOMINIO, TIPOLOGIE_CONTRATTO, TIPOLOGIE_IMMOBILE, etichettaDi, statoIva,
  type Annualita, type Condominio, type Conduttore, type Contratto, type Immobile, type Movimento, type PianoRientro, type Societa, type VoceCondominiale,
} from './tipi'
import { formattaData } from './utils/formato'

const MESI = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic']
const eur = (c: number | null | undefined) => (c == null ? '' : c / 100)
const siNo = (v: string) => (v === 'si' ? 'Sì' : v === 'no' ? 'No' : '')

export async function esportaConsultazione(token: string, anno: number): Promise<void> {
  const nomi: NomeCollezione[] = ['societa', 'immobili', 'conduttori', 'condomini', 'contratti', 'annualita', 'movimenti', 'voci_condominiali', 'piani_rientro']
  const [societa, immobili, conduttori, condomini, contratti, annualita, movimenti, voci, piani] = await Promise.all([
    carica<Societa>(token, 'societa'), carica<Immobile>(token, 'immobili'), carica<Conduttore>(token, 'conduttori'), carica<Condominio>(token, 'condomini'),
    carica<Contratto>(token, 'contratti'), carica<Annualita>(token, 'annualita'), carica<Movimento>(token, 'movimenti'), carica<VoceCondominiale>(token, 'voci_condominiali'), carica<PianoRientro>(token, 'piani_rientro'),
  ]).then((r) => r.map((x) => attivi(x as never)) as [Societa[], Immobile[], Conduttore[], Condominio[], Contratto[], Annualita[], Movimento[], VoceCondominiale[], PianoRientro[]])
  void nomi

  const soc = (id: string) => societa.find((s) => s.id === id)?.ragione_sociale ?? ''
  const imm = (id: string) => immobili.find((i) => i.id === id)
  const con = (id: string) => conduttori.find((c) => c.id === id)?.denominazione ?? ''
  const cond = (id: string) => condomini.find((c) => c.id === id)
  const ctr = (id: string) => contratti.find((c) => c.id === id)
  const base = (c: Contratto | undefined) => ({ 'Società': soc(imm(c?.immobile_id ?? '')?.societa_id ?? ''), 'Immobile': imm(c?.immobile_id ?? '')?.indirizzo ?? '', 'Conduttore': con(c?.conduttore_id ?? '') })
  const oggi = new Date().toISOString().slice(0, 10)
  const attiviC = contratti.filter((c) => c.stato !== 'cessato')

  // 1. Riepilogo per società
  const riepilogo = societa.map((s) => {
    const imms = immobili.filter((i) => i.societa_id === s.id)
    const cs = attiviC.filter((c) => imms.some((i) => i.id === c.immobile_id))
    const canoni = movimenti.filter((m) => m.tipo === 'canone' && m.competenza.startsWith(String(anno)) && cs.some((c) => c.id === m.contratto_id) && m.stato !== 'stornato')
    const vs = voci.filter((v) => imms.some((i) => i.id === v.immobile_id) && v.pagata !== 'si')
    return {
      'Società': s.ragione_sociale, 'Immobili': imms.length, 'di cui liberi': imms.filter((i) => i.stato === 'libero').length, 'Contratti attivi': cs.length,
      'Canone mensile totale': eur(cs.reduce((t, c) => t + (c.canone_mensile_cent ?? 0), 0)), 'Canone annuo totale': eur(cs.reduce((t, c) => t + (c.canone_annuale_cent ?? 0), 0)),
      [`Canoni ${anno} dovuti`]: eur(canoni.reduce((t, m) => t + (m.dovuto_cent ?? 0), 0)), [`Canoni ${anno} incassati`]: eur(canoni.reduce((t, m) => t + (m.incassato_cent ?? 0), 0)),
      'Imposte di registro non pagate': annualita.filter((a) => cs.some((c) => c.id === a.contratto_id) && a.imposta_pagata !== 'si').length,
      'Condominio da pagare': eur(vs.reduce((t, v) => t + (v.importo_cent ?? 0), 0)), 'Condominio scaduto': eur(vs.filter((v) => !v.in_piano_id && v.scadenza && v.scadenza < oggi).reduce((t, v) => t + (v.importo_cent ?? 0), 0)),
    }
  })

  const fogli: Foglio[] = [
    { nome: 'Riepilogo società', righe: riepilogo },
    { nome: 'Società', righe: societa.map((s) => ({ 'Ragione sociale': s.ragione_sociale, 'Tipo': s.tipo === 'persona' ? 'Persona fisica' : 'Società', 'Partita IVA': s.partita_iva, 'Codice fiscale': s.codice_fiscale, 'Sede': s.sede, 'PEC': s.pec, 'Note': s.note })) },
    { nome: 'Immobili', righe: immobili.map((i) => { const c = attiviC.find((x) => x.immobile_id === i.id); return { 'Società': soc(i.societa_id), 'Indirizzo': i.indirizzo, 'Comune': i.comune, 'Provincia': i.provincia, 'Tipologia': etichettaDi(TIPOLOGIE_IMMOBILE, i.tipologia), 'Stato': i.stato === 'locato' ? 'Locato' : i.stato === 'libero' ? 'Libero' : 'Non locabile', 'Conduttore attuale': c ? con(c.conduttore_id) : '', 'Canone mensile': eur(c?.canone_mensile_cent), 'Superficie mq': i.superficie_mq ?? '', 'Foglio': i.foglio, 'Particella': i.particella, 'Subalterno': i.subalterno, 'Categoria': i.categoria, 'Rendita': eur(i.rendita_cent), 'Condominio': cond(i.condominio_id)?.denominazione ?? '', 'Amministratore': cond(i.condominio_id)?.amministratore_nome ?? '', 'Millesimi': i.millesimi ?? '', 'Note': i.note } }) },
    { nome: 'Conduttori', righe: conduttori.map((k) => ({ 'Denominazione': k.denominazione, 'Tipo': k.tipo === 'persona' ? 'Persona fisica' : 'Società', 'Codice fiscale': k.codice_fiscale, 'Partita IVA': k.partita_iva, 'Indirizzo': k.indirizzo, 'Telefono': k.telefono, 'Email': k.email, 'PEC': k.pec, 'Immobili in locazione': attiviC.filter((c) => c.conduttore_id === k.id).map((c) => imm(c.immobile_id)?.indirizzo).filter(Boolean).join('; '), 'Note': k.note })) },
    { nome: 'Condomini', righe: condomini.map((c) => ({ 'Condominio': c.denominazione, 'Indirizzo': c.indirizzo, 'CF condominio': c.codice_fiscale, 'Amministratore': c.amministratore_nome, 'Telefono': c.amministratore_telefono, 'Email': c.amministratore_email, 'PEC': c.amministratore_pec, 'IBAN': c.iban, 'Intestatario': c.iban_intestatario, 'Immobili collegati': immobili.filter((i) => i.condominio_id === c.id).map((i) => i.indirizzo).join('; '), 'Note': c.note })) },
  ]

  const rigaContratto = (c: Contratto) => ({ ...base(c), 'Stato': etichettaDi(STATI_CONTRATTO, c.stato), 'Tipologia': etichettaDi(TIPOLOGIE_CONTRATTO, c.tipologia), 'IVA': statoIva(c).testo, 'Sottoscrizione': formattaData(c.data_sottoscrizione), 'Decorrenza': formattaData(c.data_decorrenza), 'Durata anni': c.durata_anni ?? '', 'Prima scadenza': formattaData(c.prima_scadenza), 'Rinnovo automatico': siNo(c.rinnovo_automatico), 'Preavviso mesi': c.preavviso_mesi ?? '', 'Cessazione': formattaData(c.data_cessazione), 'Motivo cessazione': c.motivo_cessazione, 'Canone mensile': eur(c.canone_mensile_cent), 'Canone annuo': eur(c.canone_annuale_cent), 'Periodicità': etichettaDi(PERIODICITA, c.periodicita), 'Giorno scadenza': c.giorno_scadenza ?? '', 'Incassi gestiti da noi': siNo(c.gestione_incassi), 'Deposito': eur(c.deposito_cent), 'Deposito modalità': c.deposito_modalita, 'Deposito restituito il': formattaData(c.deposito_restituito_il), 'ISTAT': siNo(c.istat_attivo), 'ISTAT %': c.istat_percentuale ?? '', 'Registrazione data': formattaData(c.reg_data), 'Ufficio': c.reg_ufficio, 'Codice identificativo': c.reg_codice, 'Modalità registrazione': etichettaDi(MODALITA_REGISTRAZIONE, c.reg_modalita), 'Imposta prima registrazione': eur(c.reg_imposta_cent), 'di cui conduttore': eur(c.reg_quota_conduttore_cent), 'Note': c.note })
  fogli.push({ nome: 'Contratti attivi', righe: attiviC.map(rigaContratto) }, { nome: 'Contratti cessati', righe: contratti.filter((c) => c.stato === 'cessato').map(rigaContratto) })

  fogli.push({ nome: 'ISTAT e imposta registro', righe: annualita.sort((a, b) => b.anno - a.anno).map((a) => ({ 'Anno': a.anno, ...base(ctr(a.contratto_id)), 'Inizio annualità': formattaData(a.data_inizio), 'ISTAT applicato': siNo(a.istat_applicato), 'Indice ISTAT %': a.istat_indice_percento ?? '', 'Quota %': a.istat_quota_percento ?? '', 'Mensile prima': eur(a.canone_mensile_precedente_cent), 'Mensile dopo': eur(a.canone_mensile_nuovo_cent), 'Annuo dopo': eur(a.canone_nuovo_cent), 'Lettera ISTAT del': formattaData(a.istat_data_lettera), 'Aliquota %': a.imposta_percento ?? '', 'Base imponibile %': a.base_imponibile_percento ?? '', 'Imposta di registro': eur(a.imposta_cent), 'Pagata': siNo(a.imposta_pagata), 'Data pagamento': formattaData(a.imposta_data_pagamento), 'Quota conduttore 50%': eur(a.quota_conduttore_cent), 'Rimborso ricevuto': siNo(a.rimborso_ricevuto), 'Data rimborso': formattaData(a.rimborso_data), 'Note': a.note })) })

  // Griglia canoni dell'anno
  const mesi = MESI.map((_, i) => `${anno}-${String(i + 1).padStart(2, '0')}`)
  fogli.push({ nome: `Canoni ${anno}`, righe: attiviC.filter((c) => c.gestione_incassi !== 'no').map((c) => {
    const r: Record<string, unknown> = { ...base(c), 'IVA': statoIva(c).testo, 'Canone mensile attuale (con IVA)': eur(canoneMensilePer(c, annualita, oggi.slice(0, 7)).totale_cent) }
    let dov = 0, inc = 0
    for (const mese of mesi) { const m = movimenti.find((x) => x.contratto_id === c.id && x.tipo === 'canone' && x.competenza === mese); r[MESI[Number(mese.slice(5)) - 1]] = m ? (m.stato === 'stornato' ? 'stornato' : eur(m.incassato_cent ?? 0)) : ''; if (m && m.stato !== 'stornato') { dov += m.dovuto_cent ?? 0; inc += m.incassato_cent ?? 0 } }
    r['Dovuto anno'] = eur(dov); r['Incassato anno'] = eur(inc); r['Insoluto'] = eur(dov - inc)
    r['Fatture'] = movimenti.filter((x) => x.contratto_id === c.id && x.tipo === 'canone' && x.competenza.startsWith(String(anno)) && x.numero_fattura).sort((a, b) => a.competenza.localeCompare(b.competenza)).map((x) => `${MESI[Number(x.competenza.slice(5)) - 1]}: ${x.numero_fattura}`).join('; ')
    return r
  }) })
  fogli.push({ nome: `Movimenti ${anno}`, righe: movimenti.filter((m) => m.competenza.startsWith(String(anno))).sort((a, b) => a.competenza.localeCompare(b.competenza)).map((m) => ({ 'Competenza': m.competenza.length === 7 ? `${MESI[Number(m.competenza.slice(5)) - 1]} ${m.competenza.slice(0, 4)}` : formattaData(m.competenza), 'Tipo': etichettaDi(TIPI_MOVIMENTO, m.tipo), ...base(ctr(m.contratto_id)), 'Descrizione': m.descrizione, 'Imponibile': eur(m.imponibile_cent), 'IVA %': m.iva_percento ?? '', 'IVA': eur(m.iva_cent), 'Dovuto': eur(m.dovuto_cent), 'Incassato': eur(m.incassato_cent), 'Data incasso': formattaData(m.data_incasso), 'Modalità': etichettaDi(MODALITA_INCASSO, m.modalita), 'N. fattura': m.numero_fattura, 'Data fattura': formattaData(m.data_fattura), 'Stato': etichettaDi(STATI_MOVIMENTO, m.stato), 'Note': m.note })) })

  fogli.push({ nome: 'Condominio bollettini', righe: voci.sort((a, b) => (b.scadenza || '').localeCompare(a.scadenza || '')).map((v) => { const i = imm(v.immobile_id); return { 'Società': soc(i?.societa_id ?? ''), 'Immobile': i?.indirizzo ?? '', 'Condominio': cond(v.condominio_id)?.denominazione ?? '', 'Amministratore': cond(v.condominio_id)?.amministratore_nome ?? '', 'Esercizio': v.esercizio, 'Tipo': etichettaDi(TIPI_VOCE_CONDOMINIO, v.tipo), 'Descrizione': v.descrizione, 'Comunicata il': formattaData(v.data_comunicazione), 'Scadenza': formattaData(v.scadenza), 'Importo': eur(v.importo_cent), 'A carico': etichettaDi(A_CARICO, v.a_carico).split(' (')[0], 'Quota conduttore': eur(v.quota_conduttore_cent), 'Pagata': siNo(v.pagata), 'Data pagamento': formattaData(v.data_pagamento), 'Quota conduttore incassata': siNo(v.riaddebitata), 'Data incasso conduttore': formattaData(v.data_riaddebito), 'In piano di rientro': v.in_piano_id ? 'Sì' : '', 'Note': v.note } }) })
  fogli.push({ nome: 'Condominio riepilogo', righe: immobili.filter((i) => i.condominio_id || voci.some((v) => v.immobile_id === i.id)).map((i) => { const vs = voci.filter((v) => v.immobile_id === i.id); const np = vs.filter((v) => v.pagata !== 'si'); const c = cond(i.condominio_id); return { 'Società': soc(i.societa_id), 'Immobile': i.indirizzo, 'Condominio': c?.denominazione ?? '', 'Amministratore': c?.amministratore_nome ?? '', 'Telefono': c?.amministratore_telefono ?? '', 'IBAN': c?.iban ?? '', 'Voci': vs.length, 'Totale': eur(vs.reduce((t, v) => t + (v.importo_cent ?? 0), 0)), 'Pagato': eur(vs.filter((v) => v.pagata === 'si').reduce((t, v) => t + (v.importo_cent ?? 0), 0)), 'Da pagare': eur(np.filter((v) => !v.in_piano_id).reduce((t, v) => t + (v.importo_cent ?? 0), 0)), 'Scaduto': eur(np.filter((v) => !v.in_piano_id && v.scadenza && v.scadenza < oggi).reduce((t, v) => t + (v.importo_cent ?? 0), 0)), 'In piano di rientro': eur(np.filter((v) => v.in_piano_id).reduce((t, v) => t + (v.importo_cent ?? 0), 0)), 'Da incassare dal conduttore': eur(vs.filter((v) => (v.quota_conduttore_cent ?? 0) > 0 && v.riaddebitata !== 'si').reduce((t, v) => t + (v.quota_conduttore_cent ?? 0), 0)) } }) })
  fogli.push({ nome: 'Piani di rientro', righe: piani.map((p) => { const rate = voci.filter((v) => v.piano_id === p.id); return { 'Stato': etichettaDi(STATI_PIANO, p.stato), 'Società': soc(imm(p.immobile_id)?.societa_id ?? ''), 'Immobile': imm(p.immobile_id)?.indirizzo ?? '', 'Condominio': cond(p.condominio_id)?.denominazione ?? '', 'Accordo del': formattaData(p.data_accordo), 'Descrizione': p.descrizione, 'Totale': eur(p.importo_totale_cent), 'Rate': p.numero_rate ?? '', 'Importo rata': eur(p.importo_rata_cent), 'Prima scadenza': formattaData(p.prima_scadenza), 'Periodicità': etichettaDi(PERIODICITA_PIANO, p.periodicita), 'Rate pagate': rate.filter((r) => r.pagata === 'si').length, 'Versato': eur(rate.filter((r) => r.pagata === 'si').reduce((t, r) => t + (r.importo_cent ?? 0), 0)), 'Prossima rata': formattaData(rate.filter((r) => r.pagata !== 'si').sort((a, b) => a.scadenza.localeCompare(b.scadenza))[0]?.scadenza), 'Note': p.note } }) })

  scaricaExcel('Gestione_Immobili_consultazione', fogli)
}
