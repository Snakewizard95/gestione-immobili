import { useState } from 'react'
import { Avviso, Caricamento, Tabella } from '../components/ui'
import { useSessioneAttiva } from '../lib/sessione'
import { attivi } from '../lib/store'
import type { Contratto, Immobile, Societa } from '../lib/tipi'
import { useCollezioni } from '../lib/useCollezioni'
import { formattaData, formattaEuro } from '../lib/utils/formato'

interface RigaRendimento {
  id: string
  societa: string
  immobili: number
  locati: number
  affitto: number
  condominio: number
  mutuo: number
  registro: number
  imu: number
  valore: number
  netto: number
  rendimento: number | null
}

function percentuale(n: number | null): string {
  if (n === null) return '—'
  return (n * 100).toFixed(2).replace('.', ',') + '%'
}

export default function Dashboard() {
  const { nome } = useSessioneAttiva()
  const { dati, caricamento, errore } = useCollezioni(['societa', 'immobili', 'contratti'])
  const societa = attivi(dati<Societa>('societa'))
  const immobili = attivi(dati<Immobile>('immobili'))
  const contratti = attivi(dati<Contratto>('contratti'))
  const attiviC = contratti.filter((c) => c.stato !== 'cessato')

  // Rendimento per società: (affitti − condominio − mutuo − imposta registro − IMU) / valore di mercato
  const righe: RigaRendimento[] = societa.map((s) => {
    const imm = immobili.filter((i) => i.societa_id === s.id)
    const ids = new Set(imm.map((i) => i.id))
    const con = attiviC.filter((c) => ids.has(c.immobile_id))
    const somma = (xs: Array<number | null | undefined>) => xs.reduce<number>((a, b) => a + (b ?? 0), 0)
    const affitto = somma(con.map((c) => c.canone_annuale_cent))
    const condominio = somma(imm.map((i) => i.condominio_annuo_cent))
    const mutuo = somma(imm.map((i) => i.mutuo_annuo_cent))
    const registro = somma(con.map((c) => c.imposta_registro_annuale_cent))
    const imu = somma(imm.map((i) => i.imu_annua_cent))
    const valore = somma(imm.map((i) => i.valore_mercato_cent))
    const netto = affitto - condominio - mutuo - registro - imu
    return { id: s.id, societa: s.ragione_sociale, immobili: imm.length, locati: new Set(con.map((c) => c.immobile_id)).size, affitto, condominio, mutuo, registro, imu, valore, netto, rendimento: valore ? netto / valore : null }
  }).sort((a, b) => b.affitto - a.affitto)

  const tot = righe.reduce((t, r) => ({ ...t, immobili: t.immobili + r.immobili, locati: t.locati + r.locati, affitto: t.affitto + r.affitto, condominio: t.condominio + r.condominio, mutuo: t.mutuo + r.mutuo, registro: t.registro + r.registro, imu: t.imu + r.imu, valore: t.valore + r.valore, netto: t.netto + r.netto }),
    { id: 'tot', societa: 'TOTALE GRUPPO', immobili: 0, locati: 0, affitto: 0, condominio: 0, mutuo: 0, registro: 0, imu: 0, valore: 0, netto: 0, rendimento: null as number | null })
  tot.rendimento = tot.valore ? tot.netto / tot.valore : null

  const [{ oggi, tra30 }] = useState(() => ({ oggi: new Date().toISOString().slice(0, 10), tra30: new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10) }))
  const scadenze = attiviC.filter((c) => c.prima_scadenza && c.prima_scadenza >= oggi && c.prima_scadenza <= tra30)
  const senzaDate = attiviC.filter((c) => !c.data_decorrenza || !c.prima_scadenza).length

  const kpi = [
    ['Contratti attivi', String(attiviC.length)],
    ['Canone annuo totale', formattaEuro(tot.affitto)],
    ['Immobili (di cui liberi)', `${immobili.length} (${immobili.filter((i) => i.stato === 'libero').length})`],
    ['Scadenze prossimi 30 giorni', String(scadenze.length)],
  ]

  return (
    <div>
      <h1 className="text-2xl font-semibold">Buongiorno, {nome}</h1>
      <p className="mt-1 text-gray-500">Riepilogo del patrimonio locato del gruppo.</p>
      {errore && <div className="mt-4"><Avviso tipo="errore">{errore}</Avviso></div>}
      {caricamento ? <Caricamento /> : (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {kpi.map(([t, v]) => (
              <div key={t} className="rounded-xl bg-white p-5 shadow-sm"><div className="text-sm text-gray-500">{t}</div><div className="mt-2 text-2xl font-semibold">{v}</div></div>
            ))}
          </div>
          {senzaDate > 0 && <div className="mt-4"><Avviso tipo="attenzione">{senzaDate} contratti attivi non hanno decorrenza o prima scadenza compilate: le scadenze non possono essere calcolate finché non vengono inserite.</Avviso></div>}

          <h2 className="mt-8 text-lg font-semibold">Rendimento annuo per società</h2>
          <p className="mb-3 text-sm text-gray-500">Netto = affitti − spese condominiali − mutuo/leasing − imposta di registro − IMU. Rendimento = netto / valore di mercato.</p>
          <Tabella<RigaRendimento> righe={[...righe, tot]} vuoto="Nessuna società inserita." colonne={[
            { chiave: 's', etichetta: 'Società', render: (r) => <span className={r.id === 'tot' ? 'font-bold' : 'font-medium'}>{r.societa}</span> },
            { chiave: 'n', etichetta: 'Immobili (locati)', allinea: 'dx', render: (r) => `${r.immobili} (${r.locati})` },
            { chiave: 'a', etichetta: 'Affitti', allinea: 'dx', render: (r) => formattaEuro(r.affitto) },
            { chiave: 'c', etichetta: 'Condominio', allinea: 'dx', render: (r) => formattaEuro(r.condominio) },
            { chiave: 'm', etichetta: 'Mutuo/leasing', allinea: 'dx', render: (r) => formattaEuro(r.mutuo) },
            { chiave: 'r', etichetta: 'Imp. registro', allinea: 'dx', render: (r) => formattaEuro(r.registro) },
            { chiave: 'i', etichetta: 'IMU', allinea: 'dx', render: (r) => formattaEuro(r.imu) },
            { chiave: 'v', etichetta: 'Valore di mercato', allinea: 'dx', render: (r) => formattaEuro(r.valore) },
            { chiave: 'p', etichetta: 'Rendimento', allinea: 'dx', render: (r) => <span className={r.rendimento !== null && r.rendimento < 0 ? 'text-red-600 font-medium' : 'font-medium'}>{percentuale(r.rendimento)}</span> },
          ]} />

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
