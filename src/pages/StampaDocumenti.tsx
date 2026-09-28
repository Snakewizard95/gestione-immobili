/**
 * Fogli A4 stampabili (da salvare in PDF con "Stampa → Salva come PDF"):
 * - prospetto di compilazione dell'F24 Elide per l'imposta di registro (con ravvedimento);
 * - lettera di aumento ISTAT al conduttore.
 * La data (pagamento o lettera) arriva nell'indirizzo: ...?data=AAAA-MM-GG
 */
import type { ReactNode } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Printer } from 'lucide-react'
import { useDatiDocumenti } from '../components/Documenti'
import { Avviso, Bottone, Caricamento } from '../components/ui'
import logo from '../assets/logo-gruppo.png'
import { preparaF24, preparaLetteraIstat } from '../lib/documenti'
import { inCedolare } from '../lib/tipi'
import { formattaData, formattaEuro, oggiIso } from '../lib/utils/formato'

function Foglio({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  return (
    <div className="min-h-screen bg-sfondo print:bg-white">
      <div className="no-stampa sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-divisore bg-sfondo px-6 py-3">
        <button onClick={() => navigate(-1)} className="btn btn-ghost"><ArrowLeft size={16} /> Indietro</button>
        <Bottone className="ml-auto" onClick={() => window.print()}><Printer size={16} /> Stampa / salva PDF</Bottone>
      </div>
      <div className="pagina-stampa ombra-md mx-auto my-8 max-w-[794px] bg-white px-6 py-10 text-sm md:px-[60px] md:py-14 print:my-0">{children}</div>
    </div>
  )
}

/** Casella con etichetta piccola, come nei riquadri del modello F24. */
function Casella({ etichetta, valore, className = '' }: { etichetta: string; valore: ReactNode; className?: string }) {
  return (
    <div className={`border border-testo px-2 py-1 ${className}`}>
      <div className="text-[9px] uppercase tracking-[0.08em] text-neutro-700">{etichetta}</div>
      <div className="num min-h-5 font-medium">{valore}</div>
    </div>
  )
}

export function StampaF24() {
  const { id = '' } = useParams()
  const [parametri] = useSearchParams()
  const pagamento = parametri.get('data') || oggiIso()
  const d = useDatiDocumenti()
  const ctx = d.contesto(id)
  if (!ctx) return <Foglio>{d.caricamento ? <Caricamento /> : <Avviso tipo="errore">Annualità non trovata.</Avviso>}</Foglio>
  if (inCedolare(ctx.contratto)) return <Foglio><Avviso tipo="ok">Contratto in cedolare secca: l'imposta di registro non è dovuta, non serve alcun F24.</Avviso></Foglio>
  const f = preparaF24(ctx, pagamento, d.tassi)
  const r = f.ravvedimento

  return (
    <Foglio>
      <header className="mb-6 flex items-start justify-between gap-6 border-b-2 border-testo pb-4">
        <div>
          <div className="kicker">Prospetto di compilazione · F24 Elide</div>
          <h1 className="mt-1 text-[30px]">Imposta di registro · annualità {ctx.annualita.anno}</h1>
          <div className="mt-1 text-neutro-700">{ctx.immobile?.indirizzo} · conduttore {ctx.conduttore?.denominazione}</div>
        </div>
        <img src={logo} alt="" className="h-11 w-[170px] flex-none object-cover" />
      </header>

      {f.mancanti.length > 0 && <div className="mb-5"><Avviso tipo="attenzione">Dati mancanti: {f.mancanti.join('; ')}.</Avviso></div>}

      <div className="mb-1 text-[10px] uppercase tracking-[0.14em] text-accento-700">Contribuente</div>
      <div className="mb-2 grid grid-cols-[1fr_2fr] gap-1">
        <Casella etichetta="Codice fiscale" valore={f.contribuente.codiceFiscale} />
        <Casella etichetta="Denominazione / ragione sociale" valore={f.contribuente.denominazione} />
      </div>
      <Casella className="mb-2" etichetta="Domicilio fiscale" valore={f.contribuente.domicilio} />
      <div className="mb-6 grid grid-cols-[2fr_1fr] gap-1">
        <Casella etichetta="Codice fiscale / P. IVA del coobbligato (conduttore)" valore={f.secondoCodiceFiscale} />
        <Casella etichetta="Codice identificativo (63 = controparte)" valore={f.codiceIdentificativo} />
      </div>

      <div className="mb-1 text-[10px] uppercase tracking-[0.14em] text-accento-700">Erario ed altro</div>
      <table className="mb-2 w-full border-collapse text-[12.5px]">
        <thead><tr className="text-left text-[9px] uppercase tracking-[0.08em] text-neutro-700">
          {['Tipo', 'Elementi identificativi', 'Codice', 'Anno di riferimento', 'Importi a debito versati'].map((h) => <th key={h} className="border border-testo px-2 py-1 font-medium">{h}</th>)}
        </tr></thead>
        <tbody>
          {f.righe.map((x) => (
            <tr key={x.codice}>
              <td className="border border-testo px-2 py-1.5 text-center">{x.tipo}</td>
              <td className="num border border-testo px-2 py-1.5">{x.elementi}</td>
              <td className="num border border-testo px-2 py-1.5 font-medium">{x.codice}</td>
              <td className="num border border-testo px-2 py-1.5">{x.anno}</td>
              <td className="num border border-testo px-2 py-1.5 text-right font-medium">{formattaEuro(x.importo_cent)}</td>
            </tr>
          ))}
          <tr><td colSpan={4} className="border border-testo px-2 py-1.5 text-right font-bold">SALDO FINALE</td><td className="num border border-testo px-2 py-1.5 text-right font-bold">{formattaEuro(r.totale_cent)}</td></tr>
        </tbody>
      </table>
      <p className="mb-6 text-xs text-neutro-700">Codice ufficio e codice atto: lasciare vuoti quando è indicato il codice identificativo del contratto.</p>

      <div className="border-t border-divisore pt-4 text-[12.5px]">
        <div className="mb-2 text-[10px] uppercase tracking-[0.14em] text-accento-700">Dettaglio del calcolo</div>
        <p>Inizio annualità {formattaData(ctx.annualita.data_inizio)} · scadenza del versamento {formattaData(r.scadenza)} · data di pagamento {formattaData(r.pagamento)}.</p>
        {r.giorniRitardo === 0 ? <p>Pagamento nei termini: nessuna sanzione e nessun interesse.</p> : (
          <>
            <p>Ritardo di {r.giorniRitardo} giorni. {r.fascia.descrizione}: sanzione del {r.fascia.percentuale.toLocaleString('it-IT', { maximumFractionDigits: 4 })}% su {formattaEuro(r.imposta_cent)} = {formattaEuro(r.sanzione_cent)}.</p>
            <p>Interessi al tasso legale: {r.dettaglioInteressi.map((q) => `${q.anno} ${q.giorni} giorni al ${q.tasso.toLocaleString('it-IT')}% = ${formattaEuro(q.interessi_cent)}`).join('; ')}.</p>
          </>
        )}
        <p className="mt-4 text-[10px] text-neutro-600">Prospetto generato da Gestione Immobili: non è il modello ufficiale. Riportare i dati nel modello F24 Elide (home banking o intermediario). Calcolo indicativo da verificare con il commercialista.</p>
      </div>
    </Foglio>
  )
}

export function StampaLetteraIstat() {
  const { id = '' } = useParams()
  const [parametri] = useSearchParams()
  const data = parametri.get('data') || oggiIso()
  const d = useDatiDocumenti()
  const ctx = d.contesto(id)
  if (!ctx) return <Foglio>{d.caricamento ? <Caricamento /> : <Avviso tipo="errore">Annualità non trovata.</Avviso>}</Foglio>
  if (inCedolare(ctx.contratto)) return <Foglio><Avviso tipo="info">Contratto in cedolare secca: l'aggiornamento ISTAT non si applica, non serve alcuna lettera.</Avviso></Foglio>
  const l = preparaLetteraIstat(ctx)
  const [saluto, ...corpo] = l.paragrafi

  return (
    <Foglio>
      <header className="mb-10 flex items-start justify-between gap-6 border-b-2 border-testo pb-4">
        <div>
          {l.mittente.map((m, i) => <div key={i} className={i === 0 ? 'font-titolo text-2xl font-semibold' : 'text-[13px] text-neutro-700'}>{m}</div>)}
        </div>
        <img src={logo} alt="" className="h-11 w-[170px] flex-none object-cover" />
      </header>

      <div className="mb-8 ml-auto w-fit min-w-[240px] text-[14px] leading-relaxed">
        {l.destinatario.map((r, i) => <div key={i} className={i === 0 ? 'font-medium' : ''}>{r}</div>)}
        {l.pecConduttore && <div className="text-[13px] text-neutro-700">PEC: {l.pecConduttore}</div>}
      </div>

      <p className="mb-6 text-[14px]">{formattaData(data)}</p>
      <p className="mb-6 text-[14px]"><strong>Oggetto: {l.oggetto}</strong></p>

      <div className="space-y-4 text-[14px] leading-relaxed">
        <p>{saluto}</p>
        {corpo.map((p, i) => <p key={i}>{p}</p>)}
        <table className="my-2 w-full max-w-[460px] border-collapse text-[13.5px]">
          <tbody>{l.voci.map(([t, v]) => (
            <tr key={t} className="border-b border-riga"><td className="py-1.5 pr-4">{t}</td><td className="num py-1.5 text-right font-medium">{v}</td></tr>
          ))}</tbody>
        </table>
        {l.chiusura.map((p, i) => <p key={i}>{p}</p>)}
        <p className="pt-2">Distinti saluti.</p>
      </div>

      <div className="mt-14 ml-auto w-64 text-center text-[14px]">
        <div>{l.mittente[0]}</div>
        <div className="mt-12 border-t border-testo pt-1 text-xs text-neutro-700">firma</div>
      </div>
    </Foglio>
  )
}
