import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { CONFIG } from '../config'
import { decifraToken, type TokenCifrato } from '../lib/auth'
import { MODO_DEMO, TOKEN_DEMO, verificaAccesso } from '../lib/github'
import { UTENTI, primoPercorso } from '../lib/permessi'
import { useSessione } from '../lib/sessione'
import logo from '../assets/logo-gruppo.png'
import { Avviso, Bottone } from '../components/ui'

export default function Login() {
  const { sessione, accedi } = useSessione()
  const navigate = useNavigate()
  const [utenteId, setUtenteId] = useState(UTENTI[0]?.id ?? '')
  const [password, setPassword] = useState('')
  const [errore, setErrore] = useState<string | null>(null)
  const [inCorso, setInCorso] = useState(false)

  if (sessione) return <Navigate to="/" replace />

  async function invia(e: FormEvent) {
    e.preventDefault()
    setErrore(null)
    const utente = UTENTI.find((u) => u.id === utenteId)
    if (!utente) { setErrore('Scegli il tuo nome.'); return }
    setInCorso(true)
    try {
      const cfg = CONFIG.tokenCifrato as TokenCifrato
      const token = MODO_DEMO ? TOKEN_DEMO : await decifraToken(cfg, utente.id, password)
      await verificaAccesso(token)
      accedi({ token, utenteId: utente.id, nome: utente.nome, scadenzaToken: MODO_DEMO ? null : cfg.scadenza_token, accessoIl: new Date().toISOString() })
      navigate(primoPercorso(utente))
    } catch (err) {
      setErrore((err as Error).message)
    } finally {
      setInCorso(false)
    }
  }

  return (
    <div className="grid min-h-screen md:h-screen md:grid-cols-[1fr_1.1fr]">
      {/* Colonna sinistra: modulo di accesso */}
      <div className="flex items-center justify-center overflow-y-auto bg-sfondo px-6 py-10">
        <form onSubmit={invia} className="w-full max-w-[400px]">
          <img src={logo} alt="Gruppo CEC Bigoli" className="mb-10 h-24 w-full object-cover" />
          <div className="kicker mb-2">Accesso riservato</div>
          <h1 className="m-0 mb-7 text-[38px] md:text-[42px]">Entra in Gestione Immobili</h1>

          <div className="flex flex-col gap-[18px]">
            <label className="block"><span className="etichetta-campo">Chi sei?</span>
              <select value={utenteId} onChange={(e) => setUtenteId(e.target.value)} className="input">
                {UTENTI.map((u) => <option key={u.id} value={u.id}>{u.nome}{u.ruolo === 'admin' ? ' (amministratore)' : ''}</option>)}
              </select>
            </label>
            <label className="block"><span className="etichetta-campo">La tua password</span>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" className="input" />
            </label>

            {MODO_DEMO && (
              <Avviso tipo="info"><strong>Modalità dimostrativa.</strong> Le password non sono ancora configurate: i dati vengono salvati solo in questo browser e qualsiasi password è accettata. I permessi per persona sono comunque attivi.</Avviso>
            )}
            {errore && <Avviso tipo="errore">{errore}</Avviso>}
          </div>

          <Bottone type="submit" disabled={inCorso} className="mt-7 !min-h-11 w-full !text-base">
            {inCorso ? 'Verifica in corso…' : 'Entra'}
          </Bottone>
          <p className="mt-4 text-[13px] text-neutro-700">Ogni modifica viene registrata con il nome di chi la fa.</p>
        </form>
      </div>

      {/* Colonna destra: pannello scuro con griglia disegnata */}
      <div className="griglia-disegnata hidden flex-col justify-between p-14 text-sfondo md:flex">
        <div className="flex justify-between text-[11px] uppercase tracking-[0.14em] text-[rgba(242,242,243,0.7)]">
          <span>Gruppo CEC Bigoli</span><span>Roma · Milano</span>
        </div>
        <div>
          <div className="font-titolo text-[clamp(64px,8vw,112px)] font-semibold uppercase leading-[0.9]">Gestione<br />Immobili</div>
          <p className="mt-6 text-lg text-[rgba(242,242,243,0.8)]">Locazioni delle società del gruppo</p>
        </div>
        <div className="flex justify-between border-t border-[rgba(242,242,243,0.25)] pt-4 text-[11px] uppercase tracking-[0.14em] text-[rgba(242,242,243,0.7)]">
          <span>Contratti</span><span>Registro</span><span>Canoni</span><span>Condominio</span>
        </div>
      </div>
    </div>
  )
}
