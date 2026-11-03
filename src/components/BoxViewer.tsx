import { useMemo } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls, OrthographicCamera, PerspectiveCamera, Grid, Line, Html } from '@react-three/drei'
import * as THREE from 'three'
import { AXIS_COLORS, ViewMode } from '@/utils/boxLayout'

interface BoxViewerProps {
  geometry: THREE.BufferGeometry | null
  lidGeometry: THREE.BufferGeometry | null
  hingeBoxGeometry: THREE.BufferGeometry | null
  hingeLidGeometry: THREE.BufferGeometry | null
  boxWidth: number
  boxDepth: number
  boxHeight: number
  // Placement of the lid/sleeve mesh, computed by App (differs per lid style
  // and flips/moves onto the box when "preview in place" is on)
  lidPosition: [number, number, number]
  lidRotation: [number, number, number]
  // The lid/sleeve lies beside the box (not assembled onto it)
  lidBeside: boolean
  // Where the box sits on the plate (centre, and turned a quarter turn about Z)
  boxPlacement: { x: number; y: number; rotated: boolean }
  // Printer plate footprint drawn on the ground (from Settings)
  plateWidth?: number
  plateDepth?: number
  plateOversized?: boolean
  viewMode: ViewMode
}

// Looking down the (1,1,1) diagonal gives a true isometric projection
const ISO_DIRECTION = new THREE.Vector3(1, 1, 1).normalize()
const ISO_DISTANCE = 600
const fmt = (n: number) => String(Math.round(n * 10) / 10)

/** Orthographic camera on the isometric diagonal, zoomed so the whole scene fits. */
function IsoCamera({ active, target, spanX, spanD, height }: {
  active: boolean
  target: [number, number, number]
  spanX: number
  spanD: number
  height: number
}) {
  const { size } = useThree()
  const span = spanX + spanD
  const screenW = span * Math.cos(Math.PI / 6)
  const screenH = span * 0.5 + height
  // Generous margins leave room for the rulers and their labels
  const zoom = Math.min(size.width / (screenW * 1.5), size.height / (screenH * 1.9))
  return (
    <OrthographicCamera
      makeDefault={active}
      near={0.1}
      far={4000}
      zoom={zoom}
      position={[
        target[0] + ISO_DIRECTION.x * ISO_DISTANCE,
        target[1] + ISO_DIRECTION.y * ISO_DISTANCE,
        target[2] + ISO_DIRECTION.z * ISO_DISTANCE,
      ]}
    />
  )
}

function RulerLabel({ position, color, text }: { position: [number, number, number]; color: string; text: string }) {
  return (
    <Html position={position} center zIndexRange={[1, 0]} style={{ pointerEvents: 'none' }}>
      <div
        className="px-1.5 py-0.5 rounded bg-background/90 border font-mono text-[11px] leading-none whitespace-nowrap"
        style={{ color, borderColor: color }}
      >
        {text}
      </div>
    </Html>
  )
}

interface Bounds { min: THREE.Vector3Tuple; max: THREE.Vector3Tuple }

/**
 * Width, depth and height dimension lines around a part's bounding box (in the
 * JSCAD Z-up space of the scene group). Width runs along the front edge and
 * depth along the right edge — the two sides facing the isometric camera. The
 * height ruler stands on a corner chosen by the caller so rulers of neighbouring
 * parts never collide.
 */
