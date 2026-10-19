// Dexie runs on an in-memory IndexedDB (fake-indexeddb), so the web app's db.ts and the logic around it work
// unchanged. This keeps the data on the device: every committed write is copied into SQLite, and launch loads it back.
// Same layer as Liber's (lingua-native mobile/src/data/persist.ts), minus its image files.
// ponytail: everything sits in memory; a person logs a few thousand rows a year, so that holds for a long time.
// HealthFile.blob (a PDF) can't go through JSON: lab file bytes get their own table when PDF import lands (phase 3).
import type { DBCore, DBCoreMutateRequest, DBCoreTransaction } from 'dexie'
import * as SQLite from 'expo-sqlite'
import { Alert, AppState } from 'react-native'
import { db } from '@shared/lib/db'

const sql = SQLite.openDatabaseSync('magno.db')
// WAL: a commit appends instead of rewriting through a journal, so the save after each change blocks less
sql.execSync(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS rows (tbl TEXT NOT NULL, key TEXT NOT NULL, val TEXT NOT NULL, PRIMARY KEY (tbl, key));
`)

type Op = () => void

/** Writes wait for their transaction to commit, so a rolled-back change never reaches the disk. */
const pending = new WeakMap<DBCoreTransaction, Op[]>()
function after(trans: DBCoreTransaction, ops: Op[]) {
  const t = trans as unknown as IDBTransaction
  let q = pending.get(trans)
  if (!q) {
    pending.set(trans, (q = []))
    t.addEventListener('complete', () => {
      unsaved.push(...q!)
      flush()
    })
  }
  q.push(...ops)
}

// Committed changes not on the disk yet, in order. A write that fails (the phone is full) never throws out of the
// commit, where it would close the app and lose the change: it stays here and goes down with the next commit, or when
// the app comes back to the front, and you're told once.
let unsaved: Op[] = []
let told = false
function flush() {
  if (!unsaved.length) return
  try {
    sql.withTransactionSync(() => unsaved.forEach((op) => op()))
    unsaved = []
    told = false
  } catch (err) {
    console.warn('Magno: saving to the device failed, will retry', err)
    if (told) return
    told = true
    const full = /full|space/i.test(String(err))
    Alert.alert(
      "Not saved on this phone yet",
      full
        ? "Your phone is full, so Magno can't keep your latest entries yet. Free up some space and they'll be saved."
        : "Magno couldn't save your latest entry on this phone. It will keep trying.",
      [{ text: 'Try again', onPress: flush }, { text: 'OK' }],
    )
  }
}
AppState.addEventListener('change', (s) => void (s !== 'unknown' && flush()))

function ops(tbl: string, key: string, req: DBCoreMutateRequest): Op[] {
  if (req.type === 'add' || req.type === 'put')
    return req.values.map((v) => () => sql.runSync('INSERT OR REPLACE INTO rows (tbl, key, val) VALUES (?, ?, ?)', [tbl, String(v[key]), JSON.stringify(v)]))
  if (req.type === 'delete') return req.keys.map((k) => () => sql.runSync('DELETE FROM rows WHERE tbl = ? AND key = ?', [tbl, String(k)]))
  // deleteRange: only clear() uses it here, so drop the whole table
  return [() => sql.runSync('DELETE FROM rows WHERE tbl = ?', [tbl])]
}

let loading = false

db.use({
  stack: 'dbcore',
  name: 'sqlite',
  create: (down: DBCore) => ({
    ...down,
    table: (name: string) => {
      const t = down.table(name)
      const key = t.schema.primaryKey.keyPath as string
      return {
        ...t,
        // .then, not async/await: Dexie's own promise keeps the transaction alive, a native one can let it commit early
        // Magno's ids are auto-increment, so a new row's key is only known once IndexedDB made it: ask for the keys back
        mutate: (req: DBCoreMutateRequest) =>
          t.mutate(req.type === 'add' || req.type === 'put' ? { ...req, wantResults: true } : req).then((res) => {
            if (loading) return res
            if ((req.type === 'add' || req.type === 'put') && res.results)
              req = { ...req, values: req.values.map((v, i) => (v[key] == null ? { ...v, [key]: res.results![i] } : v)) }
            after(req.trans, ops(name, key, req))
            return res
          }),
      }
    },
  }),
})

/** Fill Dexie from SQLite. Call once at launch, before anything reads or writes. */
export async function loadData() {
  loading = true
  try {
    const by = new Map<string, unknown[]>()
    for (const r of sql.getAllSync<{ tbl: string; val: string }>('SELECT tbl, val FROM rows')) {
      if (!by.has(r.tbl)) by.set(r.tbl, [])
      by.get(r.tbl)!.push(JSON.parse(r.val))
    }
    // Straight into IndexedDB, under Dexie: these rows are already saved, so the web's sync hooks (which make Dexie
    // look up every row before a put) and this file's own copy-to-SQLite have nothing to do. Several times faster.
    await db.open()
    const idb = db.backendDB()
    const stores = [...by.keys()].filter((t) => idb.objectStoreNames.contains(t))
    if (stores.length)
      await new Promise<void>((resolve, reject) => {
        const tx = idb.transaction(stores, 'readwrite')
        for (const t of stores) {
          const store = tx.objectStore(t)
          for (const v of by.get(t)!) store.put(v)
        }
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
        tx.onabort = () => reject(tx.error)
      })
    keepTransactionsShort()
  } finally {
    loading = false
  }
}

/**
 * fake-indexeddb keeps every transaction it has run and scans the whole list each time one starts or ends, so a long
 * session got slower and held on to every record it overwrote. Finished ones are let go before each scan.
 */
function keepTransactionsShort() {
  type Raw = { transactions: { _state: string }[]; processTransactions: () => void }
  const raw = (db.backendDB() as unknown as { _rawDatabase?: Raw })._rawDatabase
  if (!raw) return
  const scan = raw.processTransactions
  raw.processTransactions = () => {
    raw.transactions = raw.transactions.filter((t) => t._state !== 'finished')
    scan()
  }
}
