/**
 * CompoundCarousel — compounds/protocols as tall rounded-3xl cards.
 * The colored gradient header occupies the top half and the detail section
 * (dose · cadence, last injection, next due, circular Log button) is always
 * visible beneath it — no hover reveal.
 */
import { useState } from 'react'
import { ArrowUpRight, ChevronLeft, ChevronRight, Pencil } from 'lucide-react'
import { format } from 'date-fns'
import type { Compound, InjectionLog, Protocol } from '@/lib/db'
import type { SimpleScheduleItem } from '@/lib/schedule'
import { describeCadence } from '@/lib/schedule'
import { differenceInHours, parseISO } from 'date-fns'
import { Button } from '@/components/ui/button'
import {
  Carousel, CarouselContent, CarouselItem, type CarouselApi,
} from '@/components/ui/carousel'
import { cn } from '@/lib/utils'

export function CompoundCarousel({
  protocols,
  compounds,
  injections,
  schedule,
  onLog,
  onEdit,
  className,
}: {
  protocols: Protocol[]
  compounds: Compound[]
  injections: InjectionLog[]
  schedule: SimpleScheduleItem[]
  onLog: (tab: 'injection', prefill?: import('@/App').QuickLogPrefill) => void
  onEdit?: (p: Protocol & { id: number }) => void
  className?: string
}) {
  const [api, setApi] = useState<CarouselApi>()

  if (protocols.length === 0) return null

  return (
    <div className={className}>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-display text-xl font-semibold">My compounds</h3>
        {protocols.length > 2 && (
          <div className="flex gap-1.5">
            <Button variant="outline" size="icon" className="size-8 rounded-full" onClick={() => api?.scrollPrev()} aria-label="Previous">
              <ChevronLeft className="size-4" />
            </Button>
            <Button variant="outline" size="icon" className="size-8 rounded-full" onClick={() => api?.scrollNext()} aria-label="Next">
              <ChevronRight className="size-4" />
            </Button>
          </div>
        )}
      </div>
      <Carousel setApi={setApi} opts={{ align: 'start', dragFree: true }} className="overflow-visible">
        <CarouselContent className="-ml-4">
          {protocols.map((p) => {
            const compound = compounds.find((c) => c.id === p.compoundId)
            const schedItem = schedule.find((s) => s.protocol.id === p.id)
            return (
              <CarouselItem key={p.id} className="basis-[260px] pl-4">
                <CompoundCard
                  protocol={p}
                  compound={compound}
                  injections={injections}
                  schedItem={schedItem}
                  onLog={onLog}
                  onEdit={onEdit && p.id !== undefined ? () => onEdit(p as Protocol & { id: number }) : undefined}
                />
              </CarouselItem>
            )
          })}
        </CarouselContent>
      </Carousel>
    </div>
  )
}

function CompoundCard({
  protocol,
  compound,
  injections,
  schedItem,
  onLog,
  onEdit,
}: {
  protocol: Protocol
  compound?: Compound
  injections: InjectionLog[]
  schedItem?: SimpleScheduleItem
  onLog: (tab: 'injection', prefill?: import('@/App').QuickLogPrefill) => void
  onEdit?: () => void
}) {
  const color = compound?.color ?? '#f4c95c'
  const lastInj = injections.find((i) => i.compoundId === protocol.compoundId)
  const hoursSince = lastInj ? differenceInHours(new Date(), parseISO(lastInj.takenAt)) : undefined
  const lastLabel = hoursSince === undefined ? 'Never'
    : hoursSince < 1 ? 'Just now'
    : hoursSince < 24 ? `${Math.round(hoursSince)}h ago`
    : `${Math.round(hoursSince / 24)}d ago`

  const overdue = schedItem?.isOverdue ?? false
  const nextLabel = !schedItem ? '—'
    : overdue ? `${Math.round(Math.abs(schedItem.daysUntil))}d overdue`
    : schedItem.daysUntil < 0.5 ? 'Due now'
    : schedItem.daysUntil < 1 ? 'Due today'
    : format(schedItem.nextDue, 'EEE MMM d')

  return (
    <div className="flex h-[260px] flex-col rounded-xl border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: color }} />
            <p className="truncate text-[17px] font-semibold text-foreground">{compound?.name ?? protocol.name}</p>
          </div>
          {compound?.ester && <p className="mt-0.5 pl-[18px] text-xs text-muted-foreground">{compound.ester}</p>}
        </div>
        {overdue && (
          <span className="shrink-0 rounded-md bg-destructive/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-destructive">
            Overdue
          </span>
        )}
      </div>
      <p className="mt-2 pl-[18px] text-sm tabular-nums text-muted-foreground">{protocol.dose} {protocol.unit}</p>

      <div className="mt-auto flex flex-col gap-1.5 text-sm">
        <p className="text-xs text-muted-foreground">{describeCadence(protocol.cadence)}</p>
        <p className="flex justify-between gap-2">
          <span className="text-muted-foreground">Last</span>
          <span className="tabular-nums">{lastLabel}</span>
        </p>
        <p className="flex justify-between gap-2">
          <span className="text-muted-foreground">Next</span>
          <span className={cn('tabular-nums', overdue && 'text-destructive')}>{nextLabel}</span>
        </p>
      </div>

      <div className="mt-4 flex items-center justify-between">
        {onEdit ? (
          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-muted-foreground"
            aria-label="Edit protocol"
            onClick={(e) => { e.stopPropagation(); onEdit() }}
          >
            <Pencil className="size-4" />
          </Button>
        ) : <span />}
        <button
          type="button"
          aria-label={`Log ${compound?.name ?? protocol.name}`}
          className="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground transition-colors hover:bg-primary/90"
          onClick={(e) => {
            e.stopPropagation()
            onLog('injection', {
              compoundId: protocol.compoundId,
              dose: protocol.dose,
              unit: protocol.unit,
              protocolId: protocol.id,
              scheduledAt: schedItem?.nextDue.toISOString(),
            })
          }}
        >
          <ArrowUpRight className="size-5" />
        </button>
      </div>
    </div>
  )
}
