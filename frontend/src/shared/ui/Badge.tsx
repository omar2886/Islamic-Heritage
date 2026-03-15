import type { ReactNode } from 'react'

interface BadgeProps {
  children: ReactNode
  tone?: 'default' | 'accent' | 'success'
}

export function Badge({ children, tone = 'default' }: BadgeProps) {
  return <span className={`uiBadge uiBadge--${tone}`}>{children}</span>
}
