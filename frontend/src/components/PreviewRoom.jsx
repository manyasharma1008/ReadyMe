import { Canvas } from "@react-three/fiber"
import { OrbitControls, useGLTF, Center } from "@react-three/drei"
import { Suspense, useEffect, useState } from "react"

function Avatar() {
  const { scene } = useGLTF("/models/man.glb")

  return (
    <Center>
      <primitive object={scene} scale={1.5} />
    </Center>
  )
}

export default function PreviewRoom() {

  const [product, setProduct] = useState(null)

  // Read data from extension
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const data = params.get("data")

    if (data) {
      try {
        const parsed = JSON.parse(decodeURIComponent(data))
        console.log("PRODUCT:", parsed)
        setProduct(parsed)
      } catch (err) {
        console.error("Invalid product data")
      }
    }
  }, [])

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
      <div style={{ width: "220px", padding: "20px" }}>
        <h3>Select Outfit</h3>

        {product ? (
          <div style={{
            padding: "10px",
            border: "1px solid #ccc",
            borderRadius: "6px",
            background: "#fff",
            marginBottom: "10px"
          }}>
            <div style={{ fontSize: "12px", opacity: 0.6 }}>
              Detected Item
            </div>

            <div style={{ fontWeight: "500" }}>
              {product.title || "Product"}
            </div>

            {product.image && (
              <img
                src={product.image}
                alt=""
                style={{
                  width: "100%",
                  marginTop: "8px",
                  borderRadius: "4px"
                }}
              />
            )}
          </div>
        ) : (
          <div style={{ fontSize: "12px", opacity: 0.5 }}>
            No product detected
          </div>
        )}

        <div>Jacket</div>
        <div>Hoodie</div>
        <div>Shirt</div>
        <div>Dress</div>

      </div>

    </div>
  )
}