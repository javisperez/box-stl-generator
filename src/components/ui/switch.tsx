import { cn } from '@/lib/utils'

interface SwitchRowProps {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  className?: string
}

/** A label with a toggle on the right; replaces the bare checkboxes. */
export function SwitchRow({ label, checked, onChange, className }: SwitchRowProps) {
  return (
    <div className={cn('flex items-center justify-between gap-3 text-xs text-muted-foreground', className)}>
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative h-[18px] w-8 shrink-0 rounded-full transition-colors',
          checked ? 'bg-primary' : 'bg-input'
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white transition-all',
            checked ? 'left-[16px]' : 'left-0.5'
          )}
        />
      </button>
    </div>
  )
}
