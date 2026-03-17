import { useNavigate } from "react-router-dom"

function CameraPermission() {

const navigate = useNavigate()

const requestCamera = async () => {

  try {

    await navigator.mediaDevices.getUserMedia({ video: true })
    navigate("/scan")

  } catch (err) {

    alert("Camera access denied. You can enter your sizes manually.")

  }

}

return (

<div style={{
display:"flex",
flexDirection:"column",
alignItems:"center",
justifyContent:"center",
height:"80vh",
fontFamily:"inherit"
}}>

<h2>Enable Camera Access</h2>

<p>
We need camera access to scan your body and generate your avatar.
</p>

<button
onClick={requestCamera}
style={{marginTop:"20px"}}
>
Allow Camera
</button>

<button
onClick={()=>navigate("/size-result")}
style={{marginTop:"10px"}}
>
Enter Sizes Manually
</button>

</div>

)

}

export default CameraPermission