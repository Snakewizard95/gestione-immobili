/**
 * Stampe della sezione Fornitori (da salvare in PDF con "Stampa → Salva come PDF"):
 * - fatture dei fornitori di un ufficio o di tutti gli uffici di un responsabile (gruppo di supervisione);
 * - royalty Tecnocasa / Tecnomedia di un anno su una pagina orizzontale.
 */
import { useState, type ReactNode } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Printer } from 'lucide-react'
import logo from '../assets/logo-gruppo.png'
import { Bottone, Caricamento } from '../components/ui'
import { ETICHETTE_STATO, FORNITORI_ROYALTY, mensilita, royaltyDaRegistrare, pagaRoyalty, scadenzaFattura, sommaImporti, statoSemplice, storicoTariffe, studioInFornitori } from '../lib/fornitori'
import { attivi } from '../lib/store'
import { TIPOLOGIE_SPESA, etichettaDi, type Contribuente, type FatturaFornitore } from '../lib/tipi'
import { useCollezioni } from '../lib/useCollezioni'
import { formattaData, formattaDataOra, formattaEuro, oggiIso } from '../lib/utils/formato'

// I colori delle caselle e delle etichette vanno stampati (di solito il browser toglie gli sfondi)
const COLORI_STAMPA = { WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' } as React.CSSProperties

function Barra({ indietro, children }: { indietro: string; children?: ReactNode }) {
  return (
    <div className="no-stampa sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-divisore bg-sfondo px-6 py-3">
      <Link to={indietro} className="btn btn-ghost no-underline"><ArrowLeft size={16} /> Torna ai fornitori</Link>
      <span className="ml-auto flex flex-wrap items-center gap-3 text-[13px]">{children}</span>
      <Bottone onClick={() => window.print()}><Printer size={16} /> Stampa / salva PDF</Bottone>
    </div>
  )
}

function Intestazione({ kicker, titolo, sotto }: { kicker: string; titolo: string; sotto?: string }) {
  return (
    <header className="flex items-start justify-between gap-6 border-b-2 border-testo pb-3">
      <div className="min-w-0">
        <div className="kicker">{kicker}</div>
        <h1 className="mt-1 text-[30px]">{titolo}</h1>
        {sotto && <div className="mt-0.5 text-[13px] text-neutro-700">{sotto}</div>}
      </div>
      <div className="flex-none text-right text-xs text-neutro-700">
        <img src={logo} alt="Gruppo CEC Bigoli" className="mb-1.5 ml-auto h-10 w-[160px] object-cover" />
        Situazione al {formattaDataOra(new Date().toISOString())}
      </div>
    </header>
  )
}

/* ---------------------------- fatture: ufficio o responsabile ---------------------------- */

export function StampaFattureFornitori() {
  const { tipo, valore } = useParams()
  const { dati, caricamento } = useCollezioni(['contribuenti', 'fatture_fornitori'])
  const [anchePagate, setAnchePagate] = useState(false)
  const [paginaPerUfficio, setPaginaPerUfficio] = useState(false)
  const oggi = oggiIso()
  const chiave = decodeURIComponent(valore ?? '')
  const studi = attivi(dati<Contribuente>('contribuenti')).filter(studioInFornitori).sort((a, b) => a.nome.localeCompare(b.nome, 'it'))
  const fatture = attivi(dati<FatturaFornitore>('fatture_fornitori'))
  const scelti = tipo === 'responsabile' ? studi.filter((s) => s.responsabile === chiave) : studi.filter((s) => s.id === chiave)
  if (caricamento && !scelti.length) return <div className="p-10"><Caricamento /></div>

  const delle = (s: Contribuente) => [...fatture.filter((f) => f.contribuente_id === s.id), ...royaltyDaRegistrare(s, fatture, oggi)].filter((f) => anchePagate || !f.pagata)
    .sort((a, b) => Number(a.pagata) - Number(b.pagata) || scadenzaFattura(a).localeCompare(scadenzaFattura(b)))
  const tot = (ff: FatturaFornitore[], st: 'da_pagare' | 'pagata') => sommaImporti(ff.filter((f) => statoSemplice(f) === st))
  const tutte = scelti.flatMap((s) => [...fatture.filter((f) => f.contribuente_id === s.id), ...royaltyDaRegistrare(s, fatture, oggi)])
  const titolo = tipo === 'responsabile' ? `Uffici di ${chiave}` : scelti[0]?.nome ?? 'Ufficio'

  return (
    <div className="min-h-screen bg-sfondo print:bg-white" style={COLORI_STAMPA}>
      <Barra indietro="/fornitori">
        <label className="flex items-center gap-1.5"><input type="checkbox" className="accent-accento" checked={anchePagate} onChange={(e) => setAnchePagate(e.target.checked)} /> Includi le fatture pagate</label>
        {tipo === 'responsabile' && <label className="flex items-center gap-1.5"><input type="checkbox" className="accent-accento" checked={paginaPerUfficio} onChange={(e) => setPaginaPerUfficio(e.target.checked)} /> Un ufficio per pagina</label>}
      </Barra>
      <div className="pagina-stampa ombra-md mx-auto my-8 max-w-[794px] bg-white px-6 py-8 text-sm md:px-[44px] print:my-0">
        <Intestazione kicker="Fatture fornitori" titolo={titolo}
          sotto={tipo === 'responsabile' ? `${scelti.length} uffici` : scelti[0]?.responsabile ? `Responsabile: ${scelti[0].responsabile}` : undefined} />

        {/* Riepilogo */}
        <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
          {([['Da pagare', 'da_pagare'], ['Pagato', 'pagata']] as const).map(([t, st]) => (
            <div key={st} className="border border-divisore px-3 py-2">
              <div className="text-[10px] uppercase tracking-[0.08em]">{t}</div>
              <div className="num mt-0.5 font-titolo text-[20px] font-semibold leading-none">{formattaEuro(tot(tutte, st))}</div>
              <div className="mt-0.5">{tutte.filter((f) => statoSemplice(f) === st).length} fatture</div>
            </div>
          ))}
        </div>
        {tipo === 'responsabile' && scelti.length > 1 && (
          <table className="tabella-compatta mt-4 !text-[12.5px]">
            <thead><tr><th style={{ width: '1%' }}>Ufficio</th><th className="text-right">Da pagare</th><th className="text-right">Pagato</th></tr></thead>
            <tbody>
              {scelti.map((s) => { const ff = [...fatture.filter((f) => f.contribuente_id === s.id), ...royaltyDaRegistrare(s, fatture, oggi)]; return (
                <tr key={s.id}><td className="whitespace-nowrap pr-6 font-medium">{s.nome}</td>
                  <td className="num text-right">{formattaEuro(tot(ff, 'da_pagare'))}</td><td className="num text-right">{formattaEuro(tot(ff, 'pagata'))}</td></tr>
              ) })}
            </tbody>
          </table>
        )}

        {/* Dettaglio per ufficio (nel gruppo, gli uffici senza fatture da mostrare vanno su una riga sola) */}
        {tipo === 'responsabile' && scelti.some((s) => delle(s).length === 0) && (
          <p className="mt-4 text-[12px] text-neutro-700">
            {anchePagate ? 'Senza fatture' : 'Nessuna fattura da pagare'}: {scelti.filter((s) => delle(s).length === 0).map((s) => s.nome).join(', ')}.
          </p>
        )}
        {scelti.filter((s) => tipo !== 'responsabile' || delle(s).length > 0).map((s, i) => {
          const ff = delle(s)
          return (
            <section key={s.id} className={`mt-6 ${paginaPerUfficio && i > 0 ? 'interrompi-prima' : ''}`}>
              <div className="mb-1 flex items-baseline justify-between border-b border-divisore pb-1">
                <b className="text-[15px]">{s.nome}</b>
                <span className="text-[12px]">Da pagare <b>{formattaEuro(tot(ff, 'da_pagare'))}</b></span>
              </div>
              {ff.length === 0 ? <p className="text-[12px] text-neutro-700">{anchePagate ? 'Nessuna fattura.' : 'Nessuna fattura da pagare.'}</p> : (
                <table className="tabella-compatta !text-[12.5px]">
                  <thead><tr><th style={{ width: '1%' }}>Fornitore</th><th style={{ width: '1%' }}>Tipologia</th><th>N. fattura</th><th>Data</th><th>Scadenza</th><th className="text-right">Importo</th><th style={{ width: '1%' }}>Stato</th></tr></thead>
                  <tbody>
                    {ff.map((f) => (
                      <tr key={f.id}>
                        <td className="whitespace-nowrap pr-4 font-medium">{f.fornitore}</td>
                        <td className="whitespace-nowrap pr-4">{f.tipologia ? etichettaDi(TIPOLOGIE_SPESA, f.tipologia) : '—'}{f.tipologia === 'royalty' && f.competenza ? ` ${f.competenza.slice(5)}/${f.competenza.slice(2, 4)}` : ''}</td>
                        <td>{f.numero || '—'}</td>
                        <td className="num">{formattaData(f.data_fattura)}</td>
                        <td className="num">{formattaData(scadenzaFattura(f))}</td>
                        <td className="num whitespace-nowrap text-right font-semibold">{formattaEuro(f.importo_cent)}</td>
                        <td className="whitespace-nowrap"><span className={`tag tag-${ETICHETTE_STATO[statoSemplice(f)].tono}`}>{ETICHETTE_STATO[statoSemplice(f)].testo}{f.pagata && f.pagata_il ? ` ${formattaData(f.pagata_il)}` : ''}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          )
        })}
        {scelti.length === 0 && <p className="mt-6">Nessun ufficio da stampare.</p>}
      </div>
    </div>
  )
}

/* ---------------------------- royalty: elenco per ufficio delle mensilità da pagare ---------------------------- */

const MESI_BREVI = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic']
const meseBreve = (m: string) => `${MESI_BREVI[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`

/**
 * Per ogni ufficio le mensilità ancora da pagare (anche degli anni precedenti, dal primo importo impostato) fino a
 * dicembre dell'anno scelto, tutte come "da pagare" senza distinguere le insolute, con n. e data della fattura (servono per la causale).
 * I mesi pagati non compaiono; gli uffici in regola stanno su una riga in fondo.
 */
export function StampaRoyalty() {
  const { fornitore = 'tutte', anno: annoTesto } = useParams()
  // "tutte": Tecnocasa e Tecnomedia nella stessa stampa
  const fornitori: string[] = fornitore === 'tutte' ? [...FORNITORI_ROYALTY] : [fornitore]
  const [cerca] = useSearchParams()
  const { dati, caricamento } = useCollezioni(['contribuenti', 'fatture_fornitori'])
  const oggi = oggiIso()
  const meseCorrente = oggi.slice(0, 7)
  const anno = Number(annoTesto) || Number(oggi.slice(0, 4))
  const responsabile = cerca.get('responsabile') ?? ''
  const ufficio = cerca.get('ufficio') ?? ''
  const fatture = attivi(dati<FatturaFornitore>('fatture_fornitori'))
  const studi = attivi(dati<Contribuente>('contribuenti')).filter((s) => studioInFornitori(s) && fornitori.some((f) => pagaRoyalty(s, f)))
    .filter((s) => (!responsabile || s.responsabile === responsabile) && (!ufficio || s.id === ufficio))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'it'))
  if (caricamento && !studi.length) return <div className="p-10"><Caricamento /></div>

  const fine = `${anno}-12`
  const meseDopo = (m: string) => (m.slice(5) === '12' ? `${Number(m.slice(0, 4)) + 1}-01` : `${m.slice(0, 5)}${String(Number(m.slice(5)) + 1).padStart(2, '0')}`)
  const blocchi = studi.map((s) => {
    const righe = fornitori.filter((f) => pagaRoyalty(s, f)).flatMap((f) => {
      const primo = storicoTariffe(s, f)[0]?.dal
      const mesi: string[] = []
      // dal primo importo (o da gennaio dell'anno) fino a dicembre
      for (let m = primo && primo < `${anno}-01` ? primo : `${anno}-01`; m <= fine; m = meseDopo(m)) mesi.push(m)
      return mesi.map((x) => ({ fornitore: f, mese: x, ...mensilita(s, f, x, fatture, oggi) }))
        .filter((r) => r.stato && r.stato !== 'pagata' && (r.stato === 'insoluta' || r.mese.startsWith(String(anno)) || r.mese >= meseCorrente))
    }).sort((a, b) => a.mese.localeCompare(b.mese) || a.fornitore.localeCompare(b.fornitore))
    const impostato = fornitori.some((f) => pagaRoyalty(s, f) && storicoTariffe(s, f).length > 0)
    const somma = (rr: typeof righe) => rr.reduce((t, r) => t + (r.importo_cent ?? 0), 0)
    return {
      s, righe, totale: somma(righe), impostato,
      perFornitore: fornitori.map((f) => ({ f, t: somma(righe.filter((r) => r.fornitore === f)) })).filter((x) => x.t > 0),
    }
  })
  const daMostrare = blocchi.filter((b) => b.righe.length > 0)
  const inRegola = blocchi.filter((b) => b.impostato && b.righe.length === 0)
  const senzaImporto = blocchi.filter((b) => !b.impostato && b.righe.length === 0)
  const totale = daMostrare.reduce((t, b) => t + b.totale, 0)
  const totFornitore = (f: string) => daMostrare.reduce((t, b) => t + (b.perFornitore.find((x) => x.f === f)?.t ?? 0), 0)

  return (
    <div className="min-h-screen bg-sfondo print:bg-white" style={COLORI_STAMPA}>
      <style>{'@media print { @page { size: A4 portrait; margin: 10mm; } }'}</style>
      <Barra indietro={`/fornitori?${new URLSearchParams({ scheda: 'royalty', anno: String(anno), ...(responsabile ? { responsabile } : {}), ...(ufficio ? { ufficio } : {}) }).toString()}`} />
      <div className="pagina-stampa ombra-md mx-auto my-8 max-w-[794px] bg-white px-6 py-7 text-sm md:px-10 print:my-0">
        <Intestazione kicker={`Royalty ${fornitori.join(' e ')}`} titolo={`Da pagare · ${anno}`}
          sotto={[responsabile && `Responsabile: ${responsabile}`, ufficio && studi[0]?.nome, 'mensilità non pagate fino a dicembre'].filter(Boolean).join(' · ')} />
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 border-b border-divisore pb-2 text-[13px]">
          <span>{daMostrare.length} uffici con importi da pagare</span>
          <span>Totale da pagare fino a dicembre <b>{formattaEuro(totale)}</b>{fornitori.length > 1 && <span className="text-neutro-700"> ({fornitori.map((f) => `${f} ${formattaEuro(totFornitore(f))}`).join(' · ')})</span>}</span>
        </div>

        {daMostrare.map(({ s, righe, totale: t, perFornitore }) => (
          <section key={s.id} className="mt-4" style={{ breakInside: 'avoid' }}>
            <div className="flex items-baseline justify-between gap-3 border-b border-testo pb-0.5">
              <span><b className="text-[14px] uppercase tracking-[0.02em]">{s.nome}</b>{s.responsabile && <span className="ml-2 text-[12px] text-neutro-700">{s.responsabile}</span>}</span>
              <span className="text-[12.5px]">
                Da pagare <b>{formattaEuro(t)}</b>
                {fornitori.length > 1 && perFornitore.length > 1 && <span className="block text-right text-[11px] text-neutro-700">({perFornitore.map((x) => `${x.f} ${formattaEuro(x.t)}`).join(' · ')})</span>}
              </span>
            </div>
            <table className="w-full border-collapse text-[12.5px]">
              <thead>
                <tr className="text-[10px] uppercase tracking-[0.06em] text-attenuato">
                  <th className="py-0.5 pr-3 text-left font-medium" style={{ width: '11%' }}>Mese</th>
                  {fornitori.length > 1 && <th className="py-0.5 pr-3 text-left font-medium" style={{ width: '15%' }}>Royalty</th>}
                  <th className="py-0.5 pr-3 text-left font-medium" style={{ width: '20%' }}>N. fattura</th>
                  <th className="py-0.5 pr-3 text-left font-medium" style={{ width: '17%' }}>Data fattura</th>
                  <th className="py-0.5 pr-3 text-right font-medium" style={{ width: '19%' }}>Importo</th>
                  <th className="py-0.5 text-left font-medium">Stato</th>
                </tr>
              </thead>
              <tbody>
                {righe.map((r) => (
                  <tr key={`${r.fornitore}-${r.mese}`} className="border-t border-riga">
                    <td className="py-[3px] pr-3 font-medium">{meseBreve(r.mese)}</td>
                    {fornitori.length > 1 && <td className="py-[3px] pr-3">{r.fornitore}</td>}
                    <td className="py-[3px] pr-3">{r.fatture[0]?.numero || '—'}</td>
                    <td className="num py-[3px] pr-3">{r.fatture[0]?.data_fattura ? formattaData(r.fatture[0].data_fattura) : '—'}</td>
                    <td className="num py-[3px] pr-3 text-right font-semibold">{formattaEuro(r.importo_cent)}</td>
                    <td className="py-[3px] text-[12px]">da pagare</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}

        {daMostrare.length === 0 && <p className="mt-6">Nessuna mensilità da pagare.</p>}
        {inRegola.length > 0 && <p className="mt-5 text-[12px] text-neutro-700"><b>In regola</b> (nessuna mensilità da pagare): {inRegola.map((b) => b.s.nome).join(', ')}.</p>}
        {senzaImporto.length > 0 && <p className="mt-1.5 text-[12px] text-neutro-700"><b>Importo mensile non impostato</b>: {senzaImporto.map((b) => b.s.nome).join(', ')}.</p>}
      </div>
    </div>
  )
}
