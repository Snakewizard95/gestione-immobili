/**
 * Scheda "Royalty": situazione di Tecnocasa o Tecnomedia per gli uffici che le pagano. Ogni ufficio ha un importo mensile
 * (si inserisce il totale con IVA, scomposto in imponibile + IVA) che vale per tutte le mensilità dal mese indicato in poi: cambiandolo si sceglie da quale mese vale,
 * le mensilità precedenti restano con l'importo di allora. Ogni casella è una mensilità: pagata, da pagare (fino alla
 * fine del mese) o insoluta; clic per segnarla pagata. "×" toglie un ufficio che non paga la royalty, "Aggiungi ufficio" lo rimette.
 */
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Check, Pencil, Printer, X } from 'lucide-react'
import { useSessioneAttiva } from '../../lib/sessione'
import { aggiorna, campiModifica } from '../../lib/store'
import type { Contribuente, FatturaFornitore, TariffaRoyalty } from '../../lib/tipi'
import {
  FORNITORI_ROYALTY, fineMese, mensilita, nuovaFattura, scomponiTotale, pagaRoyalty, storicoTariffe, studioInFornitori, tariffaDel, totaliTariffa, type Mensilita, type StatoFattura,
} from '../../lib/fornitori'
import { analizzaEuro, formattaData, formattaEuro, oggiIso } from '../../lib/utils/formato'
import { useSoloLettura } from '../SoloLettura'
import { Avviso, Bottone, Finestra, Riquadro, Segmentato } from '../ui'

const MESI = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic']
const MESI_LUNGHI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre']
const meseLungo = (m: string) => `${MESI_LUNGHI[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`
const STILE: Record<StatoFattura, { classe: string; segno: string; testo: string }> = {
  pagata: { classe: 'bg-ok-fondo text-ok-testo border-ok-bordo', segno: '✓', testo: 'Pagata' },
  da_pagare: { classe: 'bg-accento-100 text-accento-800 border-accento', segno: '•', testo: 'Da pagare' },
  insoluta: { classe: 'bg-err-fondo text-err-testo border-err-bordo font-semibold', segno: '!', testo: 'Insoluta' },
}
const centInTesto = (c: number | null | undefined) => (c == null ? '' : (c / 100).toFixed(2).replace('.', ','))

