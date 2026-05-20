import type { LucideIcon } from 'lucide-react'

export function EmptyState({
  icon: Icon,
  title,
  detail,
}: {
  icon: LucideIcon
  title: string
  detail: string
}) {
  return (
    <div className="empty">
      <Icon size={22} />
      <strong>{title}</strong>
      <span>{detail}</span>
    </div>
  )
}
