// Magno's own server (accounts, sync). The shared code calls it with relative paths (/api/...), as the web app does
// from its own origin; polyfills.ts sends those here.
export const API = process.env.EXPO_PUBLIC_API ?? 'https://magno.fit'
