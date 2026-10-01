/**
 * Scheda "Studi" della sezione Fornitori: una tabella compatta per ogni studio con le fatture dei fornitori.
 * Le fatture si inseriscono e modificano direttamente nella riga; spunta "Pagata" con data.
 * Filtri: responsabile (tutti gli studi di quel responsabile), tipologia di spesa, stato, ricerca.
 * Gli studi si aggiungono, rinominano e rimuovono da qui (rimuovere = togliere dalla sezione Fornitori;
 * lo studio resta nei tributi). La mensilità di competenza serve solo per le royalty.
 */
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Pencil, Plus, Printer, Trash2, X } from 'lucide-react'
import { normalizzaNome, vuotoContribuente } from '../../lib/importaTributi'
import { useSessioneAttiva } from '../../lib/sessione'
import { aggiorna, campiModifica } from '../../lib/store'
import { TIPOLOGIE_SPESA, etichettaDi, type Contribuente, type FatturaFornitore } from '../../lib/tipi'
import { ETICHETTE_STATO, eCalcolata, nuovaFattura, royaltyDaRegistrare, scadenzaFattura, sommaImporti, statoSemplice, studioInFornitori } from '../../lib/fornitori'
import { analizzaEuro, formattaData, formattaEuro, oggiIso } from '../../lib/utils/formato'
import { SoloSeModifica, useSoloLettura } from '../SoloLettura'
import { Avviso, BarraRicerca, Bottone, Etichetta, Segmentato } from '../ui'

type FiltroStato = 'tutte' | 'da_pagare' | 'pagata'

/** Riga in modifica (nuova o esistente), direttamente nella tabella. */
function RigaModifica({ iniziale, fornitoriNoti, onSalva, onAnnulla, onElimina }: {
  iniziale: FatturaFornitore; fornitoriNoti: string[]
  onSalva: (f: FatturaFornitore) => Promise<string | null>; onAnnulla: () => void; onElimina?: () => void
}) {
  const [f, setF] = useState(iniziale)
  const [importo, setImporto] = useState(iniziale.importo_cent === null ? '' : (iniziale.importo_cent / 100).toFixed(2).replace('.', ','))
  const [errore, setErrore] = useState<string | null>(null)
  const [inCorso, setInCorso] = useState(false)
  const imp = <K extends keyof FatturaFornitore>(k: K, v: FatturaFornitore[K]) => setF((x) => ({ ...x, [k]: v }))
  async function salva() {
    setInCorso(true); setErrore(await onSalva({ ...f, competenza: f.tipologia === 'royalty' ? f.competenza : '' })); setInCorso(false)
  }
  return (
    <>
      <tr className="bg-accento-100">
        <td>
          <input value={f.fornitore} list="fornitori-noti" placeholder="Fornitore" autoFocus onChange={(e) => imp('fornitore', e.target.value)} className="input" />
          <datalist id="fornitori-noti">{fornitoriNoti.map((n) => <option key={n} value={n} />)}</datalist>
        </td>
        <td>
          <select value={f.tipologia} onChange={(e) => imp('tipologia', e.target.value)} className="input">
            <option value="">—</option>
            {TIPOLOGIE_SPESA.map((t) => <option key={t.valore} value={t.valore}>{t.etichetta}</option>)}
          </select>
          {f.tipologia === 'royalty' && <input type="month" value={f.competenza} title="Mensilità della royalty" onChange={(e) => imp('competenza', e.target.value)} className="input mt-1" />}
        </td>
        <td><input value={f.numero} placeholder="N." onChange={(e) => imp('numero', e.target.value)} className="input w-[90px]" /></td>
        <td><input type="date" value={f.data_fattura} onChange={(e) => imp('data_fattura', e.target.value)} className="input w-[140px]" /></td>
        <td><input type="date" value={f.scadenza} title="Se vuota: data fattura + 30 giorni" onChange={(e) => imp('scadenza', e.target.value)} className="input w-[140px]" /></td>
        <td><input value={importo} inputMode="decimal" placeholder="0,00" onChange={(e) => { setImporto(e.target.value); imp('importo_cent', analizzaEuro(e.target.value)) }} className="input num w-[100px] text-right" /></td>
        <td colSpan={2}>
          <span className="flex items-center gap-1.5">
            <Bottone piccolo disabled={inCorso} onClick={salva} title="Salva"><Check size={14} /> Salva</Bottone>
            <button type="button" onClick={onAnnulla} title="Annulla" className="btn btn-ghost btn-piccolo"><X size={14} /></button>
            {onElimina && <button type="button" onClick={onElimina} title="Elimina la fattura" className="btn btn-ghost btn-piccolo !text-neutro-700 hover:!text-err-testo"><Trash2 size={14} /></button>}
          </span>
        </td>
      </tr>
      {errore && <tr><td colSpan={8}><span className="text-[12px] text-err-testo">{errore}</span></td></tr>}
    </>
  )
}

