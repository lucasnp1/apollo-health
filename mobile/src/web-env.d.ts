// The web code (../src) is typed for Vite: import.meta.env exists there
interface ImportMeta {
  readonly env: { readonly DEV: boolean; readonly [key: string]: unknown }
}

// Browser-only libraries the web's pdf.ts and ocr.ts load; metro.config.js serves src/data/webOnly.js for them
declare module 'pdfjs-dist' {
  export type PDFPageProxy = any
  export const GlobalWorkerOptions: any
  export const getDocument: any
  export const OPS: any
}
declare module 'pdfjs-dist/build/pdf.worker.mjs?url' {
  const url: string
  export default url
}
declare module 'tesseract.js' {
  export type Worker = {
    recognize(img: unknown): Promise<{ data: { text: string } }>
    setParameters(p: object): Promise<unknown>
    terminate(): Promise<unknown>
  }
  export const createWorker: (...args: any[]) => Promise<Worker>
  export const OEM: any
  export const PSM: any
}
