/** Hook React: carica una o più collezioni e si aggiorna quando cambiano. */
import { useCallback, useEffect, useState } from 'react'
import { carica, inCache, osserva, type NomeCollezione, type RecordBase } from './store'
import { useSessioneAttiva } from './sessione'

export function useCollezioni(nomi: NomeCollezione[]) {
  const { token } = useSessioneAttiva()
  const [caricamento, setCaricamento] = useState(true)
  const [errore, setErrore] = useState<string | null>(null)
  const [versione, setVersione] = useState(0)
  const chiave = nomi.join(',')

  const ricarica = useCallback(async (forza = false) => {
    setCaricamento(true); setErrore(null)
    try {
      await Promise.all(nomi.map((n) => carica(token, n, forza)))
    } catch (e) {
      setErrore((e as Error).message)
    } finally {
      setCaricamento(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, chiave])

  useEffect(() => { void ricarica() }, [ricarica])
  useEffect(() => osserva(() => setVersione((v) => v + 1)), [])

  const dati = <T extends RecordBase>(nome: NomeCollezione): T[] => inCache<T>(nome)
  return { dati, caricamento, errore, ricarica, versione }
}
