import { Canvas } from "@react-three/fiber"
import { OrbitControls } from "@react-three/drei"

function DummyHuman() {
  return (
    <group position={[0, -1.2, 0]}>
      {/* head */}
      <mesh position={[0, 1.8, 0]}>
        <sphereGeometry args={[0.25, 32, 32]} />
        <meshStandardMaterial color="#f1c27d" />
      </mesh>

      {/* body */}
      <mesh position={[0, 0.8, 0]}>
        <capsuleGeometry args={[0.35, 1.2, 8, 16]} />
        <meshStandardMaterial color="#3b82f6" />
      </mesh>

      {/* legs */}
      <mesh position={[-0.18, -0.5, 0]}>
        <cylinderGeometry args={[0.12, 0.12, 1.2, 16]} />
        <meshStandardMaterial color="#1f2937" />
      </mesh>

      <mesh position={[0.18, -0.5, 0]}>
        <cylinderGeometry args={[0.12, 0.12, 1.2, 16]} />
        <meshStandardMaterial color="#1f2937" />
      </mesh>

      {/* arms */}
      <mesh position={[-0.55, 0.9, 0]}>
        <cylinderGeometry args={[0.1, 0.1, 1, 16]} />
        <meshStandardMaterial color="#f1c27d" />
      </mesh>

      <mesh position={[0.55, 0.9, 0]}>
        <cylinderGeometry args={[0.1, 0.1, 1, 16]} />
        <meshStandardMaterial color="#f1c27d" />
      </mesh>
    </group>
  )
}

function ModelViewer() {
  return (
    <Canvas camera={{ position: [0, 1.5, 4], fov: 45 }}>
      <ambientLight intensity={1.5} />
      <directionalLight position={[3, 5, 2]} intensity={2} />

      <DummyHuman />

      <OrbitControls
        enableZoom={false}
        enablePan={false}
        minPolarAngle={Math.PI / 2}
        maxPolarAngle={Math.PI / 2}
      />
    </Canvas>
  )
}

export default function PreviewRoom() {
  return (
    <div className="w-screen h-screen overflow-hidden relative">
      <img
        src="/closet.jpg"
        alt="Virtual fitting room"
        className="w-full h-full object-cover object-bottom"
      />

      {/* 3D model overlay */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-[400px] h-[600px]">
          <ModelViewer />
        </div>
      </div>
    </div>
  )
}