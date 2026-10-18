// The web code (../src) is typed for Vite: import.meta.env exists there
interface ImportMeta {
  readonly env: { readonly DEV: boolean; readonly [key: string]: unknown }
}
