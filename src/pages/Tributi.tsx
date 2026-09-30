/**
 * Tributi rateizzati: avvisi bonari, cartelle e rottamazioni delle società del gruppo, con i piani di rate,
 * lo stato dei pagamenti e il riepilogo per società.
 */
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Printer } from 'lucide-react'
import Calendario from '../components/tributi/Calendario'
import Contribuenti from '../components/tributi/Contribuenti'
import EditorPiano from '../components/tributi/EditorPiano'
import { SoloSeModifica } from '../components/SoloLettura'
import { BarraPagato, EtichettaStato, Scomposizione } from '../components/tributi/comuni'
import SchedaPiano from '../components/tributi/SchedaPiano'
import { Avviso, BarraRicerca, Bottone, Caricamento, Etichetta, Finestra, Gruppo, IntestazionePagina, Segmentato, Tabella, TavolaKpi, Vuoto } from '../components/ui'
import { TIPI_PRATICA, etichettaDi, type Contribuente, type PraticaTributo } from '../lib/tipi'
import { daInserire, descriviPratica, gestita, inCorso, percentualePagata, riepilogoPratiche, riepilogoRate, statoEffettivo } from '../lib/tributi'
import { useCollezioni } from '../lib/useCollezioni'
import { attivi } from '../lib/store'
import { formattaData, formattaEuro, oggiIso } from '../lib/utils/formato'

type Scheda = 'calendario' | 'piani' | 'societa' | 'anagrafica'
type FiltroPiani = 'in_corso' | 'estinti' | 'da_completare' | 'tutte'

