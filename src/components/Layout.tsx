import { useState, type ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  Building2, Home, Users, Landmark, FileText, Euro, Receipt, FileSpreadsheet, History, Settings, LogOut, Menu, X, Briefcase, Percent,
} from 'lucide-react'
import { useSessione, useUtente } from '../lib/sessione'
import { puoVedere, sezioneDiPercorso } from '../lib/permessi'
import { giorniAllaScadenza } from '../lib/auth'
import { CONFIG } from '../config'
import { MODO_DEMO } from '../lib/github'
import logo from '../assets/logo-gruppo.png'
import { Avviso, Crocette } from './ui'

const VOCI = [
  { a: '/', testo: 'Dashboard', Icona: Home },
  { a: '/contratti', testo: 'Contratti', Icona: FileText },
  { a: '/registro', testo: 'ISTAT e imposta di registro', Icona: Percent },
  { a: '/canoni', testo: 'Canoni e incassi', Icona: Euro },
  { a: '/condominio', testo: 'Condominio', Icona: Receipt },
  { sep: 'Anagrafiche' },
  { a: '/societa', testo: 'Società', Icona: Briefcase },
  { a: '/immobili', testo: 'Immobili', Icona: Building2 },
  { a: '/conduttori', testo: 'Conduttori', Icona: Users },
  { a: '/condomini', testo: 'Condomini', Icona: Landmark },
  { sep: 'Strumenti' },
  { a: '/importa', testo: 'Importa da Excel', Icona: FileSpreadsheet },
  { a: '/storico', testo: 'Storico modifiche', Icona: History },
  { a: '/impostazioni', testo: 'Impostazioni', Icona: Settings },
] as const

/** Vero se il browser non conosce i colori moderni (es. Chrome 109 su Windows 7): il sito funziona ugualmente grazie ai valori di riserva. */
const BROWSER_DATATO = typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && !CSS.supports('color', 'oklch(50% 0 0)')

export default function Layout({ children }: { children: ReactNode }) {
  const { sessione, esci } = useSessione()
  const utente = useUtente()
  const navigate = useNavigate()
  const visibile = (a: string) => { const s = sezioneDiPercorso(a); return s ? puoVedere(utente, s) : true }
  const [aperto, setAperto] = useState(false)
  const giorni = giorniAllaScadenza(sessione?.scadenzaToken ?? null)
  const avvisoToken = giorni !== null && giorni <= CONFIG.avvisoScadenzaTokenGiorni

  function esciEVai() { esci(); navigate('/login') }

  const menu = (
    <nav className="flex flex-col gap-0.5 px-3 pb-3">
      {VOCI.filter((v, i) => 'sep' in v ? VOCI.slice(i + 1).some((w) => 'a' in w && visibile(w.a)) && !('sep' in (VOCI[i + 1] ?? {})) : visibile(v.a)).map((v, i) =>
        'sep' in v ? (
          <div key={i} className="sezione-menu">{v.sep}</div>
        ) : (
          <NavLink key={v.a} to={v.a} end={v.a === '/'} onClick={() => setAperto(false)}
            className={({ isActive }) => `voce-menu ${isActive ? 'attiva con-crocette crocette-chiare' : ''}`}>
            {({ isActive }) => <>{isActive && <Crocette />}<v.Icona size={18} className="flex-none" /> {v.testo}</>}
          </NavLink>
        ),
      )}
    </nav>
  )

  return (
    <div className="min-h-screen md:flex">
      {/* Barra laterale (desktop) */}
      <aside className="hidden bg-accento-900 text-sfondo md:fixed md:inset-y-0 md:flex md:w-64 md:flex-col">
        <div className="px-4 pb-2 pt-4">
          <img src={logo} alt="Gruppo CEC Bigoli" className="h-[58px] w-[224px] object-cover" />
        </div>
        <div className="px-5 py-2.5 font-titolo text-[19px] font-semibold uppercase tracking-[0.01em]">Gestione Immobili</div>
        <div className="flex-1 overflow-y-auto pt-1">{menu}</div>
        <div className="flex items-center justify-between gap-3 border-t border-[rgba(242,242,243,0.14)] px-5 py-3.5 text-[13px] text-[rgba(242,242,243,0.74)]">
          <div className="min-w-0">
            <div className="truncate">Collegato come <span className="font-bold text-sfondo">{sessione?.nome}</span></div>
            {utente?.ruolo === 'admin' && <span className="mt-1 inline-block border border-[rgba(242,242,243,0.35)] px-1.5 text-[10px] uppercase tracking-[0.1em]">Admin</span>}
          </div>
          <button onClick={esciEVai} title="Esci" aria-label="Esci"
            className="grid h-8 w-8 flex-none place-items-center border border-[rgba(242,242,243,0.35)] text-sfondo hover:bg-[rgba(242,242,243,0.1)]">
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      {/* Intestazione (telefono) */}
      <header className="flex items-center justify-between bg-accento-900 px-4 py-3 text-sfondo md:hidden">
        <div className="font-titolo text-lg font-semibold uppercase">Gestione Immobili</div>
        <button onClick={() => setAperto(!aperto)} aria-label="Menu">{aperto ? <X /> : <Menu />}</button>
      </header>
      {aperto && (
        <div className="bg-accento-900 pt-3 text-sfondo md:hidden">
          {menu}
          <button onClick={esciEVai} className="flex items-center gap-2 px-6 pb-4 text-[rgba(242,242,243,0.74)]"><LogOut size={16} /> Esci ({sessione?.nome})</button>
        </div>
      )}

      {/* Contenuto */}
      <main className="min-w-0 flex-1 px-4 pb-16 pt-6 md:ml-64 md:px-11 md:pt-8">
        <div className="mx-auto max-w-[1400px]">
          {(MODO_DEMO || BROWSER_DATATO || avvisoToken) && (
            <div className="mb-6 flex flex-col gap-2.5">
              {MODO_DEMO && <Avviso tipo="info">Modalità dimostrativa: i dati restano solo in questo browser e non vengono inviati a GitHub.</Avviso>}
              {BROWSER_DATATO && (
                <Avviso tipo="info">Il tuo browser è datato: il sito funziona, ma alcuni dettagli grafici potrebbero essere semplificati. Se possibile usa Firefox o Edge aggiornati (su Windows 7 è disponibile Firefox ESR).</Avviso>
              )}
              {avvisoToken && (
                <Avviso tipo="attenzione">
                  {giorni! < 0
                    ? 'Il token di accesso a GitHub è scaduto: i salvataggi non funzioneranno finché non viene rinnovato (vedi Impostazioni).'
                    : `Il token di accesso a GitHub scade tra ${giorni} giorni: pianificare il rinnovo (vedi Impostazioni).`}
                </Avviso>
              )}
            </div>
          )}
          {children}
        </div>
      </main>
    </div>
  )
}
