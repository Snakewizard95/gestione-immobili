import PaginaAnagrafica from '../components/PaginaAnagrafica'
import type { Condominio } from '../lib/tipi'

const VUOTO: Partial<Condominio> = { denominazione: '', indirizzo: '', codice_fiscale: '', amministratore_nome: '', amministratore_telefono: '', amministratore_email: '', amministratore_pec: '', note: '' }

export default function PaginaCondomini() {
  return (
    <PaginaAnagrafica<Condominio>
      titolo="Condomini e amministratori" singolare="condominio" collezione="condomini" vuotoNuovo={VUOTO}
      descrivi={(r) => r.denominazione ?? ''}
      campi={() => [
        { nome: 'denominazione', etichetta: 'Denominazione condominio', tipo: 'testo', obbligatorio: true },
        { nome: 'codice_fiscale', etichetta: 'Codice fiscale condominio', tipo: 'testo' },
        { nome: 'indirizzo', etichetta: 'Indirizzo', tipo: 'testo', intera: true },
        { nome: 'amministratore_nome', etichetta: 'Amministratore (nome / studio)', tipo: 'testo', sezione: 'Amministratore', intera: true },
        { nome: 'amministratore_telefono', etichetta: 'Telefono', tipo: 'testo' },
        { nome: 'amministratore_email', etichetta: 'Email', tipo: 'testo' },
        { nome: 'amministratore_pec', etichetta: 'PEC', tipo: 'testo' },
        { nome: 'note', etichetta: 'Note', tipo: 'textarea' },
      ]}
      colonne={() => [
        { chiave: 'nome', etichetta: 'Condominio', render: (r) => <span className="font-medium">{r.denominazione}</span> },
        { chiave: 'ind', etichetta: 'Indirizzo', render: (r) => r.indirizzo || '—' },
        { chiave: 'amm', etichetta: 'Amministratore', render: (r) => r.amministratore_nome || '—' },
        { chiave: 'tel', etichetta: 'Telefono', render: (r) => r.amministratore_telefono || '—' },
        { chiave: 'email', etichetta: 'Email / PEC', render: (r) => r.amministratore_email || r.amministratore_pec || '—' },
      ]}
    />
  )
}