export default function GrigliaRoyalty({ studi: tuttiStudi, fatture }: { studi: Contribuente[]; fatture: FatturaFornitore[] }) {
  const { token, nome } = useSessioneAttiva()
  const soloLettura = useSoloLettura()
  const oggi = oggiIso()
  const meseCorrente = oggi.slice(0, 7)
  const [fornitore, setFornitore] = useState<string>(FORNITORI_ROYALTY[0])
  const anni = [...new Set([Number(oggi.slice(0, 4)), ...fatture.filter((f) => f.competenza).map((f) => Number(f.competenza.slice(0, 4)))])].sort((a, b) => b - a)
  // Tornando dalla stampa anno e filtri arrivano dall'indirizzo
  const [parametri] = useSearchParams()
  const [anno, setAnno] = useState(Number(parametri.get('anno')) || Number(oggi.slice(0, 4)))
  const [errore, setErrore] = useState<string | null>(null)
  const [responsabile, setResponsabile] = useState(parametri.get('responsabile') ?? '')
  const [ufficio, setUfficio] = useState(parametri.get('ufficio') ?? '')
  const [importo, setImporto] = useState<{ id: string; totale: string; iva: string; dal: string } | null>(null)
  const [aperta, setAperta] = useState<{ s: Contribuente; mese: string } | null>(null)

  const inSezione = tuttiStudi.filter(studioInFornitori)
  const conRoyalty = inSezione.filter((s) => pagaRoyalty(s, fornitore))
  const responsabili = [...new Set(conRoyalty.map((s) => s.responsabile).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'it'))
  const studi = conRoyalty.filter((s) => (!responsabile || s.responsabile === responsabile) && (!ufficio || s.id === ufficio))
  const esclusi = inSezione.filter((s) => !pagaRoyalty(s, fornitore))
  const mese = (m: number) => `${anno}-${String(m + 1).padStart(2, '0')}`
  const mens = (s: Contribuente, m: string): Mensilita => mensilita(s, fornitore, m, fatture, oggi)
  const insolutoStudio = (s: Contribuente) => MESI.reduce((t, _, i) => { const x = mens(s, mese(i)); return t + (x.stato === 'insoluta' ? x.importo_cent ?? 0 : 0) }, 0)
  const insolutoTot = studi.reduce((t, s) => t + insolutoStudio(s), 0)
  // Importo mostrato nella riga: quello in vigore oggi (o a dicembre, per gli anni passati)
  const meseRiferimento = anno < Number(oggi.slice(0, 4)) ? `${anno}-12` : anno > Number(oggi.slice(0, 4)) ? `${anno}-01` : meseCorrente

  async function salvaStudio(s: Contribuente, campi: Partial<Contribuente>, azione: string) {
    setErrore(null)
    try {
      await aggiorna<Contribuente>(token, 'contribuenti', (r) => r.map((c) => (c.id === s.id ? { ...c, ...campi, ...campiModifica(nome) } : c)), `${nome}: ${azione}`)
      return true
    } catch (e) { setErrore((e as Error).message); return false }
  }
  async function impostaRoyalty(s: Contribuente, paga: boolean) {
    const senza = new Set(s.senza_royalty ?? [])
    if (paga) senza.delete(fornitore); else senza.add(fornitore)
    await salvaStudio(s, { senza_royalty: [...senza] }, `${s.nome} ${paga ? 'paga' : 'non paga'} le royalty ${fornitore}`)
  }
  /** Nuovo importo mensile valido dal mese scelto in poi (stesso mese: sostituisce). I mesi precedenti non cambiano. */
  async function salvaImporto(s: Contribuente) {
    if (!importo) return
    const totale = analizzaEuro(importo.totale)
    const iva = Number(importo.iva.replace(',', '.'))
    if (!totale || totale <= 0) { setErrore('Scrivi l\'importo mensile totale con IVA.'); return }
    if (!Number.isFinite(iva) || iva < 0) { setErrore('IVA non valida.'); return }
    if (!/^\d{4}-\d{2}$/.test(importo.dal)) { setErrore('Indica da quale mese vale.'); return }
    const t: TariffaRoyalty = { dal: importo.dal, imponibile_cent: scomponiTotale(totale, iva).imponibile_cent, iva_percento: iva, totale_cent: totale }
    const storico = [...storicoTariffe(s, fornitore).filter((x) => x.dal !== t.dal), t].sort((a, b) => a.dal.localeCompare(b.dal))
    if (await salvaStudio(s, { royalty_importi: { ...(s.royalty_importi ?? {}), [fornitore]: storico } },
      `royalty ${fornitore} ${s.nome}: ${formattaEuro(totale)} IVA inclusa dal ${importo.dal}`)) setImporto(null)
  }
  function apriImporto(s: Contribuente) {
    const t = tariffaDel(s, fornitore, meseRiferimento) ?? storicoTariffe(s, fornitore).at(-1)
    setImporto({ id: s.id, totale: centInTesto(t ? totaliTariffa(t).totale_cent : null), iva: String(t?.iva_percento ?? 22).replace('.', ','), dal: t ? meseCorrente : `${anno}-01` })
  }

  return (
    <div className="text-sm">
      <div className="mb-3 flex flex-wrap items-center gap-2.5">
        <Segmentato valore={fornitore} onChange={(v) => { setFornitore(v); setImporto(null) }} opzioni={FORNITORI_ROYALTY.map((n) => ({ valore: n, etichetta: n }))} />
        <select value={anno} onChange={(e) => setAnno(Number(e.target.value))} className="input w-auto">
          {[...new Set([...anni, Number(oggi.slice(0, 4)) + 1])].sort((a, b) => b - a).map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <select value={responsabile} onChange={(e) => { setResponsabile(e.target.value); setUfficio('') }} className="input w-auto">
          <option value="">Tutti i responsabili</option>
          {responsabili.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <select value={ufficio} onChange={(e) => setUfficio(e.target.value)} className="input w-auto">
          <option value="">Tutti gli uffici</option>
          {conRoyalty.filter((s) => !responsabile || s.responsabile === responsabile).map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
        </select>
        {!soloLettura && esclusi.length > 0 && (
          <select value="" onChange={(e) => { const s = esclusi.find((x) => x.id === e.target.value); if (s) impostaRoyalty(s, true) }} className="input w-auto">
            <option value="">+ Aggiungi ufficio ({esclusi.length})</option>
            {esclusi.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
          </select>
        )}
        <Link to={`/stampa/royalty/tutte/${anno}?${new URLSearchParams({ ...(responsabile ? { responsabile } : {}), ...(ufficio ? { ufficio } : {}) }).toString()}`}
          className="btn btn-secondario no-underline" title="Stampa le mensilità da pagare di Tecnocasa e Tecnomedia"><Printer size={15} /> Stampa</Link>
        <span className="ml-auto text-[13px]">{studi.length} uffici · Insoluto {fornitore} {anno}{responsabile || ufficio ? ' (filtrato)' : ''}: <b className={insolutoTot ? 'text-err-testo' : ''}>{formattaEuro(insolutoTot)}</b></span>
      </div>
      {errore && <div className="mb-3"><Avviso tipo="errore">{errore}</Avviso></div>}

      <div className="-mx-1.5 overflow-x-auto p-1.5">
        <Riquadro className="min-w-[1180px]">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-divisore text-[10px] uppercase tracking-[0.08em] text-attenuato">
                <th className="px-3 py-1.5 text-left font-medium">Ufficio</th>
                <th className="px-2 py-1.5 text-left font-medium">Importo mensile</th>
                {MESI.map((m) => <th key={m} className="px-0.5 py-1.5 text-center font-medium">{m}</th>)}
                <th className="px-3 py-1.5 text-right font-medium">Insoluto</th>
                {!soloLettura && <th className="w-7" />}
              </tr>
            </thead>
            <tbody>
              {studi.map((s) => {
                const t = tariffaDel(s, fornitore, meseRiferimento)
                const storico = storicoTariffe(s, fornitore)
                const ins = insolutoStudio(s)
                return (
                  <tr key={s.id} className="border-b border-riga">
                    <td className="whitespace-nowrap px-3 py-0.5 font-medium">{s.nome}</td>
                    <td className="whitespace-nowrap px-2 py-0.5">
                      {importo?.id === s.id ? (
                        <span className="flex items-center gap-1">
                          <input value={importo.totale} autoFocus placeholder="Totale con IVA" title="Importo mensile totale, IVA inclusa" inputMode="decimal" onChange={(e) => setImporto({ ...importo, totale: e.target.value })} className="input num w-[90px] !min-h-[26px] !py-0 text-right text-[12px]" />
                          <span className="text-[11px] text-neutro-700">IVA incl. al</span>
                          <input value={importo.iva} inputMode="decimal" onChange={(e) => setImporto({ ...importo, iva: e.target.value })} className="input num w-[44px] !min-h-[26px] !py-0 text-right text-[12px]" />
                          <span className="text-[11px] text-neutro-700">%</span>
                          {(() => { const tot = analizzaEuro(importo.totale), iva = Number(importo.iva.replace(',', '.')); if (!tot || !Number.isFinite(iva)) return null; const x = scomponiTotale(tot, iva)
                            return <span className="text-[11px] text-neutro-700">= <span className="num">{formattaEuro(x.imponibile_cent)}</span> + <span className="num">{formattaEuro(x.iva_cent)}</span> IVA</span> })()}
                          <span className="text-[11px] text-neutro-700">dal</span>
                          <input type="month" value={importo.dal} onChange={(e) => setImporto({ ...importo, dal: e.target.value })} className="input w-[130px] !min-h-[26px] !py-0 text-[12px]" />
                          <button type="button" title="Salva" onClick={() => salvaImporto(s)} className="btn btn-primario btn-piccolo !min-h-[26px] !px-1.5"><Check size={13} /></button>
                          <button type="button" title="Annulla" onClick={() => setImporto(null)} className="btn btn-ghost btn-piccolo !min-h-[26px] !px-1.5"><X size={13} /></button>
                        </span>
                      ) : (
                        <button type="button" disabled={soloLettura} onClick={() => apriImporto(s)} className="group text-left disabled:cursor-default"
                          title={storico.length ? storico.map((x) => `dal ${x.dal.slice(5)}/${x.dal.slice(0, 4)}: ${formattaEuro(x.imponibile_cent)} + IVA ${x.iva_percento}% = ${formattaEuro(totaliTariffa(x).totale_cent)}`).join('\n') : 'Imposta l\'importo mensile'}>
                          {t ? (
                            <span className="text-[12px]">
                              <span className="num">{formattaEuro(t.imponibile_cent)}</span><span className="text-neutro-700"> + {formattaEuro(totaliTariffa(t).iva_cent)} IVA = </span><b className="num">{formattaEuro(totaliTariffa(t).totale_cent)}</b>
                              <span className="ml-1 text-[11px] text-neutro-500">dal {t.dal.slice(5)}/{t.dal.slice(2, 4)}</span>
                              {!soloLettura && <Pencil size={11} className="ml-1 inline text-neutro-400 group-hover:text-accento-700" />}
                            </span>
                          ) : <span className="text-[12px] text-accento-700">{soloLettura ? '—' : '+ Imposta importo'}</span>}
                        </button>
                      )}
                    </td>
                    {MESI.map((_, i) => {
                      const m = mese(i)
                      const x = mens(s, m)
                      const titolo = x.stato ? `${STILE[x.stato].testo} · ${meseLungo(m)} · ${formattaEuro(x.importo_cent)}${x.fatture[0]?.pagata_il ? ` · pagata il ${formattaData(x.fatture[0].pagata_il)}` : ''}` : 'Nessun importo impostato'
                      return (
                        <td key={i} className="px-0.5 py-0.5 text-center">
                          <button type="button" title={titolo} disabled={soloLettura || (!x.stato && !x.fatture.length)} onClick={() => setAperta({ s, mese: m })}
                            className={`h-6 w-full min-w-[40px] border text-[12px] disabled:cursor-default ${x.stato ? STILE[x.stato].classe : 'border-dashed border-neutro-300 text-neutro-400'}`}>
                            {x.stato ? STILE[x.stato].segno : '—'}
                          </button>
                        </td>
                      )
                    })}
                    <td className={`num whitespace-nowrap px-3 py-0.5 text-right ${ins ? 'font-semibold text-err-testo' : 'text-neutro-500'}`}>{ins ? formattaEuro(ins) : '—'}</td>
                    {!soloLettura && (
                      <td className="px-1 text-center">
                        <button type="button" title={`${s.nome} non paga le royalty ${fornitore}: togli dalla griglia`}
                          onClick={() => { if (window.confirm(`Togliere ${s.nome} dalla griglia ${fornitore}? Importi e pagamenti restano salvati; potrai rimetterlo con "Aggiungi ufficio".`)) impostaRoyalty(s, false) }}
                          className="text-neutro-400 hover:text-err-testo"><X size={14} /></button>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Riquadro>
      </div>
      <div className="mt-2 flex flex-wrap gap-[18px] text-xs text-neutro-700">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 bg-ok-bordo" />✓ Pagata</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 bg-accento" />• Da pagare (fino a fine mese)</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 bg-err-bordo" />! Insoluta (mese passato, non pagata)</span>
        <span>— Importo non impostato. Clic sull'importo per cambiarlo (scegli da quale mese vale), clic su un mese per segnarlo pagato.</span>
      </div>

      <Finestra kicker={aperta ? `${aperta.s.nome} · royalty ${fornitore}` : ''} titolo={aperta ? `Mensilità di ${meseLungo(aperta.mese)}` : ''} aperta={!!aperta} onChiudi={() => setAperta(null)}>
        {aperta && <ModuloMensilita key={`${aperta.s.id}-${aperta.mese}`} s={aperta.s} fornitore={fornitore} mese={aperta.mese} fatture={fatture} onChiudi={() => setAperta(null)} />}
      </Finestra>
    </div>
  )
}

/** Finestra di una mensilità: importo (quello in vigore, modificabile solo per questo mese), pagata con data, n. fattura. */
function ModuloMensilita({ s, fornitore, mese, fatture, onChiudi }: { s: Contribuente; fornitore: string; mese: string; fatture: FatturaFornitore[]; onChiudi: () => void }) {
  const { token, nome } = useSessioneAttiva()
  const oggi = oggiIso()
  const x = mensilita(s, fornitore, mese, fatture, oggi)
  const esistente = x.fatture[0]
  const [importo, setImporto] = useState(centInTesto(x.importo_cent))
  const [numero, setNumero] = useState(esistente?.numero ?? '')
  const [dataFattura, setDataFattura] = useState(esistente?.data_fattura ?? '')
  // Mesi passati: di solito si apre per segnarla pagata; mese corrente e futuri: per scrivere n. e data della fattura
  const [pagata, setPagata] = useState(esistente?.pagata ?? fineMese(mese) < oggi)
  const [data, setData] = useState(esistente?.pagata_il || oggi)
  const [errore, setErrore] = useState<string | null>(null)
  const [inCorso, setInCorso] = useState(false)
  const t = x.tariffa

  /** Registrazione della mensilità (fattura royalty con competenza): l'importo resta quello di questo mese. */
  const record = (m: string, base: FatturaFornitore | undefined, campi: Partial<FatturaFornitore>): FatturaFornitore => ({
    ...(base ?? nuovaFattura(nome, { contribuente_id: s.id, fornitore, tipologia: 'royalty', competenza: m, scadenza: fineMese(m) })),
    ...campi, modificato_il: new Date().toISOString(), modificato_da: nome,
  })

  async function salva(nuove: FatturaFornitore[], azione: string) {
    setErrore(null); setInCorso(true)
    try {
      await aggiorna<FatturaFornitore>(token, 'fatture_fornitori', (r) => {
        const ids = new Set(nuove.map((f) => f.id))
        return [...r.map((f) => (ids.has(f.id) ? nuove.find((n) => n.id === f.id)! : f)), ...nuove.filter((n) => !r.some((f) => f.id === n.id))]
      }, `${nome}: royalty ${fornitore} ${s.nome} — ${azione}`)
      onChiudi()
    } catch (e) { setErrore((e as Error).message) } finally { setInCorso(false) }
  }

  function salvaQuesta() {
    const cent = analizzaEuro(importo)
    if (!cent || cent <= 0) { setErrore('Scrivi l\'importo.'); return }
    salva([record(mese, esistente, { importo_cent: cent, numero: numero.trim(), data_fattura: dataFattura, pagata, pagata_il: pagata ? data : '' })], `${mese} ${pagata ? 'pagata' : 'da pagare'}`)
  }

  /** Segna pagate tutte le mensilità dell'anno fino a questa che non risultano pagate (con il loro importo in vigore). */
  function pagateFinoAQui() {
    const anno = mese.slice(0, 4)
    const nuove: FatturaFornitore[] = []
    for (let i = 1; i <= Number(mese.slice(5, 7)); i++) {
      const m = `${anno}-${String(i).padStart(2, '0')}`
      const y = mensilita(s, fornitore, m, fatture, oggi)
      if (!y.stato || y.stato === 'pagata') continue
      for (const f of y.fatture.length ? y.fatture : [undefined]) {
        nuove.push(record(m, f, { importo_cent: f?.importo_cent ?? y.importo_cent, pagata: true, pagata_il: f?.pagata_il || (m === mese ? data : '') }))
      }
    }
    if (!nuove.length) { onChiudi(); return }
    salva(nuove, `pagate ${nuove.length} mensilità fino a ${mese}`)
  }

  async function annulla() {
    if (!esistente) return
    setInCorso(true)
    try {
      await aggiorna<FatturaFornitore>(token, 'fatture_fornitori', (r) => r.map((f) => (f.id === esistente.id ? { ...f, eliminato_il: new Date().toISOString(), ...campiModifica(nome) } : f)),
        `${nome}: royalty ${fornitore} ${s.nome} — annulla registrazione ${mese}`)
      onChiudi()
    } catch (e) { setErrore((e as Error).message); setInCorso(false) }
  }

  return (
    <div className="flex flex-col gap-4 text-sm">
      {t && <p className="text-neutro-700">Importo mensile in vigore: {formattaEuro(t.imponibile_cent)} + IVA {t.iva_percento}% = <b>{formattaEuro(totaliTariffa(t).totale_cent)}</b> (dal {t.dal.slice(5)}/{t.dal.slice(0, 4)}).</p>}
      <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
        <label className="block"><span className="etichetta-campo">Importo di questo mese</span>
          <input value={importo} inputMode="decimal" onChange={(e) => setImporto(e.target.value)} className="input num text-right" />
        </label>
        <label className="block"><span className="etichetta-campo">N. fattura</span>
          <input value={numero} onChange={(e) => setNumero(e.target.value)} className="input" />
        </label>
        <label className="block"><span className="etichetta-campo">Data fattura</span>
          <input type="date" value={dataFattura} onChange={(e) => setDataFattura(e.target.value)} className="input" />
        </label>
        <div className="block"><span className="etichetta-campo">Pagata</span>
          <span className="flex items-center gap-2">
            <input type="checkbox" className="h-4 w-4 accent-accento" checked={pagata} onChange={(e) => setPagata(e.target.checked)} />
            {pagata && <input type="date" value={data} onChange={(e) => setData(e.target.value)} className="input w-auto" />}
          </span>
        </div>
      </div>
      {errore && <Avviso tipo="errore">{errore}</Avviso>}
      <div className="flex flex-wrap items-center justify-between gap-2.5 border-t border-divisore pt-4">
        <span className="flex flex-wrap gap-2">
          {mese.slice(5, 7) !== '01' && <Bottone variante="secondario" disabled={inCorso} onClick={pagateFinoAQui} title="Le mensilità da gennaio a questa non ancora pagate vengono segnate pagate, ognuna con il suo importo">Segna pagate tutte fino a questa</Bottone>}
          {esistente && <Bottone variante="ghost" disabled={inCorso} onClick={annulla} title="Torna all'importo mensile in vigore, non pagata">Annulla registrazione</Bottone>}
        </span>
        <span className="flex gap-2">
          <Bottone variante="secondario" onClick={onChiudi}>Annulla</Bottone>
          <Bottone disabled={inCorso} onClick={salvaQuesta}>{inCorso ? 'Salvataggio…' : 'Salva'}</Bottone>
        </span>
      </div>
    </div>
  )
}
