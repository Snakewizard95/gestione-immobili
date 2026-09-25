/**
 * Dashboard — variante B "Calendario" del design Industry.
 * Numeri principali, calendario dei prossimi 12 mesi (scadenze contratti e imposta di registro),
 * canone annuo per società, elenco "Da fare" e tabella di riepilogo per società.
 */
import { useState } from 'react'
import { Avviso, Caricamento, Etichetta, Riquadro, Tabella, type TonoEtichetta } from '../components/ui'
import { useSessioneAttiva, useUtente } from '../lib/sessione'
import { puoVedere } from '../lib/permessi'
import { attivi } from '../lib/store'
import type { Annualita, Contratto, Immobile, Societa, VoceCondominiale } from '../lib/tipi'
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

interface Evento { tipo: 'scadenza' | 'registro'; testo: string; titolo: string }
interface DaFare { id: string; titolo: string; dettaglio: string; tag: string; tono: TonoEtichetta }

const GIORNO = 86_400_000
const MESI_BREVI = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic']
/** Giorni concessi per pagare l'imposta di registro dall'inizio dell'annualità */
const GIORNI_PAGAMENTO_REGISTRO = 30
/** Finestra per i bollettini condominiali "in scadenza" e soglia per segnarli come urgenti */
const GIORNI_BOLLETTINI = 30
const GIORNI_URGENTE = 7
/** Voci singole di imposta di registro mostrate prima di raggrupparle */
const MAX_VOCI_REGISTRO = 4

const iso = (d: Date) => d.toISOString().slice(0, 10)
const piuGiorni = (isoData: string, giorni: number) => iso(new Date(new Date(isoData + 'T00:00:00Z').getTime() + giorni * GIORNO))
const giorniTra = (da: string, a: string) => Math.round((new Date(a + 'T00:00:00Z').getTime() - new Date(da + 'T00:00:00Z').getTime()) / GIORNO)
/** Importo senza decimali, per i numeri grandi: 26916000 → "269.160 €" */
const euroTondo = (cent: number) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0, useGrouping: 'always' } as Intl.NumberFormatOptions).format(cent / 100)
/** Indirizzo accorciato per le caselle del calendario */
const breve = (s: string) => (s.length > 24 ? s.slice(0, 23) + '…' : s)

