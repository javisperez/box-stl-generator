import { Canvas } from '@react-three/fiber'
import { OrbitControls, Grid, Line } from '@react-three/drei'
import * as THREE from 'three'

interface BoxViewerProps {
  geometry: THREE.BufferGeometry | null
  lidGeometry: THREE.BufferGeometry | null
  hingeBoxGeometry: THREE.BufferGeometry | null
  hingeLidGeometry: THREE.BufferGeometry | null
  boxHeight: number
  // Placement of the lid/sleeve mesh, computed by App (differs per lid style
  // and flips/moves onto the box when "preview in place" is on)
  lidPosition: [number, number, number]
  lidRotation: [number, number, number]
  // Printer plate footprint drawn on the ground (from Settings)
  plateWidth?: number
  plateDepth?: number
  plateOversized?: boolean
}

export function BoxViewer({
  geometry, lidGeometry, hingeBoxGeometry, hingeLidGeometry, boxHeight,
  lidPosition, lidRotation, plateWidth, plateDepth, plateOversized,
}: BoxViewerProps) {
  const plateColor = plateOversized ? '#ef4444' : '#3b82f6'
  const pw2 = (plateWidth ?? 0) / 2
  const pd2 = (plateDepth ?? 0) / 2
  // Inside the group, Z is up (JSCAD convention). The group rotation converts Z-up → Y-up.
  // Box is centered at origin, so offset Z by height/2 to put the bottom on Z=0.
  const mat = (
    <meshStandardMaterial color="#fff" side={THREE.DoubleSide} roughness={0.3} metalness={0.1} />
  )

  return (
    <div className="w-full h-full bg-gray-900">
      <Canvas
        camera={{ position: [100, 100, 100], fov: 50 }}
        style={{ background: '#1a1a1a' }}
      >
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
          {geometry && (
            <mesh geometry={geometry} position={[0, 0, boxHeight / 2]}>{mat}</mesh>
          )}
          {hingeBoxGeometry && (
            <mesh geometry={hingeBoxGeometry} position={[0, 0, boxHeight / 2]}>{mat}</mesh>
          )}
          {lidGeometry && (
            <mesh geometry={lidGeometry} position={lidPosition} rotation={lidRotation}>{mat}</mesh>
          )}
          {hingeLidGeometry && (
            <mesh geometry={hingeLidGeometry} position={lidPosition} rotation={lidRotation}>{mat}</mesh>
          )}
        </group>

        <Grid
          args={[200, 200]}
          cellSize={10}
          cellThickness={0.5}
          cellColor="#6e6e6e"
          sectionSize={50}
          sectionThickness={1}
          sectionColor="#9d4b4b"
          fadeDistance={400}
          fadeStrength={1}
          followCamera={false}
          infiniteGrid={true}
        />

        <OrbitControls
          enableDamping
          dampingFactor={0.05}
          minDistance={50}
          maxDistance={500}
        />
      </Canvas>
    </div>
  )
}
