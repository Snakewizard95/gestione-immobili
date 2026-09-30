/**
 * Impostazioni → Spazio occupato: quanto spazio usa il repository dati (o il browser in modalità prova), come è
 * suddiviso (allegati per sezione, dati, storia) e quanto ne resta; pannello "Libera spazio" per scaricare in ZIP
 * e poi rimuovere gli allegati scelti. Su GitHub i file rimossi restano nella storia finché non si fa la
 * compattazione (docs/LIMITI_E_BACKUP.md): l'elenco dei file da compattare si scarica da qui.
 */
import { useEffect, useState } from 'react'
import { Archive, Download, HardDrive, Trash2 } from 'lucide-react'
import { zipSync } from 'fflate'
import { COLLEZIONI } from '../lib/backup'
import { MODO_DEMO, eliminaFile, scaricaAllegato, spazioRepository, type SpazioOccupato as Spazio } from '../lib/github'
import { useSessioneAttiva } from '../lib/sessione'
import { aggiorna, attivi, campiModifica, inCache, type NomeCollezione } from '../lib/store'
import type { Allegato, Contribuente, PraticaTributo } from '../lib/tipi'
import { statoEffettivo } from '../lib/tributi'
import { useCollezioni } from '../lib/useCollezioni'
import { formattaByte, formattaData } from '../lib/utils/formato'
import { Avviso, Bottone, Finestra, Riquadro } from './ui'

const SEZIONI: Record<string, string> = {
  contratti: 'Contratti', annualita: 'ISTAT e registro', immobili: 'Immobili', voci_condominiali: 'Condominio', piani_rientro: 'Condominio',
  pratiche_tributi: 'Tributi rateizzati', comunicazioni: 'Documenti',
}
const sezioneDi = (a: Allegato) => SEZIONI[a.collezione] ?? 'Altro'
const MB = 1024 * 1024
const LIMITE_ZIP = 300 * MB

function Barra({ usato, limite }: { usato: number; limite: number }) {
  const perc = Math.min(100, (usato / limite) * 100)
  const colore = perc >= 85 ? 'bg-err-testo' : perc >= 60 ? 'bg-att-bordo' : 'bg-accento-700'
  return (
    <div className="relative h-4 border border-divisore bg-sfondo">
      <div className={`h-full ${colore}`} style={{ width: `${Math.max(perc, 0.5)}%` }} />
    </div>
  )
}

