import * as React from "react"

import { cn } from "@/lib/utils"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"

/** A form field: label (with "Optional" on the right), the control, then a hint. */
function Field({ label, htmlFor, optional, hint, hintTone, className, children }: {
  label: React.ReactNode
  /** Ties the label to an input; leave out for a group (segmented, chips). */
  htmlFor?: string
  optional?: boolean
  hint?: React.ReactNode
  hintTone?: "muted" | "warn"
  className?: string
  children: React.ReactNode
}) {
  const hintId = htmlFor ? `${htmlFor}-hint` : undefined
  return (
    <div data-slot="field" className={cn("flex min-w-0 flex-col gap-2", className)}>
      <div className="flex items-baseline justify-between gap-3">
        {htmlFor ? <Label htmlFor={htmlFor}>{label}</Label> : <span className="text-sm leading-none font-medium">{label}</span>}
        {optional && <span className="text-[13px] leading-none text-muted-foreground">Optional</span>}
      </div>
      {children}
      {hint && <p id={hintId} className={cn("text-[13px] leading-snug", hintTone === "warn" ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground")}>{hint}</p>}
    </div>
  )
}

/** An input with its unit inside, on the right ("500 mL"). */
function InputWithUnit({ unit, className, ...props }: React.ComponentProps<typeof Input> & { unit: string }) {
  return (
    <div className="relative">
      <Input className={cn("pr-12", className)} {...props} />
      <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">{unit}</span>
    </div>
  )
}

export { Field, InputWithUnit }