export default function PaginaTributi() {
  const { dati, caricamento, errore } = useCollezioni(['contribuenti', 'pratiche_tributi'])
  const [scheda, setScheda] = useState<Scheda>('calendario')
  const [filtro, setFiltro] = useState<FiltroPiani>('in_corso')
  const [ricerca, setRicerca] = useState('')
  const [contribuenteScelto, setContribuenteScelto] = useState('')
  const [aperta, setAperta] = useState<string | null>(null)
  const [editor, setEditor] = useState<{ base: PraticaTributo | null; contribuente?: string } | null>(null)

  const contribuenti = attivi(dati<Contribuente>('contribuenti')).sort((a, b) => a.nome.localeCompare(b.nome, 'it'))
  const pratiche = attivi(dati<PraticaTributo>('pratiche_tributi')).filter(gestita)
  const oggi = oggiIso()
  const tot = riepilogoPratiche(pratiche.filter(inCorso), oggi)
  const praticaAperta = pratiche.find((p) => p.id === aperta) ?? null

  // Pratiche filtrate per la scheda "Piani"
  const q = ricerca.trim().toLowerCase()
  const filtrate = pratiche.filter((p) => {
    if (contribuenteScelto && p.contribuente_id !== contribuenteScelto) return false
    if (filtro === 'in_corso' && !inCorso(p)) return false
    if (filtro === 'estinti' && statoEffettivo(p) !== 'estinto') return false
    if (filtro === 'da_completare' && !(p.stato === 'rate_concordate' && p.rate.length === 0)) return false
    if (q) {
      const c = contribuenti.find((x) => x.id === p.contribuente_id)
      const testo = [p.tributo, c?.nome, c?.responsabile, ...(c?.alias ?? []), etichettaDi(TIPI_PRATICA, p.tipo)].join(' ').toLowerCase()
      if (!testo.includes(q)) return false
    }
    return true
  })

  const gruppi = contribuenti
    .map((c) => ({ c, pratiche: filtrate.filter((p) => p.contribuente_id === c.id).sort((a, b) => (b.anno_rateizzo ?? 0) - (a.anno_rateizzo ?? 0) || a.tributo.localeCompare(b.tributo)) }))
    .filter((g) => g.pratiche.length > 0)

  const conteggio = (f: FiltroPiani) => pratiche.filter((p) =>
    f === 'in_corso' ? inCorso(p) : f === 'estinti' ? statoEffettivo(p) === 'estinto' : f === 'da_completare' ? p.stato === 'rate_concordate' && p.rate.length === 0 : true).length

  return (
    <div>
      <IntestazionePagina kicker="Fiscale" titolo="Tributi rateizzati"
        sottotitolo="Avvisi bonari, cartelle e rottamazioni delle società: piani di rate, pagamenti e debito residuo."
        azioni={<>
          <Segmentato valore={scheda} onChange={setScheda} opzioni={[{ valore: 'calendario', etichetta: 'Calendario' }, { valore: 'piani', etichetta: 'Piani' }, { valore: 'societa', etichetta: 'Riepilogo' }, { valore: 'anagrafica', etichetta: 'Società' }]} />
          <SoloSeModifica><Bottone onClick={() => setEditor({ base: null, contribuente: contribuenteScelto || undefined })}><Plus size={16} /> Nuovo piano</Bottone></SoloSeModifica>
        </>} />

      {errore && <div className="mb-4"><Avviso tipo="errore">{errore}</Avviso></div>}
      {caricamento && !errore ? <Caricamento /> : scheda === 'anagrafica' ? <Contribuenti contribuenti={contribuenti} pratiche={pratiche} /> : pratiche.length === 0 ? (
        <Vuoto>Nessun tributo inserito. Premi <b>Nuovo piano</b> per inserirne uno, oppure importa i file Excel da <b>Importa da Excel</b> → scheda <b>Tributi rateizzati</b>.</Vuoto>
      ) : (
        <>
          {scheda === 'calendario' && <Calendario contribuenti={contribuenti} pratiche={pratiche} onApriPratica={setAperta} />}

          {(scheda === 'piani' || scheda === 'societa') && <TavolaKpi celle={[
            { titolo: 'Debito residuo', valore: formattaEuro(tot.residuo.totale_cent), nota: `${pratiche.filter(inCorso).length} piani in corso` },
            { titolo: 'Rate scadute non pagate', valore: tot.scadute.length, nota: tot.scadute.length ? formattaEuro(tot.scadute.reduce((s, x) => s + x.totale_cent, 0)) : 'Nessuna', tono: tot.scadute.length ? 'rosso' : undefined },
            { titolo: 'Piani da inserire', valore: pratiche.filter(daInserire).length, nota: 'rate decise, piano non ancora inserito' },
            { titolo: 'Già pagato sui piani in corso', valore: formattaEuro(tot.pagato.totale_cent), nota: `${percentualePagata(tot)}% del totale` },
          ]} />}

          {scheda === 'piani' && (
            <>
              <div className="mb-5 flex flex-wrap items-center gap-3">
                <Segmentato valore={filtro} onChange={setFiltro} opzioni={[
                  { valore: 'in_corso', etichetta: `In corso (${conteggio('in_corso')})` },
                  { valore: 'da_completare', etichetta: `Rate da inserire (${conteggio('da_completare')})` },
                  { valore: 'estinti', etichetta: `Estinti (${conteggio('estinti')})` },
                  { valore: 'tutte', etichetta: `Tutte (${conteggio('tutte')})` },
                ]} />
                <select value={contribuenteScelto} onChange={(e) => setContribuenteScelto(e.target.value)} className="input w-auto">
                  <option value="">Tutte le società</option>
                  {contribuenti.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
                <BarraRicerca valore={ricerca} onChange={setRicerca} segnaposto="Cerca società, tributo, responsabile…" />
              </div>
              {gruppi.length === 0 ? <Vuoto>Nessuna pratica con questi filtri.</Vuoto> : gruppi.map(({ c, pratiche: lista }) => {
                const rg = riepilogoPratiche(lista, oggi)
                return (
                  <Gruppo key={c.id} titolo={c.nome}
                    sottotitolo={`${c.responsabile ? c.responsabile + ' · ' : ''}${lista.length} ${lista.length === 1 ? 'pratica' : 'pratiche'}`}
                    destra={rg.totale.totale_cent > 0 ? (
                      <span className="flex flex-wrap items-center justify-end gap-x-6 gap-y-2">
                        <Scomposizione etichetta="Totale" t={rg.totale} dx />
                        <Scomposizione etichetta="Da pagare" t={rg.residuo} evidenzia dx />
                        <BarraPagato percentuale={percentualePagata(rg)} />
                      </span>
                    ) : undefined}>
                    <div className="mb-2 flex justify-end gap-2">
                      <SoloSeModifica><Bottone variante="ghost" piccolo onClick={() => setEditor({ base: null, contribuente: c.id })}><Plus size={14} /> Nuovo piano</Bottone></SoloSeModifica>
                      <Link to={`/stampa/tributi/societa/${c.id}`} className="btn btn-secondario btn-piccolo no-underline"><Printer size={14} /> Scheda da stampare</Link>
                    </div>
                    <Tabella righe={lista} onRiga={(p) => setAperta(p.id)} colonne={[
                      { chiave: 'tributo', etichetta: 'Tributo', render: (p) => <span className="font-medium">{p.tributo || '—'}</span> },
                      { chiave: 'tipo', etichetta: 'Tipo', render: (p) => etichettaDi(TIPI_PRATICA, p.tipo) },
                      { chiave: 'anno', etichetta: 'Anno', render: (p) => p.anno_rateizzo ?? (p.data_notifica ? p.data_notifica.slice(0, 4) : '—') },
                      { chiave: 'rate', etichetta: 'Rate', render: (p) => { const r = riepilogoRate(p.rate, oggi); return p.rate.length ? `${r.ratePagate}/${r.rate}` : p.rate_concordate ? `${p.rate_concordate} concordate` : '—' } },
                      { chiave: 'totale', etichetta: 'Totale', allinea: 'dx', render: (p) => formattaEuro(p.rate.length ? riepilogoRate(p.rate, oggi).totale.totale_cent : p.importo_cent) },
                      { chiave: 'residuo', etichetta: 'Da pagare', allinea: 'dx', render: (p) => p.rate.length ? formattaEuro(riepilogoRate(p.rate, oggi).residuo.totale_cent) : '—' },
                      { chiave: 'prossima', etichetta: 'Prossima rata', render: (p) => { const r = riepilogoRate(p.rate, oggi); return r.scadute.length ? <Etichetta tono="rosso">{r.scadute.length} scadut{r.scadute.length === 1 ? 'a' : 'e'}</Etichetta> : r.prossima ? `${formattaData(r.prossima.scadenza)} · ${formattaEuro(r.prossima.totale_cent)}` : '—' } },
                      { chiave: 'stato', etichetta: 'Stato', render: (p) => <EtichettaStato pratica={p} /> },
                    ]} />
                  </Gruppo>
                )
              })}
            </>
          )}

          {scheda === 'societa' && <RiepilogoSocieta contribuenti={contribuenti} pratiche={pratiche} onApri={(id) => { setContribuenteScelto(id); setFiltro('tutte'); setScheda('piani') }} />}
        </>
      )}

      <Finestra kicker={contribuenti.find((c) => c.id === praticaAperta?.contribuente_id)?.nome} titolo={praticaAperta ? descriviPratica(praticaAperta) : ''} aperta={!!praticaAperta} onChiudi={() => setAperta(null)} larga>
        {praticaAperta && <SchedaPiano pratica={praticaAperta} contribuente={contribuenti.find((c) => c.id === praticaAperta.contribuente_id)}
          onModifica={() => { setEditor({ base: praticaAperta }); setAperta(null) }} />}
      </Finestra>

      <Finestra kicker="Tributi rateizzati" titolo={editor?.base ? (editor.base.rate.length ? `Modifica piano — ${descriviPratica(editor.base)}` : `Inserisci il piano — ${editor.base.tributo}`) : 'Nuovo piano di rateizzo'}
        aperta={editor !== null} onChiudi={() => setEditor(null)} larga>
        {editor && <EditorPiano base={editor.base} contribuenteIniziale={editor.contribuente} contribuenti={contribuenti} pratiche={pratiche}
          onChiudi={() => setEditor(null)} onSalvato={(id) => { setEditor(null); setAperta(id) }} />}
      </Finestra>
    </div>
  )
}

/** Tabella come il foglio "Riepilogo" dell'Excel: per ogni società piani, totale, pagato, residuo, rate scadute e prossima scadenza. */
function RiepilogoSocieta({ contribuenti, pratiche, onApri }: { contribuenti: Contribuente[]; pratiche: PraticaTributo[]; onApri: (id: string) => void }) {
  const oggi = oggiIso()
  const righe = contribuenti.map((c) => {
    const mie = pratiche.filter((p) => p.contribuente_id === c.id)
    const r = riepilogoPratiche(mie, oggi)
    return { id: c.id, c, r, piani: mie.filter((p) => p.rate.length > 0).length, inCorso: mie.filter(inCorso).length, sospeso: mie.filter(daInserire).length }
  }).filter((x) => x.piani > 0 || x.sospeso > 0)
  const tutti = riepilogoPratiche(pratiche, oggi)
  const totale = { id: '_tot', c: { nome: 'Totale' } as Contribuente, r: tutti, piani: righe.reduce((s, x) => s + x.piani, 0), inCorso: righe.reduce((s, x) => s + x.inCorso, 0), sospeso: righe.reduce((s, x) => s + x.sospeso, 0) }
  type R = typeof totale
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 text-[13px] text-neutro-700">Clicca su una società per vedere tutte le sue pratiche. I totali comprendono anche i piani già estinti, come il foglio "Riepilogo" dell'Excel.</p>
        <StampaPerResponsabile contribuenti={contribuenti} />
      </div>
      <Tabella<R> righe={righe} onRiga={(x) => onApri(x.id)} rigaTotale={totale} colonne={[
        { chiave: 'nome', etichetta: 'Società', render: (x) => <span className="font-medium">{x.c.nome}</span> },
        { chiave: 'resp', etichetta: 'Responsabile', render: (x) => x.c.responsabile || (x.id === '_tot' ? '' : <span className="text-neutro-500">—</span>) },
        { chiave: 'piani', etichetta: 'Piani (in corso)', allinea: 'dx', render: (x) => `${x.piani} (${x.inCorso})` },
        { chiave: 'totale', etichetta: 'Totale piani', allinea: 'dx', render: (x) => formattaEuro(x.r.totale.totale_cent) },
        { chiave: 'pagato', etichetta: 'Pagato', allinea: 'dx', render: (x) => formattaEuro(x.r.pagato.totale_cent) },
        { chiave: 'residuo', etichetta: 'Da pagare', allinea: 'dx', render: (x) => (
          <span className="flex flex-col items-end">
            <b>{formattaEuro(x.r.residuo.totale_cent)}</b>
            {x.r.residuo.totale_cent > 0 && <span className="whitespace-nowrap text-[11px] font-normal text-neutro-700">Cap. {formattaEuro(x.r.residuo.quota_capitale_cent)} · Sanz. {formattaEuro(x.r.residuo.sanzioni_cent)} · Int. {formattaEuro(x.r.residuo.interessi_cent)}</span>}
          </span>
        ) },
        { chiave: 'perc', etichetta: '% pagato', render: (x) => <BarraPagato percentuale={percentualePagata(x.r)} /> },
        { chiave: 'scadute', etichetta: 'Scadute', allinea: 'dx', render: (x) => x.r.scadute.length ? <Etichetta tono="rosso">{x.r.scadute.length} · {formattaEuro(x.r.scadute.reduce((s, y) => s + y.totale_cent, 0))}</Etichetta> : '—' },
        { chiave: 'prossima', etichetta: 'Prossima rata', render: (x) => x.r.prossima ? `${formattaData(x.r.prossima.scadenza)} · ${formattaEuro(x.r.prossima.totale_cent)}` : '—' },
        { chiave: 'sospeso', etichetta: 'Piani da inserire', allinea: 'dx', render: (x) => x.sospeso || '—' },
        { chiave: 'stampa', etichetta: '', render: (x) => x.id === '_tot' ? null : (
          <Link to={`/stampa/tributi/societa/${x.id}`} onClick={(e) => e.stopPropagation()} title="Scheda da stampare" className="btn btn-secondario btn-piccolo no-underline"><Printer size={14} /></Link>
        ) },
      ]} />
    </>
  )
}

/** Scelta di un responsabile e stampa delle schede di tutti i suoi uffici (una pagina per ufficio). */
function StampaPerResponsabile({ contribuenti }: { contribuenti: Contribuente[] }) {
  const responsabili = [...new Set(contribuenti.map((c) => c.responsabile).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'it'))
  const [scelto, setScelto] = useState('')
  return (
    <span className="flex items-center gap-2">
      <select value={scelto} onChange={(e) => setScelto(e.target.value)} className="input w-auto">
        <option value="">Schede di un responsabile…</option>
        {responsabili.map((r) => <option key={r} value={r}>{r}</option>)}
      </select>
      {scelto
        ? <Link to={`/stampa/tributi/responsabile/${encodeURIComponent(scelto)}`} className="btn btn-secondario no-underline"><Printer size={16} /> Stampa</Link>
        : <button type="button" className="btn btn-secondario" disabled><Printer size={16} /> Stampa</button>}
    </span>
  )
}