function DimensionRulers({ bounds, heightAt, turned = false, showWidth = true, showDepth = true }: {
  bounds: Bounds
  heightAt: 'left-front' | 'right-back'
  // The part is turned a quarter turn, so its world X extent is its depth and Y its width
  turned?: boolean
  showWidth?: boolean
  showDepth?: boolean
}) {
  const [x0, y0, z0] = bounds.min
  const [x1, y1, z1] = bounds.max
  const ex = x1 - x0, ey = y1 - y0, h = z1 - z0
  const off = Math.max(8, Math.min(ex, ey, h) * 0.2)
  const zb = Math.max(0.2, z0) // sit just above the ground plane and plate outline

  const hx = heightAt === 'left-front' ? x0 - off : x1 + off
  const hy = heightAt === 'left-front' ? y0 - off : y1 + off
  const cx = heightAt === 'left-front' ? x0 : x1
  const cy = heightAt === 'left-front' ? y0 : y1

  // Colours follow what a ruler measures (width, depth, height), not which world axis it runs along
  const xKind = turned ? 'depth' : 'width'
  const yKind = turned ? 'width' : 'depth'
  const rulers: { kind: 'width' | 'depth' | 'height'; a: THREE.Vector3Tuple; b: THREE.Vector3Tuple; extA: THREE.Vector3Tuple; extB: THREE.Vector3Tuple; text: string }[] = [
    {
      kind: xKind,
      a: [x0, y0 - off, zb], b: [x1, y0 - off, zb],
      extA: [x0, y0, zb], extB: [x1, y0, zb],
      text: `${fmt(ex)} mm`,
    },
    {
      kind: yKind,
      a: [x1 + off, y0, zb], b: [x1 + off, y1, zb],
      extA: [x1, y0, zb], extB: [x1, y1, zb],
      text: `${fmt(ey)} mm`,
    },
    {
      kind: 'height',
      a: [hx, hy, zb], b: [hx, hy, z1],
      extA: [cx, cy, zb], extB: [cx, cy, z1],
      text: `${fmt(h)} mm`,
    },
  ]

  const visible = rulers.filter((r) => (r.kind !== 'width' || showWidth) && (r.kind !== 'depth' || showDepth))

  return (
    <group>
      {visible.map((r) => {
        const color = AXIS_COLORS[r.kind]
        const mid: THREE.Vector3Tuple = [(r.a[0] + r.b[0]) / 2, (r.a[1] + r.b[1]) / 2, (r.a[2] + r.b[2]) / 2]
        return (
          <group key={r.kind}>
            <Line points={[r.a, r.b]} color={color} lineWidth={1.5} depthTest={false} />
            <Line points={[r.extA, r.a]} color={color} lineWidth={1} dashed dashSize={1.5} gapSize={1.5} transparent opacity={0.6} depthTest={false} />
            <Line points={[r.extB, r.b]} color={color} lineWidth={1} dashed dashSize={1.5} gapSize={1.5} transparent opacity={0.6} depthTest={false} />
            {[r.a, r.b].map((p, i) => (
              <mesh key={i} position={p} renderOrder={2}>
                <sphereGeometry args={[1, 12, 12]} />
                <meshBasicMaterial color={color} depthTest={false} />
              </mesh>
            ))}
            <RulerLabel position={mid} color={color} text={r.text} />
          </group>
        )
      })}
    </group>
  )
}

