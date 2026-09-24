/** Contesto React che rende disponibile la sessione (token + nome) a tutte le schermate. */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { cancellaSessione, leggiSessione, salvaSessione, type Sessione } from './auth'
import { svuotaCache } from './store'

interface ContestoSessione {
  sessione: Sessione | null
  accedi: (s: Sessione) => void
  esci: () => void
}

const Contesto = createContext<ContestoSessione | null>(null)

export function FornitoreSessione({ children }: { children: ReactNode }) {
  const [sessione, setSessione] = useState<Sessione | null>(() => leggiSessione())

  const accedi = useCallback((s: Sessione) => { salvaSessione(s); setSessione(s) }, [])
  const esci = useCallback(() => { cancellaSessione(); svuotaCache(); setSessione(null) }, [])

  const valore = useMemo(() => ({ sessione, accedi, esci }), [sessione, accedi, esci])
  return <Contesto.Provider value={valore}>{children}</Contesto.Provider>
}

export function useSessione(): ContestoSessione {
  const c = useContext(Contesto)
  if (!c) throw new Error('useSessione va usato dentro FornitoreSessione')
  return c
}

/** Restituisce la sessione garantendo che esista (da usare solo nelle pagine protette). */
export function useSessioneAttiva(): Sessione {
  const { sessione } = useSessione()
  if (!sessione) throw new Error('Sessione assente')
  return sessione
}
