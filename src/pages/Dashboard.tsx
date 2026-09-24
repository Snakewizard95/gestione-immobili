import { useSessioneAttiva } from '../lib/sessione'

export default function Dashboard() {
  const { nome } = useSessioneAttiva()
  return (
    <div>
      <h1 className="text-2xl font-semibold">Buongiorno, {nome}</h1>
      <p className="mt-1 text-gray-500">Riepilogo di contratti, incassi e scadenze. Verrà completato nella Fase 8.</p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {['Contratti attivi', 'Canone annuo totale', 'Incassi del mese', 'Scadenze prossimi 30 giorni'].map((t) => (
          <div key={t} className="rounded-xl bg-white p-5 shadow-sm">
            <div className="text-sm text-gray-500">{t}</div>
            <div className="mt-2 text-2xl font-semibold text-gray-300">—</div>
          </div>
        ))}
      </div>
    </div>
  )
}
