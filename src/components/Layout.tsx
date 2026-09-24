import { useState, type ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  Building2, Home, Users, Landmark, FileText, Euro, Receipt, FileSpreadsheet, History, Settings, LogOut, Menu, X, Briefcase,
} from 'lucide-react'
import { useSessione } from '../lib/sessione'
import { giorniAllaScadenza } from '../lib/auth'
import { CONFIG } from '../config'
import { MODO_DEMO } from '../lib/github'

const VOCI = [
  { a: '/', testo: 'Dashboard', Icona: Home },
  { a: '/contratti', testo: 'Contratti', Icona: FileText },
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

export default function Layout({ children }: { children: ReactNode }) {
  const { sessione, esci } = useSessione()
  const navigate = useNavigate()
  const [aperto, setAperto] = useState(false)
  const giorni = giorniAllaScadenza(sessione?.scadenzaToken ?? null)
  const avvisoToken = giorni !== null && giorni <= CONFIG.avvisoScadenzaTokenGiorni

  function esciEVai() { esci(); navigate('/login') }

  const menu = (
    <nav className="flex flex-col gap-1 p-3">
      {VOCI.map((v, i) =>
        'sep' in v ? (
          <div key={i} className="mt-4 mb-1 px-3 text-xs font-semibold uppercase tracking-wide text-white/50">{v.sep}</div>
        ) : (
          <NavLink
            key={v.a}
            to={v.a}
            end={v.a === '/'}
            onClick={() => setAperto(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${isActive ? 'bg-white/15 text-white font-medium' : 'text-white/80 hover:bg-white/10 hover:text-white'}`
            }
          >
            <v.Icona size={18} /> {v.testo}
          </NavLink>
        ),
      )}
    </nav>
  )

  return (
    <div className="min-h-screen md:flex">
      {/* Barra laterale (desktop) */}
      <aside className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0" style={{ background: 'var(--colore-primario)' }}>
        <div className="flex items-center gap-3 px-5 py-5 text-white">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-white/15 font-bold">GI</div>
          <div>
            <div className="font-semibold leading-tight">Gestione Immobili</div>
            <div className="text-xs text-white/60">Locazioni del gruppo</div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">{menu}</div>
        <div className="border-t border-white/10 p-4 text-sm text-white/80">
          <div className="truncate">Collegato come <span className="font-medium text-white">{sessione?.nome}</span></div>
          <button onClick={esciEVai} className="mt-2 flex items-center gap-2 text-white/70 hover:text-white"><LogOut size={16} /> Esci</button>
        </div>
      </aside>

      {/* Intestazione (telefono) */}
      <header className="md:hidden flex items-center justify-between px-4 py-3 text-white" style={{ background: 'var(--colore-primario)' }}>
        <div className="font-semibold">Gestione Immobili</div>
        <button onClick={() => setAperto(!aperto)} aria-label="Menu">{aperto ? <X /> : <Menu />}</button>
      </header>
      {aperto && (
        <div className="md:hidden text-white" style={{ background: 'var(--colore-primario)' }}>
          {menu}
          <button onClick={esciEVai} className="flex items-center gap-2 px-6 pb-4 text-white/80"><LogOut size={16} /> Esci ({sessione?.nome})</button>
        </div>
      )}

      {/* Contenuto */}
      <main className="flex-1 md:ml-64 p-4 md:p-8">
        {MODO_DEMO && (
          <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-900">
            Modalità dimostrativa: i dati restano solo in questo browser e non vengono inviati a GitHub.
          </div>
        )}
        {avvisoToken && (
          <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {giorni! < 0
              ? 'Il token di accesso a GitHub è scaduto: i salvataggi non funzioneranno finché non viene rinnovato (vedi Impostazioni).'
              : `Il token di accesso a GitHub scade tra ${giorni} giorni: pianificare il rinnovo (vedi Impostazioni).`}
          </div>
        )}
        {children}
      </main>
    </div>
  )
}
