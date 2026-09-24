import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { CONFIG } from '../config'
import { decifraToken, type TokenCifrato } from '../lib/auth'
import { verificaAccesso } from '../lib/github'
import { useSessione } from '../lib/sessione'

export default function Login() {
  const { sessione, accedi } = useSessione()
  const navigate = useNavigate()
  const [nome, setNome] = useState('')
  const [password, setPassword] = useState('')
  const [errore, setErrore] = useState<string | null>(null)
  const [inCorso, setInCorso] = useState(false)

  if (sessione) return <Navigate to="/" replace />

  async function invia(e: FormEvent) {
    e.preventDefault()
    setErrore(null)
    if (nome.trim().length < 2) { setErrore('Inserisci il tuo nome (serve per lo storico delle modifiche).'); return }
    setInCorso(true)
    try {
      const blocco = CONFIG.tokenCifrato as TokenCifrato
      const token = await decifraToken(blocco, password)
      await verificaAccesso(token)
      accedi({ token, nome: nome.trim(), scadenzaToken: blocco.scadenza_token, accessoIl: new Date().toISOString() })
      navigate('/')
    } catch (err) {
      setErrore((err as Error).message)
    } finally {
      setInCorso(false)
    }
  }

  return (
    <div className="min-h-screen grid place-items-center px-4" style={{ background: 'var(--colore-primario)' }}>
      <form onSubmit={invia} className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-xl">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-xl text-xl font-bold text-white" style={{ background: 'var(--colore-primario)' }}>GI</div>
          <h1 className="text-xl font-semibold">Gestione Immobili</h1>
          <p className="text-sm text-gray-500">Locazioni delle società del gruppo</p>
        </div>

        <label className="block text-sm font-medium">Il tuo nome
          <input value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="name" placeholder="es. Davide"
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2" />
        </label>
        <label className="mt-4 block text-sm font-medium">Password condivisa
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password"
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2" />
        </label>

        {errore && <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{errore}</div>}

        <button type="submit" disabled={inCorso}
          className="mt-6 w-full rounded-lg py-2.5 font-medium text-white disabled:opacity-60" style={{ background: 'var(--colore-primario)' }}>
          {inCorso ? 'Verifica in corso…' : 'Entra'}
        </button>
        <p className="mt-4 text-center text-xs text-gray-400">Il nome viene registrato accanto a ogni modifica che salvi.</p>
      </form>
    </div>
  )
}
