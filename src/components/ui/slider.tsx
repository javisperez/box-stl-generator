import * as React from "react"
import { cn } from "@/lib/utils"

interface SliderProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value'> {
  value: number
  min: number
  max: number
  onValueChange?: (value: number) => void
  /** Colour of the filled track and thumb ring; defaults to the theme accent. */
  color?: string
}

const Slider = React.forwardRef<HTMLInputElement, SliderProps>(
  ({ className, value, min, max, color, style, onValueChange, ...props }, ref) => {
    const pct = max > min ? Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100)) : 0
    return (
      <input
        type="range"
        className={cn("slider w-full cursor-pointer", className)}
        style={{ ...(color ? { '--c': color } : {}), '--p': `${pct}%`, ...style } as React.CSSProperties}
        value={value}
        min={min}
        max={max}
        onChange={(e) => onValueChange?.(Number(e.target.value))}
        ref={ref}
        {...props}
      />
    )
  }
)
Slider.displayName = "Slider"

export { Slider }
