/**
 * Fornitori: fatture da pagare e pagate di ogni studio (scheda Studi) e situazione delle royalty Tecnocasa e
 * Tecnomedia degli uffici che le pagano (scheda Royalty). Gli studi sono gli stessi uffici dei tributi (collezione contribuenti).
 */
import { useSearchParams } from 'react-router-dom'
import ElencoStudi from '../components/fornitori/ElencoStudi'
import GrigliaRoyalty from '../components/fornitori/GrigliaRoyalty'
import { Avviso, Caricamento, IntestazionePagina, Segmentato } from '../components/ui'
import { attivi } from '../lib/store'
import type { Contribuente, FatturaFornitore } from '../lib/tipi'
import { useCollezioni } from '../lib/useCollezioni'

export default function PaginaFornitori() {
  const { dati, caricamento, errore } = useCollezioni(['contribuenti', 'fatture_fornitori'])
  // La scheda aperta sta nell'indirizzo (?scheda=royalty): tornando da una stampa si riapre quella giusta
  const [parametri, setParametri] = useSearchParams()
  const scheda: 'studi' | 'royalty' = parametri.get('scheda') === 'royalty' ? 'royalty' : 'studi'
  const setScheda = (s: 'studi' | 'royalty') => setParametri(s === 'royalty' ? { scheda: s } : {}, { replace: true })
  const studi = attivi(dati<Contribuente>('contribuenti')).sort((a, b) => a.nome.localeCompare(b.nome, 'it'))
  const fatture = attivi(dati<FatturaFornitore>('fatture_fornitori'))
  return (
    <div>
      <IntestazionePagina kicker="Amministrazione" titolo="Fornitori"
        sottotitolo="Fatture dei fornitori di ogni studio, da pagare e pagate, e situazione delle royalty Tecnocasa e Tecnomedia."
        azioni={<Segmentato valore={scheda} onChange={setScheda} opzioni={[{ valore: 'studi', etichetta: 'Studi' }, { valore: 'royalty', etichetta: 'Royalty' }]} />} />
      {errore && <div className="mb-4"><Avviso tipo="errore">{errore}</Avviso></div>}
      {caricamento && !errore ? <Caricamento /> : scheda === 'studi' ? <ElencoStudi studi={studi} fatture={fatture} /> : <GrigliaRoyalty studi={studi} fatture={fatture} />}
    </div>
  )
}
