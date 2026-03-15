import type { ReactNode } from 'react'

interface FeatureCardProps {
  eyebrow: string
  title: string
  children: ReactNode
}

export function FeatureCard({ eyebrow, title, children }: FeatureCardProps) {
  return (
    <article className="featureCard">
      <p className="featureCard__eyebrow">{eyebrow}</p>
      <h3 className="featureCard__title">{title}</h3>
      <p className="featureCard__body">{children}</p>
    </article>
  )
}
