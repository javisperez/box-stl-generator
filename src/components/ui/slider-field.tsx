import { useEffect, useState, type ReactNode } from 'react'
import { Info } from 'lucide-react'
import { Slider } from './slider'

interface SliderFieldProps {
  label: ReactNode
  value: number
  min: number
  max: number
  step?: number
  onChange: (value: number) => void
  /** Unit shown after the number, e.g. "mm". */
  unit?: string
  /** Colour of the slider fill and thumb (defaults to the theme accent). */
  color?: string
  /** Short explanation, shown as a tooltip on an info icon next to the label. */
  hint?: string
  /** Convert the raw value to what the text input shows (defaults to the plain number). */
  format?: (value: number) => string
  /** Convert typed text back to a raw value (defaults to Number(text)). */
  parse?: (text: string) => number
  /** Extra content rendered right after the input, e.g. a computed "· 12.3 mm" readout. */
  suffix?: ReactNode
  className?: string
}

/**
 * A slider paired with a label and a type-in number field, kept in sync and
 * both clamped to [min, max]. Use in place of a Label + Slider pair anywhere
 * the value should also be directly editable.
 */
export function SliderField({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  unit,
  color,
  hint,
  format,
  parse,
  suffix,
  className,
}: SliderFieldProps) {
  const toText = format ?? ((v: number) => String(v))
  const fromText = parse ?? ((s: string) => Number(s))
  const [text, setText] = useState(toText(value))

  useEffect(() => {
    setText(toText(value))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  const commit = (raw: string) => {
    const parsed = fromText(raw)
    if (raw.trim() === '' || Number.isNaN(parsed)) {
      setText(toText(value))
      return
    }
    const clamped = Math.min(max, Math.max(min, parsed))
    setText(toText(clamped))
    if (clamped !== value) onChange(clamped)
  }

  return (
    <div className={className}>
      <div className="flex justify-between items-center gap-2">
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {label}
          {hint && (
            <span title={hint} aria-label={hint} className="opacity-60 hover:opacity-100 cursor-help">
              <Info className="h-3 w-3" />
            </span>
          )}
        </span>
        <div className="flex items-center gap-1 shrink-0 font-mono text-xs text-muted-foreground">
          <input
            type="number"
            inputMode="decimal"
            min={min}
            max={max}
            step={step}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={(e) => commit(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                commit(e.currentTarget.value)
                e.currentTarget.blur()
              }
            }}
            className="w-14 px-1 py-0.5 text-right text-foreground bg-transparent rounded border border-transparent hover:border-input focus:border-ring focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
          />
          {unit && <span>{unit}</span>}
          {suffix}
        </div>
      </div>
      <Slider className="mt-1.5" min={min} max={max} step={step} value={value} color={color} onValueChange={onChange} />
    </div>
  )
}
