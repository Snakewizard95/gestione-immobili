import PaginaAnagrafica from '../components/PaginaAnagrafica'
import { Etichetta } from '../components/ui'
import type { Conduttore } from '../lib/tipi'

const VUOTO: Partial<Conduttore> = { denominazione: '', tipo: 'societa', codice_fiscale: '', partita_iva: '', indirizzo: '', telefono: '', email: '', pec: '', note: '' }

export default function PaginaConduttori() {
  return (
    <PaginaAnagrafica<Conduttore>
      titolo="Conduttori (inquilini)" singolare="conduttore" collezione="conduttori" vuotoNuovo={VUOTO}
      descrivi={(r) => r.denominazione ?? ''}
      sottotitolo={(tutti) => `${tutti.length} ${tutti.length === 1 ? 'conduttore' : 'conduttori'} (persone e società)`}
      campi={() => [
        { nome: 'denominazione', etichetta: 'Nome / ragione sociale', tipo: 'testo', obbligatorio: true },
        { nome: 'tipo', etichetta: 'Tipo', tipo: 'select', opzioni: [{ valore: 'societa', etichetta: 'Società' }, { valore: 'persona', etichetta: 'Persona fisica' }] },
        { nome: 'codice_fiscale', etichetta: 'Codice fiscale', tipo: 'testo' },
        { nome: 'partita_iva', etichetta: 'Partita IVA', tipo: 'testo' },
        { nome: 'indirizzo', etichetta: 'Indirizzo / residenza', tipo: 'testo', intera: true },
        { nome: 'telefono', etichetta: 'Telefono', tipo: 'testo' },
        { nome: 'email', etichetta: 'Email', tipo: 'testo' },
        { nome: 'pec', etichetta: 'PEC', tipo: 'testo' },
        { nome: 'note', etichetta: 'Note', tipo: 'textarea' },
      ]}
      colonne={() => [
        { chiave: 'nome', etichetta: 'Conduttore', render: (r) => <span className="font-medium">{r.denominazione}</span> },
        { chiave: 'tipo', etichetta: 'Tipo', render: (r) => <Etichetta>{r.tipo === 'persona' ? 'Persona fisica' : 'Società'}</Etichetta> },
        { chiave: 'cf', etichetta: 'CF / P. IVA', render: (r) => r.codice_fiscale || r.partita_iva || '—' },
        { chiave: 'tel', etichetta: 'Telefono', render: (r) => r.telefono || '—' },
        { chiave: 'email', etichetta: 'Email / PEC', render: (r) => r.email || r.pec || '—' },
      ]}
    />
  )
}
