/** Componenti grafici di base riutilizzati in tutte le sezioni. */
import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'

export function Bottone({ children, variante = 'primario', ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variante?: 'primario' | 'secondario' | 'pericolo' }) {
  const stile = {
    primario: 'text-white hover:opacity-90',
    secondario: 'border border-gray-300 bg-white text-gray-800 hover:bg-gray-50',
    pericolo: 'border border-red-300 bg-white text-red-700 hover:bg-red-50',
  }[variante]
  return (
    <button {...p} style={variante === 'primario' ? { background: 'var(--colore-primario)' } : undefined}
      className={`rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50 ${stile} ${p.className ?? ''}`}>
      {children}
    </button>
  )
}

export function Finestra({ titolo, aperta, onChiudi, children, larga }: { titolo: string; aperta: boolean; onChiudi: () => void; children: ReactNode; larga?: boolean }) {
  useEffect(() => {
    if (!aperta) return
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onChiudi() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [aperta, onChiudi])
  if (!aperta) return null
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 md:p-10" onClick={onChiudi}>
      <div className={`w-full ${larga ? 'max-w-4xl' : 'max-w-2xl'} rounded-2xl bg-white shadow-2xl`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-lg font-semibold">{titolo}</h2>
          <button onClick={onChiudi} aria-label="Chiudi" className="rounded p-1 text-gray-500 hover:bg-gray-100"><X size={20} /></button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  )
}

export function Avviso({ tipo = 'info', children }: { tipo?: 'info' | 'errore' | 'ok' | 'attenzione'; children: ReactNode }) {
  const c = { info: 'bg-blue-50 text-blue-900 border-blue-200', errore: 'bg-red-50 text-red-800 border-red-200', ok: 'bg-green-50 text-green-800 border-green-200', attenzione: 'bg-amber-50 text-amber-900 border-amber-200' }[tipo]
  return <div className={`rounded-lg border px-4 py-3 text-sm ${c}`}>{children}</div>
}

export function Vuoto({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border-2 border-dashed border-gray-300 bg-white p-10 text-center text-gray-500">{children}</div>
}

export function Caricamento() {
  return <div className="py-10 text-center text-gray-400">Caricamento…</div>
}

export function Etichetta({ tono = 'grigio', children }: { tono?: 'grigio' | 'verde' | 'rosso' | 'giallo' | 'blu'; children: ReactNode }) {
  const c = { grigio: 'bg-gray-100 text-gray-700', verde: 'bg-green-100 text-green-800', rosso: 'bg-red-100 text-red-800', giallo: 'bg-amber-100 text-amber-800', blu: 'bg-blue-100 text-blue-800' }[tono]
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${c}`}>{children}</span>
}

export interface Colonna<T> {
  chiave: string
  etichetta: string
  render: (r: T) => ReactNode
  allinea?: 'sx' | 'dx'
}

export function Tabella<T extends { id: string }>({ colonne, righe, onRiga, vuoto }: { colonne: Colonna<T>[]; righe: T[]; onRiga?: (r: T) => void; vuoto?: string }) {
  if (righe.length === 0) return <Vuoto>{vuoto ?? 'Nessun elemento.'}</Vuoto>
  return (
    <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            {colonne.map((c) => <th key={c.chiave} className={`px-4 py-3 font-semibold ${c.allinea === 'dx' ? 'text-right' : ''}`}>{c.etichetta}</th>)}
          </tr>
        </thead>
        <tbody>
          {righe.map((r) => (
            <tr key={r.id} onClick={() => onRiga?.(r)} className={`border-b last:border-0 ${onRiga ? 'cursor-pointer hover:bg-gray-50' : ''}`}>
              {colonne.map((c) => <td key={c.chiave} className={`px-4 py-3 ${c.allinea === 'dx' ? 'text-right tabular-nums' : ''}`}>{c.render(r)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function BarraRicerca({ valore, onChange, segnaposto = 'Cerca…' }: { valore: string; onChange: (v: string) => void; segnaposto?: string }) {
  return <input value={valore} onChange={(e) => onChange(e.target.value)} placeholder={segnaposto}
    className="w-full max-w-sm rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2" />
}

/** Filtro testuale su tutti i valori del record. */
export function filtraTesto<T extends object>(righe: T[], testo: string, extra?: (r: T) => string): T[] {
  const q = testo.trim().toLowerCase()
  if (!q) return righe
  return righe.filter((r) => (Object.values(r).join(' ') + ' ' + (extra?.(r) ?? '')).toLowerCase().includes(q))
}
