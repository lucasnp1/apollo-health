// The lab report reader (ios/LabReaderModule.swift): PDFKit for a PDF's text, Vision for scans and photos, on the
// phone. Null where it isn't built in (Expo Go).
import { requireOptionalNativeModule } from 'expo'

/** A piece of text and where it sits, in points with y going up (like pdf.js on the web). */
export type Item = { s: string; x: number; y: number; w: number; h: number }

type Reader = {
  readPdf(uri: string): Promise<{ pages: { items: Item[]; ocr: boolean }[] }>
  readImage(uri: string): Promise<{ items: Item[] }>
}

export const LabReader = requireOptionalNativeModule<Reader>('LabReader')
