import { useGLTF } from "@react-three/drei"
import { useThree } from "@react-three/fiber"

export default function HumanModel(props) {
  const { scene } = useGLTF("/models/man.glb")
  const { size } = useThree()

  const isMobile = size.width < 640

  return (
    <primitive
      object={scene}
      scale={1.6}
      position={[0, isMobile ? -0.8 : -1.2, 0]}
      rotation={[0, Math.PI, 0]}
      {...props}
    />
  )
}

useGLTF.preload("/models/man.glb")