import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { FornitoreSessione, useSessione, useUtente } from './lib/sessione'
import { ContestoSoloLettura } from './components/SoloLettura'
import { primoPercorso, puoModificare, puoVedere, type Sezione } from './lib/permessi'
import type { ReactNode } from 'react'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Impostazioni from './pages/Impostazioni'
import PaginaSocieta from './pages/Societa'
import PaginaImmobili from './pages/Immobili'
import PaginaConduttori from './pages/Conduttori'
import PaginaCondomini from './pages/Condomini'
import PaginaContratti from './pages/Contratti'
import PaginaImporta from './pages/Importa'
import PaginaStorico from './pages/Storico'
import PaginaRegistro from './pages/Registro'
import PaginaCanoni from './pages/Canoni'
import PaginaCondominio from './pages/Condominio'
import SchedaImmobile from './pages/SchedaImmobile'

/** Mostra le pagine interne solo se l'utente ha effettuato l'accesso. */
function AreaProtetta() {
  const { sessione } = useSessione()
  if (!sessione) return <Navigate to="/login" replace />
  return (
    <Routes>
      <Route path="/stampa/immobile/:id" element={<Guardia sezione="contratti"><SchedaImmobile /></Guardia>} />
      <Route path="/*" element={<AreaConMenu />} />
    </Routes>
  )
}

/** Controlla il permesso dell'utente sulla sezione: se non può vederla lo rimanda alla prima consentita; se può solo leggerla, attiva la sola lettura. */
function Guardia({ sezione, children }: { sezione: Sezione; children: ReactNode }) {
  const utente = useUtente()
  if (!puoVedere(utente, sezione)) return <Navigate to={primoPercorso(utente)} replace />
  return <ContestoSoloLettura.Provider value={!puoModificare(utente, sezione)}>{children}</ContestoSoloLettura.Provider>
}

function AreaConMenu() {
  const utente = useUtente()
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Guardia sezione="dashboard"><Dashboard /></Guardia>} />
        <Route path="/societa" element={<Guardia sezione="anagrafiche"><PaginaSocieta /></Guardia>} />
        <Route path="/immobili" element={<Guardia sezione="anagrafiche"><PaginaImmobili /></Guardia>} />
        <Route path="/conduttori" element={<Guardia sezione="anagrafiche"><PaginaConduttori /></Guardia>} />
        <Route path="/condomini" element={<Guardia sezione="anagrafiche"><PaginaCondomini /></Guardia>} />
        <Route path="/contratti" element={<Guardia sezione="contratti"><PaginaContratti /></Guardia>} />
        <Route path="/registro" element={<Guardia sezione="registro"><PaginaRegistro /></Guardia>} />
        <Route path="/canoni" element={<Guardia sezione="canoni"><PaginaCanoni /></Guardia>} />
        <Route path="/condominio" element={<Guardia sezione="condominio"><PaginaCondominio /></Guardia>} />
        <Route path="/importa" element={<Guardia sezione="importa"><PaginaImporta /></Guardia>} />
        <Route path="/storico" element={<Guardia sezione="storico"><PaginaStorico /></Guardia>} />
        <Route path="/impostazioni" element={<Guardia sezione="impostazioni"><Impostazioni /></Guardia>} />
        <Route path="*" element={<Navigate to={primoPercorso(utente)} replace />} />
      </Routes>
    </Layout>
  )
}

export default function App() {
  return (
    <FornitoreSessione>
      {/* HashRouter: gli indirizzi usano "#/..." così GitHub Pages non dà mai "404" al ricaricamento */}
      <HashRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/*" element={<AreaProtetta />} />
        </Routes>
      </HashRouter>
    </FornitoreSessione>
  )
}
