import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

// Live password requirements checklist. The rule itself lives in lib/password.ts.
function Req({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className={cn('flex items-center gap-1.5 transition-colors', ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground')}>
      <Check className={cn('size-3 shrink-0', ok ? 'opacity-100' : 'opacity-30')} />
      {children}
    </li>
  )
}

export function PasswordRules({ password, className }: { password: string; className?: string }) {
  return (
    <ul className={cn('flex flex-col gap-1 px-0.5 text-[11px]', className)}>
      <Req ok={password.length >= 10}>At least 10 characters</Req>
      <Req ok={/[a-z]/.test(password) && /[A-Z]/.test(password)}>Upper and lowercase letters</Req>
      <Req ok={/\d/.test(password)}>A number</Req>
    </ul>
  )
}
