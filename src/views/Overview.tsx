import type { LucideIcon } from 'lucide-react'
import { Brain, FlaskConical, HeartPulse, Scale, Syringe } from 'lucide-react'
import type { View } from '../app/views'

// Home = a launcher. Big cards, two columns; each opens a full-page add flow
// (or a view). Tinted icon chips aid quick recognition; colour stays faint.
const CARDS: Array<{ view: View; label: string; sub: string; icon: LucideIcon; chip: string }> = [
  { view: 'add-injection', label: 'Injection', sub: 'Log a shot', icon: Syringe, chip: 'bg-primary/12 text-primary' },
  { view: 'add-weight', label: 'Weight', sub: 'Log body weight', icon: Scale, chip: 'bg-blue-500/10 text-blue-600 dark:text-blue-400' },
  { view: 'add-bp', label: 'Blood pressure', sub: 'Log a reading', icon: HeartPulse, chip: 'bg-rose-500/10 text-rose-600 dark:text-rose-400' },
  { view: 'symptoms', label: 'Symptoms', sub: 'How you feel', icon: Brain, chip: 'bg-violet-500/10 text-violet-600 dark:text-violet-400' },
  { view: 'labs', label: 'Lab results', sub: 'Upload or add', icon: FlaskConical, chip: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
]

export function Overview({ onNavigate }: { onNavigate: (v: View) => void }) {
  return (
    <div className="mx-auto max-w-2xl">
      <p className="mb-3 px-0.5 text-xs font-medium uppercase tracking-[0.02em] text-muted-foreground">Add to your log</p>
      <div className="grid grid-cols-2 gap-4">
        {CARDS.map((c) => (
          <button
            key={c.view}
            type="button"
            onClick={() => onNavigate(c.view)}
            className="flex min-h-[140px] flex-col items-start gap-3 rounded-xl border border-border bg-card p-5 text-left transition-colors hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <span className={`grid size-11 shrink-0 place-items-center rounded-lg ${c.chip}`}>
              <c.icon className="size-6" />
            </span>
            <div className="mt-auto">
              <p className="text-[15px] font-semibold leading-tight text-foreground">{c.label}</p>
              <p className="mt-0.5 text-[13px] text-muted-foreground">{c.sub}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
