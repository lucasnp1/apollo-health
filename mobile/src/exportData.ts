// Everything you logged, as one JSON file to save or send: free for everyone, always (never behind a paywall).
import { File, Paths } from 'expo-file-system'
import * as Sharing from 'expo-sharing'
import { db } from '@shared/lib/db'

export async function exportAll() {
  const tables = ['compounds', 'injections', 'vitals', 'bodyMetrics', 'symptoms', 'exams', 'results', 'phlebotomies'] as const
  const data: Record<string, unknown[]> = {}
  for (const t of tables) data[t] = (await db.table(t).toArray()).filter((r) => !r.deletedAtSync)
  const file = new File(Paths.cache, `magno-export-${new Date().toISOString().slice(0, 10)}.json`)
  if (file.exists) file.delete()
  file.create()
  file.write(JSON.stringify({ app: 'Magno', exportedAt: new Date().toISOString(), ...data }, null, 2))
  await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Export your Magno data', UTI: 'public.json' })
}
