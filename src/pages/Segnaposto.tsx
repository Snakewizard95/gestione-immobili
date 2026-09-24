/** Pagina provvisoria per le sezioni non ancora sviluppate. */
export default function Segnaposto({ titolo, fase }: { titolo: string; fase: number }) {
  return (
    <div>
      <h1 className="text-2xl font-semibold">{titolo}</h1>
      <div className="mt-6 rounded-xl border-2 border-dashed border-gray-300 bg-white p-10 text-center text-gray-500">
        Questa sezione verrà realizzata nella <strong>Fase {fase}</strong> del progetto.
      </div>
    </div>
  )
}
