/**
 * Oneri condominiali: per ogni immobile in condominio, le voci (rate, conguagli, lavori straordinari)
 * comunicate dall'amministratore volta per volta, con scadenza, pagamento, quota riaddebitabile al
 * conduttore e allegati (bollettini, verbali assembleari, riparti).
 */
import { useState } from 'react'
import { ChevronDown, ChevronRight, Plus } from 'lucide-react'
import Allegati from '../components/Allegati'
import Modulo, { type CampoDef } from '../components/Modulo'
import { Avviso, BarraRicerca, Bottone, Caricamento, Etichetta, Finestra, Tabella, filtraTesto } from '../components/ui'
import { useSessioneAttiva } from '../lib/sessione'
import { aggiorna, attivi, campiModifica, campiNuovo } from '../lib/store'
import { A_CARICO, SI_NO, TIPI_VOCE_CONDOMINIO, etichettaDi, type Condominio, type Conduttore, type Contratto, type Immobile, type Societa, type VoceCondominiale } from '../lib/tipi'
import { useCollezioni } from '../lib/useCollezioni'
import { formattaData, formattaEuro } from '../lib/utils/formato'

const CATEGORIE = [
  { valore: 'bollettino', etichetta: 'Bollettino / avviso di pagamento' }, { valore: 'bilancio_condominiale', etichetta: 'Verbale assemblea / bilancio / riparto' },
  { valore: 'ricevuta', etichetta: 'Ricevuta pagamento' }, { valore: 'altro', etichetta: 'Altro' },
]

function derivati(v: Partial<VoceCondominiale>, campo: string): Partial<VoceCondominiale> {
  const out: Partial<VoceCondominiale> = {}
  if (campo === 'a_carico' || (campo === 'importo_cent' && v.a_carico !== 'misto')) {
    if (v.a_carico === 'conduttore') out.quota_conduttore_cent = v.importo_cent ?? null
    if (v.a_carico === 'proprieta') out.quota_conduttore_cent = 0
  }
  if (campo === 'data_pagamento' && v.data_pagamento) out.pagata = 'si'
  if (campo === 'data_riaddebito' && v.data_riaddebito) out.riaddebitata = 'si'
  return out
}

