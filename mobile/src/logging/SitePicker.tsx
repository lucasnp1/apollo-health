// Where the shot went, with rotation, as the web's SitePicker: each rotation site shows when this exact spot was last
// used and when the spot next to it on the same muscle was, the longest rested one is marked Next, and "Other site" is
// one menu of every other site for the route, plus typing your own.
import * as Haptics from 'expo-haptics'
import { SymbolView } from 'expo-symbols'
import { useMemo, useState } from 'react'
import { type ColorValue, Pressable, StyleSheet, Text, View } from 'react-native'
import type { InjectionLog } from '@shared/lib/db'
import { canonicalSite, type CatalogSite, customSite, groupOf, isCustomSite, quickSites, REGIONS, type Route, siteLabel } from '@shared/lib/sites'
import { FieldRow, Input, MenuPicker, s as kit } from '@/kit'
import { C, F } from '@/theme'

const DAY = 86_400_000
const NONE = ''
const OTHER = '__other'
const routeOf = (i: InjectionLog): Route => (i.route === 'SubQ' ? 'SubQ' : 'IM')

function dayLabel(d: number): string {
  if (d < 0.5) return 'today'
  if (d < 1.5) return 'yesterday'
  return `${Math.round(d)} days ago`
}

// rested: free. near: a spot next to it on the same muscle was used (soft). caution / avoid: you used THIS spot.
type Status = 'rested' | 'near' | 'caution' | 'avoid'
const INK: Record<Status, ColorValue> = { rested: C.good, near: C.warn, caution: C.warn, avoid: C.danger }

