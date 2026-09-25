/**
 * Sezione "ISTAT e imposta di registro".
 * Scheda 1: tutti i contratti attivi, raggruppati per proprietà, da cui aprire il registro annuale.
 * Scheda 2: le annualità già registrate, raggruppate per proprietà e immobile, con filtri.
 * In alto: promemoria sulle regole dell'imposta di registro.
 */
import { useState } from 'react'
import { ChevronDown, ChevronRight, FileSpreadsheet, Info } from 'lucide-react'
import { scaricaExcel } from '../lib/esporta'
import RegistroAnnuale from '../components/RegistroAnnuale'
import { Avviso, BarraRicerca, Bottone, Caricamento, Etichetta, Finestra, Gruppo, IntestazionePagina, Riquadro, Segmentato, Tabella, filtraTesto } from '../components/ui'
import { attivi } from '../lib/store'
import { TIPOLOGIE_CONTRATTO, etichettaDi, statoIva, type Annualita, type Conduttore, type Contratto, type Immobile, type Societa } from '../lib/tipi'
import { useCollezioni } from '../lib/useCollezioni'
import { formattaData, formattaEuro } from '../lib/utils/formato'

type RigaContratto = Contratto & { societa: string; immobile: string; conduttore: string; nAnnualita: number; ultimoAnno: number | null; daPagare: number }
type RigaAnnualita = Annualita & { societa: string; immobile: string; conduttore: string }

function Promemoria() {
  const [aperto, setAperto] = useState(false)
  return (
    <Riquadro className="mb-6 text-sm">
      <button onClick={() => setAperto(!aperto)} aria-expanded={aperto} className="flex w-full items-center gap-2.5 px-4 py-3 text-left font-medium text-accento-800 hover:bg-[rgba(89,128,166,0.08)]">
        <Info size={16} className="flex-none" /> Promemoria: come funziona l'imposta di registro sulle locazioni {aperto ? <ChevronDown size={16} className="ml-auto" /> : <ChevronRight size={16} className="ml-auto" />}
      </button>
      {aperto && (
        <div className="grid gap-6 border-t border-divisore px-4 py-4 text-sm md:grid-cols-2">
          <ul className="list-disc space-y-1 pl-5">
            <li><strong>Quando</strong>: ogni anno, entro <strong>30 giorni</strong> dall'inizio di ciascuna annualità (anniversario della decorrenza). In alternativa si può pagare in unica soluzione per tutta la durata, con uno sconto.</li>
            <li><strong>Base</strong>: il canone annuo aggiornato (dopo l'ISTAT) dell'annualità che inizia.</li>
            <li><strong>Abitativi</strong> (4+4, transitori): <strong>2%</strong> del canone annuo.</li>
            <li><strong>Canone concordato</strong> (3+2 e agevolati): 2% su base ridotta al <strong>70%</strong> del canone (riduzione del 30%), solo nei comuni previsti.</li>
            <li><strong>Uso diverso / commerciale</strong>: <strong>1%</strong> se il locatore è soggetto IVA (la locazione rientra nel campo IVA, anche se esente); <strong>2%</strong> negli altri casi.</li>
          </ul>
          <ul className="list-disc space-y-1 pl-5">
            <li><strong>Minimo 67 €</strong>: vale per la prima registrazione, non per le annualità successive.</li>
            <li><strong>Cedolare secca</strong>: nessuna imposta di registro, ma è possibile solo per locatori persone fisiche (non per le società).</li>
            <li><strong>Ripartizione</strong>: per legge l'imposta è divisa a metà, <strong>50% a carico del conduttore</strong>, che va richiesto e incassato (registrare il rimborso nell'annualità).</li>
            <li><strong>Come si paga</strong>: modello <strong>F24 Elide</strong>, codice tributo <strong>1501</strong> (annualità successive), 1502 proroga, 1503 risoluzione (67 €), oppure addebito tramite RLI web.</li>
            <li><strong>Attenzione</strong>: le aliquote proposte dall'app dipendono dal tipo di contratto indicato nella scheda e sono sempre modificabili. In caso di dubbio confrontarsi con il commercialista.</li>
          </ul>
        </div>
      )}
    </Riquadro>
  )
}