export function BoxViewer({
  geometry, lidGeometry, hingeBoxGeometry, hingeLidGeometry, boxWidth, boxDepth, boxHeight,
  lidPosition, lidRotation, lidBeside, boxPlacement, plateWidth, plateDepth, plateOversized, viewMode,
}: BoxViewerProps) {
  const plateColor = plateOversized ? '#ef4444' : '#ff6a4d'
  const pw2 = (plateWidth ?? 0) / 2
  const pd2 = (plateDepth ?? 0) / 2
  const isIso = viewMode === 'isometric'
  // Inside the group, Z is up (JSCAD convention). The group rotation converts Z-up → Y-up.
  // Box is centered at origin, so offset Z by height/2 to put the bottom on Z=0.
  const mat = (
    <meshStandardMaterial color="#fff" side={THREE.DoubleSide} roughness={0.3} metalness={0.1} />
  )

  // The lid/sleeve only gets its own rulers when it lies beside the box; in
  // place it overlaps the box, where a second set would just be noise.
  const lidX = lidPosition[0], lidY = lidPosition[1], lidZ = lidPosition[2]
  const lidTurned = lidBeside && Math.abs(lidRotation[2]) > 0.1
  const lidBounds = useMemo<Bounds | null>(() => {
    if (!lidGeometry || !lidBeside) return null
    lidGeometry.computeBoundingBox()
    const b = lidGeometry.boundingBox
    if (!b) return null
    // A quarter turn about Z maps (x, y) → (-y, x)
    const [minX, maxX, minY, maxY] = lidTurned ? [-b.max.y, -b.min.y, b.min.x, b.max.x] : [b.min.x, b.max.x, b.min.y, b.max.y]
    return {
      min: [minX + lidX, minY + lidY, b.min.z + lidZ],
      max: [maxX + lidX, maxY + lidY, b.max.z + lidZ],
    }
  }, [lidGeometry, lidBeside, lidTurned, lidX, lidY, lidZ])

  // The box's footprint on the plate (turned parts swap width and depth)
  const boxW = boxPlacement.rotated ? boxDepth : boxWidth
  const boxD = boxPlacement.rotated ? boxWidth : boxDepth
  const boxBounds: Bounds = {
    min: [boxPlacement.x - boxW / 2, boxPlacement.y - boxD / 2, 0],
    max: [boxPlacement.x + boxW / 2, boxPlacement.y + boxD / 2, boxHeight],
  }

  // Frame everything on the plate: the box and the lid beside it
  const left = Math.min(boxBounds.min[0], lidBounds ? lidBounds.min[0] : Infinity)
  const right = Math.max(boxBounds.max[0], lidBounds ? lidBounds.max[0] : -Infinity)
  const front = Math.min(boxBounds.min[1], lidBounds ? lidBounds.min[1] : Infinity)
  const back = Math.max(boxBounds.max[1], lidBounds ? lidBounds.max[1] : -Infinity)
  const spanX = right - left
  const spanD = back - front
  // JSCAD Y maps to -Z in the scene, so the depth centre goes in negated
  const target: [number, number, number] = [(left + right) / 2, boxHeight / 2, -(front + back) / 2]

  // A lid or hinged lid matches the box footprint, so only a part whose size
  // differs (a sleeve wraps the outside) needs its own width and depth
  const sameAsBox = (a: number, b: number) => Math.abs(a - b) < 0.05
  // Compare the lid's own width and depth with the box's, whichever way each is turned
  const lidSpanX = lidBounds ? lidBounds.max[0] - lidBounds.min[0] : 0
  const lidSpanY = lidBounds ? lidBounds.max[1] - lidBounds.min[1] : 0
  const lidWidth = lidTurned ? lidSpanY : lidSpanX
  const lidDepth = lidTurned ? lidSpanX : lidSpanY
  const lidSameWidth = !!lidBounds && sameAsBox(lidWidth, boxWidth)
  const lidSameDepth = !!lidBounds && sameAsBox(lidDepth, boxDepth)

  return (
    <div className="w-full h-full bg-background">
      <Canvas camera={{ position: [100, 100, 100], fov: 50 }} style={{ background: '#0b0c0f' }}>
        {/* Both cameras stay mounted and only the active flag moves, so switching
            never restores a stale camera and each view keeps its own angle/zoom */}
        <PerspectiveCamera makeDefault={!isIso} position={[100, 100, 100]} fov={50} />
        <IsoCamera active={isIso} target={target} spanX={spanX} spanD={spanD} height={boxHeight} />

        <ambientLight intensity={0.5} />
        <directionalLight position={[10, 10, 5]} intensity={1} />
        <directionalLight position={[-10, -10, -5]} intensity={1} />

        <group rotation={[-Math.PI / 2, 0, 0]}>
          {/* Printer plate footprint — flat outline on the ground, red when a part won't fit */}
          {plateWidth && plateDepth ? (
            <group>
              <mesh position={[0, 0, 0.05]}>
                <planeGeometry args={[plateWidth, plateDepth]} />
                <meshBasicMaterial color={plateColor} transparent opacity={0.06} side={THREE.DoubleSide} depthWrite={false} />
              </mesh>
              <Line
                points={[
                  [-pw2, -pd2, 0.1],
                  [pw2, -pd2, 0.1],
                  [pw2, pd2, 0.1],
                  [-pw2, pd2, 0.1],
                  [-pw2, -pd2, 0.1],
                ]}
                color={plateColor}
                lineWidth={1.5}
                transparent
                opacity={0.7}
              />
            </group>
          ) : null}
          <group position={[boxPlacement.x, boxPlacement.y, 0]} rotation={[0, 0, boxPlacement.rotated ? Math.PI / 2 : 0]}>
            {geometry && (
              <mesh geometry={geometry} position={[0, 0, boxHeight / 2]}>{mat}</mesh>
            )}
            {hingeBoxGeometry && (
              <mesh geometry={hingeBoxGeometry} position={[0, 0, boxHeight / 2]}>{mat}</mesh>
            )}
          </group>
          {lidGeometry && (
            <mesh geometry={lidGeometry} position={lidPosition} rotation={lidRotation}>{mat}</mesh>
          )}
          {hingeLidGeometry && (
            <mesh geometry={hingeLidGeometry} position={lidPosition} rotation={lidRotation}>{mat}</mesh>
          )}
          {isIso && <DimensionRulers bounds={boxBounds} heightAt="left-front" turned={boxPlacement.rotated} />}
          {isIso && lidBounds && (
            <DimensionRulers
              bounds={lidBounds} heightAt="right-back" turned={lidTurned}
              showWidth={!lidSameWidth} showDepth={!lidSameDepth}
            />
          )}
        </group>

        <Grid
          args={[200, 200]}
          cellSize={10}
          cellThickness={0.5}
          cellColor="#2a2e37"
          sectionSize={50}
          sectionThickness={1}
          sectionColor="#3a3f4b"
          fadeDistance={isIso ? 3000 : 400}
          fadeStrength={1}
          followCamera={false}
          infiniteGrid={true}
        />

        {/* The isometric angle is fixed — drag pans instead of rotating */}
        <OrbitControls
          key={viewMode}
          enableDamping
          dampingFactor={0.05}
          enableRotate={!isIso}
          target={isIso ? target : [0, 0, 0]}
          minDistance={isIso ? 0 : 50}
          maxDistance={isIso ? Infinity : 500}
          minZoom={0.5}
          maxZoom={40}
        />
      </Canvas>
    </div>
  )
}
