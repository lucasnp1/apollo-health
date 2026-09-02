import { cn } from '@/lib/utils'

export const SUPPORT_EMAIL = 'hello@theos.studio'

// Legal pages are static HTML outside the app shell. Open them in a new tab so
// an installed (standalone) PWA, which has no back button, never gets stuck.
export function LegalLink({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <a href={href} target="_blank" rel="noopener" className={cn('underline underline-offset-2', className ?? 'text-foreground')}>
      {children}
    </a>
  )
}
