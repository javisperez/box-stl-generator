export type FilamentType = 'PLA' | 'PETG' | 'ABS'

export const FILAMENTS: { value: FilamentType; density: number }[] = [
  { value: 'PLA', density: 1.24 },
  { value: 'PETG', density: 1.27 },
  { value: 'ABS', density: 1.04 },
]

// Solid-volume estimate — real prints use less (infill), so treat it as an upper bound
export function formatGrams(volumeCm3: number, filament: FilamentType): string {
  const density = FILAMENTS.find(f => f.value === filament)?.density ?? 1.24
  const grams = volumeCm3 * density
  return grams < 10 ? grams.toFixed(1) : String(Math.round(grams))
}
