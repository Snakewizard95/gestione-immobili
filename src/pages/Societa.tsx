import PaginaAnagrafica from '../components/PaginaAnagrafica'
import { Etichetta } from '../components/ui'
import type { Societa } from '../lib/tipi'

const VUOTO: Partial<Societa> = { ragione_sociale: '', tipo: 'societa', partita_iva: '', codice_fiscale: '', sede: '', pec: '', note: '' }

export default function PaginaSocieta() {
  return (
    <PaginaAnagrafica<Societa>
      titolo="Società del gruppo (locatori)" singolare="società" genere="f" collezione="societa" vuotoNuovo={VUOTO}
      descrivi={(r) => r.ragione_sociale ?? ''}
      sottotitolo={(tutti) => `${tutti.length} ${tutti.length === 1 ? 'proprietario' : 'proprietari'} degli immobili del gruppo`}
      extraExcel={(r) => ({ 'Tipo': r.tipo === 'persona' ? 'Persona fisica' : 'Società' })}
      campi={() => [
        { nome: 'ragione_sociale', etichetta: 'Ragione sociale / nome', tipo: 'testo', obbligatorio: true },
        { nome: 'tipo', etichetta: 'Tipo', tipo: 'select', opzioni: [{ valore: 'societa', etichetta: 'Società' }, { valore: 'persona', etichetta: 'Persona fisica' }] },
        { nome: 'partita_iva', etichetta: 'Partita IVA', tipo: 'testo' },
        { nome: 'codice_fiscale', etichetta: 'Codice fiscale', tipo: 'testo' },
        { nome: 'sede', etichetta: 'Sede legale', tipo: 'testo', intera: true },
        { nome: 'pec', etichetta: 'PEC', tipo: 'testo' },
        { nome: 'note', etichetta: 'Note', tipo: 'textarea' },
        { nome: 'domicilio_comune', etichetta: 'Comune del domicilio fiscale', tipo: 'testo', sezione: 'Dati per il modello F24', colonne: 3 },
        { nome: 'domicilio_prov', etichetta: 'Provincia (sigla)', tipo: 'testo' },
        { nome: 'domicilio_indirizzo', etichetta: 'Via e numero civico', tipo: 'testo' },
        { nome: 'f24_cognome', etichetta: 'Cognome (solo persona fisica)', tipo: 'testo' },
        { nome: 'f24_nome', etichetta: 'Nome (solo persona fisica)', tipo: 'testo' },
        { nome: 'f24_sesso', etichetta: 'Sesso (M o F)', tipo: 'select', opzioni: [{ valore: 'M', etichetta: 'M' }, { valore: 'F', etichetta: 'F' }], aiuto: 'Se vuoto si ricava dal codice fiscale' },
        { nome: 'f24_data_nascita', etichetta: 'Data di nascita', tipo: 'data', aiuto: 'Se vuota si ricava dal codice fiscale' },
        { nome: 'f24_comune_nascita', etichetta: 'Comune (o Stato estero) di nascita', tipo: 'testo' },
        { nome: 'f24_prov_nascita', etichetta: 'Provincia di nascita (sigla)', tipo: 'testo' },
      ]}
      colonne={() => [
        { chiave: 'nome', etichetta: 'Ragione sociale', render: (r) => <span className="font-medium">{r.ragione_sociale}</span> },
        { chiave: 'tipo', etichetta: 'Tipo', render: (r) => <Etichetta>{r.tipo === 'persona' ? 'Persona fisica' : 'Società'}</Etichetta> },
        { chiave: 'piva', etichetta: 'P. IVA / CF', render: (r) => r.partita_iva || r.codice_fiscale || '—' },
        { chiave: 'sede', etichetta: 'Sede', render: (r) => r.sede || '—' },
        { chiave: 'pec', etichetta: 'PEC', render: (r) => r.pec || '—' },
      ]}
    />
  )
}
