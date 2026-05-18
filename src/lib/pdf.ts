const knownMarkers = [
  'Total Testosterone',
  'Free Testosterone',
  'Testosterone',
  'Estradiol',
  'SHBG',
  'Hematocrit',
  'Hemoglobin',
  'PSA',
  'ALT',
  'AST',
  'HDL',
  'LDL',
  'Triglycerides',
  'Creatinine',
  'eGFR',
  'Glucose',
  'HbA1c',
  'TSH',
  'Ferritin',
]

export type ExtractedMarker = {
  marker: string
  value: number
  unit: string
}

export async function extractPdfText(file: File) {
  const [pdfjs, pdfWorkerUrl] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.mjs?url'),
  ])
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl.default

  const buffer = await file.arrayBuffer()
  const document = await pdfjs.getDocument({ data: buffer }).promise
  const pageTexts: string[] = []

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber)
    const content = await page.getTextContent()
    const text = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .filter(Boolean)
      .join(' ')
    pageTexts.push(text)
  }

  return pageTexts.join('\n')
}

export function extractMarkersFromText(text: string): ExtractedMarker[] {
  const normalized = text.replace(/\s+/g, ' ')
  const results = new Map<string, ExtractedMarker>()

  for (const marker of knownMarkers) {
    const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(`${escaped}[^0-9-]{0,48}(-?\\d+(?:\\.\\d+)?)\\s*([a-zA-Z/%µ]+(?:/[a-zA-Z]+)?)?`, 'i')
    const match = normalized.match(regex)

    if (match) {
      results.set(marker, {
        marker,
        value: Number(match[1]),
        unit: match[2] || '',
      })
    }
  }

  return Array.from(results.values()).slice(0, 16)
}
