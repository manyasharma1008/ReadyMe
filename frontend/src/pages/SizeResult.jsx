import { useNavigate } from "react-router-dom"

function SizeResult(){

const navigate = useNavigate()

return (

<div style={{
display:"flex",
flexDirection:"column",
alignItems:"center",
justifyContent:"center",
height:"80vh"
}}>

<h2>Your Recommended Size</h2>

<p>Top Size : M</p>
<p>Waist : 32</p>
<p>Fit : Regular</p>

<button
style={{marginTop:"20px"}}
onClick={()=>navigate("/preview")}
>
Explore Virtual Try-On
</button>

</div>

)

}

export default SizeResult