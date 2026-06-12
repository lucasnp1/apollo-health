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
    <div className="relative h-[340px] overflow-hidden rounded-3xl border bg-card">
      {/* Gradient header — top half */}
      <div
        className="absolute inset-x-0 top-0 flex h-1/2 flex-col justify-end p-5"
        style={{ background: `linear-gradient(150deg, ${color}cc 0%, ${color}33 45%, transparent 100%)` }}
      >
        {overdue && (
          <span className="absolute right-4 top-4 rounded-full bg-destructive/90 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white">
            Overdue
          </span>
        )}
        <p className="font-display text-2xl font-bold leading-[1.1] text-gradient-gold">
          {compound?.name ?? protocol.name}
        </p>
        {compound?.ester && (
          <p className="mt-1 text-sm text-muted-foreground">{compound.ester}</p>
        )}
        <p className="mt-2 font-mono text-sm tabular-nums text-foreground/80">
          {protocol.dose} {protocol.unit}
        </p>
      </div>

      {/* Detail section */}
      <div className="absolute inset-x-0 bottom-0 flex h-1/2 flex-col justify-between p-5">
        <div className="flex flex-col gap-1.5 text-sm">
          <p className="text-xs text-muted-foreground">{describeCadence(protocol.cadence)}</p>
          <p className="flex justify-between gap-2">
            <span className="text-muted-foreground">Last</span>
            <span className="font-mono tabular-nums">{lastLabel}</span>
          </p>
          <p className="flex justify-between gap-2">
            <span className="text-muted-foreground">Next</span>
            <span className={cn('font-mono tabular-nums', overdue && 'text-destructive')}>{nextLabel}</span>
          </p>
        </div>
        <div className="flex items-center justify-between">
          {onEdit ? (
            <Button
              variant="ghost"
              size="icon"
              className="size-9 rounded-full"
              aria-label="Edit protocol"
              onClick={(e) => { e.stopPropagation(); onEdit() }}
            >
              <Pencil className="size-4" />
            </Button>
          ) : <span />}
          <button
            type="button"
            aria-label={`Log ${compound?.name ?? protocol.name}`}
            className="grid size-11 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform duration-300 hover:scale-110 hover:rotate-45"
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
    </div>
  )
}
