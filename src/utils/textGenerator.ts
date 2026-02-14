import { primitives, booleans, transforms } from '@jscad/modeling'

const { cuboid } = primitives
const { union } = booleans
const { translate } = transforms

const PIXELS_PER_MM = 2

/**
 * Renders text (including emojis) to a canvas and converts the result
 * to JSCAD geometry as a block of merged cuboids.
 * Returns geometry centered at origin on X/Y, with Z from 0 to textDepth.
 */
export function textToJscadGeometry(
  text: string,
  lidWidth: number,
  lidDepth: number,
  fontSize: number,
  textDepth: number
): ReturnType<typeof cuboid> | null {
  if (!text.trim()) return null

  const canvasW = Math.round(lidWidth * PIXELS_PER_MM)
  const canvasH = Math.round(lidDepth * PIXELS_PER_MM)
  const scaledFontSize = Math.round(fontSize * PIXELS_PER_MM)

  // Render text to canvas
  const canvas = document.createElement('canvas')
  canvas.width = canvasW
  canvas.height = canvasH
  const ctx = canvas.getContext('2d')!

  ctx.fillStyle = 'white'
  ctx.fillRect(0, 0, canvasW, canvasH)

  ctx.fillStyle = 'black'
  ctx.font = `bold ${scaledFontSize}px sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, canvasW / 2, canvasH / 2)

  // Read pixels
  const imageData = ctx.getImageData(0, 0, canvasW, canvasH)
  const pixels = imageData.data

  // Run-length encode "on" pixels per row and create cuboids
  const mmPerPixel = 1 / PIXELS_PER_MM
  const runs: ReturnType<typeof cuboid>[] = []

  for (let row = 0; row < canvasH; row++) {
    let runStart = -1

    for (let col = 0; col <= canvasW; col++) {
      const isOn = col < canvasW && pixels[(row * canvasW + col) * 4] < 128 // black text on white bg

      if (isOn && runStart === -1) {
        runStart = col
      } else if (!isOn && runStart !== -1) {
        const runLength = col - runStart
        const w = runLength * mmPerPixel
        const h = mmPerPixel
        const xCenter = (runStart + runLength / 2) * mmPerPixel - lidWidth / 2
        const yCenter = lidDepth / 2 - (row + 0.5) * mmPerPixel

        const block = cuboid({ size: [w, h, textDepth] })
        runs.push(translate([xCenter, yCenter, textDepth / 2], block))
        runStart = -1
      }
    }
  }

  if (runs.length === 0) return null
  if (runs.length === 1) return runs[0]

  // Batch union for better performance: tree-reduce instead of sequential
  let current = runs
  while (current.length > 1) {
    const next: ReturnType<typeof cuboid>[] = []
    for (let i = 0; i < current.length; i += 2) {
      if (i + 1 < current.length) {
        next.push(union(current[i], current[i + 1]))
      } else {
        next.push(current[i])
      }
    }
    current = next
  }

  return current[0]
}
