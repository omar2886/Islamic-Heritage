import type { AnchorHTMLAttributes, ReactNode } from 'react'

interface ButtonLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  children: ReactNode
  variant?: 'primary' | 'secondary'
}

export function ButtonLink({
  children,
  className = '',
  variant = 'primary',
  ...props
}: ButtonLinkProps) {
  const classes = `buttonLink buttonLink--${variant} ${className}`.trim()
  return (
    <a className={classes} {...props}>
      {children}
    </a>
  )
}