export default function Dashboard() {
  const { nome } = useSessioneAttiva()
  const utente = useUtente()
  const { dati, caricamento, errore } = useCollezioni(['societa', 'immobili', 'contratti', 'annualita', 'voci_condominiali'])
  const [oggi] = useState(() => iso(new Date()))
  const tra30 = piuGiorni(oggi, 30)

  const societa = attivi(dati<Societa>('societa'))
  const immobili = attivi(dati<Immobile>('immobili'))
  const contratti = attivi(dati<Contratto>('contratti'))
  const annualita = attivi(dati<Annualita>('annualita'))
  const voci = attivi(dati<VoceCondominiale>('voci_condominiali'))
  const attiviC = contratti.filter((c) => c.stato !== 'cessato')
  const somma = (xs: Array<number | null | undefined>) => xs.reduce<number>((a, b) => a + (b ?? 0), 0)
  const indirizzo = (immobileId: string) => immobili.find((i) => i.id === immobileId)?.indirizzo ?? '—'
  const vedeRegistro = puoVedere(utente, 'registro')
  const vedeCondominio = puoVedere(utente, 'condominio')

  // ── Riepilogo per società ──
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
  }), { id: 'tot', societa: 'Totale gruppo', immobili: 0, liberi: 0, contratti: 0, canone_mensile: 0, canone_annuo: 0, registro: 0 })
  const maxAnnuo = Math.max(1, ...righe.map((r) => r.canone_annuo))

  const scadenze = attiviC.filter((c) => c.prima_scadenza && c.prima_scadenza >= oggi && c.prima_scadenza <= tra30)
  const senzaDate = attiviC.filter((c) => !c.data_decorrenza || !c.prima_scadenza).length
  const inDisdetta = attiviC.filter((c) => c.stato === 'in_disdetta').length

  const kpi = [
    { valore: String(attiviC.length), titolo: 'Contratti attivi', nota: `${inDisdetta} in disdetta` },
    { valore: euroTondo(tot.canone_annuo), titolo: 'Canone annuo totale', nota: `${formattaEuro(tot.canone_mensile)} al mese` },
    { valore: String(immobili.length), titolo: 'Immobili', nota: `di cui ${tot.liberi} liberi` },
    { valore: String(scadenze.length), titolo: 'Scadenze 30 giorni', nota: `entro il ${formattaData(tra30)}` },
  ]

  // ── Calendario dei prossimi 12 mesi ──
  const inizio = new Date(oggi + 'T00:00:00Z')
  const mesi = Array.from({ length: 12 }, (_, k) => {
    const d = new Date(Date.UTC(inizio.getUTCFullYear(), inizio.getUTCMonth() + k, 1))
    return { chiave: iso(d).slice(0, 7), mese: MESI_BREVI[d.getUTCMonth()], anno: d.getUTCFullYear(), eventi: [] as Evento[] }
  })
  const primo = mesi[0].chiave
  const ultimo = mesi[11].chiave
  const aggiungi = (data: string, ev: Evento) => mesi.find((m) => m.chiave === data.slice(0, 7))?.eventi.push(ev)
  for (const c of attiviC) {
    const ind = indirizzo(c.immobile_id)
    if (c.prima_scadenza && c.prima_scadenza.slice(0, 7) >= primo && c.prima_scadenza.slice(0, 7) <= ultimo) {
      aggiungi(c.prima_scadenza, { tipo: 'scadenza', testo: breve(ind), titolo: `Scadenza contratto ${formattaData(c.prima_scadenza)} · ${ind}` })
    }
    if (vedeRegistro && c.data_decorrenza) {
      // Anniversari della decorrenza (inizio di ogni annualità) che cadono nei prossimi 12 mesi
      for (const anno of [mesi[0].anno, mesi[0].anno + 1]) {
        if (anno <= Number(c.data_decorrenza.slice(0, 4))) continue
        const anniversario = `${anno}${c.data_decorrenza.slice(4, 10)}`
        if (anniversario.slice(0, 7) >= primo && anniversario.slice(0, 7) <= ultimo) {
          aggiungi(anniversario, { tipo: 'registro', testo: breve(ind), titolo: `Imposta di registro: annualità dal ${formattaData(anniversario)} · ${ind}` })
        }
      }
    }
  }

  // ── Da fare ──
  const daFare: DaFare[] = []
  if (vedeRegistro) {
    const nonPagate = annualita.filter((a) => a.imposta_pagata !== 'si' && (a.imposta_cent ?? 0) > 0 && a.data_inizio && a.data_inizio <= tra30)
      .sort((a, b) => a.data_inizio.localeCompare(b.data_inizio))
    const contrattoDi = (a: Annualita) => contratti.find((c) => c.id === a.contratto_id)
    for (const a of nonPagate.slice(0, MAX_VOCI_REGISTRO)) {
      const entro = piuGiorni(a.data_inizio, GIORNI_PAGAMENTO_REGISTRO)
      const ritardo = oggi > entro
      const ind = indirizzo(contrattoDi(a)?.immobile_id ?? '')
      daFare.push({
        id: 'reg' + a.id,
        titolo: ritardo ? 'Imposta di registro in ritardo' : 'Imposta di registro da pagare',
        dettaglio: `${ind} · ${formattaEuro(a.imposta_cent)} · ${ritardo ? `annualità dal ${formattaData(a.data_inizio)}` : `entro il ${formattaData(entro)}`}`,
        tag: ritardo ? 'In ritardo' : 'Da pagare', tono: ritardo ? 'rosso' : 'giallo',
      })
    }
    if (nonPagate.length > MAX_VOCI_REGISTRO) {
      const altre = nonPagate.slice(MAX_VOCI_REGISTRO)
      daFare.push({ id: 'reg-altre', titolo: 'Altre imposte di registro da pagare', dettaglio: `${altre.length} annualità · ${formattaEuro(somma(altre.map((a) => a.imposta_cent)))}`, tag: 'Da pagare', tono: 'giallo' })
    }
  }
  if (vedeCondominio) {
    const limite = piuGiorni(oggi, GIORNI_BOLLETTINI)
    const bollettini = voci.filter((v) => v.pagata !== 'si' && !v.in_piano_id && v.scadenza && v.scadenza <= limite).sort((a, b) => a.scadenza.localeCompare(b.scadenza))
    if (bollettini.length > 0) {
      const giorni = giorniTra(oggi, bollettini[0].scadenza)
      daFare.push({
        id: 'boll', titolo: 'Bollettini condominiali in scadenza',
        dettaglio: `${bollettini.length} ${bollettini.length === 1 ? 'bollettino' : 'bollettini'} entro il ${formattaData(bollettini[bollettini.length - 1].scadenza)} · ${formattaEuro(somma(bollettini.map((v) => v.importo_cent)))}`,
        tag: giorni < 0 ? 'Scaduti' : giorni === 0 ? 'Oggi' : `${giorni} ${giorni === 1 ? 'giorno' : 'giorni'}`, tono: giorni <= GIORNI_URGENTE ? 'rosso' : 'giallo',
      })
    }
  }
  if (vedeRegistro) {
    const rimborsi = annualita.filter((a) => a.rimborso_ricevuto !== 'si' && (a.quota_conduttore_cent ?? 0) > 0 && a.data_inizio && a.data_inizio <= oggi)
    if (rimborsi.length > 0) {
      const conduttori = new Set(rimborsi.map((a) => contratti.find((c) => c.id === a.contratto_id)?.conduttore_id ?? a.id)).size
      daFare.push({ id: 'rimb', titolo: 'Rimborsi 50% da incassare', dettaglio: `${conduttori} ${conduttori === 1 ? 'conduttore' : 'conduttori'} · ${formattaEuro(somma(rimborsi.map((a) => a.quota_conduttore_cent)))}`, tag: 'Da incassare', tono: 'giallo' })
    }
  }
  if (vedeCondominio) {
    const quote = voci.filter((v) => v.riaddebitata !== 'si' && (v.quota_conduttore_cent ?? 0) > 0)
    if (quote.length > 0) {
      daFare.push({ id: 'quote', titolo: 'Quote condominiali da riaddebitare', dettaglio: `${quote.length} ${quote.length === 1 ? 'quota' : 'quote'} · ${formattaEuro(somma(quote.map((v) => v.quota_conduttore_cent)))}`, tag: 'Da richiedere', tono: 'giallo' })
    }
  }

  const dataLunga = new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div>
      <div className="mb-7 border-b border-divisore pb-5">
        <div className="kicker mb-2">Dashboard · {dataLunga}</div>
        <h1 className="m-0 text-[34px] md:text-[42px]">Buongiorno, {nome}</h1>
        <p className="mt-2 text-neutro-700">Riepilogo delle locazioni del gruppo.</p>
      </div>
      {errore && <div className="mb-6"><Avviso tipo="errore">{errore}</Avviso></div>}
      {caricamento ? <Caricamento /> : (
        <>
          {/* Numeri principali */}
          <div className="mb-9 grid gap-y-3 border-t border-testo" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
            {kpi.map((k) => (
              <div key={k.titolo} className="flex flex-wrap items-baseline gap-3 pr-[18px] pt-3.5">
                <span className="num whitespace-nowrap font-titolo text-[clamp(26px,2.6vw,40px)] font-semibold leading-none">{k.valore}</span>
                <span className="text-[13px] leading-[1.3] text-neutro-700">{k.titolo}<br />{k.nota}</span>
              </div>
            ))}
          </div>
          {senzaDate > 0 && <div className="mb-8"><Avviso tipo="attenzione">{senzaDate} contratti attivi non hanno decorrenza o prima scadenza compilate: le scadenze non possono essere calcolate finché non vengono inserite.</Avviso></div>}

          {/* Calendario */}
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
            <h3 className="m-0">Prossimi 12 mesi</h3>
            <div className="flex gap-[18px] text-xs text-neutro-700">
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 bg-accento-800" />Scadenza contratto</span>
              {vedeRegistro && <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 border border-accento" />Imposta di registro</span>}
            </div>
          </div>
          <div className="-mx-1.5 mb-[34px] overflow-x-auto p-1.5">
            <Riquadro className="grid min-w-[1080px] grid-cols-12">
              {mesi.map((m, i) => (
                <div key={m.chiave} className={`min-h-[180px] px-2.5 pb-4 pt-3 ${i > 0 ? 'border-l border-divisore' : ''} ${i === 0 ? 'bg-[rgba(89,128,166,0.08)]' : ''}`}>
                  <div className="mb-2.5 flex flex-col border-b border-divisore pb-2">
                    <span className="font-titolo text-lg font-semibold uppercase">{m.mese}</span>
                    <span className="text-[10px] text-neutro-600">{m.anno}</span>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {m.eventi.map((e, k) => (
                      <div key={k} title={e.titolo}
                        className={`text-[11px] leading-[1.25] ${e.tipo === 'scadenza' ? 'bg-accento-800 px-1.5 py-1 text-sfondo' : 'border border-accento px-[5px] py-[3px] text-accento-800'}`}>
                        {e.testo}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </Riquadro>
          </div>

          {/* Canone per società e Da fare */}
          <div className="mb-10 grid gap-10" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 380px), 1fr))' }}>
            <div>
              <h3 className="m-0 mb-4">Canone annuo per società</h3>
              {righe.length === 0 ? <p className="text-neutro-700">Nessuna società inserita.</p> : (
                <div className="flex flex-col gap-[18px]">
                  {righe.map((r) => (
                    <div key={r.id}>
                      <div className="mb-1.5 flex justify-between gap-3 text-sm"><span className="font-medium">{r.societa}</span><span className="num">{formattaEuro(r.canone_annuo)}</span></div>
                      <div className="relative h-3.5 border border-divisore"><div className="h-full bg-accento" style={{ width: `${(r.canone_annuo / maxAnnuo) * 100}%` }} /></div>
                      <div className="mt-1 text-xs text-neutro-700">{r.contratti} contratti · {r.immobili} ({r.liberi}) immobili (liberi)</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <h3 className="m-0 mb-4">Da fare</h3>
              <Riquadro>
                {daFare.length === 0 && <div className="px-4 py-3.5 text-neutro-700">Niente in sospeso.</div>}
                {daFare.map((d, i) => (
                  <div key={d.id} className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3.5 ${i < daFare.length - 1 ? 'border-b border-divisore' : ''}`}>
                    <div><div className="font-medium">{d.titolo}</div><div className="text-[13px] text-neutro-700">{d.dettaglio}</div></div>
                    <Etichetta tono={d.tono}>{d.tag}</Etichetta>
                  </div>
                ))}
              </Riquadro>
            </div>
          </div>

          {/* Riepilogo per società (tenuto su richiesta di Davide) */}
          <h3 className="m-0 mb-4">Riepilogo per società</h3>
          <Tabella<RigaSocieta> righe={righe} rigaTotale={righe.length > 0 ? tot : undefined} vuoto="Nessuna società inserita." colonne={[
            { chiave: 's', etichetta: 'Società', render: (r) => <span className="font-medium">{r.societa}</span> },
            { chiave: 'n', etichetta: 'Immobili (liberi)', allinea: 'dx', render: (r) => `${r.immobili} (${r.liberi})` },
            { chiave: 'c', etichetta: 'Contratti attivi', allinea: 'dx', render: (r) => r.contratti },
            { chiave: 'm', etichetta: 'Canone mensile', allinea: 'dx', render: (r) => formattaEuro(r.canone_mensile) },
            { chiave: 'a', etichetta: 'Canone annuo', allinea: 'dx', render: (r) => formattaEuro(r.canone_annuo) },
            { chiave: 'r', etichetta: 'Imposta di registro annua', allinea: 'dx', render: (r) => formattaEuro(r.registro) },
          ]} />
        </>
      )}
    </div>
  )
}
