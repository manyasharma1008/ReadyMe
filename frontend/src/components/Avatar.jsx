import { useGLTF } from "@react-three/drei"

export default function Avatar() {
  const { scene } = useGLTF("/models/avatar.glb")

  return (
    <primitive
      object={scene}
      scale={1.4}
      position={[0, -1.5, 0]}
    />
  )
}