export function SitePicker({ route, value, injections, onChange }: {
  route: Route
  value: string
  injections: InjectionLog[]
  onChange: (site: string) => void
}) {
  const [typing, setTyping] = useState(false)

  const rows = useMemo(() => {
    const now = Date.now()
    // The rotation in body order, then sites you typed yourself on this route
    const base = quickSites(route)
    const seen = new Set(base.map((q) => q.site.toLowerCase()))
    const typed: CatalogSite[] = []
    const bySite = new Map<string, number>()
    for (const i of injections) {
      if (!i.site || routeOf(i) !== route) continue
      const site = canonicalSite(i.site)
      const k = site.toLowerCase()
      const d = (now - Date.parse(i.takenAt)) / DAY
      if (!bySite.has(k) || d < bySite.get(k)!) bySite.set(k, d)
      if (!seen.has(k) && isCustomSite(site)) {
        seen.add(k)
        typed.push(customSite(site))
      }
    }
    typed.sort((a, b) => a.site.localeCompare(b.site))
    const list = [...base, ...typed].map((q) => {
      const exact = bySite.get(q.site.toLowerCase()) ?? Infinity
      // The spot next to it: the most recent other site on the same muscle
      let near: { days: number; site: string } | undefined
      for (const [k, d] of bySite) if (k !== q.site.toLowerCase() && groupOf(k) === q.group && (!near || d < near.days)) near = { days: d, site: k }
      let status: Status
      let label: string
      if (exact < 4) [status, label] = ['avoid', `This spot, ${dayLabel(exact)}`]
      else if (exact < 10) [status, label] = ['caution', `This spot, ${dayLabel(exact)}`]
      else if (near && near.days < 7 && near.site.toLowerCase() !== q.site.toLowerCase())
        [status, label] = ['near', `${siteLabel(near.site)} ${dayLabel(near.days)}`]
      else [status, label] = ['rested', Number.isFinite(exact) ? `Rested, ${dayLabel(exact)}` : 'Rested, never used']
      return { q, status, label, exact, near }
    })
    // Next: the rested rotation site that has waited longest (never used beats any number of days)
    let next: string | undefined
    let best = -1
    for (const r of list) if (!r.q.custom && r.status === 'rested' && r.exact > best) [best, next] = [r.exact, r.q.site]
    return { list, next, onList: new Set(list.map((r) => r.q.site)) }
  }, [injections, route])

  const picked = canonicalSite(value)
  const others = REGIONS[route]
    .map((r) => ({ label: r.label, sites: r.sites.filter((x) => !rows.onList.has(x.site)) }))
    .filter((r) => r.sites.length)
  const inCatalog = others.some((r) => r.sites.some((x) => x.site === picked))
  const offList = !!value.trim() && !rows.onList.has(picked)

  return (
    <View style={{ gap: 10 }}>
      <View style={p.grid}>
        {rows.list.map(({ q, status, label, exact, near }) => {
          const on = picked === q.site
          const next = rows.next === q.site && !on
          return (
            <Pressable
              key={q.site}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${siteLabel(q.site)}. ${label}${next ? '. Suggested next' : ''}`}
              onPress={() => {
                void Haptics.selectionAsync()
                onChange(on ? '' : q.site)
              }}
              style={({ pressed }) => [p.tile, next && p.tileNext, on && kit.chipOn, pressed && { opacity: 0.7 }]}
            >
              <View style={p.head}>
                {status === 'near' ? (
                  <SymbolView name="exclamationmark.triangle.fill" tintColor={C.warn} size={11} />
                ) : (
                  <View style={[p.dot, { backgroundColor: INK[status] }]} />
                )}
                <Text style={p.muscle} numberOfLines={1}>{q.muscle}</Text>
                {q.side && !q.custom ? <Text style={p.side}>{q.side}</Text> : null}
                {next ? <Text style={p.next}>NEXT</Text> : null}
              </View>
              <Text style={[p.status, { color: on ? C.fg : status === 'avoid' || status === 'caution' ? INK[status] : C.muted }]} numberOfLines={1}>
                This spot: {Number.isFinite(exact) ? dayLabel(exact) : 'never'}
              </Text>
              <Text style={[p.status, { color: on ? C.fg : status === 'near' ? INK.near : C.muted }]} numberOfLines={1}>
                Next to it: {near && near.days < 60 ? dayLabel(near.days) : '–'}
              </Text>
            </Pressable>
          )
        })}
      </View>
      <Text style={kit.hint}>Green is rested. Amber or red: you used that exact spot, red in the last few days. A triangle: the spot next to it was used this week.</Text>

      <FieldRow label="Other site">
        <MenuPicker
          value={typing || (offList && !inCatalog) ? OTHER : inCatalog ? picked : NONE}
          options={[
            { value: NONE, label: 'None' },
            ...others.flatMap((r) => r.sites.map((x) => ({ value: x.site, label: `${siteLabel(x.site)} (${r.label.toLowerCase()})` }))),
            { value: OTHER, label: 'Type your own…' },
          ]}
          onChange={(v) => {
            setTyping(v === OTHER)
            if (v !== OTHER) onChange(v === NONE ? (inCatalog || offList ? '' : value) : v)
          }}
        />
      </FieldRow>
      {typing || (offList && !inCatalog) ? (
        <Input autoFocus={typing && !offList} placeholder="Your own site, e.g. Calf L" value={offList && !inCatalog ? value : ''} onChangeText={onChange} autoCorrect={false} accessibilityLabel="Custom site" />
      ) : null}
    </View>
  )
}

const p = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: {
    flexBasis: '47%', flexGrow: 1, gap: 4, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12,
    borderWidth: 1, borderColor: C.input, backgroundColor: C.card,
  },
  tileNext: { borderColor: C.primaryLine, borderStyle: 'dashed' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  muscle: { flexShrink: 1, fontFamily: F.semi, fontSize: 15, color: C.fg },
  side: { fontFamily: F.mono, fontSize: 12, color: C.muted },
  status: { fontFamily: F.body, fontSize: 12, lineHeight: 16 },
  next: { marginLeft: 'auto', fontFamily: F.monoSemi, fontSize: 10, letterSpacing: 1.2, color: C.accentInk },
})
