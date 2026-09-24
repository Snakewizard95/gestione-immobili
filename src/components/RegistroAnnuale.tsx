/**
 * Registro storico annuale di un contratto: una riga per annualità con ISTAT, imposta di
 * registro e rimborso del conduttore, ciascuna con i propri allegati (ricevute).
 */
import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useSessioneAttiva } from '../lib/sessione'
import { aggiorna, attivi, campiModifica, campiNuovo } from '../lib/store'
import { SI_NO, type Allegato, type Annualita, type Contratto, type Opzione } from '../lib/tipi'
import { useCollezioni } from '../lib/useCollezioni'
import { aggiungiAnni, formattaData, formattaEuro } from '../lib/utils/formato'
import Allegati from './Allegati'
import Modulo, { type CampoDef } from './Modulo'
import { Avviso, Bottone, Etichetta, Finestra, Tabella } from './ui'

const MODALITA_PAGAMENTO: Opzione[] = [
  { valore: 'f24_elide', etichetta: 'F24 Elide' }, { valore: 'rli', etichetta: 'RLI (addebito)' }, { valore: 'altro', etichetta: 'Altro' },
]
const CATEGORIE_ANNUALITA: Opzione[] = [
  { valore: 'f24', etichetta: 'Ricevuta pagamento imposta (F24)' }, { valore: 'rimborso', etichetta: 'Ricevuta rimborso 50% conduttore' },
  { valore: 'lettera_istat', etichetta: 'Lettera aggiornamento ISTAT' }, { valore: 'altro', etichetta: 'Altro' },
]

const IMPOSTA_MINIMA_CENT = 6700 // imposta di registro minima annuale: 67,00 €

export function arrotondaCent(n: number): number { return Math.round(n) }

