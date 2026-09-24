import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { FornitoreSessione, useSessione } from './lib/sessione'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Impostazioni from './pages/Impostazioni'
import Segnaposto from './pages/Segnaposto'
import PaginaSocieta from './pages/Societa'
import PaginaImmobili from './pages/Immobili'
import PaginaConduttori from './pages/Conduttori'
import PaginaCondomini from './pages/Condomini'
import PaginaContratti from './pages/Contratti'
import PaginaImporta from './pages/Importa'
import PaginaStorico from './pages/Storico'

/** Mostra le pagine interne solo se l'utente ha effettuato l'accesso. */
function AreaProtetta() {
  const { sessione } = useSessione()
  if (!sessione) return <Navigate to="/login" replace />
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/societa" element={<PaginaSocieta />} />
        <Route path="/immobili" element={<PaginaImmobili />} />
        <Route path="/conduttori" element={<PaginaConduttori />} />
        <Route path="/condomini" element={<PaginaCondomini />} />
        <Route path="/contratti" element={<PaginaContratti />} />
        <Route path="/canoni" element={<Segnaposto titolo="Canoni e incassi" fase={4} />} />
        <Route path="/condominio" element={<Segnaposto titolo="Oneri condominiali" fase={5} />} />
        <Route path="/importa" element={<PaginaImporta />} />
        <Route path="/storico" element={<PaginaStorico />} />
        <Route path="/impostazioni" element={<Impostazioni />} />
        <Route path="*" element={<Navigate to="/" replace />} />
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
