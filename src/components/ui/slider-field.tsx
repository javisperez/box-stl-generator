import { useEffect, useState, type ReactNode } from 'react'
import { Label } from './label'
import { Slider } from './slider'

interface SliderFieldProps {
  label: ReactNode
  labelClassName?: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (value: number) => void
  /** Convert the raw value to what the text input shows (defaults to the plain number). */
  format?: (value: number) => string
  /** Convert typed text back to a raw value (defaults to Number(text)). */
  parse?: (text: string) => number
  /** Extra content rendered right after the input, e.g. a computed "· 12.3 mm" readout. */
  suffix?: ReactNode
}

/**
 * A slider paired with a label and a type-in number field, kept in sync and
 * both clamped to [min, max]. Use in place of a Label + Slider pair anywhere
 * the value should also be directly editable.
 */
export function SliderField({
  label,
  labelClassName,
  value,
  min,
  max,
  step = 1,
  onChange,
  format,
  parse,
  suffix,
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
    <>
      <div className="flex justify-between items-center gap-2">
        <Label className={labelClassName}>{label}</Label>
        <div className="flex items-center gap-1 shrink-0">
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
            className="w-16 px-1.5 py-0.5 text-sm text-right rounded border bg-background text-muted-foreground focus:text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
          {suffix}
        </div>
      </div>
      <Slider min={min} max={max} step={step} value={value} onValueChange={onChange} />
    </>
  )
}
