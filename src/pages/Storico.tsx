/**
 * Storico modifiche: ogni salvataggio è un commit nel repository dati.
 * Le modifiche sono raggruppate per giorno e filtrabili per persona (filtro solo nell'app, sul campo "autore").
 */
import { useEffect, useState } from 'react'
import { Avviso, Caricamento, IntestazionePagina, Riquadro, Segmentato, Vuoto } from '../components/ui'
import { listaCommit, type Commit } from '../lib/github'
import { UTENTI } from '../lib/permessi'
import { useSessioneAttiva } from '../lib/sessione'

/** Chiave del giorno in ora locale (AAAA-MM-GG) */
const giornoDi = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

function etichettaGiorno(giorno: string): { titolo: string; data: string } {
  const d = new Date(giorno + 'T12:00:00')
  const oggi = giornoDi(new Date().toISOString())
  const ieri = giornoDi(new Date(Date.now() - 86_400_000).toISOString())
  const data = d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })
  if (giorno === oggi) return { titolo: 'Oggi', data }
  if (giorno === ieri) return { titolo: 'Ieri', data }
  const nomeGiorno = d.toLocaleDateString('it-IT', { weekday: 'long' })
  return { titolo: nomeGiorno.charAt(0).toUpperCase() + nomeGiorno.slice(1), data }
}

/**
 * Con il token unico, l'autore GitHub è sempre lo stesso account: la persona vera è scritta
 * all'inizio del messaggio ("Emanuela: nuovo incasso…"). Se il prefisso è un utente noto lo usiamo.
 */
function persona(c: Commit): { chi: string; cosa: string } {
  const riga = c.messaggio.split('\n')[0]
  const i = riga.indexOf(':')
  const prefisso = i > 0 ? riga.slice(0, i).trim() : ''
  if (prefisso && UTENTI.some((u) => u.nome.toLowerCase() === prefisso.toLowerCase())) return { chi: prefisso, cosa: riga.slice(i + 1).trim() }
  return { chi: c.autore, cosa: riga }
}

export default function PaginaStorico() {
  const { token } = useSessioneAttiva()
  const [commit, setCommit] = useState<Commit[] | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [filtro, setFiltro] = useState('tutti')

  useEffect(() => {
    listaCommit(token, undefined, 100).then(setCommit).catch((e) => setErrore((e as Error).message))
  }, [token])

  const nomePersona = UTENTI.find((u) => u.id === filtro)?.nome
  const filtrati = (commit ?? []).filter((c) => filtro === 'tutti' || persona(c).chi.toLowerCase() === nomePersona?.toLowerCase())
  const perGiorno = new Map<string, Commit[]>()
  for (const c of filtrati) { const g = giornoDi(c.data); perGiorno.set(g, [...(perGiorno.get(g) ?? []), c]) }

  return (
    <div>
      <IntestazionePagina kicker="Strumenti" titolo="Storico modifiche" sottotitolo="Ogni salvataggio è registrato con nome, data e descrizione. Nulla viene mai perso."
        azioni={<Segmentato valore={filtro} onChange={setFiltro} opzioni={[{ valore: 'tutti', etichetta: 'Tutti' }, ...UTENTI.map((u) => ({ valore: u.id, etichetta: u.nome }))]} />} />
      {errore && <div className="mb-4"><Avviso tipo="errore">{errore}</Avviso></div>}
      {!commit && !errore ? <Caricamento /> : commit && (
        perGiorno.size === 0 ? <Vuoto>{commit.length === 0 ? 'Nessuna modifica registrata finora.' : 'Nessuna modifica di questa persona tra le ultime 100.'}</Vuoto> : (
          <div className="flex flex-col gap-8">
            {[...perGiorno.entries()].map(([giorno, lista]) => {
              const e = etichettaGiorno(giorno)
              return (
                <div key={giorno} className="grid gap-3 md:grid-cols-[140px_1fr]">
                  <div>
                    <div className="font-titolo text-[22px] font-semibold leading-tight">{e.titolo}</div>
                    <div className="text-xs text-neutro-700">{e.data}</div>
                  </div>
                  <Riquadro>
                    {lista.map((c, i) => (
                      <div key={c.sha} className={`grid grid-cols-[56px_90px_1fr] items-baseline gap-2 px-4 py-3 text-sm ${i < lista.length - 1 ? 'border-b border-divisore' : ''}`}>
                        <span className="num text-neutro-700">{new Date(c.data).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}</span>
                        <span className="truncate font-medium">{persona(c).chi}</span>
                        <span className="min-w-0">{persona(c).cosa}</span>
                      </div>
                    ))}
                  </Riquadro>
                </div>
              )
            })}
          </div>
        )
      )}
    </div>
  )
}
