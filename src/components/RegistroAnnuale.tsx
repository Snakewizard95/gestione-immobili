/**
 * Registro storico annuale di un contratto: una riga per annualità con ISTAT (canone mensile
 * prima/dopo), imposta di registro e rimborso del conduttore, ciascuna con i propri allegati.
 */
import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useSessioneAttiva } from '../lib/sessione'
import { aggiorna, attivi, campiModifica, campiNuovo } from '../lib/store'
import { SI_NO, TIPOLOGIE_CONTRATTO, etichettaDi, statoIva, type Allegato, type Annualita, type Contratto, type Opzione } from '../lib/tipi'
import { useCollezioni } from '../lib/useCollezioni'
import { formattaData, formattaEuro } from '../lib/utils/formato'
import Allegati from './Allegati'
import { SoloSeModifica } from './SoloLettura'
import Modulo, { type CampoDef } from './Modulo'
import { Avviso, Bottone, Etichetta, Finestra, Tabella } from './ui'

const MODALITA_PAGAMENTO: Opzione[] = [
  { valore: 'f24_elide', etichetta: 'F24 Elide (cod. 1501)' }, { valore: 'rli', etichetta: 'RLI (addebito in conto)' }, { valore: 'altro', etichetta: 'Altro' },
]
const CATEGORIE_ANNUALITA: Opzione[] = [
  { valore: 'f24', etichetta: 'Ricevuta pagamento imposta (F24)' }, { valore: 'rimborso', etichetta: 'Ricevuta rimborso 50% conduttore' },
  { valore: 'lettera_istat', etichetta: 'Lettera aggiornamento ISTAT' }, { valore: 'altro', etichetta: 'Altro' },
]

const r0 = (n: number) => Math.round(n)

/** Aliquota e base imponibile proposte in base al tipo di contratto (modificabili nella scheda). */
export function regoleImposta(c: Contratto): { percento: number; base: number } {
  const usoDiverso = ['commerciale_6_6', 'commerciale_9_9', 'uso_diverso'].includes(c.tipologia)
  if (usoDiverso) return { percento: c.regime_iva === 'con_iva' ? 1 : 2, base: 100 }
  if (c.tipologia === 'abitativo_3_2') return { percento: 2, base: 70 }
  return { percento: 2, base: 100 }
}

/** Data di inizio dell'annualità: giorno e mese della decorrenza del contratto, con l'anno scelto. */
export function inizioAnnualita(c: Contratto, anno: number | null | undefined): string {
  if (!c.data_decorrenza || !anno) return ''
  return `${anno}-${c.data_decorrenza.slice(5, 10)}`
}

function calcolaImposta(v: Partial<Annualita>): Partial<Annualita> {
  const annuo = v.canone_nuovo_cent
  if (annuo == null) return {}
  const imposta = r0(annuo * ((v.base_imponibile_percento ?? 100) / 100) * ((v.imposta_percento ?? 2) / 100))
  return { imposta_cent: imposta, quota_conduttore_cent: r0(imposta / 2) }
}

function creaDerivati(contratto: Contratto) {
  return (v: Partial<Annualita>, campo: string): Partial<Annualita> => {
    let out: Partial<Annualita> = {}
    if (campo === 'anno') out.data_inizio = inizioAnnualita(contratto, v.anno)

    const istat = ['istat_indice_percento', 'istat_quota_percento', 'canone_mensile_precedente_cent', 'istat_applicato'].includes(campo)
    if (istat && v.canone_mensile_precedente_cent != null) {
      const prec = v.canone_mensile_precedente_cent
      const aumento = v.istat_applicato === 'no' || v.istat_indice_percento == null ? 0
        : r0(prec * (v.istat_indice_percento / 100) * ((v.istat_quota_percento ?? 100) / 100))
      out = { ...out, aumento_mensile_cent: aumento, canone_mensile_nuovo_cent: prec + aumento, canone_precedente_cent: prec * 12, aumento_cent: aumento * 12, canone_nuovo_cent: (prec + aumento) * 12 }
    }
    if (campo === 'aumento_mensile_cent' && v.canone_mensile_precedente_cent != null && v.aumento_mensile_cent != null) {
      const nuovo = v.canone_mensile_precedente_cent + v.aumento_mensile_cent
      out = { ...out, canone_mensile_nuovo_cent: nuovo, aumento_cent: v.aumento_mensile_cent * 12, canone_nuovo_cent: nuovo * 12 }
    }
    if (campo === 'canone_mensile_nuovo_cent' && v.canone_mensile_nuovo_cent != null) {
      const aumento = v.canone_mensile_nuovo_cent - (v.canone_mensile_precedente_cent ?? 0)
      out = { ...out, aumento_mensile_cent: aumento, aumento_cent: aumento * 12, canone_nuovo_cent: v.canone_mensile_nuovo_cent * 12 }
    }
    const cambiaCanone = out.canone_nuovo_cent != null
    if (cambiaCanone || campo === 'imposta_percento' || campo === 'base_imponibile_percento') out = { ...out, ...calcolaImposta({ ...v, ...out }) }
    if (campo === 'imposta_cent' && v.imposta_cent != null) out.quota_conduttore_cent = r0(v.imposta_cent / 2)
    return out
  }
}

