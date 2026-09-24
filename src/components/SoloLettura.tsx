/** Contesto "sola lettura": quando attivo, moduli e pulsanti di modifica si disabilitano. */
import { createContext, useContext, type ReactNode } from 'react'

export const ContestoSoloLettura = createContext(false)
export function useSoloLettura(): boolean { return useContext(ContestoSoloLettura) }

/** Mostra i figli solo se l'utente può modificare la sezione corrente. */
export function SoloSeModifica({ children }: { children: ReactNode }) {
  const sl = useSoloLettura()
  return sl ? null : <>{children}</>
}
