import type { ReactNode } from 'react'

// A collapsible section of the side columns, with an optional control on the right of
// its title (a badge, a tab switch, a filter).

export function Section({
  title,
  extra,
  open = true,
  children,
}: {
  title: string
  extra?: ReactNode
  open?: boolean
  children: ReactNode
}) {
  return (
    <details className="side-section" open={open}>
      <summary className="side-section__head">
        <span>{title}</span>
        {/* Clicks on the control must not fold the section. */}
        {extra && (
          <span className="side-section__extra" onClick={(e) => e.preventDefault()}>
            {extra}
          </span>
        )}
      </summary>
      <div className="side-section__body">{children}</div>
    </details>
  )
}
