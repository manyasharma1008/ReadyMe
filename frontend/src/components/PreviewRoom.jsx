import { Canvas } from "@react-three/fiber"
import { OrbitControls, useGLTF } from "@react-three/drei"
import { Suspense } from "react"
import Navbar from "./Navbar"

function HumanModel() {
  const { scene } = useGLTF("/models/man.glb")

  return (
    <primitive
      object={scene}
      scale={0.015}
      position={[0, -1.9, 0]}
      rotation={[0, Math.PI, 0]}
    />
  )
}

function ModelViewer() {
  return (
    <Canvas camera={{ position: [0, 1.2, 4.5], fov: 50 }}>
      <ambientLight intensity={1.2} />
      <directionalLight position={[3, 5, 3]} intensity={2} />

      <Suspense fallback={null}>
        <HumanModel />
      </Suspense>

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

      {/* Navbar */}
      <Navbar />

      {/* Background Image */}
      <img
        src="/closet.jpg"
        alt="Virtual fitting room"
        className="absolute inset-0 w-full h-full object-cover object-bottom -z-10"
      />

      {/* 3D Model Viewer */}
      <div className="absolute top-24 left-0 right-0 bottom-0 flex items-center justify-center">
  <div className="w-[90vw] h-full max-w-[900px]">
    <ModelViewer />
  </div>
</div>


    </div>
  )
}

useGLTF.preload("/models/man.glb")