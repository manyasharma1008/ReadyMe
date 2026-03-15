import { BrowserRouter as Router, Routes, Route } from "react-router-dom"
import Home from "./pages/Home"
import PreviewRoom from "./components/PreviewRoom"
import Contact from "./pages/Contact"
import Help from "./pages/Help"
import Navbar from "./components/Navbar"

function App() {
  return (
    <Router>
      <Navbar />

      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/preview" element={<PreviewRoom />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/help" element={<Help />} />
      </Routes>
    </Router>
  )
}

export default App