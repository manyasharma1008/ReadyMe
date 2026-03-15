import { BrowserRouter as Router, Routes, Route } from "react-router-dom"
import Home from "./pages/Home"
import PreviewRoom from "./components/PreviewRoom"
import Contact from "./pages/Contact"
import Help from "./pages/Help"

function App() {
  return (
    <Router>
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