export default function PaginaRegistro() {
  const { dati, caricamento, errore } = useCollezioni(['annualita', 'contratti', 'immobili', 'conduttori', 'societa', 'allegati'])
  const [scheda, setScheda] = useState<'contratti' | 'annualita'>('contratti')
  const [ricerca, setRicerca] = useState('')
  const [anno, setAnno] = useState('')
  const [filtro, setFiltro] = useState<'tutte' | 'imposta_no' | 'rimborso_no'>('tutte')
  const [contrattoAperto, setContrattoAperto] = useState<Contratto | null>(null)

  const contratti = attivi(dati<Contratto>('contratti'))
  const immobili = attivi(dati<Immobile>('immobili'))
  const conduttori = attivi(dati<Conduttore>('conduttori'))
  const societa = attivi(dati<Societa>('societa'))
  const annualita = attivi(dati<Annualita>('annualita'))
  const annoCorrente = new Date().getFullYear()

  const descrivi = (c: Contratto) => {
    const imm = immobili.find((i) => i.id === c.immobile_id)
    return { societa: societa.find((s) => s.id === imm?.societa_id)?.ragione_sociale ?? '—', immobile: imm?.indirizzo ?? '—', conduttore: conduttori.find((x) => x.id === c.conduttore_id)?.denominazione ?? '—' }
  }

  // Scheda 1: tutti i contratti attivi
  const righeContratti: RigaContratto[] = filtraTesto(
    contratti.filter((c) => c.stato !== 'cessato').map((c) => {
      const mie = annualita.filter((a) => a.contratto_id === c.id)
      return { ...c, ...descrivi(c), nAnnualita: mie.length, ultimoAnno: mie.length ? Math.max(...mie.map((a) => a.anno)) : null, daPagare: mie.filter((a) => a.imposta_pagata !== 'si').length }
    }), ricerca)
  const perSocietaC = raggruppa(righeContratti, (r) => r.societa)

  // Scheda 2: annualità registrate
  const righeAnnualita: RigaAnnualita[] = filtraTesto(annualita.map((a) => {
    const c = contratti.find((x) => x.id === a.contratto_id)
    return { ...a, ...(c ? descrivi(c) : { societa: '—', immobile: '—', conduttore: '—' }) }
  }), ricerca)
    .filter((a) => !anno || String(a.anno) === anno)
    .filter((a) => filtro === 'tutte' || (filtro === 'imposta_no' ? a.imposta_pagata !== 'si' : a.rimborso_ricevuto !== 'si'))
  const anni = [...new Set(annualita.map((a) => a.anno))].sort((a, b) => b - a)
  const perSocietaA = raggruppa(righeAnnualita, (r) => r.societa)
  const totDaRimborsare = righeAnnualita.filter((a) => a.rimborso_ricevuto !== 'si').reduce((s, a) => s + (a.quota_conduttore_cent ?? 0), 0)
  const totNonPagata = righeAnnualita.filter((a) => a.imposta_pagata !== 'si').reduce((s, a) => s + (a.imposta_cent ?? 0), 0)

  const sel = 'input w-auto'
  const apri = (id: string) => setContrattoAperto(contratti.find((c) => c.id === id) ?? null)

  const colonneContratti = [
    { chiave: 'imm', etichetta: 'Immobile', render: (r: RigaContratto) => <span className="font-medium">{r.immobile}</span> },
    { chiave: 'con', etichetta: 'Conduttore', render: (r: RigaContratto) => r.conduttore },
    { chiave: 'tip', etichetta: 'Tipo contratto', render: (r: RigaContratto) => etichettaDi(TIPOLOGIE_CONTRATTO, r.tipologia) },
    { chiave: 'iva', etichetta: 'IVA', render: (r: RigaContratto) => { const s = statoIva(r); return <Etichetta tono={s.tono}>{s.testo}</Etichetta> } },
    { chiave: 'dec', etichetta: 'Decorrenza', render: (r: RigaContratto) => formattaData(r.data_decorrenza) },
    { chiave: 'men', etichetta: 'Canone mensile', allinea: 'dx' as const, render: (r: RigaContratto) => formattaEuro(r.canone_mensile_cent) },
    { chiave: 'ann', etichetta: 'Annualità registrate', allinea: 'dx' as const, render: (r: RigaContratto) => r.nAnnualita ? `${r.nAnnualita} (ultima ${r.ultimoAnno})` : <span className="text-neutro-500">nessuna</span> },
    { chiave: 'st', etichetta: 'Stato', render: (r: RigaContratto) => r.daPagare > 0 ? <Etichetta tono="rosso">{r.daPagare} imposta da pagare</Etichetta> : r.ultimoAnno !== null && r.ultimoAnno >= annoCorrente ? <Etichetta tono="verde">In regola {r.ultimoAnno}</Etichetta> : <Etichetta tono="giallo">Da registrare {annoCorrente}</Etichetta> },
  ]
  const colonneAnnualita = [
    { chiave: 'anno', etichetta: 'Anno', render: (a: RigaAnnualita) => <span className="num font-titolo text-[17px] font-semibold">{a.anno}</span> },
    { chiave: 'ini', etichetta: 'Inizio', render: (a: RigaAnnualita) => formattaData(a.data_inizio) },
    { chiave: 'con', etichetta: 'Conduttore', render: (a: RigaAnnualita) => a.conduttore },
    { chiave: 'ist', etichetta: 'ISTAT', render: (a: RigaAnnualita) => a.istat_applicato === 'si' && a.istat_indice_percento != null ? `${String(a.istat_indice_percento).replace('.', ',')}%` : <span className="text-neutro-500">—</span> },
    { chiave: 'mp', etichetta: 'Mensile prima', allinea: 'dx' as const, render: (a: RigaAnnualita) => <span className="text-neutro-700">{formattaEuro(a.canone_mensile_precedente_cent)}</span> },
    { chiave: 'md', etichetta: 'Mensile dopo', allinea: 'dx' as const, render: (a: RigaAnnualita) => <span className="font-medium">{formattaEuro(a.canone_mensile_nuovo_cent)}</span> },
    { chiave: 'an', etichetta: 'Annuo dopo', allinea: 'dx' as const, render: (a: RigaAnnualita) => <span className="text-neutro-700">{formattaEuro(a.canone_nuovo_cent)}</span> },
    { chiave: 'imp', etichetta: 'Imposta', allinea: 'dx' as const, render: (a: RigaAnnualita) => formattaEuro(a.imposta_cent) },
    { chiave: 'pag', etichetta: 'Pagata', render: (a: RigaAnnualita) => a.imposta_pagata === 'si' ? <Etichetta tono="verde">{formattaData(a.imposta_data_pagamento)}</Etichetta> : <Etichetta tono="rosso">No</Etichetta> },
    { chiave: 'rim', etichetta: 'Rimborso 50%', render: (a: RigaAnnualita) => a.rimborso_ricevuto === 'si' ? <Etichetta tono="verde">{formattaData(a.rimborso_data)}</Etichetta> : <Etichetta tono="giallo">Da incassare</Etichetta> },
  ]

  return (
    <div>
      <IntestazionePagina kicker="Adempimenti" titolo="ISTAT e imposta di registro"
        sottotitolo="Registro storico, anno per anno, di aggiornamenti ISTAT, imposta di registro e rimborsi dei conduttori."
        azioni={<Bottone variante="secondario" onClick={() => scaricaExcel('ISTAT_imposta_registro', [
          { nome: 'Annualità', righe: righeAnnualita.map((a) => ({ 'Anno': a.anno, 'Società': a.societa, 'Immobile': a.immobile, 'Conduttore': a.conduttore, 'Inizio annualità': formattaData(a.data_inizio), 'ISTAT applicato': a.istat_applicato === 'si' ? 'Sì' : 'No', 'Indice ISTAT %': a.istat_indice_percento ?? '', 'Quota %': a.istat_quota_percento ?? '', 'Mensile prima': (a.canone_mensile_precedente_cent ?? 0) / 100, 'Mensile dopo': (a.canone_mensile_nuovo_cent ?? 0) / 100, 'Annuo dopo': (a.canone_nuovo_cent ?? 0) / 100, 'Aliquota %': a.imposta_percento ?? '', 'Base %': a.base_imponibile_percento ?? '', 'Imposta': (a.imposta_cent ?? 0) / 100, 'Pagata': a.imposta_pagata === 'si' ? 'Sì' : 'No', 'Data pagamento': formattaData(a.imposta_data_pagamento), 'Quota conduttore': (a.quota_conduttore_cent ?? 0) / 100, 'Rimborso ricevuto': a.rimborso_ricevuto === 'si' ? 'Sì' : 'No', 'Data rimborso': formattaData(a.rimborso_data), 'Note': a.note })) },
          { nome: 'Contratti', righe: righeContratti.map((r) => ({ 'Società': r.societa, 'Immobile': r.immobile, 'Conduttore': r.conduttore, 'Tipo': etichettaDi(TIPOLOGIE_CONTRATTO, r.tipologia), 'IVA': statoIva(r).testo, 'Decorrenza': formattaData(r.data_decorrenza), 'Canone mensile': (r.canone_mensile_cent ?? 0) / 100, 'Annualità registrate': r.nAnnualita, 'Ultimo anno': r.ultimoAnno ?? '', 'Imposte da pagare': r.daPagare })) },
        ])}><FileSpreadsheet size={16} /> Esporta Excel</Bottone>} />
      <Promemoria />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Segmentato valore={scheda} onChange={setScheda} opzioni={[{ valore: 'contratti', etichetta: `Tutti i contratti (${righeContratti.length})` }, { valore: 'annualita', etichetta: `Annualità registrate (${annualita.length})` }]} />
        <BarraRicerca valore={ricerca} onChange={setRicerca} segnaposto="Cerca società, immobile, conduttore…" />
        {scheda === 'annualita' && (
          <>
            <select value={anno} onChange={(e) => setAnno(e.target.value)} className={sel}><option value="">Tutti gli anni</option>{anni.map((a) => <option key={a} value={a}>{a}</option>)}</select>
            <select value={filtro} onChange={(e) => setFiltro(e.target.value as typeof filtro)} className={sel}>
              <option value="tutte">Tutte</option><option value="imposta_no">Imposta non pagata</option><option value="rimborso_no">Rimborso non ricevuto</option>
            </select>
            <span className="ml-auto text-[13px] text-neutro-700">imposta da pagare <strong className="num text-testo">{formattaEuro(totNonPagata)}</strong> · da incassare dai conduttori <strong className="num text-testo">{formattaEuro(totDaRimborsare)}</strong></span>
          </>
        )}
      </div>

      <div>
        {errore && <div className="mb-4"><Avviso tipo="errore">{errore}</Avviso></div>}
        {caricamento && !errore ? <Caricamento /> : scheda === 'contratti' ? (
          perSocietaC.length === 0 ? <Avviso tipo="info">Nessun contratto attivo. Inseriscili nella sezione Contratti.</Avviso> :
          perSocietaC.map(([soc, righe]) => (
            <Gruppo key={soc} titolo={soc} sottotitolo={`${righe.length} contratti · ${righe.filter((r) => r.daPagare > 0).length} con imposta da pagare`}>
              <Tabella<RigaContratto> righe={righe.sort((a, b) => a.immobile.localeCompare(b.immobile))} colonne={colonneContratti} onRiga={(r) => apri(r.id)} />
            </Gruppo>
          ))
        ) : (
          perSocietaA.length === 0 ? <Avviso tipo="info">Nessuna annualità corrisponde ai filtri. Per inserirne una, vai alla scheda "Tutti i contratti" e scegli il contratto.</Avviso> :
          perSocietaA.map(([soc, righe]) => (
            <Gruppo key={soc} titolo={soc} sottotitolo={`${righe.length} annualità`}>
              {raggruppa(righe, (r) => r.immobile).map(([imm, sotto]) => (
                <div key={imm} className="mb-5">
                  <div className="mb-2 px-1 text-sm font-medium text-neutro-800">{imm}</div>
                  <Tabella<RigaAnnualita> righe={sotto.sort((a, b) => b.anno - a.anno)} colonne={colonneAnnualita} onRiga={(a) => apri(a.contratto_id)} />
                </div>
              ))}
            </Gruppo>
          ))
        )}
      </div>

      <Finestra kicker={contrattoAperto ? descrivi(contrattoAperto).societa : undefined} titolo={contrattoAperto ? `Registro annuale — ${descrivi(contrattoAperto).immobile} / ${descrivi(contrattoAperto).conduttore}` : ''} aperta={contrattoAperto !== null} onChiudi={() => setContrattoAperto(null)} larga>
        {contrattoAperto && <RegistroAnnuale contratto={contratti.find((c) => c.id === contrattoAperto.id) ?? contrattoAperto} descrizione={`${descrivi(contrattoAperto).immobile} / ${descrivi(contrattoAperto).conduttore}`} />}
      </Finestra>
    </div>
  )
}

function raggruppa<T>(righe: T[], chiave: (r: T) => string): Array<[string, T[]]> {
  const m = new Map<string, T[]>()
  for (const r of righe) { const k = chiave(r); m.set(k, [...(m.get(k) ?? []), r]) }
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
}
