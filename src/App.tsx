import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { FornitoreSessione, useSessione } from './lib/sessione'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Impostazioni from './pages/Impostazioni'
import Segnaposto from './pages/Segnaposto'

/** Mostra le pagine interne solo se l'utente ha effettuato l'accesso. */
function AreaProtetta() {
  const { sessione } = useSessione()
  if (!sessione) return <Navigate to="/login" replace />
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/societa" element={<Segnaposto titolo="Società" fase={2} />} />
        <Route path="/immobili" element={<Segnaposto titolo="Immobili" fase={2} />} />
        <Route path="/conduttori" element={<Segnaposto titolo="Conduttori" fase={2} />} />
        <Route path="/condomini" element={<Segnaposto titolo="Condomini e amministratori" fase={2} />} />
        <Route path="/contratti" element={<Segnaposto titolo="Contratti di locazione" fase={3} />} />
        <Route path="/canoni" element={<Segnaposto titolo="Canoni e incassi" fase={4} />} />
        <Route path="/condominio" element={<Segnaposto titolo="Oneri condominiali" fase={5} />} />
        <Route path="/importa" element={<Segnaposto titolo="Importa da Excel" fase={7} />} />
        <Route path="/storico" element={<Segnaposto titolo="Storico modifiche" fase={8} />} />
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
