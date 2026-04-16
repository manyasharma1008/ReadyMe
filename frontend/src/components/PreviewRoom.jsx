import { Canvas } from "@react-three/fiber"
import { OrbitControls, useGLTF, Center } from "@react-three/drei"
import { Suspense, useEffect, useState } from "react"
import { useApp } from "../context/AppContext"
import ActiveProductPanel from "./ActiveProductPanel"

function Avatar() {
  const { scene } = useGLTF("/models/man.glb")

  return (
    <Center>
      <primitive object={scene} scale={1.5} />
    </Center>
  )
}

export default function PreviewRoom() {
  const [selectedImage, setSelectedImage] = useState(null)
  const { activeProduct } = useApp()

  useEffect(() => {
    const nextImage =
      activeProduct?.product?.image ||
      activeProduct?.product?.images?.[0] ||
      null
    setSelectedImage(nextImage)
  }, [activeProduct])

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
        <Canvas camera={{ position: [0, 1.6, 3], fov: 45 }}>

          <ambientLight intensity={0.7} />
          <directionalLight position={[3, 5, 2]} intensity={1} />

          <Suspense fallback={null}>
            <Avatar />
          </Suspense>

          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1, 0]}>
            <planeGeometry args={[10, 10]} />
            <meshStandardMaterial color="#ddd8d2" />
          </mesh>

          <OrbitControls />

        </Canvas>
      </div>

      {/* RIGHT PANEL */}
      <div style={{ width: "320px", padding: "20px", overflowY: "auto" }}>
        <h3>Select Outfit</h3>

        <ActiveProductPanel
          session={activeProduct}
          showGallery
          selectedImage={selectedImage}
          onSelectImage={setSelectedImage}
        />

        <div style={{ marginTop: "16px", display: "grid", gap: "8px", fontSize: "14px" }}>
          <div>Jacket</div>
          <div>Hoodie</div>
          <div>Shirt</div>
          <div>Dress</div>
        </div>

      </div>

    </div>
  )
}
