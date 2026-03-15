import { Canvas } from "@react-three/fiber"
import { OrbitControls, Environment, Html } from "@react-three/drei"
import { Suspense } from "react"
import Avatar from "./Avatar"
import wardrobe from "../assets/wardrobe.jpg"

function Loader() {
  return (
    <Html center>
      <div style={{ color: "white", fontSize: "18px" }}>
        Loading Avatar...
      </div>
    </Html>
  )
}

export default function PreviewRoom() {
  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        backgroundImage: `url(${wardrobe})`,
        backgroundSize: "cover",
        backgroundPosition: "center"
      }}
    >
      <Canvas camera={{ position: [0, 1.6, 3], fov: 45 }}>
        <ambientLight intensity={0.8} />
        <directionalLight position={[5, 5, 5]} intensity={1.2} />

        <Suspense fallback={<Loader />}>
          <Avatar />
          <Environment preset="studio" />
        </Suspense>

        <OrbitControls enablePan={false} minDistance={1.5} maxDistance={5} />
      </Canvas>
    </div>
  )
}