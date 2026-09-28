/**
 * Fogli A4 stampabili  (da salvare in PDF con "Stampa → Salva come PDF"):
 * - lettera di aumento ISTAT al conduttore.
 * La data (pagamento o lettera) arriva nell'indirizzo: ...?data=AAAA-MM-GG
 */
import type { ReactNode } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Printer } from 'lucide-react'
import { useDatiDocumenti } from '../components/Documenti'
import { Avviso, Bottone, Caricamento } from '../components/ui'
import logo from '../assets/logo-gruppo.png'
import { preparaLetteraIstat } from '../lib/documenti'
import { inCedolare } from '../lib/tipi'
import { formattaData, oggiIso } from '../lib/utils/formato'

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
