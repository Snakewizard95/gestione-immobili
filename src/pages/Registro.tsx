/** Registro storico di tutte le annualità (ISTAT, imposta di registro, rimborsi), per tutti i contratti. */
import { useState } from 'react'
import RegistroAnnuale from '../components/RegistroAnnuale'
import { Avviso, BarraRicerca, Caricamento, Etichetta, Finestra, Tabella, filtraTesto } from '../components/ui'
import { attivi } from '../lib/store'
import type { Annualita, Conduttore, Contratto, Immobile, Societa } from '../lib/tipi'
import { useCollezioni } from '../lib/useCollezioni'
import { formattaData, formattaEuro } from '../lib/utils/formato'

type Riga = Annualita & { societa: string; immobile: string; conduttore: string }

export default function PaginaRegistro() {
  const { dati, caricamento, errore } = useCollezioni(['annualita', 'contratti', 'immobili', 'conduttori', 'societa', 'allegati'])
  const [ricerca, setRicerca] = useState('')
  const [anno, setAnno] = useState<string>('')
  const [filtro, setFiltro] = useState<'tutte' | 'imposta_no' | 'rimborso_no'>('tutte')
  const [contrattoAperto, setContrattoAperto] = useState<Contratto | null>(null)

  const contratti = attivi(dati<Contratto>('contratti'))
  const immobili = attivi(dati<Immobile>('immobili'))
  const conduttori = attivi(dati<Conduttore>('conduttori'))
  const societa = attivi(dati<Societa>('societa'))
  const descrivi = (c: Contratto) => {
    const imm = immobili.find((i) => i.id === c.immobile_id)
    return { societa: societa.find((s) => s.id === imm?.societa_id)?.ragione_sociale ?? '—', immobile: imm?.indirizzo ?? '—', conduttore: conduttori.find((x) => x.id === c.conduttore_id)?.denominazione ?? '—' }
  }

  const tutte: Riga[] = attivi(dati<Annualita>('annualita')).map((a) => {
    const c = contratti.find((x) => x.id === a.contratto_id)
    return { ...a, ...(c ? descrivi(c) : { societa: '—', immobile: '—', conduttore: '—' }) }
  })
  const anni = [...new Set(tutte.map((a) => a.anno))].sort((a, b) => b - a)
  const righe = filtraTesto(tutte, ricerca)
    .filter((a) => !anno || String(a.anno) === anno)
    .filter((a) => filtro === 'tutte' || (filtro === 'imposta_no' ? a.imposta_pagata !== 'si' : a.rimborso_ricevuto !== 'si'))
    .sort((a, b) => b.anno - a.anno || a.societa.localeCompare(b.societa) || a.immobile.localeCompare(b.immobile))

  const totImposta = righe.reduce((s, a) => s + (a.imposta_cent ?? 0), 0)
  const totDaRimborsare = righe.filter((a) => a.rimborso_ricevuto !== 'si').reduce((s, a) => s + (a.quota_conduttore_cent ?? 0), 0)
  const contrattoDi = (a: Riga) => contratti.find((c) => c.id === a.contratto_id) ?? null
  const sel = 'rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm'

  return (
    <div>
      <h1 className="text-2xl font-semibold">ISTAT e imposta di registro</h1>
      <p className="mt-1 text-gray-500">Registro storico, anno per anno, di tutti i contratti. Clicca una riga per aprire il registro del contratto e aggiungere o modificare annualità e ricevute.</p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <BarraRicerca valore={ricerca} onChange={setRicerca} segnaposto="Cerca società, immobile, conduttore…" />
        <select value={anno} onChange={(e) => setAnno(e.target.value)} className={sel}><option value="">Tutti gli anni</option>{anni.map((a) => <option key={a} value={a}>{a}</option>)}</select>
        <select value={filtro} onChange={(e) => setFiltro(e.target.value as typeof filtro)} className={sel}>
          <option value="tutte">Tutte le annualità</option><option value="imposta_no">Imposta non pagata</option><option value="rimborso_no">Rimborso non ricevuto</option>
        </select>
        <span className="ml-auto text-sm text-gray-500">{righe.length} annualità · imposta {formattaEuro(totImposta)} · da incassare dai conduttori <strong>{formattaEuro(totDaRimborsare)}</strong></span>
      </div>
      <div className="mt-4">
        {errore && <Avviso tipo="errore">{errore}</Avviso>}
        {caricamento && !errore ? <Caricamento /> : (
          <Tabella<Riga> righe={righe} onRiga={(a) => setContrattoAperto(contrattoDi(a))} vuoto="Nessuna annualità registrata. Apri un contratto (sezione Contratti → scheda Registro annuale) oppure clicca qui sopra su un contratto per iniziare."
            colonne={[
              { chiave: 'anno', etichetta: 'Anno', render: (a) => <span className="font-medium">{a.anno}</span> },
              { chiave: 'soc', etichetta: 'Società', render: (a) => a.societa },
              { chiave: 'imm', etichetta: 'Immobile', render: (a) => a.immobile },
              { chiave: 'con', etichetta: 'Conduttore', render: (a) => a.conduttore },
              { chiave: 'ist', etichetta: 'ISTAT', render: (a) => a.istat_applicato === 'si' && a.istat_indice_percento != null ? `${String(a.istat_indice_percento).replace('.', ',')}%` : <span className="text-gray-400">—</span> },
              { chiave: 'aum', etichetta: 'Aumento', allinea: 'dx', render: (a) => formattaEuro(a.aumento_cent) },
              { chiave: 'can', etichetta: 'Canone annuo', allinea: 'dx', render: (a) => formattaEuro(a.canone_nuovo_cent) },
              { chiave: 'imp', etichetta: 'Imposta', allinea: 'dx', render: (a) => formattaEuro(a.imposta_cent) },
              { chiave: 'pag', etichetta: 'Pagata', render: (a) => a.imposta_pagata === 'si' ? <Etichetta tono="verde">{formattaData(a.imposta_data_pagamento)}</Etichetta> : <Etichetta tono="rosso">No</Etichetta> },
              { chiave: 'rim', etichetta: 'Rimborso 50%', render: (a) => a.rimborso_ricevuto === 'si' ? <Etichetta tono="verde">{formattaData(a.rimborso_data)}</Etichetta> : <Etichetta tono="giallo">Da incassare</Etichetta> },
            ]} />
        )}
      </div>
      {contratti.length > 0 && righe.length === 0 && !caricamento && (
        <div className="mt-6">
          <h2 className="text-sm font-semibold text-gray-600">Apri il registro di un contratto</h2>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 text-sm">
            {contratti.filter((c) => c.stato !== 'cessato').map((c) => { const d = descrivi(c); return (
              <li key={c.id}><button onClick={() => setContrattoAperto(c)} className="w-full rounded-lg border bg-white px-3 py-2 text-left hover:bg-gray-50"><span className="font-medium">{d.immobile}</span><br /><span className="text-gray-500">{d.societa} · {d.conduttore}</span></button></li>
            ) })}
          </ul>
        </div>
      )}
      <Finestra titolo={contrattoAperto ? `Registro annuale — ${descrivi(contrattoAperto).immobile} / ${descrivi(contrattoAperto).conduttore}` : ''} aperta={contrattoAperto !== null} onChiudi={() => setContrattoAperto(null)} larga>
        {contrattoAperto && <RegistroAnnuale contratto={contrattoAperto} descrizione={`${descrivi(contrattoAperto).immobile} / ${descrivi(contrattoAperto).conduttore}`} />}
      </Finestra>
    </div>
  )
}
