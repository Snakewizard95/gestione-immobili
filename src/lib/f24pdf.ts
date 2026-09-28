/**
 * Compila il MODELLO UFFICIALE F24 Elide ("Versamenti con elementi identificativi") dell'Agenzia delle Entrate.
 * Il PDF vuoto è in public/moduli/F24-elide.pdf (scaricato da agenziaentrate.gov.it): non ha campi compilabili,
 * quindi i dati vengono scritti sopra, casella per casella, su tutte e tre le copie (banca, contribuente, ufficio).
 *
 * Le posizioni sono misurate su un'immagine della pagina larga 1201 pixel (pagina A4 = 595 × 842 punti)
 * e convertite in punti PDF. Se l'Agenzia cambia il modello, vanno ritarate qui.
 */
import type { DatiF24 } from './documenti'

const MODELLO = `${import.meta.env.BASE_URL}moduli/F24-elide.pdf`
const K = 595 / 1201                     // punti PDF per pixel dell'immagine di riferimento
const X = (px: number) => px * K
const Y = (py: number) => 842 - py * K   // nei PDF la y si misura dal basso

/** Caselle del modello: [x inizio, x fine, numero caselle] e riga di base del testo (pixel). */
const POS = {
  codiceFiscale: { x0: 233, x1: 698, n: 16, base: 238 },
  cognome: { x: 238, base: 283 },
  nome: { x: 848, base: 283 },
  nascitaGiorno: { x0: 233, x1: 291, n: 2, base: 332 },
  nascitaMese: { x0: 291, x1: 349, n: 2, base: 332 },
  nascitaAnno: { x0: 349, x1: 465, n: 4, base: 332 },
  sesso: { x0: 495, x1: 524, n: 1, base: 332 },
  comuneNascita: { x: 558, base: 332 },
  provNascita: { x0: 1090, x1: 1148, n: 2, base: 332 },
  domicilioComune: { x: 238, base: 380 },
  domicilioProv: { x0: 668, x1: 712, n: 2, base: 380 },
  domicilioIndirizzo: { x: 746, base: 380 },
  coobbligato: { x0: 378, x1: 843, n: 16, base: 430 },
  codiceIdentificativo: { x0: 1090, x1: 1148, n: 2, base: 430 },
  // Sezione Erario ed altro: prima riga e passo tra le righe
  primaRiga: 649, passoRiga: 24.2, righeMax: 28,
  tipo: { x0: 66, x1: 94, n: 1 },
  elementi: { x0: 116, x1: 610, n: 17 },
  codice: { x0: 626, x1: 712, n: 4 },
  anno: { x0: 727, x1: 813, n: 4 },
  euroFine: 1124,                         // le cifre intere finiscono appena prima della virgola stampata
  centesimi: { x0: 1134, x1: 1164, n: 2 },
  saldo: 1424,
}

/** Crea il PDF compilato; restituisce i byte del file. */
export async function creaF24ElidePdf(f: DatiF24): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
  const risposta = await fetch(MODELLO)
  if (!risposta.ok) throw new Error('Modello F24 Elide non trovato sul sito: riprovare o avvisare l’amministratore.')
  const doc = await PDFDocument.load(await risposta.arrayBuffer())
  const mono = await doc.embedFont(StandardFonts.Courier)
  const testo = await doc.embedFont(StandardFonts.Helvetica)
  const nero = rgb(0, 0, 0)
  const DIM = 10

  for (const p of doc.getPages()) {
    /** Un carattere per casella, centrato. */
    const caselle = (valore: string, c: { x0: number; x1: number; n: number }, base: number) => {
      const w = (c.x1 - c.x0) / c.n
      ;[...valore.toUpperCase()].slice(0, c.n).forEach((ch, i) => {
        p.drawText(ch, { x: X(c.x0 + w * (i + 0.5)) - mono.widthOfTextAtSize(ch, DIM) / 2, y: Y(base), size: DIM, font: mono, color: nero })
      })
    }
    /** Testo libero in un campo senza caselle (rimpicciolito se troppo lungo). */
    const libero = (valore: string, x: number, base: number, larghezzaMaxPx: number) => {
      if (!valore) return
      let size = 9
      while (size > 6 && testo.widthOfTextAtSize(valore, size) > X(larghezzaMaxPx)) size -= 0.5
      p.drawText(valore, { x: X(x), y: Y(base), size, font: testo, color: nero })
    }
    const importo = (cent: number, base: number) => {
      const euro = String(Math.floor(cent / 100)), dec = String(cent % 100).padStart(2, '0')
      p.drawText(euro, { x: X(POS.euroFine) - mono.widthOfTextAtSize(euro, DIM), y: Y(base), size: DIM, font: mono, color: nero })
      caselle(dec, POS.centesimi, base)
    }

    const c = f.contribuente
    caselle(c.codiceFiscale, POS.codiceFiscale, POS.codiceFiscale.base)
    libero(c.cognomeODenominazione, POS.cognome.x, POS.cognome.base, 585)
    libero(c.nome, POS.nome.x, POS.nome.base, 295)
    if (c.persona && c.dataNascita) {
      caselle(c.dataNascita.slice(8, 10), POS.nascitaGiorno, POS.nascitaGiorno.base)
      caselle(c.dataNascita.slice(5, 7), POS.nascitaMese, POS.nascitaMese.base)
      caselle(c.dataNascita.slice(0, 4), POS.nascitaAnno, POS.nascitaAnno.base)
    }
    if (c.persona) caselle(c.sesso, POS.sesso, POS.sesso.base)
    libero(c.comuneNascita, POS.comuneNascita.x, POS.comuneNascita.base, 510)
    caselle(c.provNascita, POS.provNascita, POS.provNascita.base)
    libero(c.domicilioComune, POS.domicilioComune.x, POS.domicilioComune.base, 410)
    caselle(c.domicilioProv, POS.domicilioProv, POS.domicilioProv.base)
    libero(c.domicilioIndirizzo, POS.domicilioIndirizzo.x, POS.domicilioIndirizzo.base, 400)
    caselle(f.secondoCodiceFiscale, POS.coobbligato, POS.coobbligato.base)
    if (f.secondoCodiceFiscale) caselle(f.codiceIdentificativo, POS.codiceIdentificativo, POS.codiceIdentificativo.base)

    f.righe.slice(0, POS.righeMax).forEach((r, i) => {
      const base = POS.primaRiga + i * POS.passoRiga
      caselle(r.tipo, POS.tipo, base)
      caselle(r.elementi, POS.elementi, base)
      caselle(r.codice, POS.codice, base)
      caselle(String(r.anno), POS.anno, base)
      importo(r.importo_cent, base)
    })
    importo(f.ravvedimento.totale_cent, POS.saldo)
  }
  doc.setTitle('Modello F24 Elide compilato')
  doc.setProducer('Gestione Immobili')
  return doc.save()
}

/** Apre il PDF in una nuova scheda (per stamparlo); se il browser la blocca, lo scarica. */
export function apriOScaricaPdf(byte: Uint8Array, nomeFile: string): void {
  const url = URL.createObjectURL(new Blob([byte as BlobPart], { type: 'application/pdf' }))
  const finestra = window.open(url, '_blank')
  if (!finestra) {
    const a = document.createElement('a')
    a.href = url; a.download = nomeFile
    document.body.appendChild(a); a.click(); a.remove()
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 120_000)
}