export default function PaginaCondominio() {
  const { token, nome } = useSessioneAttiva()
  const { dati, caricamento, errore } = useCollezioni(['voci_condominiali', 'immobili', 'condomini', 'societa', 'contratti', 'conduttori', 'allegati'])
  const [ricerca, setRicerca] = useState('')
  const [esercizio, setEsercizio] = useState('')
  const [filtro, setFiltro] = useState<'tutte' | 'da_pagare' | 'da_riaddebitare'>('tutte')
  const [aperta, setAperta] = useState<Partial<VoceCondominiale> | null>(null)
  const [chiusi, setChiusi] = useState<Set<string>>(new Set())

  const voci = attivi(dati<VoceCondominiale>('voci_condominiali'))
  const immobili = attivi(dati<Immobile>('immobili'))
  const condomini = attivi(dati<Condominio>('condomini'))
  const societa = attivi(dati<Societa>('societa'))
  const contratti = attivi(dati<Contratto>('contratti'))
  const conduttori = attivi(dati<Conduttore>('conduttori'))

  const societaDi = (imm?: Immobile) => societa.find((s) => s.id === imm?.societa_id)?.ragione_sociale ?? '—'
  const condominioDi = (id: string) => condomini.find((c) => c.id === id)
  const conduttoreDi = (immId: string) => { const c = contratti.find((x) => x.immobile_id === immId && x.stato !== 'cessato'); return conduttori.find((k) => k.id === c?.conduttore_id)?.denominazione ?? null }

  function nuova(imm?: Immobile): Partial<VoceCondominiale> {
    return { immobile_id: imm?.id ?? '', condominio_id: imm?.condominio_id ?? '', esercizio: String(new Date().getFullYear()), tipo: 'rata_ordinaria', descrizione: '', data_comunicazione: '', scadenza: '', importo_cent: null, a_carico: 'proprieta', quota_conduttore_cent: 0, pagata: 'no', data_pagamento: '', riaddebitata: 'no', data_riaddebito: '', note: '' }
  }

  const campi: CampoDef<VoceCondominiale>[] = [
    { nome: 'immobile_id', etichetta: 'Immobile', tipo: 'select', obbligatorio: true, intera: true, opzioni: immobili.map((i) => ({ valore: i.id, etichetta: `${i.indirizzo} — ${societaDi(i)}` })) },
    { nome: 'condominio_id', etichetta: 'Condominio / amministratore', tipo: 'select', opzioni: condomini.map((c) => ({ valore: c.id, etichetta: `${c.denominazione}${c.amministratore_nome ? ' · ' + c.amministratore_nome : ''}` })), aiuto: 'Se manca, crealo in Anagrafiche → Condomini' },
    { nome: 'esercizio', etichetta: 'Esercizio', tipo: 'testo', obbligatorio: true, aiuto: 'Es. 2026 oppure 2025/2026' },
    { nome: 'tipo', etichetta: 'Tipo di voce', tipo: 'select', opzioni: TIPI_VOCE_CONDOMINIO, obbligatorio: true },
    { nome: 'descrizione', etichetta: 'Descrizione', tipo: 'testo', intera: true, aiuto: 'Es. "2ª rata preventivo ordinario 2026", "Conguaglio consuntivo 2025", "Rifacimento facciata rata 3/10"' },
    { nome: 'data_comunicazione', etichetta: 'Data comunicazione amministratore', tipo: 'data', sezione: 'Importo e scadenza' },
    { nome: 'scadenza', etichetta: 'Scadenza pagamento', tipo: 'data' },
    { nome: 'importo_cent', etichetta: 'Importo', tipo: 'euro', obbligatorio: true },
    { nome: 'a_carico', etichetta: 'A carico di', tipo: 'select', opzioni: A_CARICO, aiuto: 'Di norma: ordinaria → conduttore, straordinaria → proprietà' },
    { nome: 'quota_conduttore_cent', etichetta: 'Quota riaddebitabile al conduttore', tipo: 'euro' },
    { nome: 'pagata', etichetta: 'Pagata all’amministratore', tipo: 'select', opzioni: SI_NO, sezione: 'Pagamento' },
    { nome: 'data_pagamento', etichetta: 'Data pagamento', tipo: 'data' },
    { nome: 'riaddebitata', etichetta: 'Quota conduttore incassata', tipo: 'select', opzioni: SI_NO, sezione: 'Riaddebito al conduttore' },
    { nome: 'data_riaddebito', etichetta: 'Data incasso dal conduttore', tipo: 'data', aiuto: 'Registrare anche il movimento in Canoni e incassi (rimborso spese condominiali)' },
    { nome: 'note', etichetta: 'Note', tipo: 'textarea' },
  ]

  async function salva(v: Partial<VoceCondominiale>) {
    const esistente = !!v.id
    const imm = immobili.find((i) => i.id === v.immobile_id)
    await aggiorna<VoceCondominiale>(token, 'voci_condominiali', (r) => esistente
      ? r.map((x) => (x.id === v.id ? { ...x, ...v, ...campiModifica(nome) } as VoceCondominiale : x))
      : [...r, { ...nuova(), ...v, ...campiNuovo(nome) } as VoceCondominiale],
    `${nome}: ${esistente ? 'modifica' : 'nuova'} voce condominiale "${v.descrizione || etichettaDi(TIPI_VOCE_CONDOMINIO, v.tipo)}" — ${imm?.indirizzo ?? ''}`)
    setAperta(null)
  }
  async function elimina() {
    if (!aperta?.id) return
    await aggiorna<VoceCondominiale>(token, 'voci_condominiali', (r) => r.map((x) => (x.id === aperta.id ? { ...x, eliminato_il: new Date().toISOString(), ...campiModifica(nome) } : x)), `${nome}: elimina voce condominiale "${aperta.descrizione}"`)
    setAperta(null)
  }

  const esercizi = [...new Set(voci.map((v) => v.esercizio))].sort().reverse()
  const filtrate = filtraTesto(voci.map((v) => { const imm = immobili.find((i) => i.id === v.immobile_id); return { ...v, immobile: imm?.indirizzo ?? '—', societa: societaDi(imm), condominio: condominioDi(v.condominio_id)?.denominazione ?? '' } }), ricerca)
    .filter((v) => !esercizio || v.esercizio === esercizio)
    .filter((v) => filtro === 'tutte' || (filtro === 'da_pagare' ? v.pagata !== 'si' : (v.quota_conduttore_cent ?? 0) > 0 && v.riaddebitata !== 'si'))

  // Raggruppo per società → immobile; mostro anche gli immobili in condominio senza voci
  const perSocieta = new Map<string, Map<string, { imm: Immobile; voci: typeof filtrate }>>()
  const immobiliMostrati = immobili.filter((i) => i.condominio_id || voci.some((v) => v.immobile_id === i.id))
  for (const imm of filtraTesto(immobiliMostrati.map((i) => ({ ...i, societa: societaDi(i) })), ricerca)) {
    const soc = societaDi(imm)
    if (!perSocieta.has(soc)) perSocieta.set(soc, new Map())
    perSocieta.get(soc)!.set(imm.id, { imm, voci: filtrate.filter((v) => v.immobile_id === imm.id).sort((a, b) => (b.scadenza || '').localeCompare(a.scadenza || '')) })
  }
  const totDaPagare = filtrate.filter((v) => v.pagata !== 'si').reduce((s, v) => s + (v.importo_cent ?? 0), 0)
  const totDaRiaddebitare = filtrate.filter((v) => (v.quota_conduttore_cent ?? 0) > 0 && v.riaddebitata !== 'si').reduce((s, v) => s + (v.quota_conduttore_cent ?? 0), 0)
  const sel = 'rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm'
  const oggi = new Date().toISOString().slice(0, 10)

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Oneri condominiali</h1>
        <Bottone onClick={() => setAperta(nuova())}><span className="flex items-center gap-1"><Plus size={16} /> Nuova voce</span></Bottone>
      </div>
      <p className="mt-1 text-gray-500">Rate, conguagli e lavori straordinari comunicati dagli amministratori, immobile per immobile, con bollettini e verbali allegati.</p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <BarraRicerca valore={ricerca} onChange={setRicerca} segnaposto="Cerca società, immobile, condominio…" />
        <select value={esercizio} onChange={(e) => setEsercizio(e.target.value)} className={sel}><option value="">Tutti gli esercizi</option>{esercizi.map((e) => <option key={e} value={e}>{e}</option>)}</select>
        <select value={filtro} onChange={(e) => setFiltro(e.target.value as typeof filtro)} className={sel}><option value="tutte">Tutte le voci</option><option value="da_pagare">Da pagare</option><option value="da_riaddebitare">Da riaddebitare al conduttore</option></select>
        <span className="ml-auto text-sm text-gray-500">da pagare <strong className={totDaPagare > 0 ? 'text-red-600' : ''}>{formattaEuro(totDaPagare)}</strong> · da incassare dai conduttori <strong>{formattaEuro(totDaRiaddebitare)}</strong></span>
      </div>

      <div className="mt-4">
        {errore && <Avviso tipo="errore">{errore}</Avviso>}
        {caricamento && !errore ? <Caricamento /> : perSocieta.size === 0 ? (
          <Avviso tipo="info">Nessun immobile collegato a un condominio. Apri un immobile in Anagrafiche → Immobili e scegli il condominio, oppure premi "Nuova voce".</Avviso>
        ) : [...perSocieta.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([soc, imms]) => (
          <div key={soc} className="mb-4">
            <button onClick={() => setChiusi((s) => { const n = new Set(s); if (n.has(soc)) n.delete(soc); else n.add(soc); return n })} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-white">
              {chiusi.has(soc) ? <ChevronRight size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
              <span className="text-base font-semibold">{soc}</span><span className="text-sm text-gray-500">{imms.size} immobili</span>
            </button>
            {!chiusi.has(soc) && [...imms.values()].sort((a, b) => a.imm.indirizzo.localeCompare(b.imm.indirizzo)).map(({ imm, voci: vs }) => {
              const cond = condominioDi(imm.condominio_id)
              return (
                <div key={imm.id} className="mb-3 pl-2">
                  <div className="mb-1 flex flex-wrap items-center gap-2 px-2 text-sm">
                    <span className="font-medium">{imm.indirizzo}</span>
                    {cond ? <span className="text-gray-500">{cond.denominazione}{cond.amministratore_nome ? ` · amm. ${cond.amministratore_nome}` : ''}{cond.amministratore_telefono ? ` · ${cond.amministratore_telefono}` : ''}</span> : <Etichetta tono="giallo">condominio non indicato</Etichetta>}
                    {conduttoreDi(imm.id) && <span className="text-gray-500">· conduttore {conduttoreDi(imm.id)}</span>}
                    <button onClick={() => setAperta(nuova(imm))} className="ml-auto text-xs hover:underline" style={{ color: 'var(--colore-primario)' }}>+ aggiungi voce</button>
                  </div>
                  <Tabella righe={vs} onRiga={(v) => setAperta(voci.find((x) => x.id === v.id) ?? null)} vuoto="Nessuna voce registrata per questo immobile." colonne={[
                    { chiave: 'es', etichetta: 'Esercizio', render: (v) => v.esercizio },
                    { chiave: 'tipo', etichetta: 'Tipo', render: (v) => etichettaDi(TIPI_VOCE_CONDOMINIO, v.tipo) },
                    { chiave: 'desc', etichetta: 'Descrizione', render: (v) => <span className="font-medium">{v.descrizione || '—'}</span> },
                    { chiave: 'com', etichetta: 'Comunicata il', render: (v) => formattaData(v.data_comunicazione) },
                    { chiave: 'scad', etichetta: 'Scadenza', render: (v) => <span className={v.pagata !== 'si' && v.scadenza && v.scadenza < oggi ? 'font-medium text-red-600' : ''}>{formattaData(v.scadenza)}</span> },
                    { chiave: 'imp', etichetta: 'Importo', allinea: 'dx', render: (v) => <span className="font-medium">{formattaEuro(v.importo_cent)}</span> },
                    { chiave: 'car', etichetta: 'A carico', render: (v) => etichettaDi(A_CARICO, v.a_carico).split(' (')[0] },
                    { chiave: 'pag', etichetta: 'Pagata', render: (v) => v.pagata === 'si' ? <Etichetta tono="verde">Sì · {formattaData(v.data_pagamento)}</Etichetta> : <Etichetta tono="rosso">No</Etichetta> },
                    { chiave: 'ria', etichetta: 'Quota conduttore', render: (v) => !(v.quota_conduttore_cent ?? 0) ? <span className="text-gray-400">—</span> : v.riaddebitata === 'si' ? <Etichetta tono="verde">{formattaEuro(v.quota_conduttore_cent)} incassata</Etichetta> : <Etichetta tono="giallo">{formattaEuro(v.quota_conduttore_cent)} da incassare</Etichetta> },
                  ]} />
                </div>
              )
            })}
          </div>
        ))}
      </div>

      <Finestra titolo={aperta?.id ? `Voce condominiale — ${immobili.find((i) => i.id === aperta.immobile_id)?.indirizzo ?? ''}` : 'Nuova voce condominiale'} aperta={aperta !== null} onChiudi={() => setAperta(null)} larga>
        {aperta && (
          <>
            <Modulo<VoceCondominiale> campi={campi} iniziale={aperta} onSalva={salva} onAnnulla={() => setAperta(null)} onElimina={aperta.id ? elimina : undefined} derivati={derivati} />
            <div className="mt-6">
              {aperta.id ? <Allegati collezione="voci_condominiali" recordId={aperta.id} categorie={CATEGORIE} descrizione={`voce condominiale "${aperta.descrizione}"`} />
                : <Avviso tipo="info">Salva la voce per allegare bollettino, verbale assembleare o ricevuta.</Avviso>}
            </div>
          </>
        )}
      </Finestra>
    </div>
  )
}