export default function ElencoStudi({ studi, fatture }: { studi: Contribuente[]; fatture: FatturaFornitore[] }) {
  const { token, nome } = useSessioneAttiva()
  const soloLettura = useSoloLettura()
  const oggi = oggiIso()
  const [responsabile, setResponsabile] = useState('')
  const [ufficio, setUfficio] = useState('')
  const [tipologia, setTipologia] = useState('')
  const [filtroStato, setFiltroStato] = useState<FiltroStato>('tutte')
  const [ricerca, setRicerca] = useState('')
  const [soloConFatture, setSoloConFatture] = useState(false)
  const [inModifica, setInModifica] = useState<string | null>(null)              // id della fattura in modifica
  const [nuovaPer, setNuovaPer] = useState<{ studio: string; f: FatturaFornitore } | null>(null)
  const [rinomina, setRinomina] = useState<{ id: string; nome: string } | null>(null)
  const [nuovoStudio, setNuovoStudio] = useState<{ nome: string; responsabile: string } | null>(null)
  const [errore, setErrore] = useState<string | null>(null)

  const attivi = studi.filter(studioInFornitori)
  const rimossi = studi.filter((s) => !studioInFornitori(s))
  const responsabili = [...new Set(attivi.map((s) => s.responsabile).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'it'))
  const fornitoriNoti = [...new Set(['Tecnocasa', 'Tecnomedia', ...fatture.map((f) => f.fornitore)])].sort((a, b) => a.localeCompare(b, 'it'))
  const q = ricerca.trim().toLowerCase()
  const filtra = (ff: FatturaFornitore[]) => ff
    .filter((f) => !tipologia || f.tipologia === tipologia)
    .filter((f) => filtroStato === 'tutte' || statoSemplice(f) === filtroStato)
    .filter((f) => !q || [f.fornitore, f.numero, f.note].join(' ').toLowerCase().includes(q))
    .sort((a, b) => Number(a.pagata) - Number(b.pagata)
      || scadenzaFattura(a).localeCompare(scadenzaFattura(b)))
  const visibili = attivi.filter((s) => (!responsabile || s.responsabile === responsabile) && (!ufficio || s.id === ufficio))
  // Fatture dello studio + mensilità di royalty non ancora registrate (calcolate dall'importo mensile)
  const delloStudio = (s: Contribuente) => [...fatture.filter((f) => f.contribuente_id === s.id), ...royaltyDaRegistrare(s, fatture, oggi)]
  const blocchi = visibili.map((s) => { const tutte = delloStudio(s); return { s, tutte, mostrate: filtra(tutte) } })
    .filter((b) => !(soloConFatture || q || tipologia || filtroStato !== 'tutte') || b.mostrate.length > 0 || nuovaPer?.studio === b.s.id)
  const tutteVisibili = visibili.flatMap(delloStudio)
  const totale = (st: FiltroStato) => sommaImporti(filtra(tutteVisibili).filter((f) => statoSemplice(f) === st))

  /* --------- salvataggi --------- */
  async function salvaFattura(f: FatturaFornitore): Promise<string | null> {
    if (!f.fornitore.trim()) return 'Scrivi il fornitore.'
    if (!f.importo_cent || f.importo_cent <= 0) return 'Scrivi l\'importo.'
    if (f.tipologia === 'royalty' && !f.competenza) return 'Per le royalty indica la mensilità.'
    try {
      const rec = { ...f, fornitore: f.fornitore.trim(), numero: f.numero.trim(), ...campiModifica(nome) }
      await aggiorna<FatturaFornitore>(token, 'fatture_fornitori', (r) => (r.some((x) => x.id === f.id) ? r.map((x) => (x.id === f.id ? rec : x)) : [...r, rec]),
        `${nome}: fattura ${rec.fornitore}${rec.numero ? ' n. ' + rec.numero : ''} — ${studi.find((s) => s.id === f.contribuente_id)?.nome ?? ''}`)
      setInModifica(null); setNuovaPer(null)
      return null
    } catch (e) { return (e as Error).message }
  }
  async function cambiaFattura(f: FatturaFornitore, campi: Partial<FatturaFornitore>, azione: string) {
    setErrore(null)
    if (eCalcolata(f)) {
      // Mensilità di royalty calcolata: spuntandola diventa una registrazione vera (con l'importo di quel mese)
      const nuova = { ...nuovaFattura(nome, {}), ...f, ...campi }
      const vera = { ...nuova, id: nuovaFattura(nome).id, creato_il: new Date().toISOString(), creato_da: nome, ...campiModifica(nome) }
      try {
        await aggiorna<FatturaFornitore>(token, 'fatture_fornitori', (r) => [...r, vera], `${nome}: royalty ${f.fornitore} ${f.competenza} pagata — ${studi.find((s) => s.id === f.contribuente_id)?.nome ?? ''}`)
      } catch (e) { setErrore((e as Error).message) }
      return
    }
    try {
      await aggiorna<FatturaFornitore>(token, 'fatture_fornitori', (r) => r.map((x) => (x.id === f.id ? { ...x, ...campi, ...campiModifica(nome) } : x)),
        `${nome}: ${azione} — ${f.fornitore}${f.numero ? ' n. ' + f.numero : ''}`)
    } catch (e) { setErrore((e as Error).message) }
  }
  async function salvaStudio(id: string | null, campi: Partial<Contribuente>, azione: string) {
    setErrore(null)
    try {
      if (id) await aggiorna<Contribuente>(token, 'contribuenti', (r) => r.map((c) => (c.id === id ? { ...c, ...campi, ...campiModifica(nome) } : c)), `${nome}: ${azione}`)
      else { const c = { ...vuotoContribuente(nome, ''), ...campi }; await aggiorna<Contribuente>(token, 'contribuenti', (r) => [...r, c], `${nome}: ${azione}`) }
      return true
    } catch (e) { setErrore((e as Error).message); return false }
  }
  const nomeGiaUsato = (n: string, tranne?: string) => studi.find((c) => c.id !== tranne && [c.nome, ...(c.alias ?? [])].some((x) => normalizzaNome(x) === normalizzaNome(n)))

  async function aggiungiStudio() {
    if (!nuovoStudio) return
    const n = nuovoStudio.nome.trim()
    if (!n) { setErrore('Scrivi il nome dello studio.'); return }
    const gia = nomeGiaUsato(n)
    if (gia && !gia.fornitori_rimosso) { setErrore(`Lo studio "${gia.nome}" c'è già.`); return }
    if (gia) { if (await salvaStudio(gia.id, { fornitori_rimosso: false }, `riporta lo studio ${gia.nome} nei Fornitori`)) setNuovoStudio(null); return }
    if (await salvaStudio(null, { nome: n, responsabile: nuovoStudio.responsabile.trim() }, `nuovo studio ${n}`)) setNuovoStudio(null)
  }
  async function confermaRinomina() {
    if (!rinomina) return
    const n = rinomina.nome.trim()
    const vecchio = studi.find((s) => s.id === rinomina.id)
    if (!n || !vecchio) return
    if (nomeGiaUsato(n, rinomina.id)) { setErrore(`Esiste già uno studio chiamato "${n}".`); return }
    // Il vecchio nome resta come alias: così gli Excel e i PDF con il nome precedente vengono ancora riconosciuti
    const alias = [...new Set([...(vecchio.alias ?? []), vecchio.nome])].filter((a) => normalizzaNome(a) !== normalizzaNome(n))
    if (await salvaStudio(rinomina.id, { nome: n, alias }, `rinomina lo studio ${vecchio.nome} in ${n}`)) setRinomina(null)
  }

  return (
    <div className="text-sm">
      {/* Barra dei filtri */}
      <div className="mb-3 flex flex-wrap items-center gap-2.5">
        <select value={responsabile} onChange={(e) => { setResponsabile(e.target.value); setUfficio('') }} className="input w-auto">
          <option value="">Tutti i responsabili</option>
          {responsabili.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <select value={ufficio} onChange={(e) => setUfficio(e.target.value)} className="input w-auto">
          <option value="">Tutti gli uffici</option>
          {attivi.filter((s) => !responsabile || s.responsabile === responsabile).map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
        </select>
        <select value={tipologia} onChange={(e) => setTipologia(e.target.value)} className="input w-auto">
          <option value="">Tutte le tipologie</option>
          {TIPOLOGIE_SPESA.map((t) => <option key={t.valore} value={t.valore}>{t.etichetta}</option>)}
        </select>
        <Segmentato valore={filtroStato} onChange={setFiltroStato} opzioni={[
          { valore: 'tutte', etichetta: 'Tutte' }, { valore: 'da_pagare', etichetta: 'Da pagare' }, { valore: 'pagata', etichetta: 'Pagate' },
        ]} />
        <BarraRicerca valore={ricerca} onChange={setRicerca} segnaposto="Cerca fornitore, n. fattura…" />
        <label className="flex items-center gap-1.5 text-[13px]"><input type="checkbox" className="accent-accento" checked={soloConFatture} onChange={(e) => setSoloConFatture(e.target.checked)} /> Solo studi con fatture</label>
        <span className="ml-auto flex gap-2">
          {ufficio || responsabile
            ? <Link to={ufficio ? `/stampa/fornitori/ufficio/${ufficio}` : `/stampa/fornitori/responsabile/${encodeURIComponent(responsabile)}`} className="btn btn-secondario no-underline"
                title={ufficio ? 'Stampa le fatture di questo ufficio' : `Stampa le fatture di tutti gli uffici di ${responsabile}`}><Printer size={15} /> Stampa</Link>
            : <button type="button" className="btn btn-secondario" disabled title="Scegli un responsabile o un ufficio"><Printer size={15} /> Stampa</button>}
          <SoloSeModifica><Bottone variante="secondario" onClick={() => setNuovoStudio({ nome: '', responsabile: responsabile })}><Plus size={15} /> Nuovo studio</Bottone></SoloSeModifica>
        </span>
      </div>

      {/* Totali su una riga */}
      <div className="mb-4 flex flex-wrap gap-x-5 gap-y-1 border-y border-divisore py-2 text-[13px]">
        <span>{ufficio ? visibili[0]?.nome : `${visibili.length} studi${responsabile ? ` di ${responsabile}` : ''}`}</span>
        <span>Da pagare <b>{formattaEuro(totale('da_pagare'))}</b></span>
        <span>Pagato <b>{formattaEuro(totale('pagata'))}</b></span>
      </div>

      {errore && <div className="mb-3"><Avviso tipo="errore">{errore}</Avviso></div>}

      {nuovoStudio && (
        <div className="mb-4 flex flex-wrap items-center gap-2 border border-accento bg-accento-100 px-3 py-2">
          <b className="text-[13px]">Nuovo studio</b>
          <input value={nuovoStudio.nome} autoFocus placeholder="Nome dello studio" onChange={(e) => setNuovoStudio({ ...nuovoStudio, nome: e.target.value })} className="input w-[220px] !min-h-[30px] !py-1" />
          <input value={nuovoStudio.responsabile} placeholder="Responsabile" list="responsabili" onChange={(e) => setNuovoStudio({ ...nuovoStudio, responsabile: e.target.value })} className="input w-[160px] !min-h-[30px] !py-1" />
          <datalist id="responsabili">{responsabili.map((r) => <option key={r} value={r} />)}</datalist>
          <Bottone piccolo onClick={aggiungiStudio}><Check size={14} /> Aggiungi</Bottone>
          <button type="button" className="btn btn-ghost btn-piccolo" onClick={() => setNuovoStudio(null)}><X size={14} /></button>
          <span className="text-[12px] text-neutro-700">Lo studio compare anche nell'elenco Società dei tributi.</span>
        </div>
      )}

      {/* Un blocco per studio */}
      <div className="flex flex-col gap-2">
        {blocchi.map(({ s, tutte, mostrate }) => {
          const dap = sommaImporti(tutte.filter((f) => statoSemplice(f) === 'da_pagare'))
          const nuova = nuovaPer?.studio === s.id ? nuovaPer.f : null
          return (
            <section key={s.id} className="border border-divisore">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-superficie px-3 py-1">
                {rinomina?.id === s.id ? (
                  <span className="flex items-center gap-1.5">
                    <input value={rinomina.nome} autoFocus onChange={(e) => setRinomina({ ...rinomina, nome: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') confermaRinomina(); if (e.key === 'Escape') setRinomina(null) }} className="input w-[220px] !min-h-[28px] !py-0.5" />
                    <Bottone piccolo onClick={confermaRinomina}><Check size={14} /></Bottone>
                    <button type="button" className="btn btn-ghost btn-piccolo" onClick={() => setRinomina(null)}><X size={14} /></button>
                  </span>
                ) : <b className="text-[15px]">{s.nome}</b>}
                <span className="text-[12px] text-neutro-700">{s.responsabile || 'senza responsabile'}</span>
                {mostrate.length === 0 && !nuova && <span className="text-[12px] text-neutro-500">· {tutte.length ? 'nessuna fattura con questi filtri' : 'nessuna fattura'}</span>}
                <span className="ml-auto flex flex-wrap items-center gap-x-4 text-[12px]">
                  {dap > 0 && <span>Da pagare <b>{formattaEuro(dap)}</b></span>}
                  {tutte.length > 0 && <Link to={`/stampa/fornitori/ufficio/${s.id}`} className="text-neutro-700 no-underline hover:underline" title="Stampa le fatture di questo ufficio"><Printer size={13} className="inline" /> Stampa</Link>}
                  {!soloLettura && <>
                    <button type="button" className="text-accento-700 hover:underline" onClick={() => setNuovaPer({ studio: s.id, f: nuovaFattura(nome, { contribuente_id: s.id }) })}><Plus size={13} className="inline" /> Fattura</button>
                    <button type="button" className="text-neutro-700 hover:underline" title="Rinomina lo studio" onClick={() => setRinomina({ id: s.id, nome: s.nome })}><Pencil size={13} className="inline" /> Rinomina</button>
                    <button type="button" className="text-neutro-700 hover:text-err-testo hover:underline" title="Togli lo studio dalla sezione Fornitori (resta nei tributi)"
                      onClick={() => { if (window.confirm(`Togliere "${s.nome}" dalla sezione Fornitori? Le sue fatture restano salvate e lo studio resta nei tributi; potrai ripristinarlo in fondo alla pagina.`)) salvaStudio(s.id, { fornitori_rimosso: true }, `toglie lo studio ${s.nome} dai Fornitori`) }}>
                      <Trash2 size={13} className="inline" /> Rimuovi
                    </button>
                  </>}
                </span>
              </div>
              {(mostrate.length > 0 || nuova) ? (
                <div className="overflow-x-auto">
                  <table className="tabella-compatta">
                    <thead><tr><th>Fornitore</th><th>Tipologia</th><th>N. fattura</th><th>Data</th><th>Scadenza</th><th className="text-right">Importo</th><th>Stato</th><th>Pagata</th></tr></thead>
                    <tbody>
                      {mostrate.map((f) => inModifica === f.id ? (
                        <RigaModifica key={f.id} iniziale={f} fornitoriNoti={fornitoriNoti} onSalva={salvaFattura} onAnnulla={() => setInModifica(null)}
                          onElimina={() => { if (window.confirm(`Eliminare la fattura ${f.fornitore}${f.numero ? ' n. ' + f.numero : ''}?`)) { cambiaFattura(f, { eliminato_il: new Date().toISOString() }, 'elimina fattura'); setInModifica(null) } }} />
                      ) : (
                        <tr key={f.id} className={soloLettura || eCalcolata(f) ? '' : 'cursor-pointer hover:bg-[rgba(29,31,32,0.04)]'} onClick={() => !soloLettura && !eCalcolata(f) && setInModifica(f.id)}
                          title={eCalcolata(f) ? 'Mensilità calcolata dall\'importo mensile (scheda Royalty): spunta "Pagata" quando è pagata' : soloLettura ? undefined : 'Clicca per modificare'}>
                          <td className="font-medium">{f.fornitore}</td>
                          <td>{f.tipologia ? etichettaDi(TIPOLOGIE_SPESA, f.tipologia) : '—'}{f.tipologia === 'royalty' && f.competenza && <span className="text-neutro-700"> · {formattaData(f.competenza + '-01').slice(3)}</span>}</td>
                          <td>{f.numero || '—'}</td>
                          <td className="num">{formattaData(f.data_fattura)}</td>
                          <td className="num">{formattaData(scadenzaFattura(f))}</td>
                          <td className="num text-right font-semibold">{formattaEuro(f.importo_cent)}</td>
                          <td><Etichetta tono={ETICHETTE_STATO[statoSemplice(f)].tono}>{ETICHETTE_STATO[statoSemplice(f)].testo}</Etichetta></td>
                          <td onClick={(e) => e.stopPropagation()}>
                            <span className="flex items-center gap-1.5">
                              <input type="checkbox" className="h-4 w-4 accent-accento" checked={f.pagata} disabled={soloLettura}
                                onChange={(e) => cambiaFattura(f, { pagata: e.target.checked, pagata_il: e.target.checked ? oggi : '' }, e.target.checked ? 'fattura pagata' : 'fattura da pagare')} />
                              {f.pagata && <input type="date" value={f.pagata_il} disabled={soloLettura} onChange={(e) => cambiaFattura(f, { pagata_il: e.target.value }, 'data di pagamento')} className="input w-[135px] !min-h-[26px] !py-0" />}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {nuova && <RigaModifica key={nuova.id} iniziale={nuova} fornitoriNoti={fornitoriNoti} onSalva={salvaFattura} onAnnulla={() => setNuovaPer(null)} />}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </section>
          )
        })}
        {blocchi.length === 0 && <p className="text-neutro-700">Nessuno studio con questi filtri.</p>}
      </div>

      {rimossi.length > 0 && !soloLettura && (
        <details className="mt-6 text-[13px]">
          <summary className="cursor-pointer text-neutro-700">Studi tolti dai Fornitori ({rimossi.length})</summary>
          <div className="mt-2 flex flex-wrap gap-2">
            {rimossi.map((s) => (
              <button key={s.id} type="button" className="btn btn-secondario btn-piccolo" onClick={() => salvaStudio(s.id, { fornitori_rimosso: false }, `riporta lo studio ${s.nome} nei Fornitori`)}>
                {s.nome} · ripristina
              </button>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}
