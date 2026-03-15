interface SectionHeadingProps {
  eyebrow: string
  title: string
  description: string
}

export function SectionHeading({
  eyebrow,
  title,
  description,
}: SectionHeadingProps) {
  return (
    <header className="sectionHeading">
      <p className="sectionHeading__eyebrow">{eyebrow}</p>
      <h2 className="sectionHeading__title">{title}</h2>
      <p className="sectionHeading__description">{description}</p>
    </header>
  )
}
