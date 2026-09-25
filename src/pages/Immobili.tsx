import { Link } from 'react-router-dom'
import { Printer } from 'lucide-react'
import PaginaAnagrafica from '../components/PaginaAnagrafica'
import { Etichetta } from '../components/ui'
import { attivi } from '../lib/store'
import { STATI_IMMOBILE, TIPOLOGIE_IMMOBILE, etichettaDi, type Condominio, type Immobile, type Societa } from '../lib/tipi'

const VUOTO: Partial<Immobile> = {
  societa_id: '', indirizzo: '', comune: '', provincia: '', tipologia: '', foglio: '', particella: '', subalterno: '', categoria: '',
  rendita_cent: null, superficie_mq: null, condominio_id: '', millesimi: null, stato: 'libero',
  note: '',
}

export default function PaginaImmobili() {
  return (
    <PaginaAnagrafica<Immobile>
      titolo="Immobili" singolare="immobile" collezione="immobili" dipendenze={['societa', 'condomini']} vuotoNuovo={VUOTO}
      descrivi={(r) => r.indirizzo ?? ''}
      testoRicerca={(r, dati) => dati<Societa>('societa').find((s) => s.id === r.societa_id)?.ragione_sociale ?? ''}
      extraExcel={(r, dati) => ({ 'Società': dati<Societa>('societa').find((s) => s.id === r.societa_id)?.ragione_sociale ?? '', 'Condominio': dati<Condominio>('condomini').find((c) => c.id === r.condominio_id)?.denominazione ?? '' })}
      azioniRiga={(r) => <Link to={`/stampa/immobile/${r.id}`} title="Scheda immobile (stampa / PDF)" className="btn btn-secondario btn-piccolo no-underline"><Printer size={14} /> Scheda</Link>}
      sottotitolo={(tutti) => `${tutti.length} immobili di ${new Set(tutti.map((i) => i.societa_id)).size} società · ${tutti.filter((i) => i.stato === 'libero').length} liberi`}
      campi={(dati) => [
        { nome: 'societa_id', etichetta: 'Società proprietaria', tipo: 'select', obbligatorio: true,
          opzioni: attivi(dati<Societa>('societa')).map((s) => ({ valore: s.id, etichetta: s.ragione_sociale })) },
        { nome: 'stato', etichetta: 'Stato', tipo: 'select', opzioni: STATI_IMMOBILE },
        { nome: 'indirizzo', etichetta: 'Indirizzo (via, numero, interno)', tipo: 'testo', obbligatorio: true, intera: true },
        { nome: 'comune', etichetta: 'Comune', tipo: 'testo' },
        { nome: 'provincia', etichetta: 'Provincia', tipo: 'testo' },
        { nome: 'tipologia', etichetta: 'Tipologia', tipo: 'select', opzioni: TIPOLOGIE_IMMOBILE },
        { nome: 'superficie_mq', etichetta: 'Superficie (mq)', tipo: 'numero' },
        { nome: 'foglio', etichetta: 'Foglio', tipo: 'testo', sezione: 'Dati catastali', colonne: 3 },
        { nome: 'particella', etichetta: 'Particella', tipo: 'testo' },
        { nome: 'subalterno', etichetta: 'Subalterno', tipo: 'testo' },
        { nome: 'categoria', etichetta: 'Categoria (es. A/2, C/1)', tipo: 'testo' },
        { nome: 'rendita_cent', etichetta: 'Rendita catastale', tipo: 'euro' },
        { nome: 'condominio_id', etichetta: 'Condominio', tipo: 'select', sezione: 'Condominio',
          opzioni: attivi(dati<Condominio>('condomini')).map((c) => ({ valore: c.id, etichetta: c.denominazione })) },
        { nome: 'millesimi', etichetta: 'Millesimi', tipo: 'percentuale' },
        { nome: 'note', etichetta: 'Note', tipo: 'textarea' },
      ]}
      colonne={(dati) => [
        { chiave: 'soc', etichetta: 'Società', render: (r) => dati<Societa>('societa').find((s) => s.id === r.societa_id)?.ragione_sociale ?? '—' },
        { chiave: 'ind', etichetta: 'Indirizzo', render: (r) => <span className="font-medium">{r.indirizzo}</span> },
        { chiave: 'com', etichetta: 'Comune', render: (r) => r.comune || '—' },
        { chiave: 'tip', etichetta: 'Tipologia', render: (r) => etichettaDi(TIPOLOGIE_IMMOBILE, r.tipologia) },
        { chiave: 'mq', etichetta: 'Superficie', allinea: 'dx', render: (r) => (r.superficie_mq ? `${r.superficie_mq} mq` : '—') },
        { chiave: 'stato', etichetta: 'Stato', render: (r) => <Etichetta tono={r.stato === 'locato' ? 'verde' : r.stato === 'libero' ? 'giallo' : 'grigio'}>{etichettaDi(STATI_IMMOBILE, r.stato)}</Etichetta> },
      ]}
    />
  )
}
