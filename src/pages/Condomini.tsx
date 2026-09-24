import PaginaAnagrafica from '../components/PaginaAnagrafica'
import { Etichetta } from '../components/ui'
import { useSessioneAttiva } from '../lib/sessione'
import { aggiorna, attivi, campiModifica } from '../lib/store'
import type { Condominio, Immobile, Societa } from '../lib/tipi'

const VUOTO: Partial<Condominio> = { denominazione: '', indirizzo: '', codice_fiscale: '', amministratore_nome: '', amministratore_telefono: '', amministratore_email: '', amministratore_pec: '', iban: '', iban_intestatario: '', note: '' }

type ConForm = Condominio & { immobili_ids: string[] }

export default function PaginaCondomini() {
  const { token, nome } = useSessioneAttiva()

  /** Collega/scollega gli immobili scelti nel modulo: imposta immobile.condominio_id. */
  async function collegaImmobili(condominioId: string, valori: Record<string, unknown>) {
    const scelti = (valori.immobili_ids as string[] | undefined) ?? []
    await aggiorna<Immobile>(token, 'immobili', (rec) => rec.map((i) => {
      const era = i.condominio_id === condominioId, sara = scelti.includes(i.id)
      if (era === sara) return i
      return { ...i, condominio_id: sara ? condominioId : '', ...campiModifica(nome) }
    }), `${nome}: aggiorna immobili collegati al condominio ${(valori.denominazione as string) ?? ''}`)
  }

  return (
    <PaginaAnagrafica<ConForm>
      titolo="Condomini e amministratori" singolare="condominio" collezione="condomini" dipendenze={['immobili', 'societa']} vuotoNuovo={VUOTO as Partial<ConForm>}
      descrivi={(r) => r.denominazione ?? ''}
      campiVirtuali={['immobili_ids']}
      prepara={(r, dati) => ({ immobili_ids: r.id ? attivi(dati<Immobile>('immobili')).filter((i) => i.condominio_id === r.id).map((i) => i.id) : [] })}
      dopoSalva={collegaImmobili}
      testoRicerca={(r, dati) => attivi(dati<Immobile>('immobili')).filter((i) => i.condominio_id === r.id).map((i) => i.indirizzo).join(' ')}
      campi={(dati) => {
        const societa = attivi(dati<Societa>('societa'))
        const immobili = attivi(dati<Immobile>('immobili')).sort((a, b) => a.indirizzo.localeCompare(b.indirizzo))
        return [
          { nome: 'denominazione', etichetta: 'Denominazione condominio', tipo: 'testo', obbligatorio: true },
          { nome: 'codice_fiscale', etichetta: 'Codice fiscale condominio', tipo: 'testo' },
          { nome: 'indirizzo', etichetta: 'Indirizzo del condominio', tipo: 'testo', intera: true },
          { nome: 'immobili_ids', etichetta: 'Immobili del gruppo in questo condominio', tipo: 'multiselect', obbligatorio: true,
            aiuto: 'Puoi selezionarne più di uno: ognuno avrà la propria situazione di bollettini e pagamenti, ma lo stesso amministratore.',
            opzioni: immobili.map((i) => ({ valore: i.id, etichetta: `${i.indirizzo} — ${societa.find((s) => s.id === i.societa_id)?.ragione_sociale ?? ''}` })) },
          { nome: 'amministratore_nome', etichetta: 'Amministratore (nome / studio)', tipo: 'testo', sezione: 'Amministratore', intera: true },
          { nome: 'amministratore_telefono', etichetta: 'Telefono', tipo: 'testo' },
          { nome: 'amministratore_email', etichetta: 'Email', tipo: 'testo' },
          { nome: 'amministratore_pec', etichetta: 'PEC', tipo: 'testo' },
          { nome: 'iban', etichetta: 'IBAN del condominio (per i bonifici)', tipo: 'testo', sezione: 'Coordinate bancarie', intera: true },
          { nome: 'iban_intestatario', etichetta: 'Intestatario del conto', tipo: 'testo', intera: true },
          { nome: 'note', etichetta: 'Note', tipo: 'textarea' },
        ]
      }}
      colonne={(dati) => [
        { chiave: 'nome', etichetta: 'Condominio', render: (r) => <span className="font-medium">{r.denominazione}</span> },
        { chiave: 'imm', etichetta: 'Immobili collegati', render: (r) => { const n = attivi(dati<Immobile>('immobili')).filter((i) => i.condominio_id === r.id); return n.length ? <span>{n.map((i) => i.indirizzo).join(', ')}</span> : <Etichetta tono="giallo">nessuno</Etichetta> } },
        { chiave: 'amm', etichetta: 'Amministratore', render: (r) => r.amministratore_nome || '—' },
        { chiave: 'tel', etichetta: 'Telefono', render: (r) => r.amministratore_telefono || '—' },
        { chiave: 'iban', etichetta: 'IBAN', render: (r) => r.iban ? <span className="font-mono text-xs">{r.iban}</span> : '—' },
      ]}
    />
  )
}