interface Props {
  contratto: Contratto
  descrizione: string
}

export default function RegistroAnnuale({ contratto, descrizione }: Props) {
  const { token, nome } = useSessioneAttiva()
  const { dati } = useCollezioni(['annualita', 'allegati'])
  const [aperta, setAperta] = useState<Partial<Annualita> | null>(null)

  const righe = attivi(dati<Annualita>('annualita')).filter((a) => a.contratto_id === contratto.id).sort((a, b) => a.anno - b.anno)

  function nuova(): Partial<Annualita> {
    const ultima = righe[righe.length - 1]
    const anno = ultima ? ultima.anno + 1 : (contratto.data_decorrenza ? Number(contratto.data_decorrenza.slice(0, 4)) + 1 : new Date().getFullYear())
    const mensile = ultima?.canone_mensile_nuovo_cent ?? contratto.canone_mensile_cent ?? (contratto.canone_annuale_cent != null ? r0(contratto.canone_annuale_cent / 12) : null)
    const regole = regoleImposta(contratto)
    const base: Partial<Annualita> = {
      contratto_id: contratto.id, anno, data_inizio: inizioAnnualita(contratto, anno),
      istat_applicato: contratto.istat_attivo === 'no' ? 'no' : 'si', istat_indice_percento: null, istat_quota_percento: contratto.istat_percentuale ?? 75,
      canone_mensile_precedente_cent: mensile, aumento_mensile_cent: 0, canone_mensile_nuovo_cent: mensile,
      canone_precedente_cent: mensile != null ? mensile * 12 : null, aumento_cent: 0, canone_nuovo_cent: mensile != null ? mensile * 12 : null,
      istat_data_lettera: '', aggiorna_canone: 'si',
      imposta_percento: regole.percento, base_imponibile_percento: regole.base, imposta_cent: null,
      imposta_pagata: 'no', imposta_data_pagamento: '', imposta_modalita: 'f24_elide',
      quota_conduttore_cent: null, rimborso_ricevuto: 'no', rimborso_data: '', note: '',
    }
    return { ...base, ...calcolaImposta(base) }
  }

  const campi: CampoDef<Annualita>[] = [
    { nome: 'anno', etichetta: 'Anno da pagare', tipo: 'numero', obbligatorio: true, aiuto: 'Cambiando l’anno, l’inizio annualità si aggiorna da solo' },
    { nome: 'data_inizio', etichetta: 'Inizio annualità', tipo: 'data', aiuto: contratto.data_decorrenza ? `Decorrenza del contratto: ${formattaData(contratto.data_decorrenza)}` : 'Il contratto non ha la decorrenza: inserirla nella scheda Dati' },
    { nome: 'istat_applicato', etichetta: 'Aggiornamento ISTAT applicato', tipo: 'select', opzioni: SI_NO, sezione: 'Aggiornamento ISTAT' },
    { nome: 'istat_indice_percento', etichetta: 'Variazione indice ISTAT (%)', tipo: 'percentuale', aiuto: 'Es. 1,2 per +1,2%' },
    { nome: 'istat_quota_percento', etichetta: 'Quota applicata (75 o 100)', tipo: 'numero' },
    { nome: 'istat_data_lettera', etichetta: 'Data lettera al conduttore', tipo: 'data' },
    { nome: 'canone_mensile_precedente_cent', etichetta: 'Canone MENSILE prima dell’ISTAT', tipo: 'euro' },
    { nome: 'canone_mensile_nuovo_cent', etichetta: 'Canone MENSILE dopo l’ISTAT', tipo: 'euro', aiuto: 'Calcolato, modificabile' },
    { nome: 'aumento_mensile_cent', etichetta: 'Aumento mensile', tipo: 'euro' },
    { nome: 'canone_nuovo_cent', etichetta: 'Canone ANNUO dopo l’ISTAT', tipo: 'euro', soloLettura: true, aiuto: 'Mensile × 12' },
    { nome: 'aggiorna_canone', etichetta: 'Aggiorna il canone nella scheda contratto', tipo: 'select', opzioni: SI_NO, intera: true },
    { nome: 'imposta_percento', etichetta: 'Aliquota (%)', tipo: 'percentuale', sezione: 'Imposta di registro', aiuto: '2% abitativi · 1% uso diverso con locatore IVA' },
    { nome: 'base_imponibile_percento', etichetta: 'Base imponibile (% del canone)', tipo: 'numero', aiuto: '100, oppure 70 per canone concordato' },
    { nome: 'imposta_cent', etichetta: 'Imposta di registro annuale (totale)', tipo: 'euro', aiuto: 'Calcolata, modificabile' },
    { nome: 'imposta_pagata', etichetta: 'Pagata', tipo: 'select', opzioni: SI_NO },
    { nome: 'imposta_data_pagamento', etichetta: 'Data pagamento', tipo: 'data' },
    { nome: 'imposta_modalita', etichetta: 'Modalità', tipo: 'select', opzioni: MODALITA_PAGAMENTO },
    { nome: 'quota_conduttore_cent', etichetta: 'Quota a carico conduttore (50%)', tipo: 'euro', sezione: 'Rimborso del conduttore' },
    { nome: 'rimborso_ricevuto', etichetta: 'Rimborso ricevuto', tipo: 'select', opzioni: SI_NO },
    { nome: 'rimborso_data', etichetta: 'Data rimborso', tipo: 'data' },
    { nome: 'note', etichetta: 'Note', tipo: 'textarea' },
  ]

  async function salva(v: Partial<Annualita>) {
    const esistente = !!v.id
    await aggiorna<Annualita>(token, 'annualita', (r) => esistente
      ? r.map((x) => (x.id === v.id ? { ...x, ...v, ...campiModifica(nome) } as Annualita : x))
      : [...r, { ...nuova(), ...v, ...campiNuovo(nome) } as Annualita],
    `${nome}: ${esistente ? 'modifica' : 'nuova'} annualità ${v.anno} di ${descrizione}`)
    if (v.aggiorna_canone === 'si' && v.canone_mensile_nuovo_cent != null && v.canone_mensile_nuovo_cent !== contratto.canone_mensile_cent) {
      await aggiorna<Contratto>(token, 'contratti', (r) => r.map((c) => (c.id === contratto.id
        ? { ...c, canone_mensile_cent: v.canone_mensile_nuovo_cent!, canone_annuale_cent: v.canone_mensile_nuovo_cent! * 12, imposta_registro_annuale_cent: v.quota_conduttore_cent ?? c.imposta_registro_annuale_cent, ...campiModifica(nome) }
        : c)), `${nome}: aggiorna canone ${descrizione} (ISTAT ${v.anno})`)
    }
    setAperta(null)
  }

  async function elimina() {
    if (!aperta?.id) return
    await aggiorna<Annualita>(token, 'annualita', (r) => r.map((x) => (x.id === aperta.id ? { ...x, eliminato_il: new Date().toISOString(), ...campiModifica(nome) } : x)),
      `${nome}: elimina annualità ${aperta.anno} di ${descrizione}`)
    setAperta(null)
  }

  const nAllegati = (id: string) => attivi(dati<Allegato>('allegati')).filter((a) => a.collezione === 'annualita' && a.record_id === id).length

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <Etichetta tono={statoIva(contratto).tono}>{statoIva(contratto).testo}</Etichetta>
        <Etichetta>{etichettaDi(TIPOLOGIE_CONTRATTO, contratto.tipologia)}</Etichetta>
        <span className="text-neutro-700">Decorrenza {formattaData(contratto.data_decorrenza)} · canone mensile {formattaEuro(contratto.canone_mensile_cent)}</span>
        {statoIva(contratto).soggetto && <span className="text-neutro-700">· imposta di registro proposta all'1% (locatore IVA, uso diverso)</span>}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-neutro-700">Una riga per ogni annualità: ISTAT sul canone mensile, imposta di registro pagata e rimborso del conduttore, con le ricevute allegate.</p>
        <SoloSeModifica><Bottone onClick={() => setAperta(nuova())}><Plus size={16} /> Aggiungi annualità</Bottone></SoloSeModifica>
      </div>
      {!contratto.data_decorrenza && <div className="mt-3"><Avviso tipo="attenzione">Il contratto non ha la data di decorrenza: inseriscila nella scheda Dati e l'inizio di ogni annualità verrà compilato da solo.</Avviso></div>}
      <div className="mt-4">
        <Tabella<Annualita> righe={righe} onRiga={(r) => setAperta(r)} vuoto="Nessuna annualità registrata. Premi “Aggiungi annualità” per la prima." colonne={[
          { chiave: 'anno', etichetta: 'Anno', render: (a) => <span className="num font-titolo text-[17px] font-semibold">{a.anno}</span> },
          { chiave: 'ini', etichetta: 'Inizio annualità', render: (a) => formattaData(a.data_inizio) },
          { chiave: 'ist', etichetta: 'ISTAT', render: (a) => a.istat_applicato === 'si' && a.istat_indice_percento != null ? `${String(a.istat_indice_percento).replace('.', ',')}% (quota ${a.istat_quota_percento ?? 100}%)` : <span className="text-neutro-500">non applicato</span> },
          { chiave: 'mp', etichetta: 'Mensile prima', allinea: 'dx', render: (a) => formattaEuro(a.canone_mensile_precedente_cent) },
          { chiave: 'md', etichetta: 'Mensile dopo', allinea: 'dx', render: (a) => <span className="font-medium">{formattaEuro(a.canone_mensile_nuovo_cent)}</span> },
          { chiave: 'an', etichetta: 'Annuo dopo', allinea: 'dx', render: (a) => <span className="text-neutro-700">{formattaEuro(a.canone_nuovo_cent)}</span> },
          { chiave: 'imp', etichetta: 'Imposta registro', allinea: 'dx', render: (a) => formattaEuro(a.imposta_cent) },
          { chiave: 'pag', etichetta: 'Pagata', render: (a) => a.imposta_pagata === 'si' ? <Etichetta tono="verde">Sì · {formattaData(a.imposta_data_pagamento)}</Etichetta> : <Etichetta tono="rosso">No</Etichetta> },
          { chiave: 'rim', etichetta: 'Rimborso 50%', render: (a) => a.rimborso_ricevuto === 'si' ? <Etichetta tono="verde">{formattaEuro(a.quota_conduttore_cent)} · {formattaData(a.rimborso_data)}</Etichetta> : <Etichetta tono="giallo">Da incassare {formattaEuro(a.quota_conduttore_cent)}</Etichetta> },
          { chiave: 'all', etichetta: 'Allegati', allinea: 'dx', render: (a) => nAllegati(a.id) || '—' },
        ]} />
      </div>
      <Finestra titolo={aperta?.id ? `Annualità ${aperta.anno} — ${descrizione}` : `Nuova annualità — ${descrizione}`} aperta={aperta !== null} onChiudi={() => setAperta(null)} larga>
        {aperta && (
          <>
            <Modulo<Annualita> campi={campi} iniziale={aperta} onSalva={salva} onAnnulla={() => setAperta(null)} onElimina={aperta.id ? elimina : undefined} derivati={creaDerivati(contratto)} />
            <div className="mt-6">
              {aperta.id
                ? <Allegati collezione="annualita" recordId={aperta.id} categorie={CATEGORIE_ANNUALITA} descrizione={`annualità ${aperta.anno} di ${descrizione}`} />
                : <Avviso tipo="info">Salva l'annualità per poter allegare le ricevute (pagamento imposta, rimborso del conduttore, lettera ISTAT).</Avviso>}
            </div>
          </>
        )}
      </Finestra>
    </div>
  )
}