export default function SpazioOccupato() {
  const { token, nome } = useSessioneAttiva()
  const { dati, caricamento } = useCollezioni(COLLEZIONI)
  const [spazio, setSpazio] = useState<Spazio | null>(null)
  const [erroreSpazio, setErroreSpazio] = useState<string | null>(null)
  const [aperto, setAperto] = useState(false)

  useEffect(() => { spazioRepository(token).then(setSpazio).catch((e) => setErroreSpazio((e as Error).message)) }, [token, aperto])

  const tutti = dati<Allegato>('allegati')
  const presenti = attivi(tutti)
  const eliminati = tutti.filter((a) => a.eliminato_il)
  const somma = (xs: Allegato[]) => xs.reduce((s, a) => s + (a.dimensione_byte || 0), 0)
  const perSezione = [...new Set(presenti.map(sezioneDi))].map((s) => ({ s, n: presenti.filter((a) => sezioneDi(a) === s).length, b: somma(presenti.filter((a) => sezioneDi(a) === s)) })).sort((a, b) => b.b - a.b)
  const datiByte = COLLEZIONI.filter((c) => c !== 'allegati').reduce((s, c) => s + JSON.stringify(inCache(c as NomeCollezione)).length, 0)
  const media = presenti.length ? somma(presenti) / presenti.length : 600 * 1024

  const usato = spazio?.usato_byte ?? 0
  const limite = spazio?.limite_byte ?? 1
  const liberi = Math.max(0, limite - usato)
  const storia = spazio?.fonte === 'github' ? Math.max(0, usato - somma(presenti) - datiByte) : 0

  return (
    <Riquadro className="px-[22px] py-5 text-sm">
      <h4 className="mb-2 flex items-center gap-2"><HardDrive size={18} /> Spazio occupato</h4>
      {erroreSpazio && <Avviso tipo="errore">Impossibile leggere lo spazio: {erroreSpazio}</Avviso>}
      {!spazio && !erroreSpazio && <p className="text-neutro-700">Lettura in corso…</p>}
      {spazio && (
        <>
          <p className="mb-3 text-neutro-700">
            {spazio.fonte === 'browser'
              ? 'Modalità prova: i dati e gli allegati stanno nel browser, che concede circa 5 MB per sito.'
              : 'Repository dati su GitHub. GitHub consiglia di restare sotto 1 GB (il massimo pratico è 5 GB); il valore comprende tutta la storia delle modifiche e si aggiorna con qualche ora di ritardo.'}
          </p>
          <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2">
            <span><b className="num text-[18px]">{formattaByte(usato)}</b> <span className="text-neutro-700">usati su {formattaByte(limite)}{spazio.fonte === 'github' ? ' consigliati' : ''}</span></span>
            <span className="num text-neutro-700">{Math.round((usato / limite) * 100)}%</span>
          </div>
          <Barra usato={usato} limite={limite} />
          <p className="mt-2 text-neutro-700">
            Ancora disponibili <b className="text-testo">{formattaByte(liberi)}</b>
            {liberi > 0 && <> · circa {Math.floor(liberi / media).toLocaleString('it-IT')} documenti delle dimensioni medie attuali ({formattaByte(Math.round(media))})</>}
          </p>
          {usato / limite >= 0.85 && <div className="mt-3"><Avviso tipo="attenzione">Lo spazio sta per finire: usa "Libera spazio" e, su GitHub, fai la compattazione (vedi sotto).</Avviso></div>}

          <table className="tabella mt-4 !text-[13px]">
            <thead><tr><th className="!px-2">Cosa occupa lo spazio</th><th className="!px-2 text-right">File</th><th className="!px-2 text-right">Spazio</th></tr></thead>
            <tbody>
              {caricamento ? <tr><td className="!px-2" colSpan={3}>Caricamento…</td></tr> : <>
                {perSezione.map((x) => <tr key={x.s}><td className="!px-2">Allegati · {x.s}</td><td className="num !px-2 text-right">{x.n}</td><td className="num !px-2 text-right">{formattaByte(x.b)}</td></tr>)}
                {perSezione.length === 0 && <tr><td className="!px-2" colSpan={3}>Nessun allegato.</td></tr>}
                <tr><td className="!px-2">Dati (contratti, canoni, tributi…)</td><td className="!px-2" /><td className="num !px-2 text-right">{formattaByte(datiByte)}</td></tr>
                {spazio.fonte === 'github' && <tr><td className="!px-2">Storia delle modifiche e file eliminati{eliminati.length ? ` (${eliminati.length} allegati, ${formattaByte(somma(eliminati))})` : ''}</td><td className="!px-2" /><td className="num !px-2 text-right">{formattaByte(storia)}</td></tr>}
              </>}
            </tbody>
          </table>
          <Bottone variante="secondario" className="mt-4" onClick={() => setAperto(true)} disabled={caricamento}><Archive size={16} /> Libera spazio…</Bottone>
        </>
      )}
      <Finestra kicker="Impostazioni" titolo="Libera spazio" aperta={aperto} onChiudi={() => setAperto(false)} larga>
        {aperto && <LiberaSpazio token={token} nome={nome} allegati={presenti} eliminati={eliminati} pratiche={attivi(dati<PraticaTributo>('pratiche_tributi'))} contribuenti={attivi(dati<Contribuente>('contribuenti'))} />}
      </Finestra>
    </Riquadro>
  )
}

