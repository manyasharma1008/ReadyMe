import { Canvas } from "@react-three/fiber"
import { OrbitControls, useGLTF, Center } from "@react-three/drei"
import { Suspense } from "react"

function Avatar() {
  const { scene } = useGLTF("/models/man.glb")

  return (
    <Center>
      <primitive object={scene} scale={1.5} />
    </Center>
  )
}

export default function PreviewRoom() {
  return (
    <div style={{ display: "flex", height: "100vh", background: "#e7e3dd" }}>

      {/* LEFT PANEL */}
      <div style={{ width: "220px", padding: "20px" }}>
        <h3>Adjust Avatar</h3>
        <button>Upload Photo</button>
        <button>Adjust Height</button>
        <button>Reset Avatar</button>
      </div>

      {/* CENTER MODEL */}
      <div style={{ flex: 1 }}>

        <Canvas
          camera={{ position: [0, 1.6, 3], fov: 45 }}
        >

          {/* lighting */}
          <ambientLight intensity={0.7} />
          <directionalLight position={[3, 5, 2]} intensity={1} />

          {/* model */}
          <Suspense fallback={null}>
            <Avatar />
          </Suspense>

          {/* ground */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1, 0]}>
            <planeGeometry args={[10, 10]} />
            <meshStandardMaterial color="#ddd8d2" />
          </mesh>

          <OrbitControls />

        </Canvas>

      </div>

      {/* RIGHT PANEL */}
      <div style={{ width: "220px", padding: "20px" }}>
        <h3>Select Outfit</h3>

        <div>Jacket</div>
        <div>Hoodie</div>
        <div>Shirt</div>
        <div>Dress</div>

      </div>

    </div>
  )
}