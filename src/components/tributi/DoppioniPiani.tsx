/**
 * "Trova piani doppi": stesso rateizzo inserito due volte (es. dall'Excel e dal PDF). Per ogni gruppo si sceglie la
 * versione da tenere (proposta: quella dal PDF, più precisa); le rate segnate pagate nelle altre versioni passano a
 * quella tenuta, le altre vengono eliminate (eliminazione "soft", restano nella storia delle modifiche).
 */
import { useState } from 'react'
import { useSessioneAttiva } from '../../lib/sessione'
import { aggiorna, campiModifica } from '../../lib/store'
import type { Contribuente, PraticaTributo } from '../../lib/tipi'
import { daPdf, importoDelPiano, trovaDoppioni, unisciPiani } from '../../lib/tributi'
import { formattaData, formattaEuro } from '../../lib/utils/formato'
import { Avviso, Bottone, Etichetta, Vuoto } from '../ui'

export default function DoppioniPiani({ pratiche, contribuenti }: { pratiche: PraticaTributo[]; contribuenti: Contribuente[] }) {
  const { token, nome } = useSessioneAttiva()
  const gruppi = trovaDoppioni(pratiche)
  // Versione da tenere per ogni gruppo (chiave: id della proposta)
  const [scelte, setScelte] = useState<Record<string, string>>({})
  const [inCorso, setInCorso] = useState(false)
  const [esito, setEsito] = useState<{ tipo: 'ok' | 'errore'; testo: string } | null>(null)
  const nomeDi = (id: string) => contribuenti.find((c) => c.id === id)?.nome ?? '—'

  const versioni = (g: (typeof gruppi)[number]) => [pratiche.find((p) => p.id === g.tieni.id)!, ...g.togli]
  const tenuta = (g: (typeof gruppi)[number]) => scelte[g.tieni.id] ?? g.tieni.id

  async function unisci(elenco: typeof gruppi) {
    setEsito(null); setInCorso(true)
    const modifiche = new Map<string, PraticaTributo>()
    const da = new Date().toISOString()
    for (const g of elenco) {
      const tutte = versioni(g)
      const tieni = tutte.find((p) => p.id === tenuta(g))!
      const altre = tutte.filter((p) => p.id !== tieni.id)
      modifiche.set(tieni.id, { ...unisciPiani(tieni, altre), ...campiModifica(nome) })
      for (const a of altre) modifiche.set(a.id, { ...a, eliminato_il: da, note: [a.note, `Doppione di "${tieni.tributo}": unito il ${formattaData(da)}.`].filter(Boolean).join(' '), ...campiModifica(nome) })
    }
    try {
      await aggiorna<PraticaTributo>(token, 'pratiche_tributi', (rec) => rec.map((p) => modifiche.get(p.id) ?? p),
        `${nome}: unisce ${elenco.length} ${elenco.length === 1 ? 'piano doppio' : 'piani doppi'}`)
      setEsito({ tipo: 'ok', testo: `Uniti ${elenco.length} ${elenco.length === 1 ? 'gruppo' : 'gruppi'}: tenuta una versione per ciascuno, con le rate già pagate.` })
      setScelte({})
    } catch (e) { setEsito({ tipo: 'errore', testo: (e as Error).message }) } finally { setInCorso(false) }
  }

  if (gruppi.length === 0) return <>{esito && <div className="mb-4"><Avviso tipo={esito.tipo}>{esito.testo}</Avviso></div>}<Vuoto>Nessun piano doppio trovato.</Vuoto></>

  return (
    <div className="text-sm">
      <p className="mb-4 text-neutro-700">
        Piani che risultano inseriti più volte: stessa società, stesso importo (a meno di qualche centesimo) e stesso numero di rate o stessa
        prima scadenza. Per ognuno scegli la versione da tenere (proposta: quella <b>dal PDF</b>, più precisa). Le rate segnate pagate nelle
        altre versioni passano a quella tenuta; le altre vengono eliminate.
      </p>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <span className="text-neutro-700">{gruppi.length} {gruppi.length === 1 ? 'gruppo' : 'gruppi'} di piani doppi</span>
        <Bottone disabled={inCorso} onClick={() => unisci(gruppi)}>{inCorso ? 'Unione…' : `Unisci tutti (${gruppi.length})`}</Bottone>
      </div>
      {esito && <div className="mb-4"><Avviso tipo={esito.tipo}>{esito.testo}</Avviso></div>}
      <div className="flex flex-col gap-4">
        {gruppi.map((g) => (
          <div key={g.tieni.id} className="border border-divisore p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <b>{nomeDi(g.tieni.contribuente_id)}</b>
              <Bottone variante="secondario" piccolo disabled={inCorso} onClick={() => unisci([g])}>Unisci questo</Bottone>
            </div>
            {versioni(g).map((p) => (
              <label key={p.id} className="radio flex-wrap !items-start py-1">
                <input type="radio" name={`g-${g.tieni.id}`} checked={tenuta(g) === p.id} onChange={() => setScelte((s) => ({ ...s, [g.tieni.id]: p.id }))} />
                <span className="dot mt-0.5" />
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{p.tributo}</span>{' '}
                  <Etichetta tono={daPdf(p) ? 'verde' : 'grigio'}>{daPdf(p) ? 'dal PDF' : 'dall\'Excel'}</Etichetta>
                  <span className="block text-[12px] text-neutro-700">
                    {p.rate.length} rate · {formattaEuro(importoDelPiano(p))} · prima rata {formattaData(p.rate[0]?.scadenza)} · {p.rate.filter((r) => r.pagata).length} pagate
                    {p.anno_rateizzo ? ` · anno ${p.anno_rateizzo}` : ''}
                  </span>
                </span>
              </label>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
