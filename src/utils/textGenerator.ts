import { primitives, booleans, transforms } from '@jscad/modeling'

const { cuboid } = primitives
const { union } = booleans
const { translate, rotate } = transforms

const PIXELS_PER_MM = 2

/**
 * Renders text (including emojis) to a canvas and converts the result
 * to JSCAD geometry as a block of merged cuboids.
 * Returns geometry centered at origin on X/Y, with Z from 0 to textDepth.
 *
 * rotationDeg rotates the text CCW on the surface (0 | 90 | 180 | 270). At
 * 90/270 the render frame is swapped so the text gets the surface's depth as
 * its running length instead of its width.
 */
export function textToJscadGeometry(
  text: string,
  lidWidth: number,
  lidDepth: number,
  fontSize: number,
  textDepth: number,
  rotationDeg: number = 0
): ReturnType<typeof cuboid> | null {
  if (!text.trim()) return null

  const swapFrame = rotationDeg % 180 !== 0
  const frameW = swapFrame ? lidDepth : lidWidth
  const frameD = swapFrame ? lidWidth : lidDepth

  const canvasW = Math.round(frameW * PIXELS_PER_MM)
  const canvasH = Math.round(frameD * PIXELS_PER_MM)
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
        const xCenter = (runStart + runLength / 2) * mmPerPixel - frameW / 2
        const yCenter = frameD / 2 - (row + 0.5) * mmPerPixel

        const block = cuboid({ size: [w, h, textDepth] })
        runs.push(translate([xCenter, yCenter, textDepth / 2], block))
        runStart = -1
      }
    }
  }

  if (runs.length === 0) return null

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

  const result = current[0]
  return rotationDeg
    ? rotate([0, 0, (rotationDeg * Math.PI) / 180], result)
    : result
}
