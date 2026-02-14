import { Canvas } from '@react-three/fiber'
import { OrbitControls, Grid } from '@react-three/drei'
import * as THREE from 'three'

interface BoxViewerProps {
  geometry: THREE.BufferGeometry | null
  lidGeometry: THREE.BufferGeometry | null
  boxHeight: number
  boxWidth: number
  wallThickness: number
}

export function BoxViewer({ geometry, lidGeometry, boxHeight, boxWidth, wallThickness }: BoxViewerProps) {
  // Inside the group, Z is up (JSCAD convention). The group rotation converts Z-up → Y-up.
  // Box is centered at origin, so offset Z by height/2 to put the bottom on Z=0.
  // Lid: cap at center, lip hangs below. Bottom of lip at -(wallThickness/2 + lidHeight).
  // Offset lid Z so the lip bottom sits on Z=0.
  const lidOffsetZ = wallThickness
  const lidOffsetX = boxWidth + 10

  return (
    <div className="w-full h-full bg-gray-900 rounded-lg overflow-hidden">
      <Canvas
        camera={{ position: [100, 100, 100], fov: 50 }}
        style={{ background: '#1a1a1a' }}
      >
        <ambientLight intensity={0.5} />
        <directionalLight position={[10, 10, 5]} intensity={1} />
        <directionalLight position={[-10, -10, -5]} intensity={0.3} />

        <group rotation={[-Math.PI / 2, 0, 0]}>
          {geometry && (
            <mesh geometry={geometry} position={[0, 0, boxHeight / 2]}>
              <meshStandardMaterial
                color="#fff"
                side={THREE.DoubleSide}
                roughness={0.3}
                metalness={0.1}
              />
            </mesh>
          )}
          {lidGeometry && (
            <mesh geometry={lidGeometry} position={[lidOffsetX, 0, lidOffsetZ]}>
              <meshStandardMaterial
                color="#fff"
                side={THREE.DoubleSide}
                roughness={0.3}
                metalness={0.1}
              />
            </mesh>
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