function LiberaSpazio({ token, nome, allegati, eliminati, pratiche, contribuenti }: { token: string; nome: string; allegati: Allegato[]; eliminati: Allegato[]; pratiche: PraticaTributo[]; contribuenti: Contribuente[] }) {
  const [sezione, setSezione] = useState('')
  const [soloEstinti, setSoloEstinti] = useState(false)
  const [primaDel, setPrimaDel] = useState('')
  const [scelti, setScelti] = useState<Set<string>>(new Set())
  const [zipFatto, setZipFatto] = useState<string>('')   // chiave della selezione già scaricata
  const [stato, setStato] = useState<string | null>(null)
  const [esito, setEsito] = useState<{ tipo: 'ok' | 'errore'; testo: string } | null>(null)

  const praticaDi = (a: Allegato) => (a.collezione === 'pratiche_tributi' ? pratiche.find((p) => p.id === a.record_id) : undefined)
  const descrizione = (a: Allegato) => {
    const p = praticaDi(a)
    if (!p) return sezioneDi(a)
    return `${contribuenti.find((c) => c.id === p.contribuente_id)?.nome ?? ''} · ${p.tributo}${statoEffettivo(p) === 'estinto' ? ' (estinto)' : ''}`
  }
  const anni = [...new Set(allegati.map((a) => a.creato_il.slice(0, 4)))].sort()
  const filtrati = allegati.filter((a) =>
    (!sezione || sezioneDi(a) === sezione) &&
    (!soloEstinti || (praticaDi(a) && statoEffettivo(praticaDi(a)!) === 'estinto')) &&
    (!primaDel || a.creato_il.slice(0, 4) < primaDel),
  ).sort((a, b) => b.dimensione_byte - a.dimensione_byte)
  const selezionati = allegati.filter((a) => scelti.has(a.id))
  const totaleScelti = selezionati.reduce((s, a) => s + a.dimensione_byte, 0)
  const chiaveSel = [...scelti].sort().join(',')

  const alterna = (id: string) => setScelti((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })

  async function scaricaZip() {
    setEsito(null)
    if (totaleScelti > LIMITE_ZIP) { setEsito({ tipo: 'errore', testo: `Selezione troppo grande per un solo ZIP (${formattaByte(totaleScelti)}): scegline meno di ${formattaByte(LIMITE_ZIP)} alla volta.` }); return }
    try {
      const file: Record<string, Uint8Array> = {}
      let i = 0
      for (const a of selezionati) {
        setStato(`Scaricamento ${++i} di ${selezionati.length}…`)
        const dati = new Uint8Array(await (await scaricaAllegato(token, a.percorso)).arrayBuffer())
        file[`${sezioneDi(a)}/${descrizione(a).replace(/[\\/:*?"<>|]/g, '-').replace(/ · /g, ' - ')}/${a.id.slice(0, 8)}-${a.nome_file}`] = dati
      }
      setStato('Creazione dello ZIP…')
      const zip = zipSync(file, { level: 0 })   // i PDF sono già compressi: niente ricompressione, più veloce
      const url = URL.createObjectURL(new Blob([zip], { type: 'application/zip' }))
      const l = document.createElement('a'); l.href = url; l.download = `allegati-archiviati-${new Date().toISOString().slice(0, 10)}.zip`; l.click()
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
      setZipFatto(chiaveSel)
      setEsito({ tipo: 'ok', testo: `ZIP scaricato con ${selezionati.length} file (${formattaByte(totaleScelti)}). Conservalo sul Mac prima di rimuovere i file.` })
    } catch (e) { setEsito({ tipo: 'errore', testo: 'Scaricamento non riuscito: ' + (e as Error).message }) } finally { setStato(null) }
  }

  async function rimuovi() {
    setEsito(null)
    const avviso = zipFatto === chiaveSel
      ? `Rimuovere ${selezionati.length} allegati (${formattaByte(totaleScelti)}) dalla piattaforma?`
      : `ATTENZIONE: non hai scaricato lo ZIP di questi ${selezionati.length} allegati. Rimuoverli comunque?`
    if (!window.confirm(avviso)) return
    const ids = new Set(selezionati.map((a) => a.id))
    try {
      setStato('Registrazione…')
      await aggiorna<Allegato>(token, 'allegati', (r) => r.map((x) => (ids.has(x.id) ? { ...x, eliminato_il: new Date().toISOString(), note: [x.note, 'Rimosso con "Libera spazio"'].filter(Boolean).join(' · '), ...campiModifica(nome) } : x)),
        `${nome}: libera spazio, rimuove ${selezionati.length} allegati`)
      let falliti = 0, i = 0
      for (const a of selezionati) {
        setStato(`Rimozione ${++i} di ${selezionati.length}…`)
        try { await eliminaFile(token, a.percorso, '', `${nome}: libera spazio, rimuove "${a.nome_file}"`) } catch { falliti++ }
      }
      setScelti(new Set())
      setEsito({ tipo: falliti ? 'errore' : 'ok', testo: `Rimossi ${selezionati.length - falliti} allegati (${formattaByte(totaleScelti)}).${falliti ? ` ${falliti} file non trovati nel repository (già rimossi).` : ''}${MODO_DEMO ? ' Lo spazio del browser è stato liberato.' : ' Su GitHub lo spazio si libera davvero dopo la compattazione (vedi sotto).'}` })
    } catch (e) { setEsito({ tipo: 'errore', testo: (e as Error).message }) } finally { setStato(null) }
  }

  function elencoCompattazione() {
    const righe = eliminati.map((a) => a.percorso).filter(Boolean)
    const url = URL.createObjectURL(new Blob([righe.join('\n') + '\n'], { type: 'text/plain' }))
    const l = document.createElement('a'); l.href = url; l.download = 'file-da-compattare.txt'; l.click()
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }

  const sezioni = [...new Set(allegati.map(sezioneDi))].sort()

  return (
    <div className="text-sm">
      <p className="mb-4 text-neutro-700">
        Scegli gli allegati da togliere (i più grandi sono in cima), <b>scaricali in uno ZIP</b> da conservare sul Mac e poi rimuovili.
        Le schede collegate restano: sparisce solo il documento allegato.
      </p>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <select value={sezione} onChange={(e) => setSezione(e.target.value)} className="input w-auto">
          <option value="">Tutte le sezioni</option>
          {sezioni.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={primaDel} onChange={(e) => setPrimaDel(e.target.value)} className="input w-auto">
          <option value="">Qualsiasi anno</option>
          {anni.slice(1).map((a) => <option key={a} value={a}>Caricati prima del {a}</option>)}
        </select>
        <label className="flex items-center gap-2"><input type="checkbox" className="accent-accento" checked={soloEstinti} onChange={(e) => setSoloEstinti(e.target.checked)} /> Solo piani tributi estinti</label>
      </div>
      <div className="mb-2 flex flex-wrap items-center gap-3 text-[13px]">
        <button type="button" className="text-accento-700 underline" onClick={() => setScelti(new Set(filtrati.map((a) => a.id)))}>Seleziona tutti quelli mostrati ({filtrati.length})</button>
        {scelti.size > 0 && <button type="button" className="text-accento-700 underline" onClick={() => setScelti(new Set())}>Deseleziona</button>}
        <span className="ml-auto text-neutro-700">Selezionati: <b>{selezionati.length}</b> · {formattaByte(totaleScelti)}</span>
      </div>
      <div className="max-h-[340px] overflow-y-auto border border-divisore">
        {filtrati.length === 0 ? <p className="px-4 py-6 text-center text-neutro-700">Nessun allegato con questi filtri.</p> : (
          <table className="tabella !text-[13px]">
            <tbody>
              {filtrati.map((a) => (
                <tr key={a.id} className="cliccabile" onClick={() => alterna(a.id)}>
                  <td className="!px-2 w-8"><input type="checkbox" className="accent-accento" checked={scelti.has(a.id)} readOnly /></td>
                  <td className="!px-2"><div className="font-medium">{a.nome_file}</div><div className="text-xs text-neutro-700">{descrizione(a)} · {formattaData(a.creato_il)}</div></td>
                  <td className="num !px-2 text-right whitespace-nowrap">{formattaByte(a.dimensione_byte)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2.5">
        <Bottone variante="secondario" disabled={!selezionati.length || !!stato} onClick={scaricaZip}><Download size={16} /> Scarica i selezionati (ZIP)</Bottone>
        <Bottone variante="pericolo" disabled={!selezionati.length || !!stato} onClick={rimuovi}><Trash2 size={16} /> Rimuovi i selezionati</Bottone>
        {stato && <span className="self-center text-neutro-700">{stato}</span>}
      </div>
      {esito && <div className="mt-3"><Avviso tipo={esito.tipo}>{esito.testo}</Avviso></div>}

      {!MODO_DEMO && (
        <div className="mt-6 border-t border-divisore pt-4">
          <h6 className="mb-2 text-accento-700">Recuperare davvero lo spazio su GitHub (compattazione)</h6>
          <p className="text-neutro-700">
            GitHub conserva la storia: i file rimossi continuano a occupare spazio finché la storia non viene "compattata".
            È un'operazione da fare dal Terminale del Mac, di rado (quando l'indicatore supera il 70–80%), meglio insieme a Claude.
            Serve l'elenco dei file rimossi ({eliminati.length}): scaricalo qui. Procedura in <code>docs/LIMITI_E_BACKUP.md</code>.
          </p>
          <Bottone variante="ghost" className="mt-2" disabled={!eliminati.length} onClick={elencoCompattazione}>Scarica l'elenco dei file da compattare</Bottone>
        </div>
      )}
    </div>
  )
}
