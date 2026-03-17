import { BrowserRouter as Router, Routes, Route } from "react-router-dom"

import Home from "./pages/Home"
import Contact from "./pages/Contact"
import Help from "./pages/Help"

import CameraPermission from "./pages/CameraPermission"
import BodyScan from "./pages/BodyScan"
import SizeResult from "./pages/SizeResult"

import PreviewRoom from "./components/PreviewRoom"

function App() {
  return (
    <Router>
      <Routes>

        {/* Landing Page */}
        <Route path="/" element={<Home />} />

        {/* Camera Access Page */}
        <Route path="/camera" element={<CameraPermission />} />

        {/* Body Scan Page */}
        <Route path="/scan" element={<BodyScan />} />

        {/* Size Recommendation */}
        <Route path="/size-result" element={<SizeResult />} />

        {/* Virtual Try-On Room */}
        <Route path="/preview" element={<PreviewRoom />} />

        {/* Other Pages */}
        <Route path="/contact" element={<Contact />} />
        <Route path="/help" element={<Help />} />

      </Routes>
    </Router>
  )
}

export default App