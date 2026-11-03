import { useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

interface GroupProps {
  title: string
  /** One-line state shown while collapsed, so the group reads without opening it. */
  summary?: ReactNode
  defaultOpen?: boolean
  children: ReactNode
}

/** Collapsible section: small-caps title, summary when closed, hairline divider above. */
export function Group({ title, summary, defaultOpen = false, children }: GroupProps) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className="border-t pt-3">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 pb-3 text-left"
      >
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{title}</span>
        {!open && summary && (
          <span className="ml-auto truncate text-xs text-muted-foreground/70">{summary}</span>
        )}
        <ChevronDown
          className={cn('h-4 w-4 shrink-0 text-muted-foreground/70 transition-transform', open ? 'rotate-180' : '', open || !summary ? 'ml-auto' : '')}
        />
      </button>
      {open && <div className="space-y-4 pb-4">{children}</div>}
    </section>
  )
}
