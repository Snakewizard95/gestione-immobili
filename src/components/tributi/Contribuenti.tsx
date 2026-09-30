/**
 * Scheda "Società" della sezione Tributi: elenco dei contribuenti (società che ricevono avvisi e cartelle)
 * con responsabile, email, collegamento facoltativo alle anagrafiche della piattaforma immobili.
 */
import { useState } from 'react'
import { Plus } from 'lucide-react'
import { normalizzaNome, vuotoContribuente } from '../../lib/importaTributi'
import { useSessioneAttiva } from '../../lib/sessione'
import { aggiorna, attivi, campiModifica } from '../../lib/store'
import type { Conduttore, Contribuente, PraticaTributo, Societa } from '../../lib/tipi'
import { daInserire, inCorso } from '../../lib/tributi'
import { useCollezioni } from '../../lib/useCollezioni'
import Modulo, { type CampoDef } from '../Modulo'
import { SoloSeModifica } from '../SoloLettura'
import { BarraRicerca, Bottone, Finestra, Tabella, filtraTesto } from '../ui'

type Valori = Contribuente & { alias_testo: string }

export default function Contribuenti({ contribuenti, pratiche }: { contribuenti: Contribuente[]; pratiche: PraticaTributo[] }) {
  const { token, nome } = useSessioneAttiva()
  const { dati } = useCollezioni(['societa', 'conduttori'])
  const [ricerca, setRicerca] = useState('')
  const [aperto, setAperto] = useState<Partial<Valori> | null>(null)

  const societa = attivi(dati<Societa>('societa')).sort((a, b) => a.ragione_sociale.localeCompare(b.ragione_sociale, 'it'))
  const conduttori = attivi(dati<Conduttore>('conduttori')).sort((a, b) => a.denominazione.localeCompare(b.denominazione, 'it'))
  const righe = filtraTesto(contribuenti, ricerca, (c) => (c.alias ?? []).join(' '))

  const campi: CampoDef<Valori>[] = [
    { nome: 'nome', etichetta: 'Nome breve', tipo: 'testo', obbligatorio: true, aiuto: 'Il nome usato dagli studi e nelle mail (es. "Montesacro")' },
    { nome: 'ragione_sociale', etichetta: 'Ragione sociale', tipo: 'testo' },
    { nome: 'codice_fiscale', etichetta: 'Codice fiscale', tipo: 'testo' },
    { nome: 'partita_iva', etichetta: 'Partita IVA', tipo: 'testo' },
    { nome: 'responsabile', etichetta: 'Responsabile', tipo: 'testo', sezione: 'Chi decide rate e pagamenti', colonne: 3 },
    { nome: 'email', etichetta: 'Email', tipo: 'testo' },
    { nome: 'email_cc', etichetta: 'Email in copia (facoltativa)', tipo: 'testo' },
    { nome: 'studio', etichetta: 'Studio che la segue', tipo: 'testo', sezione: 'Altro', aiuto: 'Es. "DBI Milano"' },
    { nome: 'alias_testo', etichetta: 'Altri nomi con cui compare', tipo: 'testo', doppia: true, aiuto: 'Separati da virgola, es. "Re di Roma, S.G. Re": servono per riconoscerla negli Excel' },
    { nome: 'societa_id', etichetta: 'È anche una società proprietaria di immobili?', tipo: 'select', opzioni: societa.map((s) => ({ valore: s.id, etichetta: s.ragione_sociale })) },
    { nome: 'conduttore_id', etichetta: 'È anche un conduttore dei nostri immobili?', tipo: 'select', opzioni: conduttori.map((c) => ({ valore: c.id, etichetta: c.denominazione })) },
    { nome: 'note', etichetta: 'Note', tipo: 'textarea' },
  ]

  async function salva(v: Partial<Valori>) {
    const nomeNuovo = (v.nome ?? '').trim()
    const doppione = contribuenti.find((c) => c.id !== v.id && [c.nome, ...(c.alias ?? [])].some((x) => normalizzaNome(x) === normalizzaNome(nomeNuovo)))
    if (doppione) throw new Error(`Esiste già la società "${doppione.nome}" con questo nome (o alias).`)
    const alias = (v.alias_testo ?? '').split(',').map((a) => a.trim()).filter(Boolean)
    const { alias_testo: _ignora, ...resto } = v
    void _ignora
    const record = { ...resto, nome: nomeNuovo, alias } as Contribuente
    if (v.id) {
      await aggiorna<Contribuente>(token, 'contribuenti', (rec) => rec.map((c) => (c.id === v.id ? { ...c, ...record, ...campiModifica(nome) } : c)), `${nome}: modifica società tributi ${nomeNuovo}`)
    } else {
      const nuovo = vuotoContribuente(nome, nomeNuovo)
      await aggiorna<Contribuente>(token, 'contribuenti', (rec) => [...rec, { ...nuovo, ...record, id: nuovo.id, creato_il: nuovo.creato_il, creato_da: nuovo.creato_da, eliminato_il: null }], `${nome}: nuova società tributi ${nomeNuovo}`)
    }
    setAperto(null)
  }

  async function elimina() {
    if (!aperto?.id) return
    if (pratiche.some((p) => p.contribuente_id === aperto.id)) throw new Error('Questa società ha delle pratiche: non si può eliminare.')
    await aggiorna<Contribuente>(token, 'contribuenti', (rec) => rec.map((c) => (c.id === aperto.id ? { ...c, eliminato_il: new Date().toISOString(), ...campiModifica(nome) } : c)), `${nome}: elimina società tributi ${aperto.nome}`)
    setAperto(null)
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <BarraRicerca valore={ricerca} onChange={setRicerca} segnaposto="Cerca società, responsabile, email…" />
        <span className="text-[13px] text-neutro-700">{righe.length} società</span>
        <SoloSeModifica>
          <Bottone className="ml-auto" onClick={() => setAperto({ nome: '', alias_testo: '' })}><Plus size={16} /> Nuova società</Bottone>
        </SoloSeModifica>
      </div>
      <Tabella righe={righe} onRiga={(c) => setAperto({ ...c, alias_testo: (c.alias ?? []).join(', ') })} vuoto="Nessuna società." colonne={[
        { chiave: 'n', etichetta: 'Società', render: (c) => <span className="font-medium">{c.nome}</span> },
        { chiave: 'r', etichetta: 'Responsabile', render: (c) => c.responsabile || <span className="text-neutro-500">da inserire</span> },
        { chiave: 'e', etichetta: 'Email', render: (c) => c.email || '—' },
        { chiave: 's', etichetta: 'Studio', render: (c) => c.studio || '—' },
        { chiave: 'p', etichetta: 'Piani in corso', allinea: 'dx', render: (c) => pratiche.filter((p) => p.contribuente_id === c.id && inCorso(p)).length || '—' },
        { chiave: 'a', etichetta: 'Piani da inserire', allinea: 'dx', render: (c) => pratiche.filter((p) => p.contribuente_id === c.id && daInserire(p)).length || '—' },
        { chiave: 'l', etichetta: 'Collegata a', render: (c) => [societa.find((s) => s.id === c.societa_id)?.ragione_sociale, conduttori.find((k) => k.id === c.conduttore_id) && `conduttore ${conduttori.find((k) => k.id === c.conduttore_id)!.denominazione}`].filter(Boolean).join(' · ') || '—' },
      ]} />
      <Finestra kicker="Tributi · Società" titolo={aperto?.id ? `Modifica ${aperto.nome}` : 'Nuova società'} aperta={aperto !== null} onChiudi={() => setAperto(null)} larga>
        {aperto && <Modulo<Valori> campi={campi} iniziale={aperto} onSalva={salva} onAnnulla={() => setAperto(null)} onElimina={aperto.id ? elimina : undefined} />}
      </Finestra>
    </div>
  )
}