/** Ricalcoli automatici: aumento e nuovo canone dall'indice ISTAT; imposta 2% del nuovo canone; quota conduttore 50%. */
function derivati(v: Partial<Annualita>, campo: string): Partial<Annualita> {
  const out: Partial<Annualita> = {}
  const ricalcolaIstat = ['istat_indice_percento', 'istat_quota_percento', 'canone_precedente_cent', 'istat_applicato'].includes(campo)
  if (ricalcolaIstat && v.canone_precedente_cent != null) {
    if (v.istat_applicato === 'no' || v.istat_indice_percento == null) {
      out.aumento_cent = 0; out.canone_nuovo_cent = v.canone_precedente_cent
    } else {
      const quota = (v.istat_quota_percento ?? 100) / 100
      out.aumento_cent = arrotondaCent(v.canone_precedente_cent * (v.istat_indice_percento / 100) * quota)
      out.canone_nuovo_cent = v.canone_precedente_cent + out.aumento_cent
    }
  }
  if (campo === 'aumento_cent' && v.canone_precedente_cent != null && v.aumento_cent != null) out.canone_nuovo_cent = v.canone_precedente_cent + v.aumento_cent
  const nuovo = out.canone_nuovo_cent ?? v.canone_nuovo_cent
  if ((ricalcolaIstat || campo === 'aumento_cent' || campo === 'canone_nuovo_cent') && nuovo != null && (v.imposta_cent == null || campo !== 'imposta_cent')) {
    out.imposta_cent = Math.max(IMPOSTA_MINIMA_CENT, arrotondaCent(nuovo * 0.02))
    out.quota_conduttore_cent = arrotondaCent(out.imposta_cent / 2)
  }
  if (campo === 'imposta_cent' && v.imposta_cent != null) out.quota_conduttore_cent = arrotondaCent(v.imposta_cent / 2)
  return out
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
    const inizio = contratto.data_decorrenza ? aggiungiAnni(contratto.data_decorrenza, anno - Number(contratto.data_decorrenza.slice(0, 4))) : ''
    const prec = ultima?.canone_nuovo_cent ?? contratto.canone_annuale_cent ?? null
    const base: Partial<Annualita> = {
      contratto_id: contratto.id, anno, data_inizio: inizio,
      istat_applicato: contratto.istat_attivo === 'no' ? 'no' : 'si', istat_indice_percento: null, istat_quota_percento: contratto.istat_percentuale ?? 75,
      canone_precedente_cent: prec, aumento_cent: null, canone_nuovo_cent: prec, istat_data_lettera: '', aggiorna_canone: 'si',
      imposta_cent: prec != null ? Math.max(IMPOSTA_MINIMA_CENT, arrotondaCent(prec * 0.02)) : contratto.imposta_registro_annuale_cent,
      imposta_pagata: 'no', imposta_data_pagamento: '', imposta_modalita: 'f24_elide',
      quota_conduttore_cent: null, rimborso_ricevuto: 'no', rimborso_data: '', note: '',
    }
    base.quota_conduttore_cent = base.imposta_cent != null ? arrotondaCent(base.imposta_cent / 2) : null
    return base
  }

  const campi: CampoDef<Annualita>[] = [
    { nome: 'anno', etichetta: 'Anno di riferimento', tipo: 'numero', obbligatorio: true },
    { nome: 'data_inizio', etichetta: 'Inizio annualità', tipo: 'data', aiuto: 'Anniversario della decorrenza' },
    { nome: 'istat_applicato', etichetta: 'Aggiornamento ISTAT applicato', tipo: 'select', opzioni: SI_NO, sezione: 'Aggiornamento ISTAT' },
    { nome: 'istat_indice_percento', etichetta: 'Variazione indice ISTAT (%)', tipo: 'percentuale', aiuto: 'Es. 1,2 per +1,2%' },
    { nome: 'istat_quota_percento', etichetta: 'Quota applicata (75 o 100)', tipo: 'numero' },
    { nome: 'canone_precedente_cent', etichetta: 'Canone annuo precedente', tipo: 'euro' },
    { nome: 'aumento_cent', etichetta: 'Aumento annuo (€)', tipo: 'euro', aiuto: 'Calcolato, modificabile' },
    { nome: 'canone_nuovo_cent', etichetta: 'Nuovo canone annuo', tipo: 'euro' },
    { nome: 'istat_data_lettera', etichetta: 'Data lettera al conduttore', tipo: 'data' },
    { nome: 'aggiorna_canone', etichetta: 'Aggiorna il canone nella scheda contratto', tipo: 'select', opzioni: SI_NO },
    { nome: 'imposta_cent', etichetta: 'Imposta di registro annuale (totale)', tipo: 'euro', sezione: 'Imposta di registro', aiuto: '2% del canone, minimo 67 €; modificabile' },
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
    if (v.aggiorna_canone === 'si' && v.canone_nuovo_cent != null && v.canone_nuovo_cent !== contratto.canone_annuale_cent) {
      await aggiorna<Contratto>(token, 'contratti', (r) => r.map((c) => (c.id === contratto.id
        ? { ...c, canone_annuale_cent: v.canone_nuovo_cent!, canone_mensile_cent: arrotondaCent(v.canone_nuovo_cent! / 12), imposta_registro_annuale_cent: v.quota_conduttore_cent ?? c.imposta_registro_annuale_cent, ...campiModifica(nome) }
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
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">Una riga per ogni annualità: ISTAT applicato, imposta di registro pagata e rimborso del conduttore, con le ricevute allegate.</p>
        <Bottone onClick={() => setAperta(nuova())}><span className="flex items-center gap-1"><Plus size={16} /> Aggiungi annualità</span></Bottone>
      </div>
      {!contratto.data_decorrenza && <div className="mt-3"><Avviso tipo="attenzione">Il contratto non ha la data di decorrenza: inseriscila nella scheda Dati per calcolare automaticamente l'inizio di ogni annualità.</Avviso></div>}
      <div className="mt-4">
        <Tabella<Annualita> righe={righe} onRiga={(r) => setAperta(r)} vuoto="Nessuna annualità registrata. Premi “Aggiungi annualità” per la prima." colonne={[
          { chiave: 'anno', etichetta: 'Anno', render: (a) => <span className="font-medium">{a.anno}</span> },
          { chiave: 'ist', etichetta: 'ISTAT', render: (a) => a.istat_applicato === 'si' && a.istat_indice_percento != null ? `${String(a.istat_indice_percento).replace('.', ',')}% (${a.istat_quota_percento ?? 100}%)` : <span className="text-gray-400">non applicato</span> },
          { chiave: 'aum', etichetta: 'Aumento', allinea: 'dx', render: (a) => formattaEuro(a.aumento_cent) },
          { chiave: 'can', etichetta: 'Nuovo canone annuo', allinea: 'dx', render: (a) => formattaEuro(a.canone_nuovo_cent) },
          { chiave: 'imp', etichetta: 'Imposta registro', allinea: 'dx', render: (a) => formattaEuro(a.imposta_cent) },
          { chiave: 'pag', etichetta: 'Pagata', render: (a) => a.imposta_pagata === 'si' ? <Etichetta tono="verde">Sì · {formattaData(a.imposta_data_pagamento)}</Etichetta> : <Etichetta tono="rosso">No</Etichetta> },
          { chiave: 'rim', etichetta: 'Rimborso 50%', render: (a) => a.rimborso_ricevuto === 'si' ? <Etichetta tono="verde">{formattaEuro(a.quota_conduttore_cent)} · {formattaData(a.rimborso_data)}</Etichetta> : <Etichetta tono="giallo">Da incassare {formattaEuro(a.quota_conduttore_cent)}</Etichetta> },
          { chiave: 'all', etichetta: 'Allegati', allinea: 'dx', render: (a) => nAllegati(a.id) || '—' },
        ]} />
      </div>
      <Finestra titolo={aperta?.id ? `Annualità ${aperta.anno} — ${descrizione}` : 'Nuova annualità'} aperta={aperta !== null} onChiudi={() => setAperta(null)} larga>
        {aperta && (
          <>
            <Modulo<Annualita> campi={campi} iniziale={aperta} onSalva={salva} onAnnulla={() => setAperta(null)} onElimina={aperta.id ? elimina : undefined} derivati={derivati} />
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
