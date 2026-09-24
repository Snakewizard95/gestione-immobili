import { useState } from 'react'
import { Avviso, Caricamento, Tabella } from '../components/ui'
import { useSessioneAttiva } from '../lib/sessione'
import { attivi } from '../lib/store'
import type { Contratto, Immobile, Societa } from '../lib/tipi'
import { useCollezioni } from '../lib/useCollezioni'
import { formattaData, formattaEuro } from '../lib/utils/formato'

interface RigaSocieta {
  id: string
  societa: string
  immobili: number
  liberi: number
  contratti: number
  canone_mensile: number
  canone_annuo: number
  registro: number
}

export default function Dashboard() {
  const { nome } = useSessioneAttiva()
  const { dati, caricamento, errore } = useCollezioni(['societa', 'immobili', 'contratti'])
  const [{ oggi, tra30 }] = useState(() => ({ oggi: new Date().toISOString().slice(0, 10), tra30: new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10) }))

  const societa = attivi(dati<Societa>('societa'))
  const immobili = attivi(dati<Immobile>('immobili'))
  const contratti = attivi(dati<Contratto>('contratti'))
  const attiviC = contratti.filter((c) => c.stato !== 'cessato')
  const somma = (xs: Array<number | null | undefined>) => xs.reduce<number>((a, b) => a + (b ?? 0), 0)

  const righe: RigaSocieta[] = societa.map((s) => {
    const imm = immobili.filter((i) => i.societa_id === s.id)
    const ids = new Set(imm.map((i) => i.id))
    const con = attiviC.filter((c) => ids.has(c.immobile_id))
    return {
      id: s.id, societa: s.ragione_sociale, immobili: imm.length, liberi: imm.filter((i) => i.stato === 'libero').length, contratti: con.length,
      canone_mensile: somma(con.map((c) => c.canone_mensile_cent)), canone_annuo: somma(con.map((c) => c.canone_annuale_cent)),
      registro: somma(con.map((c) => c.imposta_registro_annuale_cent)),
    }
  }).sort((a, b) => b.canone_annuo - a.canone_annuo)

  const tot: RigaSocieta = righe.reduce((t, r) => ({
    ...t, immobili: t.immobili + r.immobili, liberi: t.liberi + r.liberi, contratti: t.contratti + r.contratti,
    canone_mensile: t.canone_mensile + r.canone_mensile, canone_annuo: t.canone_annuo + r.canone_annuo, registro: t.registro + r.registro,
  }), { id: 'tot', societa: 'TOTALE GRUPPO', immobili: 0, liberi: 0, contratti: 0, canone_mensile: 0, canone_annuo: 0, registro: 0 })

  const scadenze = attiviC.filter((c) => c.prima_scadenza && c.prima_scadenza >= oggi && c.prima_scadenza <= tra30)
  const senzaDate = attiviC.filter((c) => !c.data_decorrenza || !c.prima_scadenza).length

  const kpi = [
    ['Contratti attivi', String(attiviC.length)],
    ['Canone annuo totale', formattaEuro(tot.canone_annuo)],
    ['Immobili (di cui liberi)', `${immobili.length} (${tot.liberi})`],
    ['Scadenze prossimi 30 giorni', String(scadenze.length)],
  ]
  const grassetto = (r: RigaSocieta) => (r.id === 'tot' ? 'font-bold' : '')

  return (
    <div>
      <h1 className="text-2xl font-semibold">Buongiorno, {nome}</h1>
      <p className="mt-1 text-gray-500">Riepilogo delle locazioni del gruppo.</p>
      {errore && <div className="mt-4"><Avviso tipo="errore">{errore}</Avviso></div>}
      {caricamento ? <Caricamento /> : (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {kpi.map(([t, v]) => (
              <div key={t} className="rounded-xl bg-white p-5 shadow-sm"><div className="text-sm text-gray-500">{t}</div><div className="mt-2 text-2xl font-semibold">{v}</div></div>
            ))}
          </div>
          {senzaDate > 0 && <div className="mt-4"><Avviso tipo="attenzione">{senzaDate} contratti attivi non hanno decorrenza o prima scadenza compilate: le scadenze non possono essere calcolate finché non vengono inserite.</Avviso></div>}

          <h2 className="mt-8 text-lg font-semibold">Riepilogo per società</h2>
          <div className="mt-3">
            <Tabella<RigaSocieta> righe={[...righe, tot]} vuoto="Nessuna società inserita." colonne={[
              { chiave: 's', etichetta: 'Società', render: (r) => <span className={`font-medium ${grassetto(r)}`}>{r.societa}</span> },
              { chiave: 'n', etichetta: 'Immobili (liberi)', allinea: 'dx', render: (r) => <span className={grassetto(r)}>{r.immobili} ({r.liberi})</span> },
              { chiave: 'c', etichetta: 'Contratti attivi', allinea: 'dx', render: (r) => <span className={grassetto(r)}>{r.contratti}</span> },
              { chiave: 'm', etichetta: 'Canone mensile', allinea: 'dx', render: (r) => <span className={grassetto(r)}>{formattaEuro(r.canone_mensile)}</span> },
              { chiave: 'a', etichetta: 'Canone annuo', allinea: 'dx', render: (r) => <span className={grassetto(r)}>{formattaEuro(r.canone_annuo)}</span> },
              { chiave: 'r', etichetta: 'Imposta di registro annua', allinea: 'dx', render: (r) => <span className={grassetto(r)}>{formattaEuro(r.registro)}</span> },
            ]} />
          </div>

          {scadenze.length > 0 && (
            <>
              <h2 className="mt-8 text-lg font-semibold">Contratti in scadenza nei prossimi 30 giorni</h2>
              <ul className="mt-3 space-y-1 text-sm">{scadenze.map((c) => <li key={c.id}>{formattaData(c.prima_scadenza)} — {immobili.find((i) => i.id === c.immobile_id)?.indirizzo}</li>)}</ul>
            </>
          )}
        </>
      )}
    </div>
  )
}
