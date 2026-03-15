import { BrowserRouter as Router, Routes, Route } from "react-router-dom"
import Navbar from "./components/Navbar"
import Home from "./pages/Home"
import Contact from "./pages/Contact"
import PreviewRoom from "./components/PreviewRoom"
import Help from "./pages/Help"

function App() {
  return (
    <Router>

      {/* Navbar always visible */}
      <Navbar />

      {/* Push content below fixed navbar */}
      <div className="pt-14">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/preview" element={<PreviewRoom />} />
          <Route path="/help" element={<Help />} />
        </Routes>
      </div>

    </Router>
  )
}

export default App