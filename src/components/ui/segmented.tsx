import { cn } from '@/lib/utils'

interface SegmentedProps<T extends string | number> {
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
  className?: string
  'aria-label'?: string
}

/** Pill-style single-choice control; replaces the ad-hoc button rows. */
export function Segmented<T extends string | number>({ value, options, onChange, className, ...rest }: SegmentedProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={rest['aria-label']}
      className={cn('flex gap-0.5 p-0.5 rounded-lg border bg-background', className)}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn(
            'flex-1 min-w-0 truncate px-2 py-1.5 text-xs rounded-md transition-colors',
            o.value === value
              ? 'bg-accent text